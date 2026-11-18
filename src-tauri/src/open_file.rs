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

    open_external(path.as_os_str()).map_err(|e| format!("Soubor se nepodařilo otevřít: {e}"))
}

/// Otevře odkaz v prohlížeči systému – jen http(s) a mailto (ne file:, javascript: ani jiná schémata)
#[command]
pub async fn open_external_url(url: String) -> Result<(), String> {
    let lower = url.to_ascii_lowercase();
    if !(lower.starts_with("https://") || lower.starts_with("http://") || lower.starts_with("mailto:")) || url.len() > 8192 {
        return Err("Tento odkaz se z bezpečnostních důvodů neotevírá.".into());
    }
    open_external(std::ffi::OsStr::new(&url)).map_err(|e| format!("Odkaz se nepodařilo otevřít: {e}"))
}

/// Otevře soubor / odkaz výchozí aplikací systému.
///
/// Linux AppImage: aplikace běží s prostředím AppImage (přibalené knihovny GTK, cesty, vlastní
/// xdg-open v PATH, GDK_BACKEND=x11…). Systémový prohlížeč spuštěný s ním padal („xdg-open …
/// failed with ExitStatus(4)“) – proto se spouští systémový xdg-open s očištěným prostředím.
pub fn open_external(target: &std::ffi::OsStr) -> std::io::Result<()> {
    #[cfg(target_os = "linux")]
    if let Some(appdir) = std::env::var_os("APPDIR") {
        return open_from_appimage(target, &appdir);
    }
    open::that_detached(target)
}

#[cfg(target_os = "linux")]
fn open_from_appimage(target: &std::ffi::OsStr, appdir: &std::ffi::OsStr) -> std::io::Result<()> {
    use std::process::{Command, Stdio};
    let appdir = appdir.to_string_lossy().to_string();
    // Proměnné, které nastavuje AppImage (linuxdeploy + plugin GTK) nebo aplikace sama
    const STRIP: &[&str] = &[
        "LD_LIBRARY_PATH", "LD_PRELOAD", "GTK_PATH", "GTK_EXE_PREFIX", "GTK_DATA_PREFIX", "GTK_IM_MODULE_FILE",
        "GTK_THEME", "GDK_PIXBUF_MODULE_FILE", "GDK_BACKEND", "GIO_MODULE_DIR", "GIO_EXTRA_MODULES",
        "GSETTINGS_SCHEMA_DIR", "GI_TYPELIB_PATH", "GST_PLUGIN_SYSTEM_PATH", "GST_PLUGIN_SYSTEM_PATH_1_0",
        "GST_PLUGIN_SCANNER", "GST_PLUGIN_PATH", "PYTHONPATH", "PYTHONHOME", "PERLLIB", "QT_PLUGIN_PATH",
        "WEBKIT_DISABLE_DMABUF_RENDERER", "WEBKIT_EXEC_PATH", "APPDIR", "APPIMAGE", "ARGV0", "OWD",
    ];
    // Seznamy cest bez položek uvnitř AppImage
    let clean_list = |name: &str| -> Option<String> {
        let v = std::env::var(name).ok()?;
        let kept: Vec<&str> = v.split(':').filter(|p| !p.is_empty() && !p.starts_with(&appdir)).collect();
        (!kept.is_empty()).then(|| kept.join(":"))
    };
    let path = clean_list("PATH").unwrap_or_else(|| "/usr/local/bin:/usr/bin:/bin".into());
    // Systémový xdg-open (ne ten přibalený v AppImage)
    let opener = ["/usr/bin/xdg-open", "/usr/local/bin/xdg-open", "/bin/xdg-open"]
        .into_iter()
        .find(|p| std::path::Path::new(p).exists())
        .unwrap_or("xdg-open");

    let mut cmd = Command::new(opener);
    cmd.arg(target).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    for v in STRIP {
        cmd.env_remove(v);
    }
    cmd.env("PATH", path);
    match clean_list("XDG_DATA_DIRS") {
        Some(dirs) => cmd.env("XDG_DATA_DIRS", dirs),
        None => cmd.env("XDG_DATA_DIRS", "/usr/local/share:/usr/share"),
    };
    // Odpojeně: xdg-open může čekat, než se prohlížeč ukončí – výsledek nepotřebujeme
    std::thread::spawn(move || {
        let _ = cmd.status();
    });
    Ok(())
}
