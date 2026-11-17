//! Otevření přílohy v aplikaci systému (PDF v Okularu / Evince, obrázek v prohlížeči obrázků…).
//! Vestavěný náhled PDF ve WebKitGTK je u větších souborů pomalý.
//!
//! Bezpečnost: otevřít jde jen dokument / obrázek / text podle přípony – nikdy spustitelný soubor
//! (.exe, .bat, .sh, .desktop, .lnk…), který by systém místo otevření spustil.

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use tauri::command;

/// Přípony, které systém otevře v prohlížeči / editoru (ne spustí)
const ALLOWED_EXTENSIONS: &[&str] = &[
    "pdf", "png", "jpg", "jpeg", "gif", "webp", "bmp", "heic", "txt", "csv", "rtf", "odt", "ods", "odp",
    "doc", "docx", "xls", "xlsx", "ppt", "pptx", "ics", "eml",
];

/// Uloží přílohu do soukromé dočasné složky a otevře ji výchozí aplikací systému
#[command]
pub async fn open_attachment_externally(filename: String, data_base64: String) -> Result<(), String> {
    // Jen bezpečný název souboru (žádné cesty ani řídicí znaky)
    let safe: String = filename
        .chars()
        .map(|c| if c.is_alphanumeric() || " ._-()".contains(c) { c } else { '_' })
        .collect();
    let safe = safe.trim_matches(['.', ' ']).to_string();
    let ext = safe.rsplit_once('.').map(|(_, e)| e.to_ascii_lowercase()).unwrap_or_default();
    if !ALLOWED_EXTENSIONS.contains(&ext.as_str()) {
        return Err(format!("Soubor typu „.{ext}“ se z bezpečnostních důvodů neotevírá – uložte ho a otevřete ručně."));
    }

    let bytes = B64.decode(data_base64.as_bytes()).map_err(|e| e.to_string())?;
    let dir = std::env::temp_dir().join("zazijvr-email");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    // Linux: /tmp je společný pro všechny uživatele – složka jen pro vlastníka (ještě před zápisem)
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700)).map_err(|e| e.to_string())?;
    }
    let path = dir.join(&safe);
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;

    open::that_detached(&path).map_err(|e| format!("Soubor se nepodařilo otevřít: {e}"))
}
