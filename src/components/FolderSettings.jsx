import React, { useState } from 'react';
import { Plus, Trash2, Loader2, Folder, Edit2, Check, X } from 'lucide-react';

export default function FolderSettings({ googleToken, customLabels, setCustomLabels }) {
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  const handleCreateFolder = async (e) => {
    e.preventDefault();
    if (!newFolderName.trim() || !googleToken) return;

    setIsCreating(true);
    try {
      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${googleToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: newFolderName.trim(),
          labelListVisibility: 'labelShow',
          messageListVisibility: 'show'
        })
      });

      if (res.ok) {
        const newLabel = await res.json();
        setCustomLabels(prev => [...(prev || []), newLabel]);
        setNewFolderName('');
      } else {
        console.error("Chyba při tvorbě složky", await res.text());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteFolder = async (id) => {
    if (!googleToken) return;
    setDeletingId(id);
    try {
      const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/labels/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${googleToken}`
        }
      });
      if (res.ok) {
        setCustomLabels(prev => prev.filter(l => l.id !== id));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDeletingId(null);
    }
  };

  const handleRenameFolder = async (id, oldName) => {
    if (!editName.trim() || editName === oldName || !googleToken) {
      setEditingId(null);
      return;
    }
    setIsUpdating(true);
    try {
      const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/labels/${id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${googleToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: id,
          name: editName.trim(),
          labelListVisibility: 'labelShow',
          messageListVisibility: 'show'
        })
      });

      if (res.ok) {
        const updatedLabel = await res.json();
        setCustomLabels(prev => prev.map(l => l.id === id ? updatedLabel : l));
        setEditingId(null);
      } else {
        console.error("Chyba při přejmenování složky", await res.text());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 mt-2 overflow-y-auto custom-scrollbar pr-2 max-h-[60vh] pb-4">
      <div className="bg-black/40 border border-[#00f3ff]/20 p-4 sm:p-6 rounded-2xl flex flex-col gap-4">
        <h3 className="text-xl font-bold text-gray-200 border-b border-white/10 pb-2 flex items-center gap-2">
          <Folder size={20} className="text-[#00f3ff]" />
          Vytvořit Vlastní Složku
        </h3>
        
        <form onSubmit={handleCreateFolder} className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 w-full">
          <input 
            type="text" 
            placeholder="Název nové složky (např. Důležité Projekty)" 
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            className="w-full sm:flex-1 bg-[#0f172a]/80 border border-[#00f3ff]/30 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[#00f3ff] transition-colors shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]"
          />
          <button 
            type="submit" 
            disabled={isCreating || !newFolderName.trim()}
            className="group flex items-center justify-center gap-2 bg-[#00f3ff]/10 hover:bg-[#00f3ff]/20 disabled:bg-white/5 disabled:hover:bg-white/5 disabled:text-gray-500 disabled:border-transparent disabled:cursor-not-allowed disabled:shadow-none text-[#00f3ff] border border-[#00f3ff]/40 w-full sm:w-auto px-6 py-3 rounded-xl font-bold transition-all hover:shadow-[0_0_15px_rgba(0,243,255,0.3)]"
          >
            {isCreating ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
            PŘIDAT
          </button>
        </form>
        <p className="text-xs text-gray-400 mt-1">Složky se budou automaticky synchronizovat s vaším Gmail účtem.</p>
      </div>

      <div className="bg-[#0f172a]/60 border border-white/10 p-4 sm:p-6 rounded-2xl flex flex-col gap-4">
         <h3 className="text-xl font-bold text-gray-200 border-b border-white/10 pb-2">Existující Vlastní Složky</h3>
         <div className="flex flex-col gap-2">
           {(!customLabels || customLabels.length === 0) ? (
              <div className="text-gray-500 italic py-4 text-center">Zatím nemáte vytvořenou žádnou vlastní složku.</div>
           ) : (
              customLabels.map(label => (
                  <div key={label.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 bg-black/40 border border-white/5 rounded-xl hover:bg-white/5 transition-colors group gap-3">
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
                             className="bg-[#0f172a] border border-[#00f3ff]/50 rounded px-2 py-1 text-white focus:outline-none focus:border-[#00f3ff] text-sm w-full"
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
                             className="p-1 text-gray-400 hover:text-white"
                             title="Zrušit"
                           >
                             <X size={18} />
                           </button>
                        </div>
                     ) : (
                        <div className="flex items-center justify-between w-full">
                           <div className="flex items-center gap-3 overflow-hidden">
                              <Folder size={18} className="text-[#00f3ff]/70 shrink-0" />
                              <span className="text-gray-200 font-semibold tracking-wide truncate">{label.name}</span>
                           </div>
                           <div className="flex items-center gap-2">
                             <button
                               onClick={() => { setEditingId(label.id); setEditName(label.name); }}
                               className="p-1.5 sm:p-2 bg-black/50 hover:bg-white/10 text-gray-400 hover:text-white border border-transparent hover:border-white/20 rounded-lg transition-all"
                               title="Přejmenovat složku"
                             >
                                <Edit2 size={18} />
                             </button>
                             <button 
                                onClick={() => handleDeleteFolder(label.id)}
                                disabled={deletingId === label.id}
                                className="p-1.5 sm:p-2 bg-black/50 hover:bg-red-500/20 text-gray-400 hover:text-red-400 border border-transparent hover:border-red-500/50 rounded-lg transition-all"
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
