import React, { useState, useEffect, useRef } from 'react';
import { Menu, LogOut, Search, X } from 'lucide-react';
import { getAvatarInitial } from '../utils/emailParser';

export default function MobileHeader({ 
  toggleSidebar, 
  userEmail, 
  logoutGoogleAccount 
}) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);

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

  const handleSearchChange = (e) => {
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
    const handleClickOutside = (event) => {
      // Check if the click was outside the dropdown container
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
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
    <div className="md:hidden flex items-center justify-between px-4 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top,2rem))] bg-[#0a1630]/70 border-b border-[#00f3ff]/20 z-40 relative">
      <div className="absolute right-0 top-0 h-[100px] w-[250px] pointer-events-none opacity-60 z-0 overflow-hidden">
         <img src="/neon_corner.png" alt="" draggable="false" className="absolute right-0 top-0 w-[170px] h-auto max-w-none" />
      </div>
      <button 
        id="mobile-hamburger"
        onClick={toggleSidebar}
        className={`relative z-10 p-2 -ml-2 text-[#00f3ff] rounded-xl transition-all ${userEmail ? 'hover:bg-[#00f3ff]/10 active:scale-95' : 'blur-[3px] opacity-30 pointer-events-none'}`}
      >
        <Menu size={26} strokeWidth={2.5} />
      </button>

      <div id="mobile-logo" className="relative z-10 flex-1 flex items-center justify-center h-full">
        {/* Search Input Box */}
        <div 
          className={`absolute w-full px-4 flex items-center justify-center transition-all duration-300 ease-in-out ${isSearchActive ? 'opacity-100 visible z-20 translate-y-0' : 'opacity-0 invisible z-0 translate-y-1'}`}
        >
          <div className="w-full max-w-[250px] relative flex items-center">
            <Search size={16} className="absolute left-3 text-[#00f3ff]/50" />
            <input 
              ref={searchInputRef}
              type="text" 
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="Hledat e-mail..." 
              className="w-full bg-[#00f3ff]/10 border border-[#00f3ff]/30 rounded-xl py-1.5 pl-9 pr-8 text-white text-sm outline-none focus:border-[#00f3ff] transition-colors placeholder:text-[#00f3ff]/30"
            />
            {searchQuery && (
              <button onClick={closeSearch} className="absolute right-2 text-[#00f3ff]/60 hover:text-[#00f3ff]">
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Logo */}
        <img
          src="/cropped-logo-neon-pruhledna-150x50.png"
          alt="ZažijVR"
          className={`h-7 object-contain drop-shadow-[0_0_10px_rgba(0,243,255,0.6)] pointer-events-none transition-all duration-500 ease-out absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 ${isSearchActive ? 'opacity-0 invisible scale-50 blur-md' : 'opacity-100 visible scale-100 blur-0'}`}
        />
      </div>

      <div id="mobile-user" ref={dropdownRef} className={`relative z-50 transition-all duration-500 ${!userEmail ? 'blur-[3px] opacity-30 pointer-events-none' : ''}`}>
        <button 
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="w-10 h-10 rounded-full bg-[#020817]/90 backdrop-blur-md border-[1.5px] border-[#00f3ff]/60 flex items-center justify-center font-extrabold text-[#00f3ff] drop-shadow-[0_0_10px_rgba(0,243,255,0.8)] shadow-[inset_0_0_15px_rgba(0,243,255,0.3)] transition-transform active:scale-95 hover:border-[#00f3ff]"
        >
          {getAvatarInitial(userEmail)}
        </button>

        {isDropdownOpen && (
          <div className="absolute right-0 top-14 w-64 bg-[#061026] border border-[#00f3ff]/30 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.9)] z-50 overflow-hidden flex flex-col">
            <div className="px-4 py-4 bg-[#00f3ff]/5 border-b border-[#00f3ff]/10 flex flex-col items-center">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#00f3ff]/20 to-[#f72585]/20 border border-[#00f3ff]/40 flex items-center justify-center font-black text-2xl text-[#00f3ff] mb-3 shadow-[0_0_15px_rgba(0,243,255,0.3)]">
                {getAvatarInitial(userEmail)}
              </div>
              <span className="text-sm font-bold text-white truncate max-w-full text-center w-full">{userEmail || 'Nepřihlášen'}</span>
            </div>
            
            <button
              onClick={() => {
                setIsDropdownOpen(false);
                logoutGoogleAccount(userEmail);
              }}
              className="w-full text-left px-4 py-4 flex items-center justify-center gap-3 text-[#ff3366] hover:bg-[#ff3366]/10 transition-colors"
            >
              <LogOut size={18} />
              <span className="font-bold tracking-widest text-xs uppercase">Odhlásit bezpečně</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
