import { useEffect, useRef } from 'react';

/** Jen na telefonu (tlačítko / gesto Zpět); na počítači historie zůstane beze změny */
const isMobileOs = () => typeof navigator !== 'undefined' && /Android|iPhone|iPad/i.test(navigator.userAgent);

// Krok historie zavřeného okna („mrtvý“) se při Zpět přeskočí, aby Zpět neudělalo zdánlivě nic
let skipperInstalled = false;
const installDeadStepSkipper = () => {
  if (skipperInstalled) return;
  skipperInstalled = true;
  window.addEventListener('popstate', () => {
    if (window.history.state?.vrDead) window.history.back();
  });
};

/**
 * Okno / panel přes obrazovku (detail e-mailu, menu, nastavení…) se zavře systémovým Zpět.
 *
 * Při otevření přidá krok do historie WebView. Android Zpět historii vrátí (Tauri: webView.goBack())
 * a tady se okno zavře. Když už v historii nic není, Zpět aplikaci pošle na pozadí jako obvykle.
 * Zavře-li se okno jinak (tlačítkem), jeho krok se odebere. Víc oken naráz: Zpět zavře to poslední.
 */
export function useHistoryBack(open: boolean, close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!open || !isMobileOs()) return;
    installDeadStepSkipper();
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.history.pushState({ vrBack: token }, '');
    let popped = false;
    const onPop = () => {
      // Po Zpět je aktuální krok pořád náš → zavřelo se jiné (novější) okno
      if (window.history.state?.vrBack === token) return;
      popped = true;
      closeRef.current();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      if (popped || window.history.state?.vrBack !== token) return;
      // Zavřeno tlačítkem: krok označit jako mrtvý; když po něm nic nepřibylo, rovnou ho opustit.
      // (Když se zároveň otevřelo jiné okno, jeho krok je navrch – mrtvý krok přeskočí až Zpět.)
      window.history.replaceState({ vrDead: true }, '');
      setTimeout(() => {
        if (window.history.state?.vrDead) window.history.back();
      }, 0);
    };
  }, [open]);
}
