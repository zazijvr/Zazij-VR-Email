import { useState, useEffect, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, Edit3, FileText } from 'lucide-react';
import EmailComposer from './EmailComposer';
import type { ComposerConfig, ComposerSuccess, EmailTemplate } from '../types/composer';

export default function TemplateSettings({ googleToken }: { googleToken: string | null }) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [composerConfig, setComposerConfig] = useState<ComposerConfig | null>(null);
  
  useEffect(() => {
    const saved = localStorage.getItem('zazijvr_templates');
    if (saved) {
      try { setTemplates(JSON.parse(saved)); } catch { /* poškozené uložené šablony – začne se s prázdným seznamem */ }
    }
  }, []);

  const saveToDisk = (newTemplates: EmailTemplate[]) => {
    setTemplates(newTemplates);
    localStorage.setItem('zazijvr_templates', JSON.stringify(newTemplates));
  };

  const createNewTemplate = () => {
    setComposerConfig({
      type: 'template',
      templateData: {
        id: Date.now().toString(),
        title: '',
        subject: '',
        body: ''
      }
    });
  };

  const handleSaveTemplate = (action: ComposerSuccess['action'], payload: ComposerSuccess['meta']) => {
    if (action === 'save_template') {
       const meta = payload as EmailTemplate;
       let newTemplates;
       const exists = templates.find(t => t.id === meta.id);
       if (exists) {
         newTemplates = templates.map(t => t.id === meta.id ? meta : t);
       } else {
         newTemplates = [...templates, meta];
       }
       saveToDisk(newTemplates);
    }
  };

  const handleDelete = (id: string, e: MouseEvent) => {
    e.stopPropagation();
    const newTemplates = templates.filter(t => t.id !== id);
    saveToDisk(newTemplates);
  };

  return (
    <div className="flex flex-col gap-6 w-full h-[50dvh] min-h-[400px]">

          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-navy-card/70 p-4 rounded-xl border border-neon-blue/10">
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-slate-200">Moje e-mailové šablony</h3>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">Tyto šablony se při zvolení aplikují natvrdo do otevřeného okna a změní jeho obsah i předmět.</p>
            </div>
            <button 
              onClick={createNewTemplate}
              className="flex w-full sm:w-auto justify-center items-center gap-2 bg-neon-blue/10 hover:bg-neon-blue/20 text-neon-blue border border-neon-blue/40 px-4 py-2.5 sm:py-2 rounded-lg font-bold transition-all shadow-[0_0_10px_rgba(0,243,255,0.1)] hover:shadow-[0_0_20px_rgba(0,243,255,0.3)] shrink-0"
            >
              <Plus size={18} />
              NOVÁ ŠABLONA
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-3 pr-2 border-t border-neon-blue/10 pt-4">
            {templates.length === 0 ? (
              <div className="text-center p-10 text-slate-500 font-semibold border-2 border-dashed border-slate-700/50 rounded-xl">
                Zatím tu není uložena žádná šablona.
              </div>
            ) : (
              templates.map(t => (
                <div 
                  key={t.id} 
                  className="group flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-navy-card hover:bg-navy-deep/60 border border-neon-blue/[0.15] hover:border-neon-blue/40 rounded-xl transition-all cursor-pointer shadow-sm hover:shadow-[0_0_15px_rgba(0,243,255,0.1)] gap-4"
                  onClick={() => setComposerConfig({ type: 'template', templateData: t })}
                >
                  <div className="flex items-start gap-4 flex-1 w-full overflow-hidden">
                    <div className="mt-1 w-10 h-10 rounded-lg bg-neon-blue/10 flex items-center justify-center text-neon-blue border border-neon-blue/20 shrink-0">
                      <FileText size={20} />
                    </div>
                    <div className="flex flex-col overflow-hidden max-w-[80%]">
                      <span className="font-bold text-slate-200 tracking-wide truncate">{t.title || 'Nevyplněný název'}</span>
                      <span className="text-sm text-neon-blue/70 truncate flex items-center gap-2">
                        Předmět: <span className="opacity-70 truncate">{t.subject || '(bez předmětu)'}</span>
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
                    <button className="p-2 bg-white/5 hover:bg-neon-blue/20 text-slate-400 hover:text-neon-blue rounded-lg transition-colors border border-transparent hover:border-neon-blue/40">
                      <Edit3 size={18} />
                    </button>
                    <button 
                       onClick={(e) => handleDelete(t.id, e)}
                       className="p-2 bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-lg transition-colors border border-transparent hover:border-red-500/40"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>


      {composerConfig && createPortal(
        <EmailComposer
           googleToken={googleToken}
           config={composerConfig}
           onClose={() => setComposerConfig(null)}
           onSuccessAction={handleSaveTemplate}
        />,
        document.body
      )}
    </div>
  );
}
