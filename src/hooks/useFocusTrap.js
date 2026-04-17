import { useEffect } from 'react';

export function useFocusTrap(ref, isOpen) {
  useEffect(() => {
    if (!isOpen || !ref.current) return;

    const handleKeyDown = (e) => {
      if (e.key !== 'Tab') return;

      const focusableElements = Array.from(
        ref.current.querySelectorAll(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'
        )
      ).filter(el => {
        // Vyfiltrujeme skryté elementy
        return el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0;
      });

      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          lastElement.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === lastElement) {
          firstElement.focus();
          e.preventDefault();
        }
      }
    };

    // Pokud uživatel do modalu neklikl a nemá focus nikde, přiklapneme ho dovnitř
    const timer = setTimeout(() => {
      if (ref.current && !ref.current.contains(document.activeElement)) {
        const focusable = ref.current.querySelectorAll(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'
        );
        if (focusable.length > 0) focusable[0].focus();
      }
    }, 100);

    const el = ref.current;
    el.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timer);
      el.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, ref]);
}
