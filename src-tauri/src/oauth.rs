use tauri::{command, AppHandle};
#[cfg(mobile)]
use tauri_plugin_shell::ShellExt;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

/// PKCE challenge a state jsou base64url (jen A–Z a–z 0–9 - _) – nic jiného do adresy nepustit
fn check_pkce_params(code_challenge: &str, state: &str) -> Result<(), String> {
    let ok = |s: &str, min: usize| s.len() >= min && s.len() <= 128 && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if ok(code_challenge, 43) && ok(state, 16) { Ok(()) } else { Err("Neplatné parametry přihlášení".into()) }
}

/// Vrátí OAuth URL pro mobilní platformy (bez TCP serveru).
/// Frontend si sám vyčká na deep-link callback a provede token exchange.
#[cfg(mobile)]
#[command]
pub async fn start_google_login(
    app: AppHandle,
    client_id: String,
    code_challenge: String,
    state: String,
) -> Result<String, String> {
    check_pkce_params(&code_challenge, &state)?;
    // PKCE (code_challenge) + state ověřuje frontend při návratu přes deep link
    let url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth\
         ?client_id={}\
         &redirect_uri=cz.zazijvr.email:/oauth2redirect\
         &response_type=code\
         &scope=https://mail.google.com/%20https://www.googleapis.com/auth/calendar\
         &access_type=offline\
         &prompt=consent\
         &code_challenge={}\
         &code_challenge_method=S256\
         &state={}",
        client_id, code_challenge, state
    );

    // Otevře Chrome Custom Tab (Android) nebo Safari View Controller (iOS)
    app.shell().open(url, None).map_err(|e| e.to_string())?;

    // Na Androidu dál čeká deep-link plugin – vrátíme prázdný řetězec
    // jako signál pro frontend, že flow pokračuje přes deep-link callback.
    Ok("AWAITING_DEEP_LINK".to_string())
}

/// Desktop flow – beze změny. Lokální TCP server zachytí redirect.
#[cfg(desktop)]
#[command]
pub async fn start_google_login(
    _app: AppHandle,
    client_id: String,
    code_challenge: String,
    state: String,
) -> Result<String, String> {
    check_pkce_params(&code_challenge, &state)?;
    let listener = TcpListener::bind("127.0.0.1:3456")
        .await
        .map_err(|e| e.to_string())?;

    // PKCE: Google vydá token jen tomu, kdo zná ověřovač (zůstává ve frontendu); state se ověří níže
    let url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri=http://localhost:3456/callback&response_type=code&scope=https://mail.google.com/%20https://www.googleapis.com/auth/calendar&access_type=offline&prompt=consent&code_challenge={}&code_challenge_method=S256&state={}",
        client_id, code_challenge, state
    );

    // Prohlížeč systému (na Linuxu v AppImage s očištěným prostředím – viz open_file::open_external)
    crate::open_file::open_external(std::ffi::OsStr::new(&url)).map_err(|e| e.to_string())?;

    let (mut stream, _) = listener.accept().await.map_err(|e| e.to_string())?;

    let mut buf = [0; 4096];
    let n = stream.read(&mut buf).await.map_err(|e| e.to_string())?;
    let request_str = String::from_utf8_lossy(&buf[..n]);

    let mut auth_code = "".to_string();
    if let Some(line) = request_str.lines().next() {
        if let Some(start) = line.find("code=") {
            let offset = start + 5;
            if let Some(end) = line[offset..].find(|c| c == '&' || c == ' ') {
                auth_code = line[offset..offset + end].to_string();
            }
        }
    }

    // Odpověď musí nést náš state – jinak ji poslal někdo jiný (podvržené přihlášení)
    let returned_state = request_str
        .lines()
        .next()
        .and_then(|line| line.split(['?', '&', ' ']).find_map(|p| p.strip_prefix("state=")))
        .unwrap_or("");
    if returned_state != state {
        let response = "HTTP/1.1 400 Bad Request\r\n\r\nLogin failed (state mismatch).";
        let _ = stream.write_all(response.as_bytes()).await;
        return Err("Odpověď přihlášení nepatří k této žádosti (state) – zkuste to znovu.".into());
    }

    if auth_code.is_empty() {
        let response = "HTTP/1.1 400 Bad Request\r\n\r\nLogin failed or cancelled.";
        let _ = stream.write_all(response.as_bytes()).await;
        return Err("Authorization code not found in response".into());
    }

    let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<html><head><style>body { background: #0f172a; color: #00f3ff; font-family: sans-serif; display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100vh; margin: 0; text-align: center; } h2 { text-transform: uppercase; letter-spacing: 2px; text-shadow: 0 0 10px #00f3ff; }</style></head><body><h2>[ SYSTÉM PROPOJEN ]</h2><p>Rekalibrace tokenu byla úspěšně dokončena. <br>Vracím zpět do aplikace...</p></body></html>";
    let _ = stream.write_all(response.as_bytes()).await;

    Ok(auth_code)
}

// ───────────── Úložiště refresh tokenů ─────────────
// Ve vault.bin (tauri-plugin-store) je jen seznam účtů a aktivní účet.
// Samotné refresh tokeny jsou na desktopu v systémové klíčence; ve vault.bin je u účtu prázdný řetězec.
// Když klíčenka není k dispozici, token zůstane ve vault.bin a soubor je čitelný jen pro uživatele.

const STORE_FILE: &str = "vault.bin";
#[cfg(desktop)]
const KEYRING_SERVICE: &str = "cz.zazijvr.email";

#[cfg(desktop)]
fn keyring_set(email: &str, token: &str) -> bool {
    match keyring::Entry::new(KEYRING_SERVICE, email).and_then(|e| e.set_password(token)) {
        Ok(()) => true,
        Err(e) => {
            log::warn!("Klíčenka není dostupná, token zůstane v souboru: {e}");
            false
        }
    }
}

#[cfg(desktop)]
fn keyring_get(email: &str) -> Option<String> {
    keyring::Entry::new(KEYRING_SERVICE, email)
        .and_then(|e| e.get_password())
        .ok()
        .filter(|t| !t.is_empty())
}

#[cfg(desktop)]
fn keyring_delete(email: &str) {
    if let Ok(e) = keyring::Entry::new(KEYRING_SERVICE, email) {
        let _ = e.delete_credential();
    }
}

#[cfg(mobile)]
fn keyring_set(_email: &str, _token: &str) -> bool { false }
#[cfg(mobile)]
fn keyring_get(_email: &str) -> Option<String> { None }
#[cfg(mobile)]
fn keyring_delete(_email: &str) {}

/// vault.bin jen pro vlastníka (rw-------)
fn restrict_store_file(app: &AppHandle) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        use tauri::Manager;
        if let Ok(dir) = app.path().app_data_dir() {
            let _ = std::fs::set_permissions(dir.join(STORE_FILE), std::fs::Permissions::from_mode(0o600));
        }
    }
    #[cfg(not(unix))]
    let _ = app;
}

/// Uloží token: do klíčenky, a jen když to nejde, do souboru
fn store_token(accounts: &mut serde_json::Map<String, serde_json::Value>, email: &str, token: &str) {
    let in_file = if keyring_set(email, token) { "" } else { token };
    accounts.insert(email.to_string(), serde_json::json!(in_file));
}

/// Přesune tokeny, které jsou ještě v souboru (starší verze aplikace), do klíčenky
fn migrate_tokens(app: &AppHandle) {
    use tauri_plugin_store::StoreExt;
    let Ok(store) = app.store(STORE_FILE) else { return };
    let Some(serde_json::Value::Object(mut accounts)) = store.get("google_accounts") else { return };
    let mut changed = false;
    for (email, val) in accounts.iter_mut() {
        if let Some(token) = val.as_str().filter(|t| !t.is_empty()).map(str::to_string) {
            if keyring_set(email, &token) {
                *val = serde_json::json!("");
                changed = true;
            }
        }
    }
    if changed {
        store.set("google_accounts", serde_json::Value::Object(accounts));
        let _ = store.save();
    }
    restrict_store_file(app);
}

fn token_for(accounts: &serde_json::Value, email: &str) -> Option<String> {
    keyring_get(email).or_else(|| {
        accounts.get(email).and_then(|v| v.as_str()).filter(|t| !t.is_empty()).map(str::to_string)
    })
}

#[command]
pub async fn save_google_account(app: AppHandle, email: String, refresh_token: String) -> Result<(), String> {
    use tauri_plugin_store::StoreExt;
    if !refresh_token.is_empty() && email != "unknown" {
        if let Ok(store) = app.store(STORE_FILE) {
            let mut accounts = match store.get("google_accounts") {
                Some(serde_json::Value::Object(map)) => map,
                _ => serde_json::Map::new(),
            };
            store_token(&mut accounts, &email, &refresh_token);
            store.set("google_accounts", serde_json::Value::Object(accounts));
            store.set("active_google_account", serde_json::json!(email));
            let _ = store.save();
            restrict_store_file(&app);
        }
    }
    Ok(())
}

#[command]
pub async fn get_active_refresh_token(app: AppHandle) -> Result<String, String> {
    use tauri_plugin_store::StoreExt;
    migrate_tokens(&app);
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;

    let active_email = match store.get("active_google_account") {
        Some(val) => val.as_str().unwrap_or("").to_string(),
        None => return Err("No active account selected".into()),
    };

    if active_email.is_empty() {
        return Err("No active account".into());
    }

    let accounts = store.get("google_accounts").unwrap_or(serde_json::json!({}));
    if accounts.get(&active_email).is_none() {
        return Err("No refresh token for active account".into());
    }
    token_for(&accounts, &active_email).ok_or_else(|| "Token is empty".into())
}

/// Všechny uložené Google účty s refresh tokenem (hlídání pošty na pozadí, počty nepřečtených)
pub(crate) fn saved_google_tokens(app: &AppHandle) -> Vec<(String, String)> {
    use tauri_plugin_store::StoreExt;
    let Ok(store) = app.store(STORE_FILE) else { return vec![] };
    let accounts = store.get("google_accounts").unwrap_or(serde_json::json!({}));
    let Some(obj) = accounts.as_object() else { return vec![] };
    obj.keys()
        .filter_map(|email| token_for(&accounts, email).map(|t| (email.clone(), t)))
        .collect()
}

#[command]
pub async fn get_saved_accounts(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    use tauri_plugin_store::StoreExt;
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let accounts = store.get("google_accounts").unwrap_or(serde_json::json!({}));
    Ok(accounts.as_object().map(|o| o.keys().cloned().collect()).unwrap_or_default())
}

#[command]
pub async fn get_active_account(app: tauri::AppHandle) -> Result<String, String> {
    use tauri_plugin_store::StoreExt;
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    match store.get("active_google_account") {
        Some(val) => Ok(val.as_str().unwrap_or("").to_string()),
        None => Ok("".to_string()),
    }
}

#[command]
pub async fn switch_google_account(
    app: tauri::AppHandle,
    email: String
) -> Result<String, String> {
    use tauri_plugin_store::StoreExt;
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;

    let accounts = store.get("google_accounts").unwrap_or(serde_json::json!({}));
    if accounts.get(&email).is_none() {
        return Err("Account not found".into());
    }

    store.set("active_google_account", serde_json::json!(email));
    let _ = store.save();

    get_active_refresh_token(app.clone()).await
}

#[command]
pub async fn logout_google_account(app: tauri::AppHandle, email: String) -> Result<String, String> {
    use tauri_plugin_store::StoreExt;
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;

    let mut accounts = store.get("google_accounts").unwrap_or(serde_json::json!({}));
    if let Some(obj) = accounts.as_object_mut() {
        obj.remove(&email);
    }
    store.set("google_accounts", accounts);
    keyring_delete(&email);

    let active_email = store.get("active_google_account").and_then(|v| v.as_str().map(|s| s.to_string())).unwrap_or_default();

    if active_email == email {
        store.set("active_google_account", serde_json::json!(""));
    }

    let _ = store.save();
    Ok("Logged out".into())
}
