import React, { useRef, useEffect, useState } from 'react';
import { Bold, Italic, Underline, List, ListOrdered, AlignLeft, AlignCenter, AlignRight, Image as ImageIcon, Link as LinkIcon, Undo, Redo } from 'lucide-react';
import { open as openUrl } from '@tauri-apps/plugin-shell';

const EditorDropdown = ({ defaultLabel, icon, options, onSelect }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentLabel, setCurrentLabel] = useState(defaultLabel);
  const dropdownRef = useRef(null);

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        type="button"
        onMouseDown={(e) => { e.preventDefault(); setIsOpen(!isOpen); }}
        className="px-2 py-1.5 hover:bg-[#00f3ff]/20 text-slate-300 hover:text-[#00f3ff] rounded flex items-center gap-1.5 border border-[#00f3ff]/[0.15] hover:border-[#00f3ff]/40 transition-colors bg-[#020817]/50 tracking-wide"
      >
        {icon && <div>{icon}</div>}
        {currentLabel && <div className="text-xs font-bold">{currentLabel}</div>}
        <span className="text-[9px] opacity-70">▼</span>
      </button>
      {isOpen && (
        <>
          <div 
             className="fixed inset-0 z-[90]" 
             onMouseDown={(e) => { e.stopPropagation(); setIsOpen(false); }}
          />
          <div className="absolute top-[calc(100%+4px)] left-0 min-w-[140px] bg-[#020817]/95 border border-[#00f3ff]/40 rounded-xl shadow-[0_0_20px_rgba(0,243,255,0.3)] overflow-hidden z-[100] ">
          <div className="max-h-56 overflow-y-auto custom-scrollbar">
            {options.map(opt => (
               <div 
                 key={opt.value}
                 onMouseDown={(e) => { 
                   e.preventDefault(); 
                   setCurrentLabel(opt.label);
                   onSelect(opt.value); 
                   setIsOpen(false); 
                 }}
                 className="px-3 py-2 hover:bg-[#00f3ff]/20 text-slate-300 hover:text-white cursor-pointer transition-colors border-b border-[#00f3ff]/10 last:border-0 text-xs font-semibold flex items-center gap-2"
                 style={opt.style || {}}
               >
                 <span className="w-3 flex justify-center text-[#00f3ff] shrink-0 font-black">
                    {currentLabel === opt.label ? '✓' : ''}
                 </span>
                 <span>{opt.label}</span>
               </div>
            ))}
          </div>
        </div>
        </>
      )}
    </div>
  );
};

const UnifiedColorPickerDropdown = ({ onSelectForeground, onSelectBackground }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [customColors, setCustomColors] = useState([]);
  const [currentBg, setCurrentBg] = useState('transparent');
  const [currentFg, setCurrentFg] = useState('default');
  const [showMixer, setShowMixer] = useState(false);
  const [mixR, setMixR] = useState(0);
  const [mixG, setMixG] = useState(243);
  const [mixB, setMixB] = useState(255);
  const dropdownRef = useRef(null);

  const toHex = (n) => {
    const hex = parseInt(n, 10).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  const mixedColorHex = `#${toHex(mixR)}${toHex(mixG)}${toHex(mixB)}`;
  const [hexInput, setHexInput] = useState(mixedColorHex);

  useEffect(() => {
    setHexInput(mixedColorHex.toUpperCase());
  }, [mixedColorHex]);

  const handleHexChange = (e) => {
    const val = e.target.value;
    setHexInput(val);
    const clean = val.replace('#', '');
    if (clean.length === 6) {
       const r = parseInt(clean.substr(0, 2), 16);
       const g = parseInt(clean.substr(2, 2), 16);
       const b = parseInt(clean.substr(4, 2), 16);
       if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
         setMixR(r);
         setMixG(g);
         setMixB(b);
       }
    }
  };

  const presetColors = ['#ffffff', '#000000', '#01daf6', '#e425a5', '#f7c89f'];

  const getLabelColor = (hex) => {
    if (!hex || hex === 'transparent' || hex === 'default') return '#fff';
    const c = hex.substring(1);
    const rgb = parseInt(c, 16);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >>  8) & 0xff;
    const b = (rgb >>  0) & 0xff;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luma < 128 ? '#ffffff' : '#000000';
  };

  const addCustomColor = (e) => {
    const color = e.target.value;
    if (!presetColors.includes(color) && !customColors.includes(color)) {
      setCustomColors([...customColors, color]);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        type="button"
        onMouseDown={(e) => { e.preventDefault(); setIsOpen(!isOpen); }}
        className="px-2 py-1.5 hover:bg-[#00f3ff]/20 text-slate-300 hover:text-[#00f3ff] rounded flex items-center gap-1.5 border border-transparent hover:border-[#00f3ff]/40 transition-colors bg-[#020817]/50"
        title="Barva textu a podbarvení"
      >
        <div 
           className="flex flex-col items-center gap-[2px] leading-none justify-center h-full pt-0.5 px-0.5 rounded-sm border"
           style={{ 
             backgroundColor: currentBg === 'transparent' ? 'transparent' : currentBg,
             borderColor: currentBg === 'transparent' ? 'transparent' : 'rgba(255,255,255,0.2)'
           }}
        >
           <span 
             className="font-bold text-[13px] leading-none z-10" 
             style={{ 
               marginTop: '-2px', 
               color: currentFg === 'default' ? '#94a3b8' : currentFg,
               textShadow: currentBg !== 'transparent' ? '0px 0px 2px rgba(0,0,0,0.8)' : 'none'
             }}
           >A</span>
           <div 
             className="w-3.5 h-[3px] rounded-sm shadow-[0_0_2px_rgba(0,0,0,0.8)] z-10" 
             style={{ backgroundColor: currentFg === 'default' ? '#ffffff' : currentFg }}
           ></div>
        </div>
        <span className="text-[9px] opacity-70">▼</span>
      </button>

      {isOpen && (
        <>
          <div 
             className="fixed inset-0 z-[90]" 
             onMouseDown={(e) => { e.stopPropagation(); setIsOpen(false); }}
          />
          <div 
            className="absolute top-[calc(100%+4px)] left-0 min-w-[320px] bg-[#020817]/95 border border-[#00f3ff]/40 rounded-xl shadow-[0_0_20px_rgba(0,243,255,0.3)] p-4 z-[100] flex flex-col gap-3"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex gap-4">
                {/* Background Color Section */}
                <div className="flex-1">
                   <span className="text-[9px] text-[#f72585] font-bold tracking-widest uppercase mb-2 block">Podbarvení</span>
                   
                   <button 
                     onMouseDown={(e) => { e.preventDefault(); setCurrentBg('transparent'); onSelectBackground('transparent'); setIsOpen(false); }}
                     className={`w-full border py-1 mb-3 rounded transition-colors flex flex-col items-center justify-center ${currentBg === 'transparent' ? 'border-[#f72585] bg-[#f72585]/20 text-white shadow-[0_0_10px_rgba(247,37,133,0.3)]' : 'border-[#00f3ff]/25 hover:border-[#f72585] hover:text-[#f72585] bg-white/5 text-slate-300'}`}
                     title="Text bez barevného pozadí"
                   >
                     <div className="flex items-center gap-1 text-xs font-bold">
                        {currentBg === 'transparent' && <span className="text-[#f72585]">✓</span>}
                        Bez pozadí
                     </div>
                     <span className="text-[9px] opacity-70 font-normal">Čistě průchozí piksely</span>
                   </button>

                   <div className="grid grid-cols-5 gap-1.5 mb-2">
                       {presetColors.map(c => (
                           <div key={`bg-${c}`} 
                                onMouseDown={(e) => { e.preventDefault(); setCurrentBg(c); onSelectBackground(c); setIsOpen(false); }} 
                                className={`w-5 h-5 rounded border cursor-pointer hover:scale-125 transition-all text-xs flex items-center justify-center ${currentBg === c ? 'border-[#f72585] ring-2 ring-offset-2 ring-offset-[#061026] ring-[#f72585] scale-110 z-10' : 'border-[#00f3ff]/25 hover:border-[#f72585]'}`} 
                                style={{ backgroundColor: c }} title={c}>
                                {currentBg === c && <span style={{ color: getLabelColor(c), fontWeight: 'black', textShadow: '0 0 2px rgba(0,0,0,0.5)' }}>✓</span>}
                           </div>
                       ))}
                   </div>
                   
                   {customColors.length > 0 && (
                      <>
                        <div className="h-px bg-white/10 w-full mb-2" />
                        <div className="grid grid-cols-5 gap-1.5">
                           {customColors.map(c => (
                               <div key={`bg-custom-${c}`} 
                                    onMouseDown={(e) => { e.preventDefault(); setCurrentBg(c); onSelectBackground(c); setIsOpen(false); }} 
                                    className={`w-5 h-5 rounded border cursor-pointer hover:border-[#f72585] hover:scale-125 transition-all relative group flex items-center justify-center ${currentBg === c ? 'border-[#f72585] ring-2 ring-offset-2 ring-offset-[#061026] ring-[#f72585] scale-110 z-10' : 'border-[#00f3ff]/25 hover:border-[#f72585]'}`} 
                                    style={{ backgroundColor: c }} title={c}>
                                     {currentBg === c && <span style={{ color: getLabelColor(c), fontWeight: 'black', textShadow: '0 0 2px rgba(0,0,0,0.5)' }}>✓</span>}
                                     <button 
                                       onMouseDown={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          setCustomColors(customColors.filter(color => color !== c));
                                          if (currentBg === c) setCurrentBg('transparent');
                                       }}
                                       className="absolute -top-1.5 -right-1.5 bg-red-600 rounded-full w-4 h-4 text-[9px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity border border-[#00f3ff]/25 text-white font-bold z-20"
                                     >✕</button>
                               </div>
                           ))}
                        </div>
                      </>
                   )}
                </div>

                <div className="w-px bg-white/10"></div>

                {/* Text Color Section */}
                <div className="flex-1">
                   <span className="text-[9px] text-[#00f3ff] font-bold tracking-widest uppercase mb-2 block">Text</span>
                   
                   <button 
                     onMouseDown={(e) => { e.preventDefault(); setCurrentFg('default'); onSelectForeground('inherit'); setIsOpen(false); }}
                     className={`w-full border py-1 mb-3 rounded transition-colors flex flex-col items-center justify-center ${currentFg === 'default' ? 'border-[#00f3ff] bg-[#00f3ff]/20 text-white shadow-[0_0_10px_rgba(0,243,255,0.3)]' : 'border-[#00f3ff]/25 hover:border-[#00f3ff] hover:text-[#00f3ff] bg-white/5 text-slate-300'}`}
                     title="Bez vynucené barvy (U příjemce se běžně zobrazí černě, u vás světle)"
                   >
                     <div className="flex items-center gap-1 text-xs font-bold">
                        {currentFg === 'default' && <span className="text-[#00f3ff]">✓</span>}
                        Automatická
                     </div>
                     <span className="text-[9px] opacity-70 font-normal">Přizpůsobí se příjemci</span>
                   </button>

                   <div className="grid grid-cols-5 gap-1.5 mb-2">
                       {presetColors.map(c => (
                           <div key={`fg-${c}`} 
                                onMouseDown={(e) => { e.preventDefault(); setCurrentFg(c); onSelectForeground(c); setIsOpen(false); }} 
                                className={`w-5 h-5 rounded border cursor-pointer hover:scale-125 transition-all text-xs flex items-center justify-center ${currentFg === c ? 'border-[#00f3ff] ring-2 ring-offset-2 ring-offset-[#061026] ring-[#00f3ff] scale-110 z-10' : 'border-[#00f3ff]/25 hover:border-[#00f3ff]'}`} 
                                style={{ backgroundColor: c }} title={c}>
                                {currentFg === c && <span style={{ color: getLabelColor(c), fontWeight: 'black', textShadow: '0 0 2px rgba(0,0,0,0.5)' }}>✓</span>}
                           </div>
                       ))}
                   </div>
                   
                   {customColors.length > 0 && (
                      <>
                        <div className="h-px bg-white/10 w-full mb-2" />
                        <div className="grid grid-cols-5 gap-1.5">
                           {customColors.map(c => (
                               <div key={`fg-custom-${c}`} 
                                    onMouseDown={(e) => { e.preventDefault(); setCurrentFg(c); onSelectForeground(c); setIsOpen(false); }} 
                                    className={`w-5 h-5 rounded border cursor-pointer hover:border-[#00f3ff] hover:scale-125 transition-all relative group flex items-center justify-center ${currentFg === c ? 'border-[#00f3ff] ring-2 ring-offset-2 ring-offset-[#061026] ring-[#00f3ff] scale-110 z-10' : 'border-[#00f3ff]/25 hover:border-[#00f3ff]'}`} 
                                    style={{ backgroundColor: c }} title={c}>
                                     {currentFg === c && <span style={{ color: getLabelColor(c), fontWeight: 'black', textShadow: '0 0 2px rgba(0,0,0,0.5)' }}>✓</span>}
                                     <button 
                                       onMouseDown={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          setCustomColors(customColors.filter(color => color !== c));
                                          if (currentFg === c) setCurrentFg('default');
                                       }}
                                       className="absolute -top-1.5 -right-1.5 bg-red-600 rounded-full w-4 h-4 text-[9px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity border border-[#00f3ff]/25 text-white font-bold z-20"
                                     >✕</button>
                               </div>
                           ))}
                        </div>
                      </>
                   )}
                </div>
            </div>

            {!showMixer ? (
               <button 
                 onMouseDown={(e) => { e.preventDefault(); setShowMixer(true); }}
                 className="flex justify-center items-center gap-2 mt-2 bg-white/5 p-2 rounded-lg hover:bg-[#00f3ff]/20 transition-colors border border-dashed border-[#00f3ff]/25 hover:border-[#00f3ff]/50 cursor-pointer group w-full"
               >
                 <span className="text-[10px] text-slate-300 font-bold uppercase tracking-wide group-hover:text-[#00f3ff] transition-colors">+ NAMÍCHAT VLASTNÍ BARVU</span>
               </button>
            ) : (
               <div className="flex flex-col gap-2 mt-2 p-3 bg-[#020817]/60 border border-[#00f3ff]/30 rounded-xl">
                 <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] text-[#00f3ff] font-bold uppercase tracking-widest">Míchačka barev</span>
                    <button 
                       onMouseDown={(e) => { e.preventDefault(); setShowMixer(false); }}
                       className="text-slate-400 hover:text-white text-xs font-bold"
                    >✕</button>
                 </div>
                 
                 {/* Sliders */}
                 <div className="flex flex-col gap-1.5">
                   <div className="flex items-center gap-2">
                     <span className="text-red-500 font-bold text-[9px] w-2">R</span>
                     <input type="range" min="0" max="255" value={mixR} onChange={e=>setMixR(e.target.value)} className="flex-1 accent-red-500 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer" />
                   </div>
                   <div className="flex items-center gap-2">
                     <span className="text-green-500 font-bold text-[9px] w-2">G</span>
                     <input type="range" min="0" max="255" value={mixG} onChange={e=>setMixG(e.target.value)} className="flex-1 accent-green-500 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer" />
                   </div>
                   <div className="flex items-center gap-2">
                     <span className="text-[#00f3ff] font-bold text-[9px] w-2">B</span>
                     <input type="range" min="0" max="255" value={mixB} onChange={e=>setMixB(e.target.value)} className="flex-1 accent-[#00f3ff] h-1 bg-white/10 rounded-lg appearance-none cursor-pointer" />
                   </div>
                 </div>
                 
                 <div className="flex gap-2 mt-2 items-center">
                   <div className="w-6 h-6 rounded border border-[#00f3ff]/25 shrink-0" style={{backgroundColor: mixedColorHex}}></div>
                   <input 
                     type="text" 
                     value={hexInput} 
                     onChange={handleHexChange}
                     onMouseDown={(e) => e.stopPropagation()}
                     className="w-[70px] bg-black border border-[#00f3ff]/[0.15] rounded text-center text-xs text-slate-300 font-mono py-1 focus:outline-none focus:border-[#00f3ff]/50" 
                   />
                   <button 
                     onMouseDown={(e) => { 
                       e.preventDefault(); 
                       if (!customColors.includes(mixedColorHex) && !presetColors.includes(mixedColorHex)) {
                         setCustomColors([...customColors, mixedColorHex]);
                       }
                       setShowMixer(false);
                     }}
                     className="flex-1 bg-[#00f3ff]/20 text-[#00f3ff] hover:bg-[#00f3ff]/40 text-xs font-bold rounded transition-colors border border-[#00f3ff]/50 py-1 shadow-[0_0_10px_rgba(0,243,255,0.2)]"
                   >
                     ULOŽIT
                   </button>
                 </div>
              </div>
            )}
         </div>
        </>
      )}
    </div>
  );
};

const fontOptions = [
  { label: 'Exo 2 Bold', value: '"Exo 2", sans-serif', style: { fontFamily: '"Exo 2", sans-serif', fontWeight: 700 } },
  { label: 'Open Sans', value: '"Open Sans", sans-serif', style: { fontFamily: '"Open Sans", sans-serif' } },
  { label: 'Arial', value: 'Arial', style: { fontFamily: 'Arial' } },
  { label: 'Verdana', value: 'Verdana', style: { fontFamily: 'Verdana' } },
  { label: 'Times New Roman', value: 'Times New Roman', style: { fontFamily: '"Times New Roman", Times, serif' } },
  { label: 'Courier New', value: 'Courier New', style: { fontFamily: '"Courier New", Courier, monospace' } },
  { label: 'Georgia', value: 'Georgia', style: { fontFamily: 'Georgia' } }
];

const sizeOptions = [
  { label: 'Malé', value: '1' },
  { label: 'Normální', value: '3' },
  { label: 'Velké', value: '5' },
  { label: 'Obrovské', value: '7' }
];

const RichTextEditor = ({ value = '', onChange, placeholder, className = '', hideImageUpload = false }) => {
  const editorRef = useRef(null);
  const fileInputRef = useRef(null);
  const [isFocused, setIsFocused] = useState(false);
  const [formatState, setFormatState] = useState({});
  const [linkModal, setLinkModal] = useState({ isOpen: false, text: '', url: 'https://', savedRange: null, htmlContent: '', existingAnchor: null });
  // Stav Ctrl se drží jen jako data atribut na DOM (kvůli kurzoru nad odkazy) – bez re-renderu editoru
  const rootRef = useRef(null);
  const [selectedImage, setSelectedImage] = useState(null); // { el, rect }
  const [customWidth, setCustomWidth] = useState('');

  useEffect(() => {
    const setCtrl = (on) => { if (rootRef.current) rootRef.current.dataset.ctrl = on ? 'true' : 'false'; };
    const handleKeyDown = (e) => {
      if (e.key === 'Control' || e.key === 'Meta') setCtrl(true);
    };
    const handleKeyUp = (e) => {
      if (e.key === 'Control' || e.key === 'Meta') setCtrl(false);
    };
    const handleBlur = () => setCtrl(false);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  const updateFormatState = () => {
    setFormatState({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      insertUnorderedList: document.queryCommandState('insertUnorderedList'),
      insertOrderedList: document.queryCommandState('insertOrderedList'),
      justifyLeft: document.queryCommandState('justifyLeft'),
      justifyCenter: document.queryCommandState('justifyCenter'),
      justifyRight: document.queryCommandState('justifyRight')
    });
  };

  // Inicializace obsahu editorru pouze při prvním mountu (ne na každou změnu value)
  // Tím se zabrání smyčce: psaní → onChange → value prop → innerHTML přepis → ztráta kurzoru
  const isInitializedRef = useRef(false);
  useEffect(() => {
    if (editorRef.current && !isInitializedRef.current) {
      editorRef.current.innerHTML = value || '';
      isInitializedRef.current = true;
    }
  }, []);

  // Pokud se value změní externě (np. reset formuláře), aktualizuj editor
  const lastExternalValueRef = useRef(value);
  useEffect(() => {
    if (value !== lastExternalValueRef.current && editorRef.current) {
      const currentHTML = editorRef.current.innerHTML;
      // Aktualizuj jen pokud se value opravdu liší od toho co editor teď zobrazuje
      if (currentHTML !== value) {
        editorRef.current.innerHTML = value || '';
      }
      lastExternalValueRef.current = value;
    }
  }, [value]);

  const debounceTimerRef = useRef(null);
  const formatThrottleRef = useRef(null);
  
  // Throttlovaná verze - spustí se max 1× za 200ms aby se při rychlém psaní
  // nevolalo 8× queryCommandState() pro každé písmeno
  const updateFormatStateThrottled = () => {
    if (!formatThrottleRef.current) {
      formatThrottleRef.current = setTimeout(() => {
        updateFormatState();
        formatThrottleRef.current = null;
      }, 200);
    }
  };
  
  // Aktuální onChange v refu – flush při odchodu z editoru / unmountu volá vždy nejnovější verzi
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  /** Okamžitě předá rozepsaný obsah rodiči (zruší čekající debounce) */
  const flushChange = () => {
    if (!debounceTimerRef.current) return;
    clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = null;
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      lastExternalValueRef.current = html;
      onChangeRef.current?.(html);
    }
  };

  const handleInput = () => {
    if (editorRef.current) {
      // Debounce 600ms - editor se cítí okamžitě, React state se aktualizuje s odstupem.
      // Při odchodu z editoru (klik na Odeslat apod.) se obsah předá hned – viz flushChange.
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        if (editorRef.current) {
          const html = editorRef.current.innerHTML;
          lastExternalValueRef.current = html; // zabraň re-triggeru useEffect
          onChangeRef.current?.(html);
        }
      }, 600);
    }
  };

  // Při zavření editoru nezahodit posledních 600 ms psaní
  useEffect(() => () => {
    flushChange();
    if (formatThrottleRef.current) clearTimeout(formatThrottleRef.current);
  }, []);

  const execCommand = (cmd, val = null) => {
    document.execCommand(cmd, false, val);
    if (editorRef.current) {
      editorRef.current.focus();
      onChange(editorRef.current.innerHTML);
    }
    updateFormatState();
  };

  const activeBtnClass = "bg-[#00f3ff]/20 text-[#00f3ff] shadow-[0_0_10px_rgba(0,243,255,0.2)] border-[#00f3ff]/40";
  const inactiveBtnClass = "hover:bg-white/10 text-slate-300 hover:text-white border-transparent";
  const btnBaseClass = "p-1.5 rounded transition-colors border";

  const insertImage = (e) => {
    const file = e.target.files[0];
    if (file && (file.type.startsWith('image/') || file.name.match(/\.(svg|png|jpg|jpeg|gif|webp|ico|bmp)$/i))) {
      const reader = new FileReader();
      reader.onload = (event) => {
         execCommand('insertImage', event.target.result);
      };
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const performUndo = () => {
    document.execCommand('undo', false, null);
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
      updateFormatState();
    }
  };

  const performRedo = () => {
    document.execCommand('redo', false, null);
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
      updateFormatState();
    }
  };

  const handleKeyDownEditing = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        performRedo();
      } else {
        performUndo();
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      performRedo();
    }
  };

  const openLinkModal = () => {
    const selection = window.getSelection();
    let text = '';
    let url = 'https://';
    let range = null;
    let existingAnchor = null;
    let htmlContent = '';

    if (selection && selection.rangeCount > 0) {
      range = selection.getRangeAt(0);
      
      let node = selection.anchorNode;
      while (node && node !== editorRef.current) {
        if (node.nodeName === 'A') {
          existingAnchor = node;
          break;
        }
        node = node.parentNode;
      }

      if (existingAnchor) {
        url = existingAnchor.href;
        htmlContent = existingAnchor.innerHTML;
        text = existingAnchor.innerText || '';
      } else {
        text = selection.toString();
        const fragment = range.cloneContents();
        const div = document.createElement('div');
        div.appendChild(fragment);
        htmlContent = div.innerHTML;
      }
    }
    setLinkModal({ isOpen: true, text, url, savedRange: range, htmlContent, existingAnchor });
  };

  const submitLink = () => {
    if (linkModal.savedRange) {
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(linkModal.savedRange);
    }
    if (linkModal.url) {
      const safeUrl = linkModal.url.startsWith('http') || linkModal.url.startsWith('mailto:') ? linkModal.url : `https://${linkModal.url}`;
      
      if (linkModal.existingAnchor) {
        linkModal.existingAnchor.href = safeUrl;
        if (linkModal.text && linkModal.text !== linkModal.existingAnchor.innerText) {
          linkModal.existingAnchor.innerText = linkModal.text;
        }
      } else {
        const defaultOriginalText = linkModal.savedRange ? linkModal.savedRange.toString() : '';
        const shouldUseText = linkModal.text && linkModal.text !== defaultOriginalText;
        const finalContent = shouldUseText ? linkModal.text : (linkModal.htmlContent || linkModal.text || safeUrl);
        const html = `<a href="${safeUrl}" target="_blank" style="text-decoration: underline;">${finalContent}</a>`;
        document.execCommand('insertHTML', false, html);
      }

      if (editorRef.current) {
        onChange(editorRef.current.innerHTML);
      }
    }
    setLinkModal({ isOpen: false, text: '', url: 'https://', savedRange: null, htmlContent: '', existingAnchor: null });
  };

  // Image click handler – zobraz toolbar pro resize
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const handleImageClick = (e) => {
      const img = e.target.closest('img');
      if (img) {
        e.preventDefault();
        setSelectedImage(img);
        setCustomWidth(img.width ? String(img.width) : '');
      } else {
        setSelectedImage(null);
      }
    };

    editor.addEventListener('click', handleImageClick);
    return () => editor.removeEventListener('click', handleImageClick);
  }, []);

  const resizeImage = (width) => {
    if (!selectedImage) return;
    if (width === 'auto') {
      selectedImage.style.width = '';
      selectedImage.style.height = '';
      selectedImage.removeAttribute('width');
      selectedImage.removeAttribute('height');
    } else {
      selectedImage.style.width = `${width}px`;
      selectedImage.style.height = 'auto';
      selectedImage.setAttribute('width', width);
      selectedImage.removeAttribute('height');
    }
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  };

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const handleNativeClick = (e) => {
      const target = e.target.closest('a');
      if (target) {
        e.preventDefault();
        e.stopPropagation();
        
        if (e.ctrlKey || e.metaKey) {
          openUrl(target.href).catch(err => {
             console.error("Failed to open URL:", err);
             window.open(target.href, '_blank');
          });
        }
      }
    };

    editor.addEventListener('click', handleNativeClick, { capture: true });
    return () => {
      editor.removeEventListener('click', handleNativeClick, { capture: true });
    };
  }, []);

  return (
    <div ref={rootRef} data-ctrl="false" className={`flex flex-col border rounded-xl shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] ${isFocused ? 'border-[#00f3ff]/60 bg-[#061026]' : 'border-[#00f3ff]/30 bg-[#061026]'} ${className} relative overflow-visible`} style={{contain: 'layout style'}}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 p-2 border-b border-[#00f3ff]/10 bg-[#0a1630] shrink-0">
        <EditorDropdown defaultLabel="Open Sans" options={fontOptions} onSelect={(val) => execCommand('fontName', val)} />
        <EditorDropdown 
          icon={<span className="font-serif tracking-tighter flex items-end"><span className="text-[10px] leading-none mb-[1px]">t</span><span className="text-sm leading-none">T</span></span>} 
          defaultLabel="Normální"
          options={sizeOptions} 
          onSelect={(val) => execCommand('fontSize', val)} 
        />

        <div className="w-px h-4 bg-white/10 mx-1 hidden sm:block"></div>

        <button onClick={performUndo} className={`${btnBaseClass} ${inactiveBtnClass}`} title="Zpět (Ctrl+Z)"><Undo size={16} /></button>
        <button onClick={performRedo} className={`${btnBaseClass} ${inactiveBtnClass}`} title="Vpřed (Ctrl+Y)"><Redo size={16} /></button>

        <div className="w-px h-4 bg-white/10 mx-1 hidden sm:block"></div>

        <UnifiedColorPickerDropdown 
           onSelectForeground={(val) => execCommand('foreColor', val)} 
           onSelectBackground={(val) => execCommand('hiliteColor', val)} 
        />

        <div className="w-px h-4 bg-white/10 mx-1 hidden sm:block"></div>
        <button onClick={() => execCommand('bold')} className={`${btnBaseClass} ${formatState.bold ? activeBtnClass : inactiveBtnClass}`} title="Tučné"><Bold size={16} /></button>
        <button onClick={() => execCommand('italic')} className={`${btnBaseClass} ${formatState.italic ? activeBtnClass : inactiveBtnClass}`} title="Kurzíva"><Italic size={16} /></button>
        <button onClick={() => execCommand('underline')} className={`${btnBaseClass} ${formatState.underline ? activeBtnClass : inactiveBtnClass}`} title="Podtržené"><Underline size={16} /></button>
        <div className="w-px h-4 bg-white/10 mx-1 hidden sm:block"></div>
        <button onClick={() => execCommand('insertUnorderedList')} className={`${btnBaseClass} ${formatState.insertUnorderedList ? activeBtnClass : inactiveBtnClass}`} title="Odrážky"><List size={16} /></button>
        <button onClick={() => execCommand('insertOrderedList')} className={`${btnBaseClass} ${formatState.insertOrderedList ? activeBtnClass : inactiveBtnClass}`} title="Číslování"><ListOrdered size={16} /></button>
        <div className="w-px h-4 bg-white/10 mx-1 hidden sm:block"></div>
        <button onClick={() => execCommand('justifyLeft')} className={`${btnBaseClass} ${formatState.justifyLeft ? activeBtnClass : inactiveBtnClass}`} title="Zarovnat vlevo"><AlignLeft size={16} /></button>
        <button onClick={() => execCommand('justifyCenter')} className={`${btnBaseClass} ${formatState.justifyCenter ? activeBtnClass : inactiveBtnClass}`} title="Zarovnat na střed"><AlignCenter size={16} /></button>
        <button onClick={() => execCommand('justifyRight')} className={`${btnBaseClass} ${formatState.justifyRight ? activeBtnClass : inactiveBtnClass}`} title="Zarovnat vpravo"><AlignRight size={16} /></button>
        <div className="w-px h-4 bg-white/10 mx-1 hidden sm:block"></div>
        <button onClick={openLinkModal} className="p-1.5 hover:bg-white/10 text-slate-300 hover:text-[#00f3ff] rounded transition-colors" title="Vložit odkaz"><LinkIcon size={16} /></button>
        {!hideImageUpload && (
           <React.Fragment>
             <button onClick={() => fileInputRef.current?.click()} className="px-2 py-1.5 hover:bg-[#00f3ff]/20 text-slate-300 hover:text-[#00f3ff] rounded flex items-center gap-1.5 border border-transparent hover:border-[#00f3ff]/40 transition-colors bg-white/5" title="Vložit obrázek">
               <ImageIcon size={15} /> <span className="text-[10px] uppercase font-bold tracking-widest hidden sm:block">Obrázek</span>
             </button>
             <input type="file" accept="image/*,.svg,.png,.jpg,.jpeg,.gif,.webp" ref={fileInputRef} onChange={insertImage} className="hidden" />
           </React.Fragment>
        )}
      </div>

      {/* Link Modal */}
      {linkModal.isOpen && (
        <div className="absolute inset-0 bg-[#020817]/60 z-50 flex items-center justify-center " onMouseDown={(e) => e.stopPropagation()}>
          <div className="bg-[#061026] border border-[#00f3ff]/40 shadow-[0_0_30px_rgba(0,243,255,0.2)] rounded-xl p-5 w-[90%] max-w-sm flex flex-col gap-4">
            <h3 className="text-[#00f3ff] font-bold text-sm tracking-widest uppercase flex items-center gap-2 mb-1">
              <LinkIcon size={16} /> Vložit odkaz
            </h3>
            
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-slate-400 font-bold uppercase">Zobrazený text</label>
              <input 
                type="text" 
                value={linkModal.text}
                onChange={(e) => setLinkModal({...linkModal, text: e.target.value})}
                placeholder="Např. Zažij VR"
                className="bg-[#020817]/50 border border-[#00f3ff]/[0.15] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#00f3ff]/50 transition-colors"
              />
            </div>
            
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-slate-400 font-bold uppercase">URL adresa</label>
              <input 
                type="text" 
                value={linkModal.url}
                onChange={(e) => setLinkModal({...linkModal, url: e.target.value})}
                placeholder="https://..."
                className="bg-[#020817]/50 border border-[#00f3ff]/[0.15] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#00f3ff]/50 transition-colors"
                onKeyDown={(e) => { if (e.key === 'Enter') submitLink(); }}
              />
            </div>

            <div className="flex justify-end gap-2 mt-2">
              <button 
                onClick={() => setLinkModal({ isOpen: false, text: '', url: 'https://', savedRange: null })}
                className="px-4 py-2 rounded text-xs font-bold text-slate-400 hover:text-white transition-colors"
              >
                ZRUŠIT
              </button>
              <button 
                onClick={submitLink}
                className="px-4 py-2 rounded text-xs font-bold bg-[#00f3ff]/20 text-[#00f3ff] hover:bg-[#00f3ff]/40 border border-[#00f3ff]/50 transition-colors shadow-[0_0_10px_rgba(0,243,255,0.2)]"
              >
                VLOŽIT ODKAZ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Editor Area */}
      <div 
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onKeyDown={handleKeyDownEditing}
        onKeyUp={updateFormatStateThrottled}
        onMouseUp={updateFormatStateThrottled}
        onFocus={() => setIsFocused(true)}
        onBlur={() => { flushChange(); setIsFocused(false); }}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        className="flex-1 w-full p-4 text-white custom-scrollbar outline-none overflow-y-auto rich-text-content"
        placeholder={placeholder}
      ></div>

      {/* Image Resize Toolbar */}
      {selectedImage && (() => {
        const editorEl = editorRef.current;
        if (!editorEl) return null;
        const editorRect = editorEl.getBoundingClientRect();
        const imgRect = selectedImage.getBoundingClientRect();
        const topRelative = imgRect.bottom - editorRect.top + editorEl.scrollTop + 6;
        const leftRelative = Math.max(4, imgRect.left - editorRect.left);

        return (
          <div
            style={{ position: 'absolute', top: topRelative, left: leftRelative, zIndex: 200 }}
            className="flex items-center gap-1.5 bg-[#020817]/95 border border-[#00f3ff]/60 rounded-xl px-3 py-2 shadow-[0_0_20px_rgba(0,243,255,0.4)] backdrop-blur-sm"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <span className="text-[9px] text-[#00f3ff] font-bold uppercase tracking-widest mr-1">Velikost</span>
            {[{label:'S', px:120},{label:'M', px:250},{label:'L', px:450},{label:'XL', px:700}].map(({label, px}) => (
              <button
                key={label}
                onMouseDown={(e) => { e.preventDefault(); resizeImage(px); }}
                className="px-2 py-1 text-[10px] font-black text-slate-300 hover:text-[#00f3ff] hover:bg-[#00f3ff]/20 rounded border border-[#00f3ff]/[0.15] hover:border-[#00f3ff]/50 transition-all"
              >{label}</button>
            ))}
            <div className="w-px h-4 bg-white/20" />
            <button
              onMouseDown={(e) => { e.preventDefault(); resizeImage('auto'); }}
              className="px-2 py-1 text-[10px] font-black text-slate-300 hover:text-white hover:bg-white/10 rounded border border-[#00f3ff]/[0.15] transition-all"
            >Původní</button>
            <div className="w-px h-4 bg-white/20" />
            <input
              type="number"
              value={customWidth}
              onChange={e => setCustomWidth(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (customWidth) resizeImage(parseInt(customWidth)); } }}
              onMouseDown={e => e.stopPropagation()}
              placeholder="px"
              className="w-14 bg-[#020817]/60 border border-[#00f3ff]/25 rounded px-2 py-1 text-[10px] text-white text-center font-mono focus:outline-none focus:border-[#00f3ff]/50"
            />
            <button
              onMouseDown={(e) => { e.preventDefault(); if (customWidth) resizeImage(parseInt(customWidth)); }}
              className="px-2 py-1 text-[10px] font-black text-[#f72585] hover:text-white hover:bg-[#f72585]/20 rounded border border-[#f72585]/40 transition-all"
            >OK</button>
            <button
              onMouseDown={(e) => { e.preventDefault(); setSelectedImage(null); }}
              className="ml-1 text-slate-500 hover:text-red-400 text-xs transition-colors"
            >✕</button>
          </div>
        );
      })()}

      <style dangerouslySetInnerHTML={{__html: `
        div[data-ctrl="true"] [contenteditable] a {
          cursor: pointer !important;
        }
        [contenteditable] a {
          cursor: text;
        }
        [contenteditable]:empty:before {
          content: attr(placeholder);
          color: #94a3b8;
          pointer-events: none;
          display: block; 
        }
        [contenteditable] {
          line-height: 1.6;
          font-family: 'Open Sans', sans-serif;
        }
        [contenteditable] img {
          max-width: 100%;
          height: auto;
        }
        /* Ztlumení barev pro Původní email (Quoted text) v editoru */
        [contenteditable] blockquote.gmail_quote {
          color: #94a3b8 !important;
        }
        [contenteditable] blockquote.gmail_quote *,
        [contenteditable] div.gmail_attr * {
          color: #94a3b8 !important;
          background-color: transparent !important;
        }
        [contenteditable] img {
          max-width: 100%;
          height: auto;
          border-radius: 8px;
          margin: 10px 0;
          box-shadow: 0 4px 15px rgba(0,0,0,0.3);
          border: 1px solid rgba(255,255,255,0.1);
          cursor: pointer;
        }
        [contenteditable] img:hover {
          outline: 2px solid rgba(0,243,255,0.5);
          outline-offset: 2px;
        }
        [contenteditable] ul { list-style-type: disc; padding-left: 1.5rem; margin-bottom: 1rem; }
        [contenteditable] ol { list-style-type: decimal; padding-left: 1.5rem; margin-bottom: 1rem; }
      `}} />
    </div>
  );
}
export default React.memo(RichTextEditor);
