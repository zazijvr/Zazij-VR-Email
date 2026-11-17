import { useState, useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { getStoredContacts } from '../utils/contactManager';

/** Stačí hodnota – při výběru návrhu se posílá náhradní objekt místo skutečné události */
export type AutofillChange = { target: { value: string } };

interface AutofillInputProps {
  userEmail?: string;
  label?: ReactNode;
  value: string;
  onChange: (e: AutofillChange) => void;
  placeholder?: string;
  className?: string;
  headerRight?: ReactNode;
}

export default function AutofillInput({ userEmail, label, value, onChange, placeholder, className, headerRight }: AutofillInputProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [knownContacts, setKnownContacts] = useState<string[]>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const justSelectedRef = useRef(false);

  useEffect(() => {
    if (userEmail) {
      setKnownContacts(getStoredContacts(userEmail));
    }
  }, [userEmail]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleInputChange = (e: AutofillChange) => {
    const val = e.target.value;
    onChange(e);

    // Pokud je zadáno více adres (oddělené čárkou), zajímá nás jen poslední slovo pro napovídání
    const parts = val.split(',');
    const currentPart = parts.length > 0 ? parts[parts.length - 1].trim().toLowerCase() : '';

    if (currentPart.length > 0) {
      setTimeout(() => {
        const filtered: string[] = [];
        for (let i = 0; i < knownContacts.length; i++) {
           if (knownContacts[i].toLowerCase().includes(currentPart)) {
              filtered.push(knownContacts[i]);
              if (filtered.length >= 5) break;
           }
        }
        setSuggestions(filtered);
        setShowDropdown(filtered.length > 0);
        setActiveIndex(-1);
      }, 0);
    } else {
      setTimeout(() => {
        const top5 = knownContacts.slice(0, 5);
        setSuggestions(top5);
        setShowDropdown(top5.length > 0);
        setActiveIndex(-1);
      }, 0);
    }
  };

  const handleFocus = () => {
    if (justSelectedRef.current) {
       justSelectedRef.current = false;
       return;
    }
    const parts = value ? value.split(',') : [];
    const currentPart = parts.length > 0 ? parts[parts.length - 1].trim().toLowerCase() : '';
    
    if (currentPart.length === 0 && knownContacts.length > 0) {
       setSuggestions(knownContacts.slice(0, 5));
       setShowDropdown(true);
    } else if (suggestions.length > 0) {
       setShowDropdown(true);
    }
  };

  const handleSelectSuggestion = (suggestion: string) => {
    const parts = value.split(',');
    parts.pop(); // Odebereme nedopsanou část
    
    // Přidat vybraný návrh
    const newValue = parts.length > 0 
      ? parts.join(',') + ', ' + suggestion 
      : suggestion;
      
    // Aktualizujeme stav skrz rodiče (fake event objekt pro onChange)
    onChange({ target: { value: newValue + ', ' }});
    setShowDropdown(false);
    justSelectedRef.current = true;
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (activeIndex >= 0 && activeIndex < suggestions.length) {
        e.preventDefault();
        handleSelectSuggestion(suggestions[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      setShowDropdown(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 relative" ref={wrapperRef}>
      <div className="flex justify-between items-center px-1">
        <label className="text-[10px] text-[#00f3ff] uppercase tracking-widest font-bold opacity-70">
          {label}
        </label>
        {headerRight && (
          <div className="flex items-center gap-2">
            {headerRight}
          </div>
        )}
      </div>
      <input 
        ref={inputRef}
        type="text" 
        value={value} 
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        onFocus={handleFocus}
        className={className}
      />
      
      {showDropdown && (
        <ul className="absolute top-[100%] left-0 w-full z-[100] mt-2 bg-[#061026] border border-[#00f3ff]/40 rounded-xl overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.8),_0_0_15px_rgba(0,243,255,0.2)] max-h-[250px] overflow-y-auto transform-gpu will-change-transform">
          {suggestions.map((suggestion, index) => (
            <li 
              key={index}
              onClick={() => handleSelectSuggestion(suggestion)}
              onMouseEnter={() => setActiveIndex(index)}
              className={`px-4 py-3 cursor-pointer text-sm font-mono border-b border-[#00f3ff]/10 last:border-none transition-colors ${
                index === activeIndex 
                ? 'bg-[#00f3ff]/20 text-white' 
                : 'text-slate-300 hover:bg-white/5'
              }`}
            >
              {suggestion}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
