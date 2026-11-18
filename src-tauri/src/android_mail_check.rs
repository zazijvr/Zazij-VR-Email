//! Android: kontrola nové pošty na pozadí (WorkManager → MailCheckWorker.kt → MailNative.checkMail).
//!
//! Běží i bez spuštěné aplikace, takže nepoužívá Tauri (AppHandle): účty, tokeny a hesla čte přímo
//! ze souboru vault.bin (tauri-plugin-store, JSON) v soukromé složce aplikace. Stav (co už bylo
//! nahlášeno) si drží v mail_check_state.json. První kontrola účtu jen zapamatuje stav – bez upozornění.
//! Vrací JSON pole upozornění [{ "title", "body", "account", "open": { kind, account, messageId, folder } }].

use crate::imap_mail::{self, ImapAccount};
use jni::objects::{JClass, JString};
use jni::sys::jstring;
use jni::JNIEnv;
use mail_parser::MessageParser;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::Duration;

const STATE_FILE: &str = "mail_check_state.json";
/// Kolik upozornění na účet; víc nových zpráv se shrne do jednoho
const MAX_SINGLE: usize = 3;

#[derive(Serialize)]
struct Notice {
    title: String,
    body: String,
    account: String,
    /// Co otevřít po klepnutí (stejné jako mail_watch::OpenRequest na desktopu)
    open: Open,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Open {
    /// "google" | "imap"
    kind: String,
    account: String,
    /// Gmail: id zprávy; IMAP: UID v Doručených
    message_id: String,
    folder: String,
}

/// Nová zpráva: (odesílatel, předmět, id zprávy / UID)
type NewMail = (String, String, String);

#[derive(Serialize, Deserialize, Default)]
struct State {
    /// IMAP: email → (UIDVALIDITY, nejvyšší UID)
    #[serde(default)]
    imap: HashMap<String, (u32, u32)>,
    /// Google: email → id nepřečtených zpráv v Doručených, které už známe
    #[serde(default)]
    google: HashMap<String, Vec<String>>,
}

#[no_mangle]
pub extern "system" fn Java_cz_zazijvr_email_MailNative_checkMail<'l>(
    mut env: JNIEnv<'l>,
    _class: JClass<'l>,
    data_dir: JString<'l>,
    google_client_id: JString<'l>,
) -> jstring {
    let data_dir: String = env.get_string(&data_dir).map(Into::into).unwrap_or_default();
    let client_id: String = env.get_string(&google_client_id).map(Into::into).unwrap_or_default();
    // Žádná chyba nesmí shodit proces (panika přes JNI = pád aplikace)
    let notices = std::panic::catch_unwind(|| check_all(Path::new(&data_dir), &client_id)).unwrap_or_default();
    let json = serde_json::to_string(&notices).unwrap_or_else(|_| "[]".into());
    env.new_string(json).map(|s| s.into_raw()).unwrap_or(std::ptr::null_mut())
}

/// vault.bin leží v datové složce aplikace (Tauri ji umisťuje do podsložky) – najít ji
fn find_vault(dir: &Path, depth: u8) -> Option<PathBuf> {
    let direct = dir.join("vault.bin");
    if direct.is_file() {
        return Some(direct);
    }
    if depth == 0 {
        return None;
    }
    std::fs::read_dir(dir).ok()?.flatten().filter(|e| e.path().is_dir()).find_map(|e| find_vault(&e.path(), depth - 1))
}

fn check_all(data_dir: &Path, client_id: &str) -> Vec<Notice> {
    let Some(vault_path) = find_vault(data_dir, 4) else { return vec![] };
    let Ok(raw) = std::fs::read(&vault_path) else { return vec![] };
    let Ok(vault) = serde_json::from_slice::<serde_json::Value>(&raw) else { return vec![] };

    let state_path = data_dir.join(STATE_FILE);
    let mut state: State = std::fs::read(&state_path).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
    let mut notices = Vec::new();

    // ── IMAP (Seznam, vlastní doména) ──
    let accounts: Vec<ImapAccount> = vault.get("imap_accounts").and_then(|v| serde_json::from_value(v.clone()).ok()).unwrap_or_default();
    let passwords = vault.get("imap_passwords").and_then(|v| v.as_object()).cloned().unwrap_or_default();
    state.imap.retain(|email, _| accounts.iter().any(|a| &a.email == email));
    for acc in &accounts {
        let Some(pw) = passwords.get(&acc.email.to_lowercase()).and_then(|v| v.as_str()) else { continue };
        let prev = state.imap.get(&acc.email).copied();
        if let Ok((validity, last, mails)) = check_imap(acc, pw, prev) {
            state.imap.insert(acc.email.clone(), (validity, last));
            push_notices(&mut notices, "imap", &acc.email, mails);
        }
    }

    // ── Google (Gmail API) ──
    if !client_id.is_empty() {
        let google: Vec<(String, String)> = vault
            .get("google_accounts")
            .and_then(|v| v.as_object())
            .map(|o| o.iter().filter_map(|(e, t)| t.as_str().filter(|t| !t.is_empty()).map(|t| (e.clone(), t.to_string()))).collect())
            .unwrap_or_default();
        state.google.retain(|email, _| google.iter().any(|(e, _)| e == email));
        if let Ok(rt) = tokio::runtime::Builder::new_current_thread().enable_all().build() {
            for (email, refresh_token) in google {
                let known = state.google.get(&email).cloned();
                if let Some((ids, mails)) = rt.block_on(check_gmail(client_id, &refresh_token, known.as_deref())) {
                    state.google.insert(email.clone(), ids);
                    push_notices(&mut notices, "google", &email, mails);
                }
            }
        }
    }

    if let Ok(bytes) = serde_json::to_vec(&state) {
        let _ = std::fs::write(&state_path, bytes);
    }
    notices
}

fn push_notices(out: &mut Vec<Notice>, kind: &str, account: &str, mails: Vec<NewMail>) {
    if mails.is_empty() {
        return;
    }
    let open = |id: &str| Open {
        kind: kind.into(),
        account: account.into(),
        message_id: id.into(),
        folder: if kind == "imap" { "INBOX".into() } else { String::new() },
    };
    if mails.len() > MAX_SINGLE {
        let (from, subject, id) = &mails[0];
        out.push(Notice {
            title: format!("Nová pošta · {account}"),
            body: format!("{} nových zpráv – poslední od: {from}\n{subject}", mails.len()),
            account: account.into(),
            open: open(id),
        });
        return;
    }
    for (from, subject, id) in mails {
        let subject = if subject.is_empty() { "(bez předmětu)".to_string() } else { subject };
        out.push(Notice { title: format!("{from} · {account}"), body: subject, account: account.into(), open: open(&id) });
    }
}

/// (UIDVALIDITY, nejvyšší UID, nové nepřečtené (odesílatel, předmět)); bez předchozího stavu jen výchozí bod
fn check_imap(acc: &ImapAccount, password: &str, prev: Option<(u32, u32)>) -> Result<(u32, u32, Vec<NewMail>), String> {
    let mut s = imap_mail::connect(acc, password)?;
    let result = (|| {
        let mbox = s.examine("INBOX").map_err(|e| e.to_string())?;
        let validity = mbox.uid_validity.unwrap_or(0);
        let top = mbox.uid_next.unwrap_or(1).saturating_sub(1);
        let Some((prev_validity, prev_last)) = prev else { return Ok((validity, top, vec![])) };
        if prev_validity != validity || top <= prev_last {
            return Ok((validity, if prev_validity == validity { top.max(prev_last) } else { top }, vec![]));
        }
        let fetches = s
            .uid_fetch(format!("{}:*", prev_last + 1), "(UID FLAGS BODY.PEEK[HEADER.FIELDS (FROM SUBJECT)])")
            .map_err(|e| e.to_string())?;
        let parser = MessageParser::default();
        let mut mails = Vec::new();
        let mut last = prev_last;
        for f in fetches.iter() {
            let Some(uid) = f.uid else { continue };
            if uid <= prev_last {
                continue;
            }
            last = last.max(uid);
            if f.flags().iter().any(|x| *x == imap::types::Flag::Seen) {
                continue;
            }
            let Some(msg) = parser.parse_headers(f.header().unwrap_or(&[])) else { continue };
            let first = msg.from().and_then(|a| a.first());
            if first.and_then(|a| a.address()).is_some_and(|a| a.eq_ignore_ascii_case(&acc.email)) {
                continue; // zpráva poslaná sám sobě
            }
            let from = first.and_then(|a| a.name().or(a.address())).unwrap_or("").to_string();
            mails.push((from, msg.subject().unwrap_or("").to_string(), uid.to_string()));
        }
        Ok((validity, last, mails))
    })();
    let _ = s.logout();
    result
}

/// (všechna aktuální id nepřečtených v Doručených, nové (odesílatel, předmět)); bez známých id jen výchozí bod
async fn check_gmail(client_id: &str, refresh_token: &str, known: Option<&[String]>) -> Option<(Vec<String>, Vec<NewMail>)> {
    let http = reqwest::Client::builder().timeout(Duration::from_secs(25)).build().ok()?;
    let v: serde_json::Value = http
        .post("https://oauth2.googleapis.com/token")
        .form(&[("client_id", client_id), ("refresh_token", refresh_token), ("grant_type", "refresh_token")])
        .send()
        .await
        .ok()?
        .json()
        .await
        .ok()?;
    let token = v.get("access_token")?.as_str()?.to_string();

    let list: serde_json::Value = http
        .get("https://gmail.googleapis.com/gmail/v1/users/me/messages")
        .query(&[("q", "in:inbox is:unread"), ("maxResults", "25")])
        .bearer_auth(&token)
        .send()
        .await
        .ok()?
        .json()
        .await
        .ok()?;
    let ids: Vec<String> = list
        .get("messages")
        .and_then(|m| m.as_array())
        .map(|a| a.iter().filter_map(|m| m.get("id")?.as_str().map(str::to_string)).collect())
        .unwrap_or_default();
    let Some(known) = known else { return Some((ids, vec![])) };

    let mut mails = Vec::new();
    for id in ids.iter().filter(|id| !known.contains(id)).take(10) {
        let Ok(res) = http
            .get(format!("https://gmail.googleapis.com/gmail/v1/users/me/messages/{id}"))
            .query(&[("format", "metadata"), ("metadataHeaders", "From"), ("metadataHeaders", "Subject")])
            .bearer_auth(&token)
            .send()
            .await
        else {
            continue;
        };
        let Ok(m) = res.json::<serde_json::Value>().await else { continue };
        let labels: Vec<&str> = m.get("labelIds").and_then(|l| l.as_array()).map(|a| a.iter().filter_map(|x| x.as_str()).collect()).unwrap_or_default();
        if labels.contains(&"SENT") {
            continue;
        }
        let header = |name: &str| {
            m.pointer("/payload/headers")
                .and_then(|h| h.as_array())
                .and_then(|h| h.iter().find(|x| x.get("name").and_then(|n| n.as_str()).is_some_and(|n| n.eq_ignore_ascii_case(name))))
                .and_then(|x| x.get("value")?.as_str().map(str::to_string))
                .unwrap_or_default()
        };
        let from_raw = header("From");
        let from = match from_raw.split_once('<') {
            Some((name, _)) if !name.trim().is_empty() => name.trim().trim_matches('"').to_string(),
            _ => from_raw.trim_matches(['<', '>', ' ']).to_string(),
        };
        mails.push((from, header("Subject"), id.clone()));
    }
    Some((ids, mails))
}
