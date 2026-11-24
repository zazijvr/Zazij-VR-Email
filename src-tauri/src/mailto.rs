//! Odkazy mailto: z jiných aplikací (prohlížeč, soubory…) – když je ZažijVR Email nastavený jako
//! výchozí poštovní klient. Systém spustí aplikaci s argumentem „mailto:…“ (soubor .desktop: Exec … %u):
//!  - první spuštění: odkaz se uloží a okno si ho vyzvedne příkazem take_pending_mailto,
//!  - aplikace už běží: single-instance předá argumenty běžící instanci → uloží + událost „open-mailto“.
//! Okno pak otevře nový e-mail s předvyplněným adresátem, předmětem a textem.
use std::sync::Mutex;

pub struct PendingMailto(pub Mutex<Option<String>>);

/// Najde v argumentech příkazové řádky odkaz mailto: (rozumná délka, nic jiného)
pub fn find(args: &[String]) -> Option<String> {
    args.iter()
        .find(|a| a.len() <= 8192 && a.get(..7).is_some_and(|p| p.eq_ignore_ascii_case("mailto:")))
        .cloned()
}

/// Okno si vyzvedne čekající odkaz (jen jednou)
#[tauri::command]
pub fn take_pending_mailto(state: tauri::State<PendingMailto>) -> Option<String> {
    state.0.lock().ok().and_then(|mut p| p.take())
}
