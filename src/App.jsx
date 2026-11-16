import React, { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { onAction, registerActionTypes, isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { message } from '@tauri-apps/plugin-dialog';
// Vracíme čistý nativní fetch pro přímou podporu WebView Android vrstvy, 
// jelikož tauriFetch(reqwest) zde občas neověří kořenové certifikáty Googlu z důvodu chybějících Android trust stores.
const apiFetch = (...args) => fetch(...args);


import { useAlert } from './components/AlertProvider';
import Sidebar from './components/Sidebar';
import SettingsModal from './components/SettingsModal';
import MobileHeader from './components/MobileHeader';
import EmailApp from './modules/Email/EmailApp';
import CalendarApp from './modules/Calendar/CalendarApp';

function App() {
  const { showAlert } = useAlert();
  const [activeFolder, setActiveFolder] = useState('Doručené');
  const [activeCalendarView, setActiveCalendarView] = useState('Co mě čeká?');
  const [appMode, setAppMode] = useState('email');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isVerticalLayout, setIsVerticalLayout] = useState(() => {
    const saved = localStorage.getItem('zazijvr_layout_vertical');
    return saved !== null ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    localStorage.setItem('zazijvr_layout_vertical', JSON.stringify(isVerticalLayout));
  }, [isVerticalLayout]);
  const [googleToken, setGoogleToken] = useState(null);
  const [userInfo, setUserInfo] = useState(null);
  const [savedAccounts, setSavedAccounts] = useState([]);

  const loadSavedAccounts = useCallback(async () => {
    try {
      const accounts = await invoke('get_saved_accounts');
      setSavedAccounts(accounts);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    let unlistenAction;

    const setupNotificationListener = async () => {
      try {
        if (typeof window.__TAURI_INTERNALS__ !== 'undefined' || typeof window.__TAURI__ !== 'undefined') {
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
      if (unlistenAction) unlistenAction();
    };
  }, []);

  useEffect(() => {
    loadSavedAccounts();
  }, [loadSavedAccounts, googleToken]);

  const switchGoogleAccount = async (email) => {
    try {
      const refreshToken = await invoke('switch_google_account', { email });
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
           setGoogleToken(data.access_token);
           setIsSettingsOpen(false); // zavre po prepnuti modal
        }
      }
    } catch (err) {
      console.error('Chyba prepnuti uctu:', err);
    }
  };

  const logoutGoogleAccount = async (email) => {
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
                  if (!permissionGranted) permissionGranted = await requestPermission();

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
  const [unreadCounts, setUnreadCounts] = useState({});
  const [triggerCompose, setTriggerCompose] = useState(0);
  const [triggerCreateEvent, setTriggerCreateEvent] = useState(0);
  const [triggerMove, setTriggerMove] = useState(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
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
      const refreshToken = await invoke('get_active_refresh_token');
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
           body: new URLSearchParams(requestBody).toString()
        });
        const data = await res.json();
        if (data.access_token) {
          console.log("Automatické přihlášení na pozadí proběhlo úspěšně!");
          console.log(`[DEV TESTING] Pro testování na mobilu mimo Tauri zkopíruj tohle URL:\nhttp://${window.location.hostname}:5173/?devToken=${data.access_token}`);
          setGoogleToken(data.access_token);
        }
      }
    } catch (err) {
      console.log("Uživatel zatím není bezpečně přihlášen k trezoru (nebo token propadl). Chcete-li pokračovat, musíte se přihlásit ručně.", err);
    }
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
        const deepLinkPromise = new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Přihlášení vypršelo (60s). Zkuste znovu.')), 60000);
          
          deepLinkResolver = async (urls) => {
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
            } catch (e) {
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
            code: authCode,
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
             code: authCode,
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
        setGoogleToken(accessToken);
      }

    } catch (error) {
      console.error('Kriticky selhalo spojení s backendem/Google API:', error);
      showAlert('Systémová chyba při startu přihlášení:\n\n' + String(error) + '\n\nZkuste zmáčknout F12 a podívat se do konzole.', 'Chyba přihlášení', 'error');
    }
  };


  const [customLabels, setCustomLabels] = useState([]);

  const handleMoveCustomFolder = async (id, sourceName, targetName) => {
    if (!googleToken) return;

    const basename = sourceName.split('/').pop();
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
            if (data.labels) setCustomLabels(data.labels.filter(l => l.type === 'user'));
          }
        } catch (e) { }
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
          if (data.labels) setCustomLabels(data.labels.filter(l => l.type === 'user'));
        }
      } catch (e) { }
      if (activeFolder === newName) setActiveFolder(sourceName);
    }
  };

  useEffect(() => {
    if (googleToken) {
      apiFetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: { Authorization: `Bearer ${googleToken}` }
      })
        .then(res => res.json())
        .then(data => {
          setUserInfo({ email: data.emailAddress, messagesTotal: data.messagesTotal });
        })
        .catch(err => console.error("Chyba při stahování profilu:", err));

      let loadedUserLabels = [];

      const fetchLabels = async () => {
        try {
          const res = await apiFetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
            headers: { Authorization: `Bearer ${googleToken}` }
          });
          if (res.ok) {
            const data = await res.json();
            if (data.labels) {
              // Filtrace všech custom lableů vytvořených uživatelem
              let userLabels = data.labels.filter(l => l.type === 'user');
              
              // 1. Zjištění/Založení Master synchronizačního štítku VR-Replied
              const syncLabelName = 'VR-Replied';
              let repliedLabel = userLabels.find(l => l.name === syncLabelName);
              
              if (!repliedLabel) {
                 try {
                   console.log("Zakládám tajný master štítek VR-Replied pro cloud sync odpovědí...");
                   const createRes = await apiFetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
                     method: 'POST',
                     headers: { 
                       Authorization: `Bearer ${googleToken}`,
                       'Content-Type': 'application/json'
                     },
                     body: JSON.stringify({
                       name: syncLabelName,
                       labelListVisibility: 'labelHide',
                       messageListVisibility: 'hide'
                     })
                   });
                   if (createRes.ok) {
                     repliedLabel = await createRes.json();
                     console.log("Tajný štítek založen:", repliedLabel.id);
                     userLabels.push(repliedLabel); // dočasně ho přidáme aby ho poznala apka
                   }
                 } catch(e) { console.error("Nelze založit VR-Replied štítek", e); }
              }

              // Pokud ho máme, uložíme si jeho ID do globálního localStorage, aby na něj ostatní komponenty (EmailList/Composer) snáz dosáhly okamžitě, když API ještě probíhá
              if (repliedLabel) {
                localStorage.setItem('vr-replied-label-id', repliedLabel.id);
              }

              // Odstranění tajných štítků z vyobrazení postranního navigačního panelu složek
              userLabels = userLabels.filter(l => l.name !== syncLabelName);
              
              setCustomLabels(userLabels);
              loadedUserLabels = userLabels;
            }
          }
        } catch (err) { console.error("Chyba při načítání štítků:", err); }
      };

      const fetchCounts = async () => {
        const folderMapping = {
          'Doručené': 'INBOX',
          'Odeslané': 'SENT',
          'Důležité': 'STARRED',
          'Rozepsané': 'DRAFT',
          'Spam': 'SPAM',
          'Koš': 'TRASH'
        };
        try {
          const counts = {};

          // Combine system and custom labels for counting
          const targets = Object.entries(folderMapping).map(([name, id]) => ({ name, id }));
          loadedUserLabels.forEach(l => targets.push({ name: l.name, id: l.id }));

          // Skryté / minimalizované okno – počty se dotáhnou při dalším ticku po návratu
          if (document.hidden) return;

          // Všechny složky najednou (dřív jedna po druhé)
          await Promise.all(targets.map(async ({ name, id }) => {
            const res = await apiFetch(`https://gmail.googleapis.com/gmail/v1/users/me/labels/${id}`, {
              headers: { Authorization: `Bearer ${googleToken}` }
            });
            if (res.ok) {
              const data = await res.json();
              if (data.messagesUnread > 0) {
                counts[name] = data.messagesUnread;
              }
            }
          }));
          // Nový objekt jen při změně – jinak by se každých 10 s překreslila celá aplikace
          setUnreadCounts(prev => {
            const prevKeys = Object.keys(prev);
            const same = prevKeys.length === Object.keys(counts).length && prevKeys.every(k => prev[k] === counts[k]);
            return same ? prev : counts;
          });
        } catch (err) {
          console.error("Chyba při načítání nepřečtených e-mailů", err);
        }
      };

      fetchLabels().then(fetchCounts);
      const intervalId = setInterval(fetchCounts, 10000);
      return () => clearInterval(intervalId);
    }
  }, [googleToken, activeFolder]);

  useEffect(() => {
    const handleF5 = (e) => {
      if (e.key === 'F5') {
        e.preventDefault();
        window.location.reload();
      }
    };
    window.addEventListener('keydown', handleF5);
    return () => window.removeEventListener('keydown', handleF5);
  }, []);

  return (
    <div className="flex flex-col h-[100dvh] w-full overflow-hidden app-bg relative md:border border-[#00f3ff]/20 shadow-2xl select-none pt-[env(safe-area-inset-top)]">


      <MobileHeader
        toggleSidebar={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        userEmail={userInfo?.email || (googleToken ? 'test@zazijvr.cz' : undefined)}
        logoutGoogleAccount={logoutGoogleAccount}
      />


      <div className="flex flex-1 overflow-hidden relative">


        {/* Vizuální scelení celé aplikace shora - kyberpunkový top okraj rozhraní */}
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-[#00f3ff]/80 via-[#00f3ff]/20 to-transparent shadow-[0_0_15px_rgba(0,243,255,0.8)] z-30 md:z-[100] pointer-events-none"></div>

        {/* Overlay pro mobilní menu */}
        {isMobileMenuOpen && googleToken && (
          <div
            className="fixed inset-0 bg-[#020817]/60 backdrop-blur-sm z-40 md:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}

        {/* Levá navigace */}
        <div className={`fixed inset-y-0 left-0 z-50 md:relative md:z-10 h-full shrink-0 overflow-visible transition-transform duration-300 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} ${googleToken ? 'flex' : 'hidden'}`}>
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
            onMoveCustomFolder={handleMoveCustomFolder}
            customLabels={customLabels}
            onMobileClose={() => setIsMobileMenuOpen(false)}
          />
        </div>

        {/* Hlavní obsahová oblast s plynulým maskováním na okrajích (pouze na desktopu, aby mobilní view šlo ostře ke kraji displeje) */}
        <div
          className="flex-1 h-full z-10 relative overflow-hidden"
        >
          {appMode === 'email' ? (
            <EmailApp
              googleToken={googleToken}
              activeFolder={activeFolder}
              unreadCounts={unreadCounts}
              setUnreadCounts={setUnreadCounts}
              triggerCompose={triggerCompose}
              triggerMove={triggerMove}
              loginWithGoogle={loginWithGoogle}
              isVerticalLayout={isVerticalLayout}
              customLabels={customLabels}
              userEmail={userInfo?.email}
            />
          ) : (
            <CalendarApp
              activeCalendarView={activeCalendarView}
              googleToken={googleToken}
              triggerCreateEvent={triggerCreateEvent}
              userEmail={userInfo?.email}
            />
          )}
        </div>

        {/* Skryté modální okno pro nastavení */}
        <SettingsModal
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
        />
      </div>
    </div>
  );
}

export default App;
