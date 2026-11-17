import { useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { Plus, Trash2, Loader2, Folder, Edit2, Check, X } from 'lucide-react';

import { createLabel, deleteLabel, renameLabel } from '../services/gmail';
import type { GmailLabel } from '../types/gmail';

interface FolderSettingsProps {
  googleToken: string;
  customLabels: GmailLabel[];
  setCustomLabels: Dispatch<SetStateAction<GmailLabel[]>>;
}

export default function FolderSettings({ googleToken, customLabels, setCustomLabels }: FolderSettingsProps) {
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  const handleCreateFolder = async (e: FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim() || !googleToken) return;
    setIsCreating(true);
    try {
      const newLabel = await createLabel(googleToken, newFolderName.trim());
      setCustomLabels((prev) => [...(prev || []), newLabel]);
      setNewFolderName('');
    } catch (err) {
      console.error('Chyba při tvorbě složky', err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteFolder = async (id: string) => {
    if (!googleToken) return;
    setDeletingId(id);
    try {
      await deleteLabel(googleToken, id);
      setCustomLabels((prev) => prev.filter((l) => l.id !== id));
    } catch (err) {
      console.error('Chyba při mazání složky', err);
    } finally {
      setDeletingId(null);
    }
  };

  const handleRenameFolder = async (id: string, oldName: string) => {
    if (!editName.trim() || editName === oldName || !googleToken) {
      setEditingId(null);
      return;
    }
    setIsUpdating(true);
    try {
      const updatedLabel = await renameLabel(googleToken, id, editName.trim());
      setCustomLabels((prev) => prev.map((l) => (l.id === id ? updatedLabel : l)));
      setEditingId(null);
    } catch (err) {
      console.error('Chyba při přejmenování složky', err);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 mt-2 overflow-y-auto custom-scrollbar pr-2 max-h-[60vh] pb-4">
      <div className="bg-[#0a1630] border border-[#00f3ff]/20 p-4 sm:p-6 rounded-2xl flex flex-col gap-4">
        <h3 className="text-xl font-bold text-slate-200 border-b border-[#00f3ff]/[0.15] pb-2 flex items-center gap-2">
          <Folder size={20} className="text-[#00f3ff]" />
          Vytvořit Vlastní Složku
        </h3>
        
        <form onSubmit={handleCreateFolder} className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 w-full">
          <input 
            type="text" 
            placeholder="Název nové složky (např. Důležité Projekty)" 
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            className="w-full sm:flex-1 bg-[#061026]/80 border border-[#00f3ff]/30 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-[#00f3ff] transition-colors shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]"
          />
          <button 
            type="submit" 
            disabled={isCreating || !newFolderName.trim()}
            className="group flex items-center justify-center gap-2 bg-[#00f3ff]/10 hover:bg-[#00f3ff]/20 disabled:bg-white/5 disabled:hover:bg-white/5 disabled:text-slate-500 disabled:border-transparent disabled:cursor-not-allowed disabled:shadow-none text-[#00f3ff] border border-[#00f3ff]/40 w-full sm:w-auto px-6 py-3 rounded-xl font-bold transition-all hover:shadow-[0_0_15px_rgba(0,243,255,0.3)]"
          >
            {isCreating ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
            PŘIDAT
          </button>
        </form>
        <p className="text-xs text-slate-400 mt-1">Složky se budou automaticky synchronizovat s vaším Gmail účtem.</p>
      </div>

      <div className="bg-[#061026]/60 border border-[#00f3ff]/[0.15] p-4 sm:p-6 rounded-2xl flex flex-col gap-4">
         <h3 className="text-xl font-bold text-slate-200 border-b border-[#00f3ff]/[0.15] pb-2">Existující Vlastní Složky</h3>
         <div className="flex flex-col gap-2">
           {(!customLabels || customLabels.length === 0) ? (
              <div className="text-slate-500 italic py-4 text-center">Zatím nemáte vytvořenou žádnou vlastní složku.</div>
           ) : (
              customLabels.map(label => (
                  <div key={label.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 bg-[#0a1630] border border-[#00f3ff]/10 rounded-xl hover:bg-white/5 transition-colors group gap-3">
                     {editingId === label.id ? (
                        <div className="flex items-center gap-3 w-full sm:w-auto overflow-hidden">
                           <Folder size={18} className="text-[#00f3ff]/70 shrink-0" />
                           <input 
                             type="text" 
                             value={editName} 
                             onChange={(e) => setEditName(e.target.value)}
                             onKeyDown={(e) => {
                                if (e.key === 'Enter') handleRenameFolder(label.id, label.name);
                                if (e.key === 'Escape') setEditingId(null);
                             }}
                             autoFocus
                             className="bg-[#061026] border border-[#00f3ff]/50 rounded px-2 py-1 text-white focus:outline-none focus:border-[#00f3ff] text-sm w-full"
                           />
                           <button 
                             onClick={() => handleRenameFolder(label.id, label.name)}
                             disabled={isUpdating}
                             className="p-1 text-[#00f3ff] hover:text-white"
                             title="Uložit"
                           >
                             {isUpdating ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                           </button>
                           <button 
                             onClick={() => setEditingId(null)}
                             disabled={isUpdating}
                             className="p-1 text-slate-400 hover:text-white"
                             title="Zrušit"
                           >
                             <X size={18} />
                           </button>
                        </div>
                     ) : (
                        <div className="flex items-center justify-between w-full">
                           <div className="flex items-center gap-3 overflow-hidden">
                              <Folder size={18} className="text-[#00f3ff]/70 shrink-0" />
                              <span className="text-slate-200 font-semibold tracking-wide truncate">{label.name}</span>
                           </div>
                           <div className="flex items-center gap-2">
                             <button
                               onClick={() => { setEditingId(label.id); setEditName(label.name); }}
                               className="p-1.5 sm:p-2 bg-[#020817]/50 hover:bg-white/10 text-slate-400 hover:text-white border border-transparent hover:border-[#00f3ff]/25 rounded-lg transition-all"
                               title="Přejmenovat složku"
                             >
                                <Edit2 size={18} />
                             </button>
                             <button 
                                onClick={() => handleDeleteFolder(label.id)}
                                disabled={deletingId === label.id}
                                className="p-1.5 sm:p-2 bg-[#020817]/50 hover:bg-red-500/20 text-slate-400 hover:text-red-400 border border-transparent hover:border-red-500/50 rounded-lg transition-all"
                                title="Smazat složku"
                             >
                                {deletingId === label.id ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                             </button>
                           </div>
                        </div>
                     )}
                  </div>
              ))
           )}
         </div>
      </div>
    </div>
  );
}
