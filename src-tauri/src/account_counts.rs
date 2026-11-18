//! Počty nepřečtených v Doručených pro všechny přidané účty (Google i IMAP) – pro přepínač účtů.
//! Účty se dotazují souběžně; účet, který zrovna neodpoví, ve výsledku chybí.

use crate::{imap_mail, oauth};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{command, AppHandle};

/// Přístupové tokeny Google účtů (platí cca hodinu) – ať se neobnovují při každém dotazu
static GOOGLE_TOKENS: Mutex<Option<HashMap<String, (String, Instant)>>> = Mutex::new(None);

fn cached_token(email: &str) -> Option<String> {
    let guard = GOOGLE_TOKENS.lock().ok()?;
    let (tok, until) = guard.as_ref()?.get(email)?;
    (Instant::now() < *until).then(|| tok.clone())
}

fn store_token(email: &str, token: &str, ttl: u64) {
    if let Ok(mut guard) = GOOGLE_TOKENS.lock() {
        guard
            .get_or_insert_with(HashMap::new)
            .insert(email.to_string(), (token.to_string(), Instant::now() + Duration::from_secs(ttl.saturating_sub(120))));
    }
}

async fn google_unread(
    http: reqwest::Client,
    email: String,
    refresh_token: String,
    client_id: String,
    client_secret: Option<String>,
) -> Option<(String, u32)> {
    let token = match cached_token(&email) {
        Some(t) => t,
        None => {
            let mut form = vec![
                ("client_id", client_id.as_str()),
                ("refresh_token", refresh_token.as_str()),
                ("grant_type", "refresh_token"),
            ];
            if let Some(secret) = client_secret.as_deref() {
                form.push(("client_secret", secret));
            }
            let v: serde_json::Value = http
                .post("https://oauth2.googleapis.com/token")
                .form(&form)
                .send()
                .await
                .ok()?
                .json()
                .await
                .ok()?;
            let tok = v.get("access_token")?.as_str()?.to_string();
            store_token(&email, &tok, v.get("expires_in").and_then(|e| e.as_u64()).unwrap_or(3600));
            tok
        }
    };
    let res = http
        .get("https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX")
        .bearer_auth(&token)
        .send()
        .await
        .ok()?;
    if !res.status().is_success() {
        return None;
    }
    let v: serde_json::Value = res.json().await.ok()?;
    let unread = v.get("messagesUnread").and_then(|n| n.as_u64()).unwrap_or(0) as u32;
    Some((email, unread))
}

async fn imap_unread(app: AppHandle, email: String) -> Option<(String, u32)> {
    let e = email.clone();
    let count = imap_mail::with_session(&app, &e, |s| Ok(imap_mail::unseen_count(s, "INBOX"))).await.ok()?;
    Some((email, count))
}

/// email → počet nepřečtených v Doručených. Klient Google podle platformy
/// (počítač: desktop ID + secret, telefon: mobilní ID bez secretu).
#[command]
pub async fn accounts_unread(app: AppHandle, client_id: String, client_secret: Option<String>) -> HashMap<String, u32> {
    let mut tasks = tokio::task::JoinSet::new();
    let http = reqwest::Client::builder().timeout(Duration::from_secs(20)).build().unwrap_or_default();
    for (email, refresh_token) in oauth::saved_google_tokens(&app) {
        tasks.spawn(google_unread(http.clone(), email, refresh_token, client_id.clone(), client_secret.clone()));
    }
    for acc in imap_mail::load_accounts(&app) {
        tasks.spawn(imap_unread(app.clone(), acc.email));
    }
    let mut out = HashMap::new();
    while let Some(res) = tasks.join_next().await {
        if let Ok(Some((email, n))) = res {
            out.insert(email, n);
        }
    }
    out
}
