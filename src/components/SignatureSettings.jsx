import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit3, X, Save, Star, PenTool } from 'lucide-react';
import RichTextEditor from './RichTextEditor';

export default function SignatureSettings() {
  const [signatures, setSignatures] = useState([]);
  const [editingSignature, setEditingSignature] = useState(null);

  useEffect(() => {
    const saved = localStorage.getItem('zazijvr_signatures');
    if (saved) {
      try { setSignatures(JSON.parse(saved)); } catch (e) {}
    }
  }, []);

  const saveToDisk = (newSignatures) => {
    setSignatures(newSignatures);
    localStorage.setItem('zazijvr_signatures', JSON.stringify(newSignatures));
  };

  const createNewSignature = () => {
    setEditingSignature({
      id: Date.now().toString(),
      title: '',
      body: '',
      isDefault: signatures.length === 0 // If it's the first one, make it default automatically
    });
  };

  const handleSave = () => {
    if (!editingSignature.title.trim()) return;

    let newSignatures = [...signatures];
    // Pokud je nastavován jako výchozí, zrušit výchozí u ostatních
    if (editingSignature.isDefault) {
      newSignatures = newSignatures.map(s => ({ ...s, isDefault: false }));
    }

    const existsIndex = newSignatures.findIndex(s => s.id === editingSignature.id);
    if (existsIndex >= 0) {
       newSignatures[existsIndex] = editingSignature;
    } else {
       newSignatures.push(editingSignature);
    }
    
    // Fallback: Pokud žádný není default, udělej z nějakeho aspoň true
    if (newSignatures.length > 0 && !newSignatures.some(s => s.isDefault)) {
        newSignatures[0].isDefault = true;
    }

    saveToDisk(newSignatures);
    setEditingSignature(null);
  };

  const handleDelete = (id, e) => {
    e.stopPropagation();
    let newSignatures = signatures.filter(s => s.id !== id);
    if (newSignatures.length > 0 && !newSignatures.some(s => s.isDefault)) {
      newSignatures[0].isDefault = true; // Auto reassign default
    }
    saveToDisk(newSignatures);
  };

  const setAsDefault = (id, e) => {
    e.stopPropagation();
    const newSignatures = signatures.map(s => ({
       ...s,
       isDefault: s.id === id
    }));
    saveToDisk(newSignatures);
  };

  return (
    <div className="flex flex-col gap-6 w-full h-[50dvh] min-h-[400px]">
      {!editingSignature ? (
        <>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#0a1630]/70 p-4 rounded-xl border border-[#00f3ff]/10">
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-slate-200">Podpisy E-mailů</h3>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">Jeden podpis můžete nastavit jako výchozí – sám se vloží při otevírání nové zprávy.</p>
            </div>
            <button 
              onClick={createNewSignature}
              className="flex justify-center w-full sm:w-auto items-center gap-2 bg-[#00f3ff]/10 hover:bg-[#00f3ff]/20 text-[#00f3ff] border border-[#00f3ff]/40 px-4 py-2.5 sm:py-2 rounded-lg font-bold transition-all shadow-[0_0_10px_rgba(0,243,255,0.1)] hover:shadow-[0_0_20px_rgba(0,243,255,0.3)] shrink-0"
            >
              <Plus size={18} />
              NOVÝ PODPIS
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-3 pr-2 border-t border-[#00f3ff]/10 pt-4">
            {signatures.length === 0 ? (
              <div className="text-center p-10 text-slate-500 font-semibold border-2 border-dashed border-slate-700/50 rounded-xl">
                Zatím tu není uložen žádný podpis.
              </div>
            ) : (
              signatures.map(s => (
                <div 
                  key={s.id} 
                  className={`group flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 ${s.isDefault ? 'bg-[#00f3ff]/5 border border-[#00f3ff]/30 shadow-[0_0_15px_rgba(0,243,255,0.05)]' : 'bg-[#0a1630] border border-[#00f3ff]/[0.15] hover:border-[#00f3ff]/30'} rounded-xl transition-all cursor-pointer hover:shadow-md gap-4`}
                  onClick={() => setEditingSignature(s)}
                >
                  <div className="flex items-start gap-4 flex-1 overflow-hidden w-full">
                    <div className={`mt-1 w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border transition-all ${s.isDefault ? 'bg-[#00f3ff]/20 text-[#00f3ff] border-[#00f3ff]/50 shadow-[0_0_10px_rgba(0,243,255,0.3)]' : 'bg-white/5 text-slate-500 border-[#00f3ff]/[0.15]'}`}>
                      {s.isDefault ? <Star size={20} fill="currentColor" /> : <PenTool size={20} />}
                    </div>
                    <div className="flex flex-col overflow-hidden max-w-[80%]">
                      <span className={`font-bold tracking-wide truncate ${s.isDefault ? 'text-slate-100' : 'text-slate-300'}`}>{s.title || 'Nevyplněný název'}</span>
                      <span className="text-sm text-slate-500 truncate mt-1 opactiy-80 font-mono">
                         {s.body.split('\n')[0].substring(0, 40) + '...'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                    {!s.isDefault && (
                        <button 
                          onClick={(e) => setAsDefault(s.id, e)}
                          className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider bg-transparent border border-slate-600 hover:border-[#00f3ff]/50 text-slate-400 hover:text-[#00f3ff] rounded-lg transition-all whitespace-nowrap"
                        >
                           Označit výchozí
                        </button>
                    )}
                    <button className="p-2 bg-white/5 hover:bg-[#00f3ff]/20 text-slate-400 hover:text-[#00f3ff] rounded-lg transition-colors border border-transparent hover:border-[#00f3ff]/40">
                      <Edit3 size={18} />
                    </button>
                    <button 
                       onClick={(e) => handleDelete(s.id, e)}
                       className="p-2 bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-lg transition-colors border border-transparent hover:border-red-500/40"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-4 bg-[#0a1630] border border-[#00f3ff]/20 p-5 rounded-2xl flex-1">
          <div className="flex justify-between items-center mb-2">
             <h3 className="text-lg sm:text-xl font-bold tracking-widest text-[#00f3ff]">EDITOR PODPISU</h3>
             <button onClick={() => setEditingSignature(null)} className="p-2 bg-white/5 hover:bg-[#ef4444]/20 text-slate-400 hover:text-[#ef4444] rounded-full transition-all border border-transparent hover:border-[#ef4444]/40 hover:shadow-[0_0_15px_rgba(239,68,68,0.3)] flex items-center justify-center">
               <X size={22} strokeWidth={2} />
             </button>
          </div>
          
          <div className="flex flex-col gap-4 flex-1">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs uppercase tracking-widest font-bold text-slate-400">Název podpisu pro orientaci</label>
              <input 
                type="text" 
                value={editingSignature.title} 
                onChange={e => setEditingSignature(prev => ({...prev, title: e.target.value}))}
                placeholder="Např. Formální, Osobní..."
                className="bg-[#061026]/80 border border-[#f72585]/60 shadow-[0_0_10px_rgba(247,37,133,0.1)] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#f72585] focus:shadow-[0_0_15px_rgba(247,37,133,0.3)] transition-all w-full"
                autoFocus
              />
            </div>
            
            <div className="flex flex-col gap-1.5 flex-1 h-full min-h-[150px]">
              <label className="text-xs uppercase tracking-widest font-bold text-slate-400">Vzhled podpisu (Podporuje i obrázky a textové styly)</label>
              <RichTextEditor
                value={editingSignature.body}
                onChange={html => setEditingSignature(prev => ({...prev, body: html}))}
                placeholder="S pozdravem, Jan Novák"
                className="flex-1"
              />
            </div>
            
            <label className="flex items-center gap-3 cursor-pointer group mt-2 pt-2 border-t border-[#00f3ff]/10">
              <input 
                type="checkbox" 
                checked={editingSignature.isDefault}
                onChange={e => setEditingSignature(prev => ({...prev, isDefault: e.target.checked}))}
                className="w-5 h-5 accent-[#00f3ff] bg-black border-[#00f3ff]/25 rounded" 
              />
              <span className="text-sm font-semibold text-slate-300 group-hover:text-white transition-colors">Tento podpis používat jako Výchozí</span>
            </label>
          </div>
          
          <div className="flex flex-col-reverse sm:flex-row justify-end pt-4 gap-3">
             <button 
               onClick={() => setEditingSignature(null)}
               className="w-full sm:w-auto px-6 py-3 sm:py-2.5 bg-transparent border border-[#00f3ff]/25 text-slate-300 font-bold rounded-xl hover:bg-white/5 transition-colors"
             >
               Storno
             </button>
             <button 
               onClick={handleSave}
               disabled={!editingSignature.title.trim()}
               className="flex justify-center w-full sm:w-auto items-center gap-2 px-6 py-3 sm:py-2.5 bg-[#00f3ff]/20 border border-[#00f3ff]/50 text-[#00f3ff] font-bold rounded-xl hover:bg-[#00f3ff]/30 shadow-[0_0_15px_rgba(0,243,255,0.2)] hover:shadow-[0_0_20px_rgba(0,243,255,0.4)] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
             >
               <Save size={18} />
               Uložit podpis
             </button>
          </div>
        </div>
      )}
    </div>
  );
}
