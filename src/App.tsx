import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { onAction, registerActionTypes, isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
// Vracíme čistý nativní fetch pro přímou podporu WebView Android vrstvy, 
// jelikož tauriFetch(reqwest) zde občas neověří kořenové certifikáty Googlu z důvodu chybějících Android trust stores.
const apiFetch: typeof fetch = (...args) => fetch(...args);


import { useAlert } from './components/AlertProvider';
import { checkForUpdate } from './utils/updater';
import Sidebar from './components/Sidebar';
import AccountSwitcher, { type SwitcherAccount } from './components/AccountSwitcher';
import MobileHeader from './components/MobileHeader';
import EmailApp from './modules/Email/EmailApp';
import { useCustomLabels, useProfile, useUnreadCounts } from './hooks/useMailboxQueries';
import { useHistoryBack } from './hooks/useHistoryBack';
import type { AppMode } from './components/Sidebar';
import type { UnreadCounts, UserInfo } from './types/account';
import type { GmailLabel } from './types/gmail';
import type { MoveRequest } from './types/email';
import { imapListAccounts, imapListFolders } from './services/imap';
import {
  MailProviderProvider, createGmailProvider, createImapProvider, imapCustomFolders, imapId, imapUnreadCounts,
} from './services/mailProvider';

/** Kliknutí na upozornění o nové poště (posílá Rust – src-tauri/src/mail_watch.rs) */
interface MailWatchOpen {
  kind: 'google' | 'imap';
  account: string;
  messageId: string;
  folder: string;
}

// Načtou se až při prvním otevření – rychlejší start (hlavně na telefonu)
const SettingsModal = lazy(() => import('./components/SettingsModal'));
const CalendarApp = lazy(() => import('./modules/Calendar/CalendarApp'));

function App() {
  const { showAlert, showConfirm } = useAlert();
  const [activeFolder, setActiveFolder] = useState('Doručené');
  const [activeCalendarView, setActiveCalendarView] = useState('Co mě čeká?');
  const [appMode, setAppMode] = useState<AppMode>('email');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  /** Nastavení se načte (lazy) při prvním otevření a pak zůstane připravené */
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [isVerticalLayout, setIsVerticalLayout] = useState(() => {
    const saved = localStorage.getItem('zazijvr_layout_vertical');
    return saved !== null ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    localStorage.setItem('zazijvr_layout_vertical', JSON.stringify(isVerticalLayout));
  }, [isVerticalLayout]);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  /** Aktivní jiný účet (IMAP) – null = pošta z aktivního Google účtu */
  const [activeImap, setActiveImapState] = useState<string | null>(() => {
    try { return localStorage.getItem('vr-active-imap'); } catch { return null; }
  });
  const setActiveImap = useCallback((email: string | null) => {
    setActiveImapState(email);
    try {
      if (email) localStorage.setItem('vr-active-imap', email);
      else localStorage.removeItem('vr-active-imap');
    } catch { /* bez localStorage se volba jen nezapamatuje */ }
  }, []);
  const [savedAccounts, setSavedAccounts] = useState<string[]>([]);

  const loadSavedAccounts = useCallback(async () => {
    try {
      const accounts = await invoke<string[]>('get_saved_accounts');
      setSavedAccounts(accounts);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    let unlistenAction: { unregister: () => Promise<void> } | undefined;

    const setupNotificationListener = async () => {
      try {
        if (typeof window.__TAURI_INTERNALS__ !== 'undefined') {
          await registerActionTypes([{
            id: 'new_email',
            actions: [{
              id: 'view',
              title: 'Zobrazit e-mail',
              foreground: true
            }]
          }]);
          unlistenAction = await onAction(async (notification) => {
            console.log("Kliknuto na notifikaci:", notification);
            // ... (rest of logic safely skipped in browser)
          });
        }
      } catch (err) {
        console.error("Nelze nastavit listener pro notifikace:", err);
      }
    };

    setupNotificationListener();

    return () => {
      unlistenAction?.unregister().catch(() => {});
    };
  }, []);

  useEffect(() => {
    loadSavedAccounts();
  }, [loadSavedAccounts, googleToken]);

  // Tichá kontrola aktualizací chvíli po startu – při nové verzi nabídne otevřít Nastavení
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const update = await checkForUpdate();
        if (update) {
          showConfirm(
            `Je k dispozici nová verze ${update.version}.${update.body ? `\n\n${update.body}` : ''}\n\nInstalace trvá pár vteřin, pak se aplikace sama restartuje.`,
            'Nová verze aplikace',
            () => setIsSettingsOpen(true),
            { type: 'info', confirmText: 'Zobrazit', cancelText: 'Později' }
          );
        }
      } catch (e) {
        console.warn('Kontrola aktualizací selhala', e);
      }
    }, 8000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Uložené přihlášení k účtu už u Googlu neplatí – nabídne nové přihlášení */
  const offerRelogin = (email: string) => {
    showConfirm(
      `Přihlášení k účtu ${email} už neplatí – Google ho zrušil nebo vypršelo.\n\nPřihlaste se k tomuto účtu znovu (v okně Googlu vyberte ${email}).`,
      'Účet je potřeba znovu přihlásit',
      () => loginWithGoogle(),
      { type: 'warning', confirmText: 'Přihlásit znovu', cancelText: 'Zavřít' }
    );
  };

  const switchGoogleAccount = async (email: string) => {
    // Přepnutí z jiného (IMAP) účtu na aktivní Google účet nepotřebuje nové přihlášení
    if (activeImap && email === userInfo?.email) {
      window.dispatchEvent(new Event('vr-account-switched'));
      setActiveImap(null);
      setIsSettingsOpen(false);
      return;
    }
    const previous = userInfo?.email;
    try {
      const refreshToken = await invoke<string>('switch_google_account', { email });
      if (refreshToken) {
        const res = await apiFetch("https://oauth2.googleapis.com/token", {
           method: "POST",
           headers: { "Content-Type": "application/x-www-form-urlencoded" },
           body: new URLSearchParams({
             client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID_DESKTOP,
             client_secret: import.meta.env.VITE_GOOGLE_CLIENT_SECRET,
             refresh_token: refreshToken,
             grant_type: "refresh_token"
           }).toString()
        });
        const data = await res.json();
        if (data.access_token) {
           // Jiný účet – seznam si nesmí vzít poštu z mezipaměti předchozího účtu
           setUserInfo(null);
           window.dispatchEvent(new Event('vr-account-switched'));
           setActiveImap(null);
           setGoogleToken(data.access_token);
           setIsSettingsOpen(false); // zavre po prepnuti modal
           return;
        }
        throw new Error(data.error || 'token_error');
      }
      throw new Error('missing_refresh_token');
    } catch (err) {
      console.error('Chyba prepnuti uctu:', err);
      // Aktivní zůstane účet, na kterém uživatel byl
      if (previous && previous !== email) {
        await invoke('switch_google_account', { email: previous }).catch(() => {});
      }
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes('invalid_grant') || errMsg.includes('missing_refresh_token')) {
        offerRelogin(email);
      } else {
        showAlert(`Na účet ${email} se nepodařilo přepnout.\n\n${errMsg}`, 'Chyba přepnutí účtu', 'error');
      }
    }
  };

  const logoutGoogleAccount = async (email: string) => {
    try {
      await invoke('logout_google_account', { email });
      loadSavedAccounts();
      if (userInfo && userInfo.email === email) {
        setGoogleToken(null);
        setUserInfo(null);
      }
    } catch (err) {
      console.error('Chyba odhlaseni:', err);
    }
  };

  // Úloha na pozadí pro hlídání nejbližších schůzek (Běží i při minimalizaci do System Tray).
  // V režimu Kalendář hlídá připomínky CalendarApp podle nastavení událostí – tady se pak nic nedělá,
  // aby upozornění nechodila dvakrát. Už upozorněné schůzky se pamatují přes přepínání režimů.
  const notifiedEventsRef = useRef(new Set());
  useEffect(() => {
    if (!googleToken || appMode === 'calendar') return;

    const notifiedEvents = notifiedEventsRef.current;

    const fetchUpcomingEvents = async () => {
       try {
         const now = new Date();
         const timeMin = now.toISOString();
         const max = new Date(now.getTime() + 2 * 60 * 60 * 1000); // Mírný předstih 2 hodin
         const timeMax = max.toISOString();

         const primaryUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`;
         const res = await apiFetch(primaryUrl, { headers: { Authorization: `Bearer ${googleToken}` } });
         if (!res.ok) return;
         
         const data = await res.json();
         const events = data.items || [];
         const currentTime = new Date().getTime();

         for (const ev of events) {
            if (notifiedEvents.has(ev.id)) continue;
            if (ev.start && ev.start.dateTime) {
               const startTime = new Date(ev.start.dateTime).getTime();
               const diffMinutes = (startTime - currentTime) / (1000 * 60);

               if (diffMinutes > 0 && diffMinutes <= 15) {
                  let permissionGranted = await isPermissionGranted();
                  if (!permissionGranted) permissionGranted = (await requestPermission()) === 'granted';

                  if (permissionGranted) {
                     sendNotification({
                        title: `🗓️ Blížící se schůzka: ${ev.summary || 'Bez názvu'}`,
                        body: `Začne přesně za ${Math.round(diffMinutes)} minut.`
                     });
                     notifiedEvents.add(ev.id);
                  }
               }
            }
         }
       } catch (err) {
         console.warn("Background calendar check failed", err);
       }
    };

    fetchUpcomingEvents();
    const intervalId = setInterval(fetchUpcomingEvents, 60000); // 1-minutový beat

    return () => clearInterval(intervalId);
  }, [googleToken, appMode]);
  const [unreadCounts, setUnreadCounts] = useState<UnreadCounts>({});
  const [triggerCompose, setTriggerCompose] = useState(0);
  const [triggerCreateEvent, setTriggerCreateEvent] = useState(0);
  const [triggerMove, setTriggerMove] = useState<{ moves: MoveRequest[]; ts: number } | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isSettingsOpen) {
          setIsSettingsOpen(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSettingsOpen]);
  // Tichý auto-refresh tokenu, stabilní odkaz přes useCallback
  const checkSilentLogin = useCallback(async () => {
    try {
      if (!window.__TAURI_INTERNALS__) return; // Vynechá kontrolu tauri, pokud běží v prohlížeči
      console.log("Hledám uložené Google pověření a případně potají žádám o čerstvy Token...");
      const refreshToken = await invoke<string>('get_active_refresh_token');
      if (refreshToken) {
        const isMobile = !('__TAURI_INTERNALS__' in window) || 
                         navigator.userAgent.includes('Android') || 
                         navigator.userAgent.includes('iPhone');

        const requestBody = isMobile ? {
            client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID_MOBILE,
            refresh_token: refreshToken,
            grant_type: "refresh_token"
        } : {
            client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID_DESKTOP,
            client_secret: import.meta.env.VITE_GOOGLE_CLIENT_SECRET,
            refresh_token: refreshToken,
            grant_type: "refresh_token"
        };

        const res = await apiFetch("https://oauth2.googleapis.com/token", {
           method: "POST",
           headers: { "Content-Type": "application/x-www-form-urlencoded" },
           body: new URLSearchParams(requestBody as Record<string, string>).toString()
        });
        const data = await res.json();
        if (data.access_token) {
          console.log("Automatické přihlášení na pozadí proběhlo úspěšně!");
          console.log(`[DEV TESTING] Pro testování na mobilu mimo Tauri zkopíruj tohle URL:\nhttp://${window.location.hostname}:5173/?devToken=${data.access_token}`);
          setGoogleToken(data.access_token);
        } else if (data.error === 'invalid_grant') {
          const email = await invoke<string>('get_active_account').catch(() => '');
          if (email) offerRelogin(email);
        }
      }
    } catch (err) {
      console.log("Uživatel zatím není bezpečně přihlášen k trezoru (nebo token propadl). Chcete-li pokračovat, musíte se přihlásit ručně.", err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- checkSilentLogin se volá jen při startu; offerRelogin jen zobrazuje dialog
  }, []);

  // Vyvolat při úplně prvním spuštění aplikace
  useEffect(() => {
    // DEV MODE: Obejít Tauri a načíst token z GET URL (nebo z lokální paměti po F5)
    const params = new URLSearchParams(window.location.search);
    let devToken = params.get('devToken');

    // Zkusit vytáhnout z paměti pro případ refreshnutí (F5) na webu
    if (!devToken && !window.__TAURI_INTERNALS__) {
      devToken = sessionStorage.getItem('zazij_dev_token');
    }

    if (devToken && !window.__TAURI_INTERNALS__) {
      console.log("DEV MODE OVERRIDE: Nalezen devToken! Spouštím aplikaci v testovacím režimu bez napojení na Tauri backend.");
      setGoogleToken(devToken);
      sessionStorage.setItem('zazij_dev_token', devToken);

      // Smažeme devToken z URL lišty, aby se to uživateli pořád nepletlo do odkazů
      if (params.get('devToken')) {
        window.history.replaceState({}, document.title, "/");
      }

      // Načteme skutečná data z Google, testér chce vidět svou vlastní mailovou schránku a obličej
      apiFetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${devToken}` }
      })
        .then(res => res.json())
        .then(data => {
          if (data.email) {
            setUserInfo({ email: data.email, name: data.name, picture: data.picture });
          } else {
            // Token propadl nebo nemáme scopes
            sessionStorage.removeItem('zazij_dev_token');
            console.error("Profil nevrátil email, token je zřejmě mrtvý");
          }
        })
        .catch(err => {
          console.error("Chyba načítání profilu z devTokenu:", err);
        });

      return;
    }

    // WEB OAUTH FALLBACK (Implicit Grant Flow)
    if (!window.__TAURI_INTERNALS__ && window.location.hash.includes('access_token')) {
      // Google OAuth přesměroval zpět s #access_token=... v URL
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = hashParams.get('access_token');

      if (accessToken) {
        console.log("Úspěšný login webového prohlížeče! Detekován token v URL.");
        // Smažeme Hash z adresní lišty aby URL nevypadalo ošklivě a nezůstal tam token
        window.location.hash = '';

        setGoogleToken(accessToken);

        // U webového přihlášení musíme ručně načíst osobní info přes Google Profile API, protože Rust backend to teď neudělá.
        apiFetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` }
        })
          .then(res => res.json())
          .then(data => {
            setUserInfo({ email: data.email, name: data.name, picture: data.picture });
          })
          .catch(err => console.error("Chyba při načítání profilu u webového přihlášení:", err));

        return;
      }
    }

    checkSilentLogin();
  }, [checkSilentLogin]);

  // Udržování spojení "při životě" (Google Access Tokency mají striktně životnost 1 hodinu)
  // Takže každých 45 minut o něj nenápadně střelíme znova na backend server, aby neusnul e-mail panel.
  useEffect(() => {
    if (!googleToken) return;

    // 45 minut = 45 * 60 * 1000 ms
    const intervalId = setInterval(() => {
      console.log("Preventivní záchrana tokenu: Google token vyprší za 15 minut, probíhá auto-refresh...");
      checkSilentLogin();
    }, 45 * 60 * 1000);

    return () => clearInterval(intervalId);
  }, [googleToken, checkSilentLogin]);

  const loginWithGoogle = async () => {
    try {
      if (!window.__TAURI_INTERNALS__) {
        showAlert('Google zablokuje pokus o přihlášení z neověřené lokální sítě (Error 400: redirect_uri_mismatch).\n\nPro vývoj mobilního UI:\n1. Otevři appku klasicky na Linuxu (Tauri).\n2. Zmáčkni F12 (Konzole).\n3. Po zobrazení mailů zkopíruj vygenerovaný testovací DEV URL odkaz a otevři si ho v mobilním prohlížeči.', 'Jste ve webovém prohlížeči', 'info');
        return;
      }

      console.log('Navazuji zabezpečené oAuth spojení...');

      // Detekujeme Android/iOS pomocí platformy – Tauri na mobile nemá tray-icon ani window events
      const isMobile = !('__TAURI_INTERNALS__' in window) || 
                       navigator.userAgent.includes('Android') || 
                       navigator.userAgent.includes('iPhone');

      if (isMobile) {
        // === ANDROID FLOW: Deep Link ===
        // 1. Rust backend otevře Chrome Custom Tab a vrátí "AWAITING_DEEP_LINK"
        // 2. Čekáme na deep-link callback přes Tauri plugin
        const { onOpenUrl } = await import('@tauri-apps/plugin-deep-link');
        
        let deepLinkResolver = null;
        
        // Nastavíme listener PŘED otevřením prohlížeče
        const deepLinkPromise = new Promise<string>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Přihlášení vypršelo (60s). Zkuste znovu.')), 60000);
          
          deepLinkResolver = async (urls: string[] | string) => {
            clearTimeout(timeout);
            const callbackUrl = Array.isArray(urls) ? urls[0] : urls;
            console.log('[OAuth] Deep link přijat:', callbackUrl);
            
            try {
              const url = new URL(callbackUrl);
              const code = url.searchParams.get('code');
              const error = url.searchParams.get('error');
              
              if (error) reject(new Error(`Google odmítl přihlášení: ${error}`));
              else if (code) resolve(code);
              else reject(new Error('V callback URL nebyl nalezen kód.'));
            } catch {
              reject(new Error('Chybná callback URL: ' + callbackUrl));
            }
          };
          
          onOpenUrl(deepLinkResolver);
        });

        // Otevřeme prohlížeč pro mobil - ten používá GCloud iOS Client ID!
        await invoke('start_google_login', {
          clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID_MOBILE,
        });
        
        console.log('Prohlížeč otevřen, čekám na deep-link callback...');

        // Čekáme na callback
        const authCode = await deepLinkPromise;
        console.log('Kód přijat přes deep-link. Vyměňuji za tokeny...');

        // Token exchange – redirect_uri musí přesně odpovídat tomu co je v Google Console!
        // U iOS / Mobile klientů se neposílá client_secret (neexistuje, vyhodilo by to chybu)
        const res = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID_MOBILE,
            code: String(authCode),
            grant_type: 'authorization_code',
            redirect_uri: 'cz.zazijvr.email:/oauth2redirect'
          }).toString()
        });
        
        const data = await res.json();
        if (!data.access_token) throw new Error('Token exchange selhal: ' + JSON.stringify(data));
        
        const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
          headers: { Authorization: `Bearer ${data.access_token}` }
        });
        const profileData = await profileRes.json();
        
        await invoke('save_google_account', { 
          email: profileData.emailAddress || 'unknown', 
          refreshToken: data.refresh_token || '' 
        });
        
        setGoogleToken(data.access_token);
        if (profileData.emailAddress) setUserInfo({ email: profileData.emailAddress });

      } else {
        // === DESKTOP FLOW: TCP localhost server (beze změny) ===
        const authCode = await invoke('start_google_login', {
          clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID_DESKTOP,
        });
        console.log('Kód přijat. Měním kód za token přístupů...');
        
        const res = await apiFetch("https://oauth2.googleapis.com/token", {
           method: "POST",
           headers: { "Content-Type": "application/x-www-form-urlencoded" },
           body: new URLSearchParams({
             client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID_DESKTOP,
             client_secret: import.meta.env.VITE_GOOGLE_CLIENT_SECRET,
             code: String(authCode),
             grant_type: "authorization_code",
             redirect_uri: "http://localhost:3456/callback"
           }).toString()
        });
        const data = await res.json();
        const accessToken = data.access_token;
        const refreshToken = data.refresh_token;

        if (!accessToken) throw new Error("Chyba při parsování Google tokenu.");

        const profileRes = await apiFetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        const profileData = await profileRes.json();
        const userEmail = profileData.emailAddress;

        await invoke('save_google_account', { email: userEmail, refreshToken: refreshToken || "" });

        console.log(`[DEV TESTING] Pro testování na mobilu mimo Tauri zkopíruj tohle URL:\nhttp://${window.location.hostname}:5173/?devToken=${accessToken}`);
        setUserInfo(null);
        window.dispatchEvent(new Event('vr-account-switched'));
        setGoogleToken(accessToken);
      }

    } catch (error) {
      console.error('Kriticky selhalo spojení s backendem/Google API:', error);
      showAlert('Systémová chyba při startu přihlášení:\n\n' + String(error) + '\n\nZkuste zmáčknout F12 a podívat se do konzole.', 'Chyba přihlášení', 'error');
    }
  };


  const [customLabels, setCustomLabels] = useState<GmailLabel[]>([]);

  const handleMoveCustomFolder = async (id: string, sourceName: string, targetName: string | null) => {
    if (!googleToken) return;

    const basename = sourceName.split('/').pop() || sourceName;
    const newName = targetName ? `${targetName}/${basename}` : basename;

    if (newName === sourceName) {
      showAlert("Pořadí složek na jedné úrovni nelze svévolně měnit, Gmail je automaticky řadí abecedně.", 'Složka zde již je', 'info');
      return;
    }

    // Optimisticky uprav stát pro plynulost UX - rovnou i pro případné podsložky!
    setCustomLabels(prev =>
      prev.map(label => {
        if (label.id === id) return { ...label, name: newName };
        if (label.name.startsWith(sourceName + '/')) { // Podsložky
          const suffix = label.name.substring(sourceName.length);
          return { ...label, name: newName + suffix };
        }
        return label;
      })
    );

    if (activeFolder === sourceName) {
      setActiveFolder(newName);
    }

    // Otevřít složku plynule ihned po vhození, pokud byla sbalená:
    if (targetName) {
      window.dispatchEvent(new CustomEvent('zazijvr_expand_folder', { detail: targetName }));
    }

    try {
      const res = await apiFetch(`https://gmail.googleapis.com/gmail/v1/users/me/labels/${id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${googleToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: id,
          name: newName,
          labelListVisibility: 'labelShow',
          messageListVisibility: 'show'
        })
      });

      const refreshLabelsFromServer = async () => {
        try {
          const dataRes = await apiFetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
            headers: { Authorization: `Bearer ${googleToken}` }
          });
          if (dataRes.ok) {
            const data = await dataRes.json();
            if (data.labels) setCustomLabels((data.labels as GmailLabel[]).filter(l => l.type === 'user'));
          }
        } catch { /* nepovedlo se obnovit složky – zůstane optimistický stav */ }
      };

      if (!res.ok) {
        console.error("Chyba při updatu složky:", await res.text());
        showAlert("Nepodařilo se přesunout složku. Zkontrolujte, že v cíli neexistuje stejnojmenná.", 'Chyba serveru', 'error');
        // Revert pravdou ze serveru
        await refreshLabelsFromServer();
        if (activeFolder === newName) setActiveFolder(sourceName);
      } else {
        // Počkáme chvíli a dotáhneme finální server state pro perfektní synchronizaci
        setTimeout(refreshLabelsFromServer, 500);
      }
    } catch (err) {
      console.error(err);
      // Revert pravdou ze serveru
      try {
        const dataRes = await apiFetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', { headers: { Authorization: `Bearer ${googleToken}` } });
        if (dataRes.ok) {
          const data = await dataRes.json();
          if (data.labels) setCustomLabels((data.labels as GmailLabel[]).filter(l => l.type === 'user'));
        }
      } catch { /* nepovedlo se obnovit složky – zůstane optimistický stav */ }
      if (activeFolder === newName) setActiveFolder(sourceName);
    }
  };

  // Profil, vlastní složky a počty nepřečtených (TanStack Query – nestahují se při každém přepnutí složky)
  const profileQuery = useProfile(googleToken);
  const labelsQuery = useCustomLabels(googleToken);
  const countsQuery = useUnreadCounts(googleToken, labelsQuery.data);

  useEffect(() => {
    const p = profileQuery.data;
    if (p?.emailAddress) setUserInfo({ email: p.emailAddress, messagesTotal: p.messagesTotal });
  }, [profileQuery.data]);

  // Místní stav zůstává kvůli okamžitým změnám (přesun složky, odečet po přečtení) – server ho při dalším stažení srovná
  useEffect(() => {
    if (labelsQuery.data) setCustomLabels(labelsQuery.data);
  }, [labelsQuery.data]);

  useEffect(() => {
    if (countsQuery.data && !activeImap) setUnreadCounts(countsQuery.data);
  }, [countsQuery.data, activeImap]);

  // ───────────── Jiný účet (IMAP): složky, počty, poskytovatel pošty ─────────────
  const imapFoldersQuery = useQuery({
    queryKey: ['imapFolders', activeImap],
    queryFn: () => imapListFolders(activeImap as string),
    enabled: !!activeImap,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  const imapFolders = imapFoldersQuery.data;

  /** Přidané IMAP účty (Seznam, vlastní doména) – pro přepínač v levém panelu */
  const imapAccountsQuery = useQuery({
    queryKey: ['imapAccounts'],
    queryFn: () => imapListAccounts().catch(() => []),
    enabled: typeof window.__TAURI_INTERNALS__ !== 'undefined',
    staleTime: Infinity,
  });
  const imapLabels = useMemo(() => imapCustomFolders(imapFolders ?? []), [imapFolders]);

  useEffect(() => {
    if (activeImap && imapFolders) setUnreadCounts(imapUnreadCounts(imapFolders));
  }, [activeImap, imapFolders]);

  const switchToImap = (email: string) => {
    window.dispatchEvent(new Event('vr-account-switched'));
    setUnreadCounts({});
    setActiveFolder('Doručené');
    setActiveImap(email);
    setIsSettingsOpen(false);
  };

  /** Pošta aktivního účtu (Gmail nebo IMAP) – komponenty pošty pracují jen s tímto rozhraním */
  const mailProvider = useMemo(() => {
    if (activeImap) return createImapProvider(activeImap, imapFolders ?? []);
    if (googleToken && userInfo?.email) return createGmailProvider(googleToken, userInfo.email, customLabels);
    return null;
  }, [activeImap, imapFolders, googleToken, userInfo?.email, customLabels]);
  const mailAccountEmail = activeImap ?? userInfo?.email;

  /** Všechny účty pro přepínač v levém panelu: Google účty a pak ostatní (IMAP) */
  const switcherAccounts = useMemo<SwitcherAccount[]>(() => {
    const google = [...savedAccounts];
    if (userInfo?.email && !google.includes(userInfo.email)) google.unshift(userInfo.email);
    return [
      ...google.map((email) => ({ email, kind: 'google' as const })),
      ...(imapAccountsQuery.data ?? []).map((a) => ({
        email: a.email,
        kind: 'imap' as const,
        provider: /seznam\.cz$/i.test(a.imapHost) ? 'Seznam' : /wedos\.net$/i.test(a.imapHost) ? 'WEDOS' : a.imapHost,
      })),
    ];
  }, [savedAccounts, userInfo?.email, imapAccountsQuery.data]);

  // Hlídání nové pošty na pozadí (Rust) potřebuje údaje Google aplikace pro obnovu přihlášení
  useEffect(() => {
    if (typeof window.__TAURI_INTERNALS__ === 'undefined') return;
    invoke('mail_watch_set_google_client', {
      clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID_DESKTOP ?? '',
      clientSecret: import.meta.env.VITE_GOOGLE_CLIENT_SECRET ?? '',
    }).catch(() => { /* mobil – hlídání neběží */ });
  }, []);

  /** Kliknutí na upozornění: přepnout na účet, otevřít Doručené a zprávu */
  const openFromNotification = async (req: MailWatchOpen) => {
    setAppMode('email');
    setIsSettingsOpen(false);
    setIsMobileMenuOpen(false);
    let id = req.messageId;
    if (req.kind === 'imap') {
      if (activeImap !== req.account) switchToImap(req.account);
      else setActiveFolder('Doručené');
      id = imapId(Number(req.messageId), req.folder);
    } else {
      setActiveFolder('Doručené');
      if (activeImap || userInfo?.email !== req.account) await switchGoogleAccount(req.account);
    }
    // Až se po přepnutí účtu vyprázdní výběr a načte seznam
    setTimeout(() => window.dispatchEvent(new CustomEvent('vr-open-email', { detail: { id } })), 400);
  };
  const openFromNotificationRef = useRef(openFromNotification);
  openFromNotificationRef.current = openFromNotification;
  useEffect(() => {
    if (typeof window.__TAURI_INTERNALS__ === 'undefined') return;
    const unlisten = listen<MailWatchOpen>('mail-watch-open', (e) => { openFromNotificationRef.current(e.payload); });
    return () => { unlisten.then((f) => f()).catch(() => {}); };
  }, []);

  useEffect(() => { if (isSettingsOpen) setSettingsLoaded(true); }, [isSettingsOpen]);

  // Android – Zpět: menu a nastavení se zavírají systémovým Zpět přes historii (useHistoryBack).
  useHistoryBack(isMobileMenuOpen, () => setIsMobileMenuOpen(false));
  useHistoryBack(isSettingsOpen, () => setIsSettingsOpen(false));
  // Tah od levého okraje (MainActivity.kt → __vrOpenMenu) vysune menu, ale jen když je tlačítko
  // menu na obrazovce vidět. Jinak (nebo při chybě) je to běžné Zpět.
  useEffect(() => {
    window.__vrOpenMenu = () => {
      const el = document.getElementById('mobile-hamburger');
      if (!el) return false;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      // Překryté tlačítko (e-mail, psaní, nastavení, menu) nebo zablokované (pointer-events: none) se nepočítá
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!hit || !el.contains(hit)) return false;
      setIsMobileMenuOpen(true);
      return true;
    };
    return () => { delete window.__vrOpenMenu; };
  }, []);

  const selectAccount = (acc: SwitcherAccount) => {
    setIsMobileMenuOpen(false);
    if (acc.kind === 'imap') switchToImap(acc.email);
    else switchGoogleAccount(acc.email);
  };
  const sidebarLabels = activeImap ? imapLabels : customLabels;

  useEffect(() => {
    // F5 = obnovit aktuální složku; Ctrl+F5 = znovu načíst celou aplikaci
    const handleF5 = (e: KeyboardEvent) => {
      if (e.key === 'F5') {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) window.location.reload();
        else window.dispatchEvent(new Event('vr-refresh-folder'));
      }
    };
    window.addEventListener('keydown', handleF5);
    return () => window.removeEventListener('keydown', handleF5);
  }, []);

  return (
    <div className="flex flex-col h-[100dvh] w-full overflow-hidden app-bg relative md:border border-neon-blue/20 shadow-2xl select-none pt-[env(safe-area-inset-top)]">


      <MobileHeader
        toggleSidebar={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        userEmail={activeImap ?? (userInfo?.email || (googleToken ? 'test@zazijvr.cz' : undefined))}
        logoutGoogleAccount={logoutGoogleAccount}
        isImapAccount={!!activeImap}
        onManageAccounts={() => setIsSettingsOpen(true)}
        accounts={switcherAccounts}
        onSelectAccount={selectAccount}
      />


      <div className="flex flex-1 overflow-hidden relative">


        {/* Vizuální scelení celé aplikace shora - kyberpunkový top okraj rozhraní */}
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-neon-blue/80 via-neon-blue/20 to-transparent shadow-[0_0_15px_rgba(0,243,255,0.8)] z-30 md:z-[100] pointer-events-none"></div>

        {/* Overlay pro mobilní menu */}
        {isMobileMenuOpen && (googleToken || activeImap) && (
          <div
            className="fixed inset-0 bg-navy-deep/60 backdrop-blur-sm z-40 md:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}

        {/* Levá navigace */}
        <div className={`fixed inset-y-0 left-0 z-50 md:relative md:z-10 h-full shrink-0 overflow-visible transition-transform duration-300 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} ${googleToken || activeImap ? 'flex' : 'hidden'}`}>
          <Sidebar
            activeFolder={activeFolder}
            setActiveFolder={setActiveFolder}
            activeCalendarView={activeCalendarView}
            setActiveCalendarView={setActiveCalendarView}
            appMode={appMode}
            setAppMode={setAppMode}
            setIsSettingsOpen={setIsSettingsOpen}
            unreadCounts={unreadCounts}
            onComposeNew={() => setTriggerCompose(prev => prev + 1)}
            onCreateNewEvent={() => setTriggerCreateEvent(prev => prev + 1)}
            onMoveEmail={(moves) => setTriggerMove({ moves, ts: Date.now() })}
            onMoveCustomFolder={activeImap ? undefined : handleMoveCustomFolder}
            customLabels={sidebarLabels}
            onMobileClose={() => setIsMobileMenuOpen(false)}
            accountSwitcher={<AccountSwitcher accounts={switcherAccounts} activeEmail={mailAccountEmail} onSelect={selectAccount} />}
          />
        </div>

        {/* Hlavní obsahová oblast s plynulým maskováním na okrajích (pouze na desktopu, aby mobilní view šlo ostře ke kraji displeje) */}
        <div
          className="flex-1 h-full z-10 relative overflow-hidden"
        >
          {appMode === 'email' ? (
            <MailProviderProvider value={mailProvider}>
              <EmailApp
                googleToken={googleToken}
                activeFolder={activeFolder}
                unreadCounts={unreadCounts}
                setUnreadCounts={setUnreadCounts}
                triggerCompose={triggerCompose}
                triggerMove={triggerMove}
                loginWithGoogle={loginWithGoogle}
                isVerticalLayout={isVerticalLayout}
                customLabels={sidebarLabels}
                userEmail={mailAccountEmail}
              />
            </MailProviderProvider>
          ) : (
            <Suspense fallback={null}>
              <CalendarApp
                activeCalendarView={activeCalendarView}
                googleToken={googleToken}
                triggerCreateEvent={triggerCreateEvent}
                userEmail={userInfo?.email}
                imapAccount={activeImap}
                onSwitchToGoogle={userInfo?.email ? () => switchGoogleAccount(userInfo.email) : undefined}
              />
            </Suspense>
          )}
        </div>

        {/* Modální okno pro nastavení – načte se při prvním otevření, pak zůstává připravené */}
        {settingsLoaded && <Suspense fallback={null}><SettingsModal
          isSettingsOpen={isSettingsOpen}
          setIsSettingsOpen={setIsSettingsOpen}
          googleToken={googleToken}
          userInfo={userInfo}
          loginWithGoogle={loginWithGoogle}
          isVerticalLayout={isVerticalLayout}
          setIsVerticalLayout={setIsVerticalLayout}
          savedAccounts={savedAccounts}
          switchGoogleAccount={switchGoogleAccount}
          logoutGoogleAccount={logoutGoogleAccount}
          customLabels={customLabels}
          setCustomLabels={setCustomLabels}
          activeImap={activeImap}
          onSwitchImap={switchToImap}
          onImapAccountsChanged={() => { imapFoldersQuery.refetch(); imapAccountsQuery.refetch(); }}
          onImapAccountRemoved={(email) => { if (email === activeImap) setActiveImap(null); }}
        /></Suspense>}
      </div>
    </div>
  );
}

export default App;
