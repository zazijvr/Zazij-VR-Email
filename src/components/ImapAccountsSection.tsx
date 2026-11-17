import { useEffect, useState, type FormEvent } from 'react';
import { ChevronDown, ChevronRight, Loader2, Mail, X } from 'lucide-react';
import {
  imapAddAccount, imapListAccounts, imapRemoveAccount, presetFor, providerOf,
  type ImapAccount, type Security,
} from '../services/imap';
import { useAlert } from './AlertProvider';

const INPUT = 'bg-navy/50 border border-neon-blue/[0.15] rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-neon-blue/50 transition-colors w-full';
const LABEL = 'text-xs text-slate-400 font-bold tracking-widest uppercase';

const isDesktopApp = () => !!window.__TAURI_INTERNALS__ && !/Android|iPhone|iPad/i.test(navigator.userAgent);

interface Props {
  /** Volá se po přidání / odebrání účtu (rodič si obnoví seznam účtů) */
  onAccountsChanged?: () => void;
}

/** Nastavení → Propojené účty: jiné než Google účty (Seznam.cz, vlastní doména) */
export default function ImapAccountsSection({ onAccountsChanged }: Props) {
  const { showAlert, showConfirm } = useAlert();
  const [accounts, setAccounts] = useState<ImapAccount[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [server, setServer] = useState(() => presetFor(''));

  const reload = () => imapListAccounts().then(setAccounts).catch(() => setAccounts([]));
  useEffect(() => { if (isDesktopApp()) reload(); }, []);

  if (!isDesktopApp()) return null;

  const provider = providerOf(email);

  // Po zadání adresy doplnit servery (jen dokud je uživatel ručně nezměnil)
  const applyPreset = (value: string) => {
    const p = presetFor(value.trim());
    setServer((prev) => {
      const untouched = !prev.imapHost || prev.imapHost === presetFor(prev.email).imapHost;
      return untouched ? p : { ...prev, email: value.trim(), username: prev.username === prev.email ? value.trim() : prev.username };
    });
  };

  const resetForm = () => {
    setEmail(''); setPassword(''); setDisplayName(''); setServer(presetFor('')); setError(''); setShowAdvanced(false);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.includes('@') || !password) {
      setError('Vyplňte e-mail a heslo.');
      return;
    }
    if (provider === 'outlook') {
      setError('Outlook / Microsoft 365 nepovoluje přihlášení heslem přes IMAP – připojení přes Microsoft účet přidáme v další verzi.');
      return;
    }
    setSaving(true);
    try {
      await imapAddAccount({ ...server, email: email.trim(), displayName: displayName.trim() }, password);
      await reload();
      onAccountsChanged?.();
      resetForm();
      setIsFormOpen(false);
      showAlert(`Účet ${email.trim()} je připojený.`, 'Účet přidán', 'success');
    } catch (err) {
      setError(String(err));
      // U vlastní domény bývá chyba v odhadu serverů – rovnou je ukázat
      if (provider === 'custom') setShowAdvanced(true);
    } finally {
      setSaving(false);
    }
  };

  const remove = (acc: ImapAccount) => {
    showConfirm(`Odebrat účet ${acc.email} z aplikace? Pošta na serveru zůstane.`, 'Odebrat účet', async () => {
      await imapRemoveAccount(acc.email).catch((e) => showAlert(String(e), 'Chyba', 'error'));
      await reload();
      onAccountsChanged?.();
    }, { confirmText: 'Odebrat', type: 'warning' });
  };

  const securitySelect = (value: Security, onChange: (v: Security) => void) => (
    <select value={value} onChange={(e) => onChange(e.target.value as Security)} className={INPUT}>
      <option value="tls">SSL/TLS</option>
      <option value="starttls">STARTTLS</option>
    </select>
  );

  return (
    <div className="mt-4 border-t border-neon-blue/[0.15] pt-4 sm:pt-6">
      <h3 className="text-lg sm:text-xl font-bold text-slate-200 mb-4 border-b border-neon-blue/[0.15] pb-2">Další e-mailové účty (Seznam, vlastní doména)</h3>

      <div className="flex flex-col gap-3">
        {accounts.map((acc) => (
          <div key={acc.email} className="flex items-center justify-between gap-3 bg-navy-card border border-neon-blue/[0.15] p-4 rounded-2xl">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-neon-purple/10 border border-neon-purple/30 flex items-center justify-center text-neon-purple shrink-0">
                <Mail size={18} />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-white font-bold truncate">{acc.displayName || acc.email}</span>
                <span className="text-slate-500 text-xs truncate">{acc.email} · {acc.imapHost}</span>
              </div>
            </div>
            <button onClick={() => remove(acc)} title="Odebrat účet"
              className="p-2 bg-white/5 hover:bg-danger/20 text-slate-400 hover:text-danger border border-neon-blue/[0.15] hover:border-danger/50 rounded-xl transition-all shrink-0">
              <X size={18} />
            </button>
          </div>
        ))}

        {!isFormOpen ? (
          <button onClick={() => setIsFormOpen(true)}
            className="self-start flex items-center gap-3 bg-neon-purple/10 hover:bg-neon-purple/20 text-neon-purple border border-neon-purple/40 hover:border-neon-purple/80 px-6 py-3.5 rounded-xl font-bold transition-all">
            <span className="text-2xl font-black leading-none">+</span>
            <span className="tracking-wide">Přidat jiný e-mail (Seznam, vlastní doména)</span>
          </button>
        ) : (
          <form onSubmit={submit} className="bg-navy-card border border-neon-blue/[0.15] p-4 sm:p-6 rounded-2xl flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <label className="flex flex-col gap-2">
                <span className={LABEL}>E-mail</span>
                <input type="email" autoComplete="off" value={email} placeholder="jmeno@seznam.cz"
                  onChange={(e) => { setEmail(e.target.value); applyPreset(e.target.value); }} className={INPUT} />
              </label>
              <label className="flex flex-col gap-2">
                <span className={LABEL}>Heslo</span>
                <input type="password" autoComplete="new-password" value={password} placeholder="••••••••"
                  onChange={(e) => setPassword(e.target.value)} className={INPUT} />
              </label>
              <label className="flex flex-col gap-2 sm:col-span-2">
                <span className={LABEL}>Jméno odesílatele (nepovinné)</span>
                <input type="text" value={displayName} placeholder="Jan Novák" onChange={(e) => setDisplayName(e.target.value)} className={INPUT} />
              </label>
            </div>

            {provider === 'seznam' && (
              <p className="text-xs text-slate-400 leading-relaxed">
                Seznam: stačí běžné heslo ke schránce, nic se nemusí zapínat. Servery se doplní samy (imap.seznam.cz / smtp.seznam.cz).
              </p>
            )}
            {provider === 'outlook' && (
              <p className="text-xs text-neon-amber leading-relaxed">
                Outlook / Microsoft 365 vyžaduje přihlášení přes Microsoft účet – tuto možnost přidáme v další verzi.
              </p>
            )}

            <button type="button" onClick={() => setShowAdvanced((v) => !v)} className="self-start flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-neon-blue">
              {showAdvanced ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Pokročilé – servery
            </button>
            {showAdvanced && (
              <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
                <label className="flex flex-col gap-2 sm:col-span-3"><span className={LABEL}>IMAP server</span>
                  <input value={server.imapHost} onChange={(e) => setServer({ ...server, imapHost: e.target.value })} className={INPUT} /></label>
                <label className="flex flex-col gap-2 sm:col-span-1"><span className={LABEL}>Port</span>
                  <input type="number" value={server.imapPort} onChange={(e) => setServer({ ...server, imapPort: Number(e.target.value) })} className={INPUT} /></label>
                <label className="flex flex-col gap-2 sm:col-span-2"><span className={LABEL}>Zabezpečení</span>
                  {securitySelect(server.imapSecurity, (v) => setServer({ ...server, imapSecurity: v, imapPort: v === 'tls' ? 993 : 143 }))}</label>
                <label className="flex flex-col gap-2 sm:col-span-3"><span className={LABEL}>SMTP server</span>
                  <input value={server.smtpHost} onChange={(e) => setServer({ ...server, smtpHost: e.target.value })} className={INPUT} /></label>
                <label className="flex flex-col gap-2 sm:col-span-1"><span className={LABEL}>Port</span>
                  <input type="number" value={server.smtpPort} onChange={(e) => setServer({ ...server, smtpPort: Number(e.target.value) })} className={INPUT} /></label>
                <label className="flex flex-col gap-2 sm:col-span-2"><span className={LABEL}>Zabezpečení</span>
                  {securitySelect(server.smtpSecurity, (v) => setServer({ ...server, smtpSecurity: v, smtpPort: v === 'tls' ? 465 : 587 }))}</label>
                <label className="flex flex-col gap-2 sm:col-span-6"><span className={LABEL}>Přihlašovací jméno (obvykle celý e-mail)</span>
                  <input value={server.username} onChange={(e) => setServer({ ...server, username: e.target.value })} className={INPUT} /></label>
              </div>
            )}

            {error && <p className="text-sm text-danger-soft whitespace-pre-line">{error}</p>}

            <div className="flex items-center gap-3 justify-end pt-2 border-t border-neon-blue/10">
              <button type="button" onClick={() => { resetForm(); setIsFormOpen(false); }} disabled={saving}
                className="px-4 py-2 rounded-xl text-sm font-bold text-slate-400 hover:text-white">Zrušit</button>
              <button type="submit" disabled={saving}
                className="flex items-center gap-2 bg-neon-blue/15 hover:bg-neon-blue/25 text-neon-blue border border-neon-blue/50 px-5 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-60">
                {saving && <Loader2 size={16} className="animate-spin" />}
                {saving ? 'Ověřuji připojení…' : 'Připojit účet'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
