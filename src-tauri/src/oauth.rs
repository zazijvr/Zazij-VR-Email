use tauri::{command, AppHandle};
use tauri_plugin_shell::ShellExt;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

#[command]
pub async fn start_google_login(
    app: AppHandle,
    client_id: String,
    client_secret: String,
) -> Result<String, String> {
    // 1. Spustíme lokální server k naslouchání na portu 3456
    let listener = TcpListener::bind("127.0.0.1:3456")
        .await
        .map_err(|e| e.to_string())?;

    // 2. Otevřeme výchozí prohlížeč URL pro bezpečný login
    let url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri=http://localhost:3456/callback&response_type=code&scope=https://mail.google.com/%20https://www.googleapis.com/auth/calendar&access_type=offline&prompt=consent",
        client_id
    );

    #[cfg(desktop)]
    open::that(&url).map_err(|e| e.to_string())?;

    #[cfg(mobile)]
    app.shell().open(url.clone(), None).map_err(|e| e.to_string())?;

    // 3. Počkáme až nás Google přesměruje zpět
    let (mut stream, _) = listener.accept().await.map_err(|e| e.to_string())?;

    let mut buf = [0; 4096];
    let n = stream.read(&mut buf).await.map_err(|e| e.to_string())?;
    let request_str = String::from_utf8_lossy(&buf[..n]);

    // 4. Parsování authorization_code z HTTP requestu
    let mut auth_code = "".to_string();
    if let Some(line) = request_str.lines().next() {
        if let Some(start) = line.find("code=") {
            let offset = start + 5;
            if let Some(end) = line[offset..].find(|c| c == '&' || c == ' ') {
                auth_code = line[offset..offset + end].to_string();
            }
        }
    }

    if auth_code.is_empty() {
        let response = "HTTP/1.1 400 Bad Request\r\n\r\nLogin failed or cancelled.";
        let _ = stream.write_all(response.as_bytes()).await;
        return Err("Authorization code not found in response".into());
    }

    // 5. Stylizovaná odpověď prohlížeči (Kyberpunk UI) s opravou české diakritiky!
    let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<html><head><style>body { background: #0f172a; color: #00f3ff; font-family: sans-serif; display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100vh; margin: 0; text-align: center; } h2 { text-transform: uppercase; letter-spacing: 2px; text-shadow: 0 0 10px #00f3ff; }</style></head><body><h2>[ SYSTÉM PROPOJEN ]</h2><p>Rekalibrace tokenu byla úspěšně dokončena. <br>Tuto záložku můžeš zavřít a vrátit se do aplikace.</p></body></html>";
    let _ = stream.write_all(response.as_bytes()).await;

    // 6. Směníme kód za Access Token & Refresh Token rovnou přes Google API
    let client = reqwest::Client::new();
    let params = [
        ("client_id", client_id.as_str()),
        ("client_secret", client_secret.as_str()),
        ("code", auth_code.as_str()),
        ("grant_type", "authorization_code"),
        ("redirect_uri", "http://localhost:3456/callback"),
    ];

    let res = client
        .post("https://oauth2.googleapis.com/token")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Failed to exchange token: {}", e))?;

    let json: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("Failed json parsing: {}", e))?;

    let access_token = json["access_token"].as_str().unwrap_or("").to_string();
    let refresh_token = json["refresh_token"].as_str().unwrap_or("").to_string();

    if access_token.is_empty() {
        return Err("No access token returned from Google".into());
    }

    // 6.5 Získání emailu pomocí profilu API
    let profile_res = client
        .get("https://gmail.googleapis.com/gmail/v1/users/me/profile")
        .bearer_auth(&access_token)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch profile: {}", e))?;

    let profile_json: serde_json::Value = profile_res
        .json()
        .await
        .map_err(|e| format!("Failed to parse profile json: {}", e))?;

    let email = profile_json["emailAddress"]
        .as_str()
        .unwrap_or("unknown")
        .to_string();

    // 7. Uložíme refresh_token bezpečně přes tauri_plugin_store do mapy účtů
    if !refresh_token.is_empty() && email != "unknown" {
        use tauri_plugin_store::StoreExt;
        if let Ok(store) = app.store("vault.bin") {
            let mut accounts = store.get("google_accounts").unwrap_or(serde_json::json!({}));
            if let Some(obj) = accounts.as_object_mut() {
                obj.insert(email.clone(), serde_json::json!(refresh_token));
            } else {
                let mut new_map = serde_json::Map::new();
                new_map.insert(email.clone(), serde_json::json!(refresh_token));
                accounts = serde_json::Value::Object(new_map);
            }
            store.set("google_accounts", accounts);
            store.set("active_google_account", serde_json::json!(email));
            let _ = store.save();
        }
    } else if refresh_token.is_empty() && email != "unknown" {
        // Pokud Google už nevrátil nový refresh token, pokusíme se účet přesto označit za aktivní, pokud jej známe.
        use tauri_plugin_store::StoreExt;
        if let Ok(store) = app.store("vault.bin") {
             store.set("active_google_account", serde_json::json!(email));
             let _ = store.save();
        }
    }

    Ok(access_token)
}

#[command]
pub async fn check_existing_login(
    app: AppHandle,
    client_id: String,
    client_secret: String,
) -> Result<String, String> {
    use tauri_plugin_store::StoreExt;

    let store = app.store("vault.bin").map_err(|e| e.to_string())?;
    
    let active_email = match store.get("active_google_account") {
        Some(val) => val.as_str().unwrap_or("").to_string(),
        None => return Err("No active account selected".into()),
    };

    if active_email.is_empty() {
        return Err("No active account".into());
    }

    let accounts = store.get("google_accounts").unwrap_or(serde_json::json!({}));
    let refresh_token = match accounts.get(&active_email) {
        Some(val) => val.as_str().unwrap_or("").to_string(),
        None => return Err("No refresh token for active account".into()),
    };

    if refresh_token.is_empty() {
        return Err("Token is empty".into());
    }

    let client = reqwest::Client::new();
    let params = [
        ("client_id", client_id.as_str()),
        ("client_secret", client_secret.as_str()),
        ("refresh_token", refresh_token.as_str()),
        ("grant_type", "refresh_token"),
    ];

    let res = client
        .post("https://oauth2.googleapis.com/token")
        .form(&params)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;

    let access_token = json["access_token"].as_str().unwrap_or("").to_string();
    if access_token.is_empty() {
        return Err("Session expired or revoked".into());
    }

    // Pro vývoj na mobilu bez F12 console:
    println!("\n-----------------------------------------------------------");
    println!("DEV MOBILE LOGIN LINK (Zkopírujte tohle na svém telefonu):");
    println!("http://[Vase-WIFI-IP]:5173/?devToken={}", access_token);
    println!("-----------------------------------------------------------\n");

    Ok(access_token)
}

#[command]
pub async fn get_saved_accounts(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    use tauri_plugin_store::StoreExt;
    let store = app.store("vault.bin").map_err(|e| e.to_string())?;
    let accounts = store.get("google_accounts").unwrap_or(serde_json::json!({}));
    
    let mut emails = Vec::new();
    if let Some(obj) = accounts.as_object() {
        for key in obj.keys() {
            emails.push(key.clone());
        }
    }
    Ok(emails)
}

#[command]
pub async fn get_active_account(app: tauri::AppHandle) -> Result<String, String> {
    use tauri_plugin_store::StoreExt;
    let store = app.store("vault.bin").map_err(|e| e.to_string())?;
    match store.get("active_google_account") {
        Some(val) => Ok(val.as_str().unwrap_or("").to_string()),
        None => Ok("".to_string()),
    }
}

#[command]
pub async fn switch_google_account(
    app: tauri::AppHandle, 
    email: String, 
    client_id: String, 
    client_secret: String
) -> Result<String, String> {
    use tauri_plugin_store::StoreExt;
    let store = app.store("vault.bin").map_err(|e| e.to_string())?;
    
    let accounts = store.get("google_accounts").unwrap_or(serde_json::json!({}));
    if accounts.get(&email).is_none() {
        return Err("Account not found".into());
    }
    
    store.set("active_google_account", serde_json::json!(email));
    let _ = store.save();

    check_existing_login(app.clone(), client_id, client_secret).await
}

#[command]
pub async fn logout_google_account(app: tauri::AppHandle, email: String) -> Result<String, String> {
    use tauri_plugin_store::StoreExt;
    let store = app.store("vault.bin").map_err(|e| e.to_string())?;
    
    let mut accounts = store.get("google_accounts").unwrap_or(serde_json::json!({}));
    if let Some(obj) = accounts.as_object_mut() {
        obj.remove(&email);
    }
    store.set("google_accounts", accounts);

    let active_email = store.get("active_google_account").and_then(|v| v.as_str().map(|s| s.to_string())).unwrap_or_default();
    
    if active_email == email {
        store.set("active_google_account", serde_json::json!(""));
    }
    
    let _ = store.save();
    Ok("Logged out".into())
}
