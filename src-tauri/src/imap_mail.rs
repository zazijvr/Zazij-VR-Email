//! Jiné e-mailové účty než Gmail (Seznam.cz, vlastní doména…) přes IMAP (čtení) a SMTP (odesílání).
//!
//! Nastavení účtu (servery, porty, uživatel) je ve vault.bin, heslo v systémové klíčence.
//! Každý příkaz se připojí, přihlásí, provede operaci a odhlásí se – běží mimo hlavní vlákno.

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use mail_parser::{Address, MessageParser, MimeHeaders};
use serde::{Deserialize, Serialize};
use std::net::TcpStream;
use tauri::{command, AppHandle};

const STORE_FILE: &str = "vault.bin";
const STORE_KEY: &str = "imap_accounts";
const KEYRING_SERVICE: &str = "cz.zazijvr.email.imap";

// ───────────── Typy sdílené s frontendem ─────────────

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Security {
    /// Šifrované spojení od začátku (IMAP 993, SMTP 465)
    Tls,
    /// Nešifrované spojení povýšené příkazem STARTTLS (IMAP 143, SMTP 587)
    Starttls,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ImapAccount {
    pub email: String,
    #[serde(default)]
    pub display_name: String,
    pub username: String,
    pub imap_host: String,
    pub imap_port: u16,
    pub imap_security: Security,
    pub smtp_host: String,
    pub smtp_port: u16,
    pub smtp_security: Security,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ImapFolder {
    /// Název pro server (může být kódovaný modified UTF-7)
    pub path: String,
    /// Čitelný název (dekódovaná diakritika)
    pub name: String,
    pub delimiter: Option<String>,
    /// inbox | sent | drafts | trash | junk | archive | null
    pub special: Option<String>,
    pub unseen: u32,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ImapMessageSummary {
    pub uid: u32,
    pub from: String,
    pub from_raw: String,
    pub to: String,
    pub cc: String,
    pub subject: String,
    /// ms od 1970
    pub date: i64,
    pub seen: bool,
    pub flagged: bool,
    pub answered: bool,
    pub draft: bool,
    pub size: u32,
    pub has_attachment: bool,
    pub snippet: String,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ImapMessagePage {
    pub total: u32,
    pub messages: Vec<ImapMessageSummary>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ImapAttachment {
    pub index: usize,
    pub filename: String,
    pub mime_type: String,
    pub size: usize,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ImapMessageDetail {
    pub uid: u32,
    pub subject: String,
    pub from: String,
    pub from_raw: String,
    pub reply_to: String,
    pub to: String,
    pub cc: String,
    pub date: i64,
    pub message_id: String,
    /// HTML s vloženými obrázky (cid:) nahrazenými data URL; bez sanitizace – tu dělá frontend
    pub html: String,
    pub text: String,
    pub attachments: Vec<ImapAttachment>,
    pub seen: bool,
    pub flagged: bool,
}

// ───────────── Uložení účtů ─────────────

fn load_accounts(app: &AppHandle) -> Vec<ImapAccount> {
    use tauri_plugin_store::StoreExt;
    app.store(STORE_FILE)
        .ok()
        .and_then(|s| s.get(STORE_KEY))
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default()
}

fn save_accounts(app: &AppHandle, accounts: &[ImapAccount]) -> Result<(), String> {
    use tauri_plugin_store::StoreExt;
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.set(STORE_KEY, serde_json::to_value(accounts).map_err(|e| e.to_string())?);
    store.save().map_err(|e| e.to_string())
}

fn password_for(email: &str) -> Result<String, String> {
    keyring::Entry::new(KEYRING_SERVICE, email)
        .and_then(|e| e.get_password())
        .map_err(|_| format!("Heslo k účtu {email} není uložené – přidejte účet znovu."))
}

fn account(app: &AppHandle, email: &str) -> Result<(ImapAccount, String), String> {
    let acc = load_accounts(app)
        .into_iter()
        .find(|a| a.email.eq_ignore_ascii_case(email))
        .ok_or_else(|| format!("Účet {email} nenalezen"))?;
    let pw = password_for(&acc.email)?;
    Ok((acc, pw))
}

// ───────────── IMAP připojení ─────────────

type TlsSession = imap::Session<native_tls::TlsStream<TcpStream>>;

fn friendly(e: impl std::fmt::Display) -> String {
    let msg = e.to_string();
    let lower = msg.to_lowercase();
    if lower.contains("authenticationfailed") || lower.contains("authentication failed") || lower.contains("invalid credentials") || lower.contains("login failed") || lower.contains("[auth") {
        "Přihlášení selhalo – zkontrolujte e-mail a heslo (u Seznamu musí být v nastavení schránky povolený přístup přes IMAP).".into()
    } else if lower.contains("failed to lookup") || lower.contains("name or service not known") || lower.contains("dns") {
        "Server nebyl nalezen – zkontrolujte adresu serveru.".into()
    } else if lower.contains("connection refused") || lower.contains("timed out") {
        "Server neodpovídá – zkontrolujte adresu, port a zabezpečení.".into()
    } else {
        msg
    }
}

fn connect(acc: &ImapAccount, password: &str) -> Result<TlsSession, String> {
    let tls = native_tls::TlsConnector::builder().build().map_err(friendly)?;
    let addr = (acc.imap_host.as_str(), acc.imap_port);
    let client = match acc.imap_security {
        Security::Tls => imap::connect(addr, &acc.imap_host, &tls),
        Security::Starttls => imap::connect_starttls(addr, &acc.imap_host, &tls),
    }
    .map_err(friendly)?;
    client.login(&acc.username, password).map_err(|(e, _)| friendly(e))
}

/// Spustí operaci nad přihlášenou IMAP relací v samostatném vlákně
async fn with_session<T, F>(app: &AppHandle, email: &str, op: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&mut TlsSession) -> Result<T, String> + Send + 'static,
{
    let (acc, pw) = account(app, email)?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut session = connect(&acc, &pw)?;
        let result = op(&mut session);
        let _ = session.logout();
        result
    })
    .await
    .map_err(|e| e.to_string())?
}

fn decode_folder(path: &str) -> String {
    utf7_imap::decode_utf7_imap(path.to_string())
}

/// Rozpoznání speciálních složek podle atributů (RFC 6154) nebo běžných názvů
fn special_use(path: &str, attrs: &[imap::types::NameAttribute]) -> Option<String> {
    for a in attrs {
        if let imap::types::NameAttribute::Custom(c) = a {
            let c = c.to_ascii_lowercase();
            for (attr, kind) in [("\\sent", "sent"), ("\\drafts", "drafts"), ("\\trash", "trash"), ("\\junk", "junk"), ("\\archive", "archive")] {
                if c == attr {
                    return Some(kind.into());
                }
            }
        }
    }
    let n = decode_folder(path).to_lowercase();
    let last = n.rsplit(['/', '.']).next().unwrap_or(&n).to_string();
    if n == "inbox" {
        return Some("inbox".into());
    }
    let by_name: &[(&[&str], &str)] = &[
        (&["sent", "sent items", "sent messages", "odeslané", "odeslana posta", "odeslaná pošta"], "sent"),
        (&["drafts", "draft", "koncepty", "rozepsané"], "drafts"),
        (&["trash", "deleted", "deleted items", "deleted messages", "koš", "kos"], "trash"),
        (&["spam", "junk", "junk e-mail", "nevyžádaná pošta", "hromadná"], "junk"),
        (&["archive", "archiv"], "archive"),
    ];
    by_name.iter().find(|(names, _)| names.contains(&last.as_str())).map(|(_, k)| (*k).to_string())
}

fn fmt_address(addr: Option<&Address>) -> (String, String) {
    // (zobrazované jméno první adresy, celý seznam „Jméno <adresa>, …“)
    let Some(addr) = addr else { return (String::new(), String::new()) };
    let list: Vec<String> = addr
        .iter()
        .map(|a| match (a.name(), a.address()) {
            (Some(n), Some(e)) if !n.is_empty() => format!("{n} <{e}>"),
            (_, Some(e)) => e.to_string(),
            (Some(n), None) => n.to_string(),
            _ => String::new(),
        })
        .filter(|s| !s.is_empty())
        .collect();
    let display = addr
        .first()
        .map(|a| a.name().filter(|n| !n.is_empty()).or(a.address()).unwrap_or("").to_string())
        .unwrap_or_default();
    (display, list.join(", "))
}

fn header_has_attachment(raw_headers: &[u8]) -> bool {
    let h = String::from_utf8_lossy(raw_headers).to_lowercase();
    h.contains("content-type: multipart/mixed")
}

// ───────────── Příkazy: účty ─────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddAccountInput {
    pub account: ImapAccount,
    pub password: String,
}

/// Ověří přihlášení k IMAP i SMTP a účet uloží (heslo do klíčenky)
#[command]
pub async fn imap_add_account(app: AppHandle, input: AddAccountInput) -> Result<ImapAccount, String> {
    let AddAccountInput { account: acc, password } = input;

    // 1) IMAP
    let acc_c = acc.clone();
    let pw_c = password.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut s = connect(&acc_c, &pw_c)?;
        let _ = s.logout();
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| e.to_string())??;

    // 2) SMTP
    smtp_transport(&acc, &password)?
        .test_connection()
        .await
        .map_err(|e| format!("Odesílací server (SMTP): {}", friendly(e)))
        .and_then(|ok| if ok { Ok(()) } else { Err("Odesílací server (SMTP) nepřijal spojení.".into()) })?;

    keyring::Entry::new(KEYRING_SERVICE, &acc.email)
        .and_then(|e| e.set_password(&password))
        .map_err(|e| format!("Heslo se nepodařilo uložit do klíčenky: {e}"))?;

    let mut accounts = load_accounts(&app);
    accounts.retain(|a| !a.email.eq_ignore_ascii_case(&acc.email));
    accounts.push(acc.clone());
    save_accounts(&app, &accounts)?;
    Ok(acc)
}

#[command]
pub async fn imap_list_accounts(app: AppHandle) -> Result<Vec<ImapAccount>, String> {
    Ok(load_accounts(&app))
}

#[command]
pub async fn imap_remove_account(app: AppHandle, email: String) -> Result<(), String> {
    let mut accounts = load_accounts(&app);
    accounts.retain(|a| !a.email.eq_ignore_ascii_case(&email));
    save_accounts(&app, &accounts)?;
    if let Ok(e) = keyring::Entry::new(KEYRING_SERVICE, &email) {
        let _ = e.delete_credential();
    }
    Ok(())
}

// ───────────── Příkazy: složky a zprávy ─────────────

#[command]
pub async fn imap_list_folders(app: AppHandle, email: String) -> Result<Vec<ImapFolder>, String> {
    with_session(&app, &email, |s| {
        let names = s.list(Some(""), Some("*")).map_err(friendly)?;
        let mut out = Vec::new();
        for n in names.iter() {
            if n.attributes().iter().any(|a| matches!(a, imap::types::NameAttribute::NoSelect)) {
                continue;
            }
            let path = n.name().to_string();
            let unseen = s
                .status(&path, "(UNSEEN)")
                .map(|m| m.unseen.unwrap_or(0))
                .unwrap_or(0);
            out.push(ImapFolder {
                name: decode_folder(&path),
                special: special_use(&path, n.attributes()),
                delimiter: n.delimiter().map(str::to_string),
                path,
                unseen,
            });
        }
        Ok(out)
    })
    .await
}

/// Stránka zpráv složky od nejnovější (page 0 = nejnovějších `page_size`)
#[command]
pub async fn imap_list_messages(app: AppHandle, email: String, folder: String, page: u32, page_size: u32) -> Result<ImapMessagePage, String> {
    with_session(&app, &email, move |s| {
        let mbox = s.examine(&folder).map_err(friendly)?;
        let total = mbox.exists;
        if total == 0 {
            return Ok(ImapMessagePage { total, messages: vec![] });
        }
        let end = total.saturating_sub(page * page_size);
        if end == 0 {
            return Ok(ImapMessagePage { total, messages: vec![] });
        }
        let start = end.saturating_sub(page_size - 1).max(1);
        let fetches = s
            .fetch(format!("{start}:{end}"), "(UID FLAGS RFC822.SIZE BODY.PEEK[HEADER])")
            .map_err(friendly)?;
        let parser = MessageParser::default();
        let mut messages: Vec<ImapMessageSummary> = fetches
            .iter()
            .filter_map(|f| {
                let uid = f.uid?;
                let header = f.header().unwrap_or(&[]);
                let msg = parser.parse_headers(header)?;
                let (from, from_raw) = fmt_address(msg.from());
                let flags = f.flags();
                let has = |flag: &imap::types::Flag| flags.iter().any(|x| x == flag);
                Some(ImapMessageSummary {
                    uid,
                    from,
                    from_raw,
                    to: fmt_address(msg.to()).1,
                    cc: fmt_address(msg.cc()).1,
                    subject: msg.subject().unwrap_or("").to_string(),
                    date: msg.date().map(|d| d.to_timestamp() * 1000).unwrap_or(0),
                    seen: has(&imap::types::Flag::Seen),
                    flagged: has(&imap::types::Flag::Flagged),
                    answered: has(&imap::types::Flag::Answered),
                    draft: has(&imap::types::Flag::Draft),
                    size: f.size.unwrap_or(0),
                    has_attachment: header_has_attachment(header),
                    snippet: String::new(),
                })
            })
            .collect();
        messages.sort_by(|a, b| b.date.cmp(&a.date));
        Ok(ImapMessagePage { total, messages })
    })
    .await
}

fn fetch_raw(s: &mut TlsSession, folder: &str, uid: u32) -> Result<(Vec<u8>, bool, bool), String> {
    s.examine(folder).map_err(friendly)?;
    let fetches = s.uid_fetch(uid.to_string(), "(FLAGS BODY.PEEK[])").map_err(friendly)?;
    let f = fetches.iter().next().ok_or("Zpráva už na serveru není")?;
    let flags = f.flags();
    let seen = flags.iter().any(|x| *x == imap::types::Flag::Seen);
    let flagged = flags.iter().any(|x| *x == imap::types::Flag::Flagged);
    Ok((f.body().unwrap_or(&[]).to_vec(), seen, flagged))
}

#[command]
pub async fn imap_get_message(app: AppHandle, email: String, folder: String, uid: u32) -> Result<ImapMessageDetail, String> {
    with_session(&app, &email, move |s| {
        let (raw, seen, flagged) = fetch_raw(s, &folder, uid)?;
        let msg = MessageParser::default().parse(&raw[..]).ok_or("Zprávu se nepodařilo přečíst")?;

        let mut html = msg.body_html(0).map(|c| c.into_owned()).unwrap_or_default();
        let text = msg.body_text(0).map(|c| c.into_owned()).unwrap_or_default();
        if html.is_empty() && !text.is_empty() {
            let esc = text.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;");
            html = format!("<div style=\"white-space: pre-wrap; font-family: sans-serif;\">{esc}</div>");
        }

        let mut attachments = Vec::new();
        for (index, part) in msg.attachments().enumerate() {
            let ct = part.content_type();
            let mime = ct
                .map(|c| format!("{}/{}", c.c_type, c.c_subtype.as_deref().unwrap_or("octet-stream")))
                .unwrap_or_else(|| "application/octet-stream".into());
            // Vložené obrázky (cid:) rovnou do HTML, do příloh jen skutečné přílohy
            if let Some(cid) = part.content_id() {
                let cid = cid.trim_matches(['<', '>']);
                let needle = format!("cid:{cid}");
                if html.contains(&needle) {
                    html = html.replace(&needle, &format!("data:{mime};base64,{}", B64.encode(part.contents())));
                    continue;
                }
            }
            attachments.push(ImapAttachment {
                index,
                filename: part.attachment_name().unwrap_or("příloha").to_string(),
                mime_type: mime,
                size: part.contents().len(),
            });
        }

        let (from, from_raw) = fmt_address(msg.from());
        Ok(ImapMessageDetail {
            uid,
            subject: msg.subject().unwrap_or("").to_string(),
            from,
            from_raw,
            reply_to: fmt_address(msg.reply_to()).1,
            to: fmt_address(msg.to()).1,
            cc: fmt_address(msg.cc()).1,
            date: msg.date().map(|d| d.to_timestamp() * 1000).unwrap_or(0),
            message_id: msg.message_id().map(|m| format!("<{m}>")).unwrap_or_default(),
            html,
            text,
            attachments,
            seen,
            flagged,
        })
    })
    .await
}

/// Obsah přílohy (base64)
#[command]
pub async fn imap_get_attachment(app: AppHandle, email: String, folder: String, uid: u32, index: usize) -> Result<String, String> {
    with_session(&app, &email, move |s| {
        let (raw, _, _) = fetch_raw(s, &folder, uid)?;
        let msg = MessageParser::default().parse(&raw[..]).ok_or("Zprávu se nepodařilo přečíst")?;
        let part = msg.attachments().nth(index).ok_or("Příloha nenalezena")?;
        Ok(B64.encode(part.contents()))
    })
    .await
}

fn uid_set(uids: &[u32]) -> String {
    uids.iter().map(u32::to_string).collect::<Vec<_>>().join(",")
}

/// Příznak přečteno („seen“) nebo důležité („flagged“)
#[command]
pub async fn imap_set_flag(app: AppHandle, email: String, folder: String, uids: Vec<u32>, flag: String, value: bool) -> Result<(), String> {
    let imap_flag = match flag.as_str() {
        "seen" => "\\Seen",
        "flagged" => "\\Flagged",
        "answered" => "\\Answered",
        _ => return Err(format!("Neznámý příznak {flag}")),
    };
    with_session(&app, &email, move |s| {
        s.select(&folder).map_err(friendly)?;
        let op = if value { "+FLAGS.SILENT" } else { "-FLAGS.SILENT" };
        s.uid_store(uid_set(&uids), format!("{op} ({imap_flag})")).map_err(friendly)?;
        Ok(())
    })
    .await
}

fn move_uids(s: &mut TlsSession, uids: &[u32], target: &str) -> Result<(), String> {
    let set = uid_set(uids);
    let can_move = s.capabilities().map(|c| c.has_str("MOVE")).unwrap_or(false);
    if can_move {
        s.uid_mv(&set, target).map_err(friendly)
    } else {
        s.uid_copy(&set, target).map_err(friendly)?;
        s.uid_store(&set, "+FLAGS.SILENT (\\Deleted)").map_err(friendly)?;
        s.expunge().map(|_| ()).map_err(friendly)
    }
}

#[command]
pub async fn imap_move(app: AppHandle, email: String, folder: String, uids: Vec<u32>, target: String) -> Result<(), String> {
    with_session(&app, &email, move |s| {
        s.select(&folder).map_err(friendly)?;
        move_uids(s, &uids, &target)
    })
    .await
}

/// Smazání: do koše, nebo natrvalo (když už je v koši / koš neexistuje)
#[command]
pub async fn imap_delete(app: AppHandle, email: String, folder: String, uids: Vec<u32>, trash: Option<String>) -> Result<(), String> {
    with_session(&app, &email, move |s| {
        s.select(&folder).map_err(friendly)?;
        match trash.filter(|t| *t != folder) {
            Some(t) => move_uids(s, &uids, &t),
            None => {
                s.uid_store(uid_set(&uids), "+FLAGS.SILENT (\\Deleted)").map_err(friendly)?;
                s.expunge().map(|_| ()).map_err(friendly)
            }
        }
    })
    .await
}

// ───────────── SMTP ─────────────

type Smtp = lettre::AsyncSmtpTransport<lettre::Tokio1Executor>;

fn smtp_transport(acc: &ImapAccount, password: &str) -> Result<Smtp, String> {
    use lettre::transport::smtp::authentication::Credentials;
    let builder = match acc.smtp_security {
        Security::Tls => Smtp::relay(&acc.smtp_host),
        Security::Starttls => Smtp::starttls_relay(&acc.smtp_host),
    }
    .map_err(|e| friendly(e))?;
    Ok(builder
        .port(acc.smtp_port)
        .credentials(Credentials::new(acc.username.clone(), password.to_string()))
        .timeout(Some(std::time::Duration::from_secs(30)))
        .build())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendInput {
    pub email: String,
    /// Hotová MIME zpráva (z okna pro psaní) jako text
    pub mime: String,
    /// Všichni příjemci (Komu + Kopie) – samotné adresy
    pub recipients: Vec<String>,
    /// Složka Odeslané, kam se zpráva uloží (SMTP ji sám neukládá)
    pub sent_folder: Option<String>,
}

#[command]
pub async fn smtp_send(app: AppHandle, input: SendInput) -> Result<(), String> {
    use lettre::address::{Address as LAddress, Envelope};
    use lettre::AsyncTransport;

    let (acc, pw) = account(&app, &input.email)?;
    let from: LAddress = acc.email.parse().map_err(|_| "Neplatná adresa odesílatele".to_string())?;
    let to: Vec<LAddress> = input
        .recipients
        .iter()
        .filter_map(|r| r.trim().parse().ok())
        .collect();
    if to.is_empty() {
        return Err("Chybí platná adresa příjemce.".into());
    }
    let envelope = Envelope::new(Some(from), to).map_err(|e| e.to_string())?;

    // Hlavička From doplněná podle účtu (okno pro psaní ji u Gmailu nepotřebuje)
    let from_header = if acc.display_name.is_empty() { acc.email.clone() } else { format!("{} <{}>", acc.display_name, acc.email) };
    let date = chrono_like_date();
    let full = format!("From: {from_header}\r\nDate: {date}\r\nMIME-Version: 1.0\r\n{}", input.mime);

    smtp_transport(&acc, &pw)?
        .send_raw(&envelope, full.as_bytes())
        .await
        .map_err(|e| format!("Odeslání selhalo: {}", friendly(e)))?;

    // Kopie do Odeslaných (chyba tady už odeslání nevrací zpět)
    if let Some(sent) = input.sent_folder {
        let acc2 = acc.clone();
        let bytes = full.into_bytes();
        let _ = tauri::async_runtime::spawn_blocking(move || {
            if let Ok(mut s) = connect(&acc2, &pw) {
                let _ = s.append_with_flags(&sent, &bytes, &[imap::types::Flag::Seen]);
                let _ = s.logout();
            }
        })
        .await;
    }
    Ok(())
}

/// Datum pro hlavičku Date (RFC 2822) bez další knihovny – v UTC
fn chrono_like_date() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0);
    let dt = mail_parser::DateTime::from_timestamp(secs);
    dt.to_rfc822()
}
