import React, { useState } from 'react';
import { Menu, LogOut } from 'lucide-react';
import { getAvatarInitial } from '../utils/emailParser';

export default function MobileHeader({ 
  toggleSidebar, 
  userEmail, 
  logoutGoogleAccount 
}) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  return (
    <div className="md:hidden flex items-center justify-between px-4 h-16 bg-black/60 backdrop-blur-md border-b border-[#00f3ff]/20 z-40 relative">
      <button 
        onClick={toggleSidebar}
        className={`p-2 -ml-2 text-[#00f3ff] rounded-xl transition-all ${userEmail ? 'hover:bg-[#00f3ff]/10 active:scale-95' : 'blur-[3px] opacity-30 pointer-events-none'}`}
      >
        <Menu size={26} strokeWidth={2.5} />
      </button>

      <div className="flex-1 flex justify-center pointer-events-none">
        <img
          src="/cropped-logo-neon-pruhledna-150x50.png"
          alt="ZažijVR"
          className="h-7 object-contain drop-shadow-[0_0_10px_rgba(0,243,255,0.6)]"
        />
      </div>

      <div className={`relative z-50 transition-all ${!userEmail ? 'blur-[3px] opacity-30 pointer-events-none' : ''}`}>
        <button 
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="w-10 h-10 rounded-full bg-[#00f3ff]/10 border border-[#00f3ff]/40 flex items-center justify-center font-bold text-[#00f3ff] drop-shadow-[0_0_8px_rgba(0,243,255,0.6)] shadow-[inset_0_0_10px_rgba(248,0,255,0.1)] transition-transform active:scale-95 hover:border-[#00f3ff]"
        >
          {getAvatarInitial(userEmail)}
        </button>

        {isDropdownOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)} />
            <div className="absolute right-0 top-14 w-64 bg-[#0f172a] border border-[#00f3ff]/30 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.9)] z-50 overflow-hidden flex flex-col">
              <div className="px-4 py-4 bg-[#00f3ff]/5 border-b border-[#00f3ff]/10 flex flex-col items-center">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#00f3ff]/20 to-[#f800ff]/20 border border-[#00f3ff]/40 flex items-center justify-center font-black text-2xl text-[#00f3ff] mb-3 shadow-[0_0_15px_rgba(0,243,255,0.3)]">
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
          </>
        )}
      </div>
    </div>
  );
}
