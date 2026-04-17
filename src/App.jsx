import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { onAction, registerActionTypes } from '@tauri-apps/plugin-notification';
import { message } from '@tauri-apps/plugin-dialog';

import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import SettingsModal from './components/SettingsModal';
import EmailApp from './modules/Email/EmailApp';
import CalendarApp from './modules/Calendar/CalendarApp';

function App() {
  const [activeFolder, setActiveFolder] = useState('Doručené');
  const [activeCalendarView, setActiveCalendarView] = useState('Co mě čeká?');
  const [appMode, setAppMode] = useState('email');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isVerticalLayout, setIsVerticalLayout] = useState(true);
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
      console.log("Hledám uložené Google pověření a případně potají žádám o čerstvý Token...");
      const token = await invoke('check_existing_login', {
        clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        clientSecret: import.meta.env.VITE_GOOGLE_CLIENT_SECRET,
      });
      if (token) {
        console.log("Automatické přihlášení na pozadí proběhlo úspěšně!");
        setGoogleToken(token);
      }
    } catch (err) {
      console.log("Uživatel zatím není bezpečně přihlášen k trezoru (nebo token propadl). Chcete-li pokračovat, musíte se přihlásit ručně.", err);
    }
  }, []);

  // Vyvolat při úplně prvním spuštění aplikace
  useEffect(() => {
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
      console.log('Navazuji zabezpečené oAuth spojení přes Rust backend...');
      const accessToken = await invoke('start_google_login', {
        clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        clientSecret: import.meta.env.VITE_GOOGLE_CLIENT_SECRET,
      });
      console.log('Spojení navázáno, token úspěšně přijat.');
      setGoogleToken(accessToken);
    } catch (error) {
      console.error('Kriticky selhalo spojení s backendem:', error);
    }
  };

  const [customLabels, setCustomLabels] = useState([]);

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
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0f172a] relative rounded-xl border border-[#00f3ff]/20 shadow-2xl select-none">

      <TitleBar />
      
      <div className="flex flex-1 overflow-hidden relative">
      

      {/* Vizuální scelení celé aplikace shora - kyberpunkový top okraj rozhraní */}
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-[#00f3ff]/80 via-[#00f3ff]/20 to-transparent shadow-[0_0_15px_rgba(0,243,255,0.8)] z-[100] pointer-events-none"></div>

      {/* Variace 1: Čistě CSS vykreslované obrazové pozadí pro dokonalý výkon */}
      <div 
        className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.45] z-0" 
        style={{ 
          backgroundImage: "url('/bg_trace.svg?v=3')", 
          backgroundSize: 'cover', 
          backgroundPosition: 'center' 
        }} 
      />

      {/* Levá navigace */}
      <div className="relative z-10 h-full flex shrink-0 overflow-visible">
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
          customLabels={customLabels}
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
