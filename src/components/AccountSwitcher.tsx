import { useState } from 'react';
import { Check, ChevronDown, Mail } from 'lucide-react';
import UnreadBadge from './UnreadBadge';
import { othersUnread } from '../utils/accounts';

export interface SwitcherAccount {
  email: string;
  /** Google = přihlášení Googlem, imap = Seznam / vlastní doména */
  kind: 'google' | 'imap';
  label?: string;
  /** Poskytovatel pod adresou (Google, Seznam, WEDOS…) */
  provider?: string;
  /** Nepřečtené v Doručených (undefined = zatím nezjištěno) */
  unread?: number;
}


interface Props {
  accounts: SwitcherAccount[];
  /** Právě otevřený účet */
  activeEmail?: string | null;
  onSelect: (account: SwitcherAccount) => void;
}

/** Levý panel: který účet je otevřený a rychlé přepnutí na jiný */
export default function AccountSwitcher({ accounts, activeEmail, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  if (!activeEmail) return null;

  const active = accounts.find((a) => a.email === activeEmail);
  const canSwitch = accounts.length > 1;
  const elsewhere = othersUnread(accounts, activeEmail);

  return (
    <div className="relative px-4 mb-3 md:mb-5">
      <button
        type="button"
        onClick={() => canSwitch && setOpen((v) => !v)}
        title={canSwitch ? 'Přepnout e-mailový účet' : activeEmail}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left ${open
          ? 'bg-neon-blue/10 border-neon-blue/50'
          : 'bg-white/[0.03] border-neon-blue/[0.15]'} ${canSwitch ? 'hover:border-neon-blue/50 hover:bg-neon-blue/10 cursor-pointer' : 'cursor-default'}`}
      >
        <div className="w-8 h-8 rounded-full bg-neon-blue/10 border border-neon-blue/30 flex items-center justify-center text-neon-blue font-bold text-sm uppercase shrink-0">
          {activeEmail[0]}
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-[10px] font-bold tracking-widest uppercase text-slate-500">Účet</span>
          <span className="text-sm text-slate-200 font-semibold truncate max-w-[13rem]">{active?.label || activeEmail}</span>
        </div>
        <UnreadBadge count={elsewhere} title={`Nepřečtené v ostatních účtech: ${elsewhere}`} />
        {canSwitch && <ChevronDown size={16} className={`text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180 text-neon-blue' : ''}`} />}
      </button>

      {open && (
        <>
          {/* Klik mimo seznam ho zavře */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-4 right-4 top-full mt-2 z-50 bg-navy border border-neon-blue/30 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.8),0_0_20px_rgba(0,243,255,0.15)] py-1.5 max-h-80 overflow-y-auto custom-scrollbar">
            {accounts.map((acc) => {
              const isActive = acc.email === activeEmail;
              return (
                <button
                  key={`${acc.kind}:${acc.email}`}
                  type="button"
                  onClick={() => { setOpen(false); if (!isActive) onSelect(acc); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${isActive ? 'bg-neon-blue/10' : 'hover:bg-white/5'}`}
                >
                  <Mail size={16} className={isActive ? 'text-neon-blue shrink-0' : 'text-slate-500 shrink-0'} />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className={`text-sm truncate ${isActive ? 'text-neon-blue font-bold' : 'text-slate-200'}`}>{acc.label || acc.email}</span>
                    <span className="text-[11px] text-slate-500 truncate">
                      {acc.label ? `${acc.email} · ` : ''}{acc.provider || (acc.kind === 'google' ? 'Google' : 'Jiný účet')}
                    </span>
                  </div>
                  <UnreadBadge count={acc.unread} title={`Nepřečtené v Doručených: ${acc.unread}`} />
                  {isActive && <Check size={16} className="text-neon-blue shrink-0" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
