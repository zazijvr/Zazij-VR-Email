// Nástroje pro lokální ukládání a získávání e-mailových kontaktů z historie
export const getStoredContacts = (userEmail: string | null | undefined): string[] => {
  if (!userEmail) return [];
  try {
    const raw = localStorage.getItem(`email_contacts_${userEmail}`);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error("Selhalo načtení kontaktů z localStorage:", e);
    return [];
  }
};

export const saveNewContacts = (userEmail: string | null | undefined, contactStrings: (string | null | undefined)[]): void => {
  if (!userEmail || !contactStrings || contactStrings.length === 0) return;
  
  const current = getStoredContacts(userEmail);
  
  let added = false;
  
  // Očekáváme pole řetězců jako: "jmeno příjmení <email@domena.cz>" nebo "email@domena.cz"
  // Rozsekáme podle čárek, pokud náhodou dostaneme zřetězený seznam:
  const rawList: string[] = [];
  contactStrings.forEach((str) => {
    if (!str) return;
    str.split(',').forEach(splitStr => rawList.push(splitStr.trim()));
  });

  rawList.forEach(rawContact => {
    if (!rawContact) return;
    
    // Extrahujeme pouze email pro deduplikaci, ale uložíme celé jméno pokud je k dispozici
    // Příklad "Petr Novák <petr@novak.cz>"
    const emailMatch = rawContact.match(/<([^>]+)>/);
    let emailOnly = rawContact;
    if (emailMatch && emailMatch[1]) {
      emailOnly = emailMatch[1].trim().toLowerCase();
    } else {
       // Očistíme pokud tam jsou jen maily
       emailOnly = rawContact.trim().toLowerCase();
    }
    
    // Pokud je to validní email tvar, pokusíme se ho aktualizovat/přidat
    if (emailOnly.includes('@')) {
       // Najdeme, zda už máme tento mail uložený
       const existingIndex = current.findIndex(c => {
         const exMatch = c.match(/<([^>]+)>/);
         let exEmail = c;
         if (exMatch && exMatch[1]) exEmail = exMatch[1];
         return exEmail.trim().toLowerCase() === emailOnly;
       });

       if (existingIndex !== -1) {
          // Pokud je existující záznam spíše hrubý (bez jména), a nový má jméno, updatneme ho
          if (!current[existingIndex].includes('<') && rawContact.includes('<')) {
             current[existingIndex] = rawContact;
             added = true;
          }
       } else {
          current.push(rawContact);
          added = true;
       }
    }
  });

  if (added) {
    try {
      localStorage.setItem(`email_contacts_${userEmail}`, JSON.stringify(current));
    } catch (e) {
      console.error("Selhalo ukládání kontaktů do localStorage:", e);
    }
  }
};
