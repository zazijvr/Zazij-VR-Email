//! Otevření přílohy v aplikaci systému (PDF v Okularu / Evince, obrázek v prohlížeči obrázků…).
//! Vestavěný náhled PDF ve WebKitGTK je u větších souborů pomalý.

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use tauri::command;

/// Uloží přílohu do dočasné složky a otevře ji výchozí aplikací systému
#[command]
pub async fn open_attachment_externally(filename: String, data_base64: String) -> Result<(), String> {
    let bytes = B64.decode(data_base64.as_bytes()).map_err(|e| e.to_string())?;
    // Jen bezpečný název souboru (žádné cesty)
    let safe: String = filename
        .chars()
        .map(|c| if c.is_alphanumeric() || " ._-()".contains(c) { c } else { '_' })
        .collect();
    let safe = if safe.trim_matches(['.', ' ']).is_empty() { "priloha".to_string() } else { safe };
    let dir = std::env::temp_dir().join("zazijvr-email");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(safe);
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    open::that_detached(&path).map_err(|e| format!("Soubor se nepodařilo otevřít: {e}"))
}
