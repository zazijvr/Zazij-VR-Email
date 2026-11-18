import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import { Check, Mail, Menu, LogOut, Search, Settings, X } from 'lucide-react';
import { getAvatarInitial } from '../utils/emailParser';
import { openZazijvrWeb } from '../utils/zazijvrWeb';
import type { SwitcherAccount } from './AccountSwitcher';
import { RudolphOverlay } from './ThemeDecor';
import { SakuraBranch } from './ThemeDecor';
import UnreadBadge from './UnreadBadge';

interface MobileHeaderProps {
  toggleSidebar: () => void;
  userEmail?: string;
  logoutGoogleAccount: (email: string) => void;
  /** Otevřený je jiný (IMAP) účet – místo odhlášení Googlu nabídnout správu účtů */
  isImapAccount?: boolean;
  onManageAccounts?: () => void;
  /** Všechny účty (Google i IMAP) – v rozbalovacím okně u ikony účtu se mezi nimi přepíná */
  accounts?: SwitcherAccount[];
  onSelectAccount?: (account: SwitcherAccount) => void;
}

export default function MobileHeader({
  toggleSidebar,
  userEmail,
  logoutGoogleAccount,
  isImapAccount = false,
  onManageAccounts,
  accounts = [],
  onSelectAccount,
}: MobileHeaderProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleSearchToggle = () => {
      setIsSearchActive(prev => {
        if (!prev) {
          setTimeout(() => searchInputRef.current?.focus(), 100);
          return true;
        }
        // Při zavírání přes toggle (vrátí false) se vymaže query stejně jako u křížku
        setSearchQuery('');
        window.dispatchEvent(new CustomEvent('vr-mobile-search-query-change', { detail: '' }));
        return false;
      });
    };
    window.addEventListener('vr-mobile-search-toggle', handleSearchToggle);
    return () => window.removeEventListener('vr-mobile-search-toggle', handleSearchToggle);
  }, []);

  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setSearchQuery(q);
    window.dispatchEvent(new CustomEvent('vr-mobile-search-query-change', { detail: q }));
  };

  const closeSearch = () => {
    setIsSearchActive(false);
    setSearchQuery('');
    window.dispatchEvent(new CustomEvent('vr-mobile-search-query-change', { detail: '' }));
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Check if the click was outside the dropdown container
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        event.stopPropagation();
        event.preventDefault();
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) {
      // Use capture phase to intercept the click before it reaches other elements
      document.addEventListener('click', handleClickOutside, true);
    }
    return () => {
      document.removeEventListener('click', handleClickOutside, true);
    };
  }, [isDropdownOpen]);

  return (
    // Odsazení pod stavový řádek už má celá aplikace (App) – tady se nepřidává, jinak vznikl prázdný pás
    // Hlavička sama nic neořezává – jinak by ořízla i rozbalovací okno účtů pod ikonou
    <div className="md:hidden flex items-center justify-between px-4 py-2 bg-navy-card/70 border-b border-neon-blue/20 z-40 relative">
      {/* Motiv desky plošných spojů – vedle ikony uživatele, oříznutý výškou hlavičky */}
      {/* Motiv Sakura: místo neonových čar kvetoucí větev z pravého horního rohu (za ikonou účtu) */}
      <SakuraBranch flip className="absolute right-0 top-0 w-[150px] h-[66px] pointer-events-none z-0" />
      <div className="vr-corner-art absolute right-0 top-0 h-full w-[250px] pointer-events-none opacity-60 z-0 overflow-hidden">
         <img src="/neon_corner.png" alt="" draggable="false" className="vr-neon-art absolute right-0 top-0 w-[170px] h-auto max-w-none" />
      </div>
      <button 
        id="mobile-hamburger"
        onClick={toggleSidebar}
        className={`relative z-10 p-2 -ml-2 text-neon-blue rounded-xl transition-all ${userEmail ? 'hover:bg-neon-blue/10 active:scale-95' : 'blur-[3px] opacity-30 pointer-events-none'}`}
      >
        <Menu size={26} strokeWidth={2.5} />
      </button>

      <div id="mobile-logo" className="relative z-10 flex-1 flex items-center justify-center h-full">
        {/* Search Input Box */}
        <div 
          className={`absolute w-full px-4 flex items-center justify-center transition-all duration-300 ease-in-out ${isSearchActive ? 'opacity-100 visible z-20 translate-y-0' : 'opacity-0 invisible z-0 translate-y-1'}`}
        >
          <div className="w-full max-w-[250px] relative flex items-center">
            <Search size={16} className="absolute left-3 text-neon-blue/50" />
            <input 
              ref={searchInputRef}
              type="text" 
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="Hledat e-mail..." 
              className="w-full bg-neon-blue/10 border border-neon-blue/30 rounded-xl py-1.5 pl-9 pr-8 text-white text-sm outline-none focus:border-neon-blue transition-colors placeholder:text-neon-blue/30"
            />
            {searchQuery && (
              <button onClick={closeSearch} className="absolute right-2 text-neon-blue/60 hover:text-neon-blue">
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Logo – probliká jako neon, klepnutí otevře zazijvr.cz */}
        <button
          type="button"
          onClick={openZazijvrWeb}
          title="zazijvr.cz"
          aria-label="Otevřít web ZažijVR"
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-1 transition-all duration-500 ease-out active:scale-95 ${isSearchActive ? 'opacity-0 invisible scale-50' : 'opacity-100 visible scale-100'}`}
        >
          <span className="vr-logo-wrap relative block">
            <img src="/cropped-logo-neon-pruhledna-150x50.png" alt="ZažijVR" draggable="false" className="vr-neon-logo h-7 w-auto object-contain" />
            <span className="vr-logo-tint vr-neon-logo" aria-hidden="true" />
            <RudolphOverlay />
          </span>
        </button>
      </div>

      <div id="mobile-user" ref={dropdownRef} className={`relative z-50 transition-all duration-500 ${!userEmail ? 'blur-[3px] opacity-30 pointer-events-none' : ''}`}>
        <button 
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="w-10 h-10 rounded-full bg-navy-deep/90 backdrop-blur-md border-[1.5px] border-neon-blue/60 flex items-center justify-center font-extrabold text-neon-blue drop-shadow-[0_0_10px_rgb(var(--c-neon-blue)/0.8)] shadow-[inset_0_0_15px_rgb(var(--c-neon-blue)/0.3)] transition-transform active:scale-95 hover:border-neon-blue"
        >
          {getAvatarInitial(userEmail)}
        </button>

        {isDropdownOpen && (
          <div className="absolute right-0 top-14 w-64 bg-navy border border-neon-blue/30 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.9)] z-50 overflow-hidden flex flex-col">
            <div className="px-4 py-4 bg-neon-blue/5 border-b border-neon-blue/10 flex flex-col items-center">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-neon-blue/20 to-neon-purple/20 border border-neon-blue/40 flex items-center justify-center font-black text-2xl text-neon-blue mb-3 shadow-[0_0_15px_rgb(var(--c-neon-blue)/0.3)]">
                {getAvatarInitial(userEmail)}
              </div>
              <span className="text-sm font-bold text-white truncate max-w-full text-center w-full">{userEmail || 'Nepřihlášen'}</span>
            </div>

            {/* Přepnutí na jiný účet */}
            {accounts.length > 1 && (
              <div className="flex flex-col py-1.5 border-b border-neon-blue/10 max-h-72 overflow-y-auto">
                <span className="px-4 pt-1 pb-1.5 text-[10px] font-bold tracking-widest uppercase text-slate-500">Přepnout účet</span>
                {accounts.map((acc) => {
                  const isActive = acc.email === userEmail;
                  return (
                    <button
                      key={`${acc.kind}:${acc.email}`}
                      onClick={() => { setIsDropdownOpen(false); if (!isActive) onSelectAccount?.(acc); }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${isActive ? 'bg-neon-blue/10' : 'active:bg-white/5'}`}
                    >
                      <Mail size={16} className={isActive ? 'text-neon-blue shrink-0' : 'text-slate-500 shrink-0'} />
                      <span className="flex flex-col min-w-0 flex-1">
                        <span className={`text-sm truncate ${isActive ? 'text-neon-blue font-bold' : 'text-slate-200'}`}>{acc.email}</span>
                        <span className="text-[11px] text-slate-500">{acc.provider || (acc.kind === 'google' ? 'Google' : 'Jiný účet')}</span>
                      </span>
                      <UnreadBadge count={acc.unread} />
                      {isActive && <Check size={16} className="text-neon-blue shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
            
            {isImapAccount ? (
              <button
                onClick={() => { setIsDropdownOpen(false); onManageAccounts?.(); }}
                className="w-full text-left px-4 py-4 flex items-center justify-center gap-3 text-neon-blue hover:bg-neon-blue/10 transition-colors"
              >
                <Settings size={18} />
                <span className="font-bold tracking-widest text-xs uppercase">Spravovat účty</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  setIsDropdownOpen(false);
                  if (userEmail) logoutGoogleAccount(userEmail);
                }}
                className="w-full text-left px-4 py-4 flex items-center justify-center gap-3 text-neon-red hover:bg-neon-red/10 transition-colors"
              >
                <LogOut size={18} />
                <span className="font-bold tracking-widest text-xs uppercase">Odhlásit bezpečně</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
