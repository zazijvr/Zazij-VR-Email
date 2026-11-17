//! Hlídání nové pošty na pozadí – Doručené ve všech přidaných účtech (Google i IMAP).
//!
//! Běží v Rustu nezávisle na okně, takže funguje i se schovaným oknem v liště.
//! První průchod si u každého účtu jen zapamatuje, co ve schránce už je (bez upozornění).
//! Kliknutí na upozornění ukáže okno a pošle webové části událost `mail-watch-open`.

use crate::imap_mail;
use mail_parser::MessageParser;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{command, AppHandle, Emitter, Manager};

const POLL_EVERY: Duration = Duration::from_secs(60);
const FIRST_POLL_AFTER: Duration = Duration::from_secs(10);
/// Kolik upozornění najednou na účet; zbytek se shrne do jednoho
const MAX_SINGLE: usize = 3;

/// Přihlašovací údaje Google aplikace (předá je webová část – jsou v jejím buildu z .env)
static GOOGLE_CLIENT: Mutex<Option<(String, String)>> = Mutex::new(None);

#[command]
pub fn mail_watch_set_google_client(client_id: String, client_secret: String) {
    if let Ok(mut c) = GOOGLE_CLIENT.lock() {
        *c = Some((client_id, client_secret));
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenRequest {
    /// "google" | "imap"
    pub kind: String,
    pub account: String,
    /// Gmail: id zprávy; IMAP: UID v Doručených
    pub message_id: String,
    /// IMAP: cesta ke složce Doručené na serveru
    pub folder: String,
}

struct NewMail {
    from: String,
    subject: String,
    open: OpenRequest,
}

#[derive(Default)]
struct ImapState {
    uid_validity: u32,
    last_uid: u32,
}

#[derive(Default)]
struct GoogleState {
    seen: HashSet<String>,
    access_token: Option<(String, Instant)>,
}

pub fn start(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut imap_state: HashMap<String, ImapState> = HashMap::new();
        let mut google_state: HashMap<String, GoogleState> = HashMap::new();
        tokio::time::sleep(FIRST_POLL_AFTER).await;
        loop {
            poll_imap(&app, &mut imap_state).await;
            poll_google(&app, &mut google_state).await;
            tokio::time::sleep(POLL_EVERY).await;
        }
    });
}

// ───────────── IMAP (Seznam, vlastní doména) ─────────────

async fn poll_imap(app: &AppHandle, state: &mut HashMap<String, ImapState>) {
    let accounts = imap_mail::load_accounts(app);
    state.retain(|email, _| accounts.iter().any(|a| &a.email == email));
    for acc in accounts {
        let Ok((acc, pw)) = imap_mail::account(app, &acc.email) else { continue };
        let prev = state.get(&acc.email).map(|s| (s.uid_validity, s.last_uid));
        let email = acc.email.clone();
        let result = tauri::async_runtime::spawn_blocking(move || check_imap(&acc, &pw, prev)).await;
        let Ok(Ok((validity, last_uid, mails))) = result else { continue };
        state.insert(email.clone(), ImapState { uid_validity: validity, last_uid });
        notify_all(app, &email, mails);
    }
}

/// Vrací (UIDVALIDITY, nejvyšší UID, nové nepřečtené zprávy). Bez předchozího stavu jen zjistí výchozí bod.
fn check_imap(
    acc: &imap_mail::ImapAccount,
    password: &str,
    prev: Option<(u32, u32)>,
) -> Result<(u32, u32, Vec<NewMail>), String> {
    let mut s = imap_mail::connect(acc, password)?;
    let result = (|| {
        // EXAMINE = jen pro čtení, zprávy se tím neoznačí jako přečtené
        let mbox = s.examine("INBOX").map_err(|e| e.to_string())?;
        let validity = mbox.uid_validity.unwrap_or(0);
        let top = mbox.uid_next.unwrap_or(1).saturating_sub(1);
        let Some((prev_validity, prev_last)) = prev else { return Ok((validity, top, vec![])) };
        if prev_validity != validity || top <= prev_last {
            return Ok((validity, top.max(if prev_validity == validity { prev_last } else { 0 }), vec![]));
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
                continue; // „n:*“ vrátí poslední zprávu, i když nic nového není
            }
            last = last.max(uid);
            if f.flags().iter().any(|x| *x == imap::types::Flag::Seen) {
                continue;
            }
            let header = f.header().unwrap_or(&[]);
            let Some(msg) = parser.parse_headers(header) else { continue };
            let from_addr = msg.from().and_then(|a| a.first()).and_then(|a| a.address()).unwrap_or("").to_string();
            if from_addr.eq_ignore_ascii_case(&acc.email) {
                continue; // vlastní zpráva poslaná sám sobě
            }
            let from = msg
                .from()
                .and_then(|a| a.first())
                .and_then(|a| a.name().map(str::to_string).or_else(|| a.address().map(str::to_string)))
                .unwrap_or_default();
            mails.push(NewMail {
                from,
                subject: msg.subject().unwrap_or("").to_string(),
                open: OpenRequest { kind: "imap".into(), account: acc.email.clone(), message_id: uid.to_string(), folder: "INBOX".into() },
            });
        }
        Ok((validity, last, mails))
    })();
    let _ = s.logout();
    result
}

// ───────────── Google (Gmail API) ─────────────

async fn poll_google(app: &AppHandle, state: &mut HashMap<String, GoogleState>) {
    let Some((client_id, client_secret)) = GOOGLE_CLIENT.lock().ok().and_then(|c| c.clone()) else { return };
    let accounts = crate::oauth::saved_google_tokens(app);
    state.retain(|email, _| accounts.iter().any(|(e, _)| e == email));
    let http = reqwest::Client::new();
    for (email, refresh_token) in accounts {
        let st = state.entry(email.clone()).or_default();
        let Some(token) = google_access_token(&http, st, &client_id, &client_secret, &refresh_token).await else { continue };
        let Ok(ids) = gmail_unread_inbox(&http, &token).await else { continue };
        let was_initialized = st.seen.contains(INIT_MARK);
        let new_ids: Vec<String> = ids.iter().filter(|id| !st.seen.contains(*id)).cloned().collect();
        if st.seen.len() > 2000 {
            st.seen.clear(); // jen omezení paměti – nepřečtené z Doručených se hned doplní zpět
        }
        st.seen.extend(ids.iter().cloned());
        st.seen.insert(INIT_MARK.into());
        if !was_initialized {
            continue; // výchozí bod – bez upozornění
        }
        let mut mails = Vec::new();
        for id in new_ids.into_iter().take(10) {
            if let Ok(Some((from, subject))) = gmail_headers(&http, &token, &id).await {
                mails.push(NewMail {
                    from,
                    subject,
                    open: OpenRequest { kind: "google".into(), account: email.clone(), message_id: id, folder: String::new() },
                });
            }
        }
        notify_all(app, &email, mails);
    }
}

/// Značka „výchozí bod už je zapamatovaný“ (i když byla schránka bez nepřečtených)
const INIT_MARK: &str = "\u{0}init";

async fn google_access_token(
    http: &reqwest::Client,
    st: &mut GoogleState,
    client_id: &str,
    client_secret: &str,
    refresh_token: &str,
) -> Option<String> {
    if let Some((tok, until)) = &st.access_token {
        if Instant::now() < *until {
            return Some(tok.clone());
        }
    }
    let res = http
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("refresh_token", refresh_token),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .await
        .ok()?;
    let v: serde_json::Value = res.json().await.ok()?;
    let tok = v.get("access_token")?.as_str()?.to_string();
    let ttl = v.get("expires_in").and_then(|e| e.as_u64()).unwrap_or(3600);
    st.access_token = Some((tok.clone(), Instant::now() + Duration::from_secs(ttl.saturating_sub(120))));
    Some(tok)
}

async fn gmail_unread_inbox(http: &reqwest::Client, token: &str) -> Result<Vec<String>, ()> {
    let res = http
        .get("https://gmail.googleapis.com/gmail/v1/users/me/messages")
        .query(&[("q", "in:inbox is:unread"), ("maxResults", "25")])
        .bearer_auth(token)
        .send()
        .await
        .map_err(|_| ())?;
    if !res.status().is_success() {
        return Err(());
    }
    let v: serde_json::Value = res.json().await.map_err(|_| ())?;
    Ok(v.get("messages")
        .and_then(|m| m.as_array())
        .map(|a| a.iter().filter_map(|m| m.get("id")?.as_str().map(str::to_string)).collect())
        .unwrap_or_default())
}

async fn gmail_headers(http: &reqwest::Client, token: &str, id: &str) -> Result<Option<(String, String)>, ()> {
    let res = http
        .get(format!("https://gmail.googleapis.com/gmail/v1/users/me/messages/{id}"))
        .query(&[("format", "metadata"), ("metadataHeaders", "From"), ("metadataHeaders", "Subject")])
        .bearer_auth(token)
        .send()
        .await
        .map_err(|_| ())?;
    if !res.status().is_success() {
        return Err(());
    }
    let v: serde_json::Value = res.json().await.map_err(|_| ())?;
    let labels: Vec<&str> = v.get("labelIds").and_then(|l| l.as_array()).map(|a| a.iter().filter_map(|x| x.as_str()).collect()).unwrap_or_default();
    if labels.contains(&"SENT") || !labels.contains(&"UNREAD") {
        return Ok(None);
    }
    let header = |name: &str| {
        v.pointer("/payload/headers")
            .and_then(|h| h.as_array())
            .and_then(|h| h.iter().find(|x| x.get("name").and_then(|n| n.as_str()).is_some_and(|n| n.eq_ignore_ascii_case(name))))
            .and_then(|x| x.get("value")?.as_str().map(str::to_string))
            .unwrap_or_default()
    };
    // „Jméno <adresa>“ → jen jméno
    let from_raw = header("From");
    let from = match from_raw.split_once('<') {
        Some((name, _)) if !name.trim().is_empty() => name.trim().trim_matches('"').to_string(),
        _ => from_raw.trim_matches(['<', '>', ' ']).to_string(),
    };
    Ok(Some((from, header("Subject"))))
}

// ───────────── Upozornění ─────────────

fn notify_all(app: &AppHandle, account: &str, mails: Vec<NewMail>) {
    if mails.is_empty() {
        return;
    }
    if mails.len() > MAX_SINGLE {
        let first = &mails[0];
        let body = format!("{} nových zpráv – poslední od: {}\n{}", mails.len(), first.from, first.subject);
        show(app, &format!("Nová pošta · {account}"), &body, first.open.clone());
        return;
    }
    for m in mails {
        let subject = if m.subject.is_empty() { "(bez předmětu)" } else { m.subject.as_str() };
        show(app, &format!("{} · {account}", m.from), subject, m.open);
    }
}

#[cfg(target_os = "linux")]
fn show(app: &AppHandle, title: &str, body: &str, open: OpenRequest) {
    let handle = notify_rust::Notification::new()
        .appname("ZažijVR E-mail")
        .summary(title)
        .body(body)
        .icon("mail-message-new")
        .sound_name("message-new-instant")
        .action("default", "Otevřít")
        .show();
    let Ok(handle) = handle else { return };
    let app = app.clone();
    // Čekání na kliknutí blokuje – vlastní vlákno pro každé upozornění
    std::thread::spawn(move || {
        handle.wait_for_action(|action| {
            if action == "default" {
                open_in_app(&app, open);
            }
        });
    });
}

#[cfg(not(target_os = "linux"))]
fn show(app: &AppHandle, title: &str, body: &str, _open: OpenRequest) {
    use tauri_plugin_notification::NotificationExt;
    let _ = app.notification().builder().title(title).body(body).show();
}

#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
fn open_in_app(app: &AppHandle, open: OpenRequest) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
    let _ = app.emit("mail-watch-open", open);
}
