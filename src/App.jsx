import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { onAction, registerActionTypes } from '@tauri-apps/plugin-notification';
import { message } from '@tauri-apps/plugin-dialog';


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
           
           try {
             const win = getCurrentWindow();
             await win.unminimize();
             await win.show();
             
             // Agresivní hack na prokopnutí Linux (Wayland/Gnome) Focus zdi
             await win.setAlwaysOnTop(true);
             await win.setFocus();
             setTimeout(() => {
                win.setAlwaysOnTop(false);
             }, 500);
             
             // Fallback if focus doesn't work
             if (win.requestUserAttention) {
                await win.requestUserAttention(1); // 1 = Critical
             }
           } catch(e) {
             console.error(e);
           }
        });
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
      const accessToken = await invoke('switch_google_account', {
        email,
        clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        clientSecret: import.meta.env.VITE_GOOGLE_CLIENT_SECRET,
      });
      setGoogleToken(accessToken);
      setIsSettingsOpen(false); // zavre po prepnuti modal
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
      const token = await invoke('check_existing_login', {
        clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        clientSecret: import.meta.env.VITE_GOOGLE_CLIENT_SECRET,
      });
      if (token) {
        console.log("Automatické přihlášení na pozadí proběhlo úspěšně!");
        console.log(`[DEV TESTING] Pro testování na mobilu mimo Tauri zkopíruj tohle URL:\nhttp://${window.location.hostname}:5173/?devToken=${token}`);
        setGoogleToken(token);
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
       fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
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
          fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
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
      console.log('Navazuji zabezpečené oAuth spojení přes Rust backend...');
      const accessToken = await invoke('start_google_login', {
        clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        clientSecret: import.meta.env.VITE_GOOGLE_CLIENT_SECRET,
      });
      console.log('Spojení navázáno, token úspěšně přijat.');
      console.log(`[DEV TESTING] Pro testování na mobilu mimo Tauri zkopíruj tohle URL:\nhttp://${window.location.hostname}:5173/?devToken=${accessToken}`);
      setGoogleToken(accessToken);
    } catch (error) {
      console.error('Kriticky selhalo spojení s backendem:', error);
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
      const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/labels/${id}`, {
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
            const dataRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
               headers: { Authorization: `Bearer ${googleToken}` }
            });
            if (dataRes.ok) {
               const data = await dataRes.json();
               if (data.labels) setCustomLabels(data.labels.filter(l => l.type === 'user'));
            }
         } catch(e) {}
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
         const dataRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', { headers: { Authorization: `Bearer ${googleToken}` } });
         if (dataRes.ok) {
            const data = await dataRes.json();
            if (data.labels) setCustomLabels(data.labels.filter(l => l.type === 'user'));
         }
      } catch(e) {}
      if (activeFolder === newName) setActiveFolder(sourceName);
    }
  };

  useEffect(() => {
    if (googleToken) {
      fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
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
          const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
            headers: { Authorization: `Bearer ${googleToken}` }
          });
          if (res.ok) {
            const data = await res.json();
            if (data.labels) {
              const userLabels = data.labels.filter(l => l.type === 'user');
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

          for (const {name, id} of targets) {
            const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/labels/${id}`, {
              headers: { Authorization: `Bearer ${googleToken}` }
            });
            if (res.ok) {
              const data = await res.json();
              if (data.messagesUnread > 0) {
                counts[name] = data.messagesUnread;
              }
            }
          }
          setUnreadCounts(counts);
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
    <div className="flex flex-col h-[100dvh] w-full overflow-hidden bg-[#0f172a] relative md:border border-[#00f3ff]/20 shadow-2xl select-none">


      <MobileHeader 
         toggleSidebar={() => setIsMobileMenuOpen(!isMobileMenuOpen)} 
         userEmail={userInfo?.email || (googleToken ? 'test@zazijvr.cz' : undefined)} 
         logoutGoogleAccount={logoutGoogleAccount}
      />

      
      <div className="flex flex-1 overflow-hidden relative">
      

      {/* Vizuální scelení celé aplikace shora - kyberpunkový top okraj rozhraní */}
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-[#00f3ff]/80 via-[#00f3ff]/20 to-transparent shadow-[0_0_15px_rgba(0,243,255,0.8)] z-30 md:z-[100] pointer-events-none"></div>

      {/* Variace 1: Čistě CSS vykreslované obrazové pozadí pro dokonalý výkon */}
      <div 
        className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.45] z-0" 
        style={{ 
          backgroundImage: "url('/bg_trace.svg?v=3')", 
          backgroundSize: 'cover', 
          backgroundPosition: 'center' 
        }} 
      />

      {/* Overlay pro mobilní menu */}
      {isMobileMenuOpen && googleToken && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden" 
          onClick={() => setIsMobileMenuOpen(false)} 
        />
      )}

      {/* Levá navigace */}
      <div className={`fixed inset-y-0 left-0 z-50 md:relative md:z-10 h-full shrink-0 overflow-visible transition-transform duration-300 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} ${googleToken ? 'flex' : 'hidden'}`}>
        {/* Levé spodní zrcadlové rozhraní sběrnice (Crisp část v Sidebar) */}
        <div className="absolute left-0 bottom-0 h-[114px] w-[256px] overflow-hidden z-[30] pointer-events-none">
           <div className="absolute left-0 bottom-0 h-[114px] w-[400px] opacity-40 rotate-180">
             <svg width="100%" height="100%" viewBox="0 0 400 114" fill="none" xmlns="http://www.w3.org/2000/svg">
               <defs>
                 <filter id="bottomLeftMiniGlow" x="-20%" y="-20%" width="140%" height="140%">
                   <feGaussianBlur stdDeviation="3" result="blur1" />
                   <feGaussianBlur stdDeviation="8" result="blur2" />
                   <feMerge>
                       <feMergeNode in="blur2" />
                       <feMergeNode in="blur1" />
                       <feMergeNode in="SourceGraphic" />
                   </feMerge>
                 </filter>
               </defs>
               <path d="M 50 -20 L 50 10 L 80 40 L 150 40 L 200 80 L 400 80" stroke="#00f3ff" strokeWidth="2" filter="url(#bottomLeftMiniGlow)" />
               <path d="M 50 -20 L 50 10 L 80 40 L 150 40 L 200 80 L 400 80" stroke="#ffffff" strokeWidth="1" strokeOpacity="0.5" filter="url(#bottomLeftMiniGlow)" />
               <path d="M 20 -20 L 20 0 L 35 15 L 180 15 L 220 50 L 400 50" stroke="#f800ff" strokeWidth="1.5" strokeOpacity="0.8" filter="url(#bottomLeftMiniGlow)" />
               <path d="M 90 -20 L 90 60 L 130 100 L 250 100 L 280 65 L 400 65" stroke="#00f3ff" strokeWidth="1" strokeOpacity="0.5" filter="url(#bottomLeftMiniGlow)" />
               <circle cx="80" cy="40" r="4" fill="#0f172a" stroke="#00f3ff" strokeWidth="1.5" filter="url(#bottomLeftMiniGlow)" />
               <circle cx="200" cy="80" r="3" fill="#00f3ff" filter="url(#bottomLeftMiniGlow)" />
               <circle cx="35" cy="15" r="3" fill="#f800ff" filter="url(#bottomLeftMiniGlow)" />
               <circle cx="220" cy="50" r="5" fill="#0f172a" stroke="#f800ff" strokeWidth="1.5" filter="url(#bottomLeftMiniGlow)" />
               <circle cx="130" cy="100" r="2" fill="#00f3ff" filter="url(#bottomLeftMiniGlow)" />
             </svg>
           </div>
        </div>

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

      {/* Hlavní obsahová oblast s plynulým maskováním na okrajích */}
      <div 
         className="flex-1 h-full z-10 relative overflow-hidden"
         style={{ maskImage: "linear-gradient(to right, transparent, black 15px, black calc(100% - 15px), transparent)" }}
      >
        {/* Dekorativní hexagon maska napravo */}
        <div className="absolute right-[-100px] top-[10%] w-[400px] h-[800px] bg-[#f800ff] opacity-5 mix-blend-screen blur-[100px] pointer-events-none rounded-[100%] z-0"></div>

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
