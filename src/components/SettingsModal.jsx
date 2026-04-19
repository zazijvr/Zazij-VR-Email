import React, { useState, useRef } from 'react';
import { X, Settings as SettingsIcon, FileText, PenTool, Folder } from 'lucide-react';
import TemplateSettings from './TemplateSettings';
import SignatureSettings from './SignatureSettings';
import FolderSettings from './FolderSettings';
import { useFocusTrap } from '../hooks/useFocusTrap';

export default function SettingsModal({
  isSettingsOpen,
  setIsSettingsOpen,
  googleToken,
  userInfo,
  loginWithGoogle,
  isVerticalLayout,
  setIsVerticalLayout,
  savedAccounts = [],
  switchGoogleAccount,
  logoutGoogleAccount,
  customLabels,
  setCustomLabels
}) {
  const [activeTab, setActiveTab] = useState('general');
  const modalRef = useRef(null);

  useFocusTrap(modalRef, isSettingsOpen);

  if (!isSettingsOpen) return null;

  return (
    <div ref={modalRef} className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/70"
        onClick={() => setIsSettingsOpen(false)}
      ></div>
      
      <div className="relative bg-[#1e293b]/80 border border-white/20 rounded-2xl sm:rounded-[30px] w-full max-w-3xl p-4 sm:p-8 shadow-[0_0_40px_rgba(0,0,0,0.5),0_0_20px_rgba(255,255,255,0.05)] flex flex-col z-10 transition-transform max-h-[90vh]">
        
        <div className="flex justify-between items-center mb-4 sm:mb-6 border-b border-white/10 pb-3 sm:pb-4">
          <h2 className="text-xl sm:text-3xl font-black tracking-widest text-[#00f3ff] drop-shadow-[0_0_20px_rgba(0,243,255,0.6)]">NASTAVENÍ</h2>
          <button 
            onClick={() => setIsSettingsOpen(false)}
            className="p-1.5 sm:p-2 bg-white/5 hover:bg-[#ef4444]/20 text-gray-400 hover:text-[#ef4444] rounded-full transition-all border border-transparent hover:border-[#ef4444]/40 hover:shadow-[0_0_15px_rgba(239,68,68,0.3)] flex items-center justify-center shrink-0"
          >
            <X size={20} className="sm:w-[22px] sm:h-[22px]" strokeWidth={2} />
          </button>
        </div>

        <div className="flex gap-2 sm:gap-4 mb-4 border-b border-white/5 pb-4 overflow-x-auto custom-scrollbar snap-x">
          <button onClick={() => setActiveTab('general')} className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl font-bold tracking-wider transition-all whitespace-nowrap snap-start text-xs sm:text-base ${activeTab === 'general' ? 'bg-[#00f3ff]/20 text-[#00f3ff] border border-[#00f3ff]/50 shadow-[0_0_15px_rgba(0,243,255,0.2)]' : 'bg-black/20 text-gray-400 border border-white/5 hover:bg-white/5 hover:text-white'}`}>
            <SettingsIcon size={16} className="sm:w-[18px] sm:h-[18px]" /> OBECNÉ
          </button>
          <button onClick={() => setActiveTab('templates')} className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl font-bold tracking-wider transition-all whitespace-nowrap snap-start text-xs sm:text-base ${activeTab === 'templates' ? 'bg-[#00f3ff]/20 text-[#00f3ff] border border-[#00f3ff]/50 shadow-[0_0_15px_rgba(0,243,255,0.2)]' : 'bg-black/20 text-gray-400 border border-white/5 hover:bg-white/5 hover:text-white'}`}>
            <FileText size={16} className="sm:w-[18px] sm:h-[18px]" /> ŠABLONY
          </button>
          <button onClick={() => setActiveTab('signatures')} className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl font-bold tracking-wider transition-all whitespace-nowrap snap-start text-xs sm:text-base ${activeTab === 'signatures' ? 'bg-[#00f3ff]/20 text-[#00f3ff] border border-[#00f3ff]/50 shadow-[0_0_15px_rgba(0,243,255,0.2)]' : 'bg-black/20 text-gray-400 border border-white/5 hover:bg-white/5 hover:text-white'}`}>
            <PenTool size={16} className="sm:w-[18px] sm:h-[18px]" /> PODPISY
          </button>
          <button onClick={() => setActiveTab('folders')} className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl font-bold tracking-wider transition-all whitespace-nowrap snap-start text-xs sm:text-base ${activeTab === 'folders' ? 'bg-[#00f3ff]/20 text-[#00f3ff] border border-[#00f3ff]/50 shadow-[0_0_15px_rgba(0,243,255,0.2)]' : 'bg-black/20 text-gray-400 border border-white/5 hover:bg-white/5 hover:text-white'}`}>
            <Folder size={16} className="sm:w-[18px] sm:h-[18px]" /> SLOŽKY
          </button>
        </div>
        
        {activeTab === 'general' && (
        <div className="flex flex-col gap-8 mt-2 overflow-y-auto custom-scrollbar pr-2 max-h-[60vh]">
          <div>
            <h3 className="text-xl font-bold text-gray-200 mb-4 border-b border-white/10 pb-2">Vzhled a Zobrazení</h3>
            <div className="flex items-center gap-4 bg-black/40 border border-[#00f3ff]/10 p-5 rounded-2xl w-full">
              <div className="flex-1 flex flex-col gap-1">
                <span className="text-gray-200 font-semibold tracking-wide">Rozložení panelů s poštou</span>
                <span className="text-sm text-gray-500">Zvolte, jak chcete mít umístěný náhled e-mailu vůči seznamu zpráv.</span>
              </div>
              <div className="flex items-center gap-2 bg-[#02040a] p-1 rounded-xl border border-white/5">
                <button 
                  onClick={() => setIsVerticalLayout(false)}
                  className={`px-4 py-2 rounded-lg text-sm font-bold tracking-wider transition-all ${!isVerticalLayout ? 'bg-[#00f3ff]/20 text-[#00f3ff] border border-[#00f3ff]/40 shadow-[0_0_10px_rgba(0,243,255,0.2)]' : 'text-gray-500 hover:text-white'}`}
                >
                  VEDLE SEBE
                </button>
                <button 
                  onClick={() => setIsVerticalLayout(true)}
                  className={`px-4 py-2 rounded-lg text-sm font-bold tracking-wider transition-all ${isVerticalLayout ? 'bg-[#00f3ff]/20 text-[#00f3ff] border border-[#00f3ff]/40 shadow-[0_0_10px_rgba(0,243,255,0.2)]' : 'text-gray-500 hover:text-white'}`}
                >
                  POD SEBOU
                </button>
              </div>
            </div>
          </div>

          <div className="mt-2">
            <h3 className="text-xl font-bold text-gray-200 mb-4 border-b border-white/10 pb-2">Propojené Účty</h3>
            <div className="flex flex-col gap-4">
              
              {savedAccounts.length > 0 ? (
                <>
                  {savedAccounts.map((email) => {
                    const isActive = userInfo?.email === email || (savedAccounts.length === 1 && googleToken);
                    return (
                      <div key={email} className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-5 rounded-2xl transition-all border ${isActive ? 'bg-[#00f3ff]/10 border-[#00f3ff]/50 shadow-[0_0_15px_rgba(0,243,255,0.1)]' : 'bg-black/40 border-white/10 hover:border-white/30'}`}>
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 overflow-hidden mb-3 sm:mb-0">
                          <div className={`shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center font-black text-lg sm:text-xl uppercase ${isActive ? 'bg-[#00f3ff] text-[#0f172a] shadow-[0_0_15px_rgba(0,243,255,0.6)]' : 'bg-white/10 text-gray-400'}`}>
                            {email.charAt(0)}
                          </div>
                          <div className="flex flex-col overflow-hidden">
                            <span className={`font-bold tracking-wide truncate max-w-[200px] sm:max-w-xs ${isActive ? 'text-gray-100' : 'text-gray-400'}`}>{email}</span>
                            {isActive ? (
                              <span className="text-[#00f3ff] text-[10px] sm:text-xs font-semibold flex items-center gap-1.5 mt-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#00f3ff] animate-pulse shadow-[0_0_5px_rgba(0,243,255,1)]"></span>
                                Aktivní napojení ({userInfo?.messagesTotal || 0} mailů)
                              </span>
                            ) : (
                              <span className="text-gray-500 text-[10px] sm:text-xs mt-1">Odpojený účet</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-0 border-white/5 pt-3 sm:pt-0">
                          {!isActive && (
                            <button 
                              onClick={() => switchGoogleAccount(email)}
                              className="px-3 sm:px-4 py-1.5 sm:py-2 bg-white/5 hover:bg-[#00f3ff]/20 text-gray-300 hover:text-[#00f3ff] border border-white/10 hover:border-[#00f3ff]/50 rounded-lg sm:rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap"
                            >
                              PŘEPNOUT
                            </button>
                          )}
                          <button 
                            onClick={() => logoutGoogleAccount(email)}
                            className="p-1.5 sm:p-2 bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 border border-white/10 hover:border-red-500/50 rounded-lg sm:rounded-xl transition-all"
                            title="Odebrat účet"
                          >
                            <X size={18} className="sm:w-[20px] sm:h-[20px]" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  <button 
                    onClick={() => loginWithGoogle()}
                    className="group self-start flex items-center gap-3 bg-[#00f3ff]/10 hover:bg-[#00f3ff]/20 text-[#00f3ff] border border-[#00f3ff]/40 hover:border-[#00f3ff]/80 px-6 py-3.5 rounded-xl font-bold transition-all hover:scale-105 mt-2 shadow-[0_0_10px_rgba(0,243,255,0.1)] hover:shadow-[0_0_25px_rgba(0,243,255,0.4)]"
                  >
                    <span className="text-2xl font-black leading-none drop-shadow-md">+</span>
                    <span className="tracking-wide">Přidat další Google Účet</span>
                  </button>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between bg-black/40 border border-[#00f3ff]/10 p-5 rounded-2xl">
                    <div className="flex flex-col gap-1">
                      <span className="text-gray-300 font-semibold tracking-wide">Zatím nemáte propojený žádný účet.</span>
                      <span className="text-sm text-gray-500">Pro zobrazení vaší doručené pošty a událostí je nutné se přihlásit.</span>
                    </div>
                  </div>

                  <button 
                    onClick={() => loginWithGoogle()}
                    className="group self-start flex items-center gap-3 bg-[#00f3ff]/10 hover:bg-[#00f3ff]/20 text-[#00f3ff] border border-[#00f3ff]/40 hover:border-[#00f3ff]/80 px-6 py-3.5 rounded-xl font-bold transition-all hover:scale-105 shadow-[0_0_10px_rgba(0,243,255,0.1)] hover:shadow-[0_0_25px_rgba(0,243,255,0.4)]"
                  >
                    <span className="text-2xl font-black leading-none drop-shadow-md">+</span>
                    <span className="tracking-wide">Připojit Google Účet</span>
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="mt-4 border-t border-white/10 pt-4 sm:pt-6">
            <h3 className="text-lg sm:text-xl font-bold text-gray-200 mb-4 border-b border-white/10 pb-2">Vlastní napojení (IMAP/SMTP)</h3>
            <div className="bg-black/40 border border-white/10 p-4 sm:p-6 rounded-2xl flex flex-col gap-4 sm:gap-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-gray-400 font-bold tracking-widest uppercase">IMAP Server</label>
                  <input type="text" placeholder="imap.seznam.cz" className="bg-[#0f172a]/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#00f3ff]/50 transition-colors" />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-gray-400 font-bold tracking-widest uppercase">SMTP Server</label>
                  <input type="text" placeholder="smtp.seznam.cz" className="bg-[#0f172a]/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#00f3ff]/50 transition-colors" />
                </div>
                <div className="flex flex-col gap-2 mt-2">
                  <label className="text-xs text-gray-400 font-bold tracking-widest uppercase">Přihlašovací e-mail</label>
                  <input type="email" placeholder="vas.email@domena.cz" className="bg-[#0f172a]/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#00f3ff]/50 transition-colors" />
                </div>
                <div className="flex flex-col gap-2 mt-2">
                  <label className="text-xs text-gray-400 font-bold tracking-widest uppercase">Heslo</label>
                  <input type="password" placeholder="••••••••" className="bg-[#0f172a]/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#00f3ff]/50 transition-colors" />
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 mt-2 pt-4 border-t border-white/5">
                <label className="flex items-center gap-2 sm:gap-3 cursor-pointer group">
                  <input type="checkbox" className="w-4 h-4 sm:w-5 sm:h-5 accent-[#00f3ff] bg-black border-white/20 rounded" defaultChecked />
                  <span className="text-xs sm:text-sm font-semibold text-gray-300 group-hover:text-white transition-colors">SSL/TLS</span>
                </label>
                <div className="hidden sm:block flex-1"></div>
                <button className="bg-white/5 hover:bg-[#00f3ff]/20 text-gray-400 hover:text-[#00f3ff] border border-white/10 hover:border-[#00f3ff]/50 px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all w-full sm:w-auto mt-2 sm:mt-0">
                  ULOŽIT IMAP KONFIGURACI
                </button>
              </div>
            </div>
          </div>

        </div>
        )}

        {activeTab === 'templates' && <TemplateSettings googleToken={googleToken} />}
        {activeTab === 'signatures' && <SignatureSettings />}
        {activeTab === 'folders' && <FolderSettings googleToken={googleToken} customLabels={customLabels} setCustomLabels={setCustomLabels} />}
        

        
      </div>
    </div>
  );
}
