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
      
      <div className="relative bg-[#1e293b]/80 border border-white/20 rounded-[30px] w-full max-w-3xl p-8 shadow-[0_0_40px_rgba(0,0,0,0.5),0_0_20px_rgba(255,255,255,0.05)] flex flex-col z-10 transition-transform">
        
        <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
          <h2 className="text-3xl font-black tracking-widest text-[#00f3ff] drop-shadow-[0_0_20px_rgba(0,243,255,0.6)]">NASTAVENÍ</h2>
          <button 
            onClick={() => setIsSettingsOpen(false)}
            className="p-2 bg-white/5 hover:bg-[#ef4444]/20 text-gray-400 hover:text-[#ef4444] rounded-full transition-all border border-transparent hover:border-[#ef4444]/40 hover:shadow-[0_0_15px_rgba(239,68,68,0.3)] flex items-center justify-center"
          >
            <X size={22} strokeWidth={2} />
          </button>
        </div>

        <div className="flex gap-4 mb-4 border-b border-white/5 pb-4">
          <button onClick={() => setActiveTab('general')} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold tracking-wider transition-all ${activeTab === 'general' ? 'bg-[#00f3ff]/20 text-[#00f3ff] border border-[#00f3ff]/50 shadow-[0_0_15px_rgba(0,243,255,0.2)]' : 'bg-black/20 text-gray-400 border border-white/5 hover:bg-white/5 hover:text-white'}`}>
            <SettingsIcon size={18} /> OBECNÉ
          </button>
          <button onClick={() => setActiveTab('templates')} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold tracking-wider transition-all ${activeTab === 'templates' ? 'bg-[#00f3ff]/20 text-[#00f3ff] border border-[#00f3ff]/50 shadow-[0_0_15px_rgba(0,243,255,0.2)]' : 'bg-black/20 text-gray-400 border border-white/5 hover:bg-white/5 hover:text-white'}`}>
            <FileText size={18} /> ŠABLONY
          </button>
          <button onClick={() => setActiveTab('signatures')} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold tracking-wider transition-all ${activeTab === 'signatures' ? 'bg-[#00f3ff]/20 text-[#00f3ff] border border-[#00f3ff]/50 shadow-[0_0_15px_rgba(0,243,255,0.2)]' : 'bg-black/20 text-gray-400 border border-white/5 hover:bg-white/5 hover:text-white'}`}>
            <PenTool size={18} /> PODPISY
          </button>
          <button onClick={() => setActiveTab('folders')} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold tracking-wider transition-all ${activeTab === 'folders' ? 'bg-[#00f3ff]/20 text-[#00f3ff] border border-[#00f3ff]/50 shadow-[0_0_15px_rgba(0,243,255,0.2)]' : 'bg-black/20 text-gray-400 border border-white/5 hover:bg-white/5 hover:text-white'}`}>
            <Folder size={18} /> SLOŽKY
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
                      <div key={email} className={`flex items-center justify-between p-5 rounded-2xl transition-all border ${isActive ? 'bg-[#00f3ff]/10 border-[#00f3ff]/50 shadow-[0_0_15px_rgba(0,243,255,0.1)]' : 'bg-black/40 border-white/10 hover:border-white/30'}`}>
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-xl uppercase ${isActive ? 'bg-[#00f3ff] text-[#0f172a] shadow-[0_0_15px_rgba(0,243,255,0.6)]' : 'bg-white/10 text-gray-400'}`}>
                            {email.charAt(0)}
                          </div>
                          <div className="flex flex-col">
                            <span className={`font-bold tracking-wide ${isActive ? 'text-gray-100' : 'text-gray-400'}`}>{email}</span>
                            {isActive ? (
                              <span className="text-[#00f3ff] text-xs font-semibold flex items-center gap-2 mt-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#00f3ff] animate-pulse shadow-[0_0_5px_rgba(0,243,255,1)]"></span>
                                Aktivní napojení ({userInfo?.messagesTotal || 0} mailů)
                              </span>
                            ) : (
                              <span className="text-gray-500 text-xs mt-1">Odpojený účet (Lze přepnout)</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {!isActive && (
                            <button 
                              onClick={() => switchGoogleAccount(email)}
                              className="px-4 py-2 bg-white/5 hover:bg-[#00f3ff]/20 text-gray-300 hover:text-[#00f3ff] border border-white/10 hover:border-[#00f3ff]/50 rounded-xl text-sm font-bold transition-all"
                            >
                              PŘEPNOUT
                            </button>
                          )}
                          <button 
                            onClick={() => logoutGoogleAccount(email)}
                            className="p-2 bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 border border-white/10 hover:border-red-500/50 rounded-xl transition-all"
                            title="Odebrat účet"
                          >
                            <X size={20} />
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

          <div className="mt-4 border-t border-white/10 pt-6">
            <h3 className="text-xl font-bold text-gray-200 mb-4 border-b border-white/10 pb-2">Vlastní napojení (IMAP/SMTP)</h3>
            <div className="bg-black/40 border border-white/10 p-6 rounded-2xl flex flex-col gap-5">
              <div className="grid grid-cols-2 gap-4">
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
              
              <div className="flex items-center gap-6 mt-2 pt-4 border-t border-white/5">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input type="checkbox" className="w-5 h-5 accent-[#00f3ff] bg-black border-white/20 rounded" defaultChecked />
                  <span className="text-sm font-semibold text-gray-300 group-hover:text-white transition-colors">Vyžadovat SSL/TLS</span>
                </label>
                <div className="flex-1"></div>
                <button className="bg-white/5 hover:bg-[#00f3ff]/20 text-gray-400 hover:text-[#00f3ff] border border-white/10 hover:border-[#00f3ff]/50 px-6 py-2.5 rounded-xl font-bold transition-all">
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
