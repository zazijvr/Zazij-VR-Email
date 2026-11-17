// Automatické aktualizace přes oficiální Tauri updater.
// Aplikace stáhne latest.json z veřejného repozitáře s vydáními, ověří podpis balíčku
// veřejným klíčem z tauri.conf.json, nainstaluje ho a restartuje se.
// Na mobilu updater není – tam se aktualizuje jinak (APK / obchod).

export const isUpdaterSupported = () =>
  typeof window !== 'undefined' &&
  !!window.__TAURI_INTERNALS__ &&
  !/Android|iPhone|iPad/i.test(navigator.userAgent);

/** Vrátí objekt aktualizace (version, body, date…), nebo null když je aplikace aktuální */
export const checkForUpdate = async () => {
  if (!isUpdaterSupported()) return null;
  const { check } = await import('@tauri-apps/plugin-updater');
  return await check({ timeout: 20000 });
};

/**
 * Stáhne, ověří a nainstaluje aktualizaci, pak restartuje aplikaci.
 * onProgress({ downloaded, total }) – total může být null, když server velikost neuvede.
 */
export const installUpdate = async (update, onProgress) => {
  let downloaded = 0;
  let total = null;
  await update.downloadAndInstall((event) => {
    if (event.event === 'Started') {
      total = event.data.contentLength ?? null;
      onProgress?.({ downloaded, total });
    } else if (event.event === 'Progress') {
      downloaded += event.data.chunkLength;
      onProgress?.({ downloaded, total });
    }
  });
  const { relaunch } = await import('@tauri-apps/plugin-process');
  await relaunch();
};
