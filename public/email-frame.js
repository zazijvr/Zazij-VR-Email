// Skript uvnitř okna s obsahem e-mailu (iframe srcdoc, sandbox bez allow-same-origin).
// Je v samostatném souboru kvůli Content Security Policy (vložené skripty jsou v aplikaci zakázané).
// S aplikací komunikuje jen přes postMessage: otevření odkazu a výška obsahu.
document.addEventListener('click', function(e) {
  const a = e.target.closest('a');
  if (a && a.href) {
    e.preventDefault();
    window.parent.postMessage({ type: 'open-link', url: a.href }, '*');
  }
});

// Nejpokročilejší auto-scaling pro emailové iframy na WebKitu/Chromiu
let stalyScale = 1.0;
let vychoziScale = 1.0;
let translateX = 0;
let translateY = 0;

function applyTransform() {
   document.body.style.transformOrigin = '0 0';
   document.body.style.transform = 'translate(' + translateX + 'px, ' + translateY + 'px) scale(' + stalyScale + ')';
}

function fitToWidth() {
  // 1. Uvolnit mantinely pro přesné změření původního rozložení
  document.documentElement.style.overflowX = 'visible';
  document.body.style.overflowX = 'visible';
  document.body.style.transform = 'none';
  document.body.style.width = 'auto';
  translateX = 0;
  translateY = 0;

  // 2. Musíme dát maličký rozestup browseru, aby stihl aplikovat "auto" před změřením, 
  // ale kvůli synchronnosti změn to můžeme zkusit rovnou z DOMu
  const docWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
  const winWidth = window.innerWidth;

  // 3. Rozhodnutí
  if (docWidth > winWidth + 5 && winWidth > 0) {
     // Email má fixní šířku (např 600px table), která se nevměstná do mobilu.
     stalyScale = winWidth / docWidth;
     // Zásadní chyba z minula: Musíme uměle zvětšit i tělo, aby HTML neoseklo pravou stranu před zmenšením!
     document.body.style.width = docWidth + 'px';
  } else {
     // Běžný responzivní email (vykreslen tak, že se hned vešel)
     stalyScale = 1.0;
     document.body.style.width = '100%';
  }
  vychoziScale = stalyScale;

  // 4. Aplikovat transform a znovu uzamknout scrollování s pojištěním, že neosekáváme vnitřek
  applyTransform();
  document.documentElement.style.overflowX = 'hidden';

  // 5. Odeslat novou výšku rodiči, aby nás správně roztáhl
  const fullScrollHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, document.body.offsetHeight);
  window.parent.postMessage({ type: 'content-height', height: (fullScrollHeight * stalyScale) + 50 }, '*');
}

// Okamžitá spoušť po nalití docu
fitToWidth();
window.addEventListener('load', fitToWidth);

let lastWidth = window.innerWidth;
window.addEventListener('resize', function() {
   // Spustit škálování AŽ když se změní šířka okna (např otočení telefonu). 
   // Změna výšky okna nesmí re-triggerovat škálování, jinak vzniká nekonečná smyčka
   // u emailů, co mají "height: 100%" (vyplňují novou výšku iframu a posílají ještě větší scrollHeight!)
   if (Math.abs(window.innerWidth - lastWidth) > 5) {
       lastWidth = window.innerWidth;
       fitToWidth();
   }
});

setTimeout(fitToWidth, 200);
setTimeout(fitToWidth, 800);

// Javascript Pinch-To-Zoom, plně napojený na CSS Transformaci
let vzdalenostInit = 0;
let scaleInit = 1.0;
let txInit = 0;
let tyInit = 0;
let stredInitX = 0;
let stredInitY = 0;

document.addEventListener('touchstart', function(e) {
  if (e.touches.length === 2) {
     vzdalenostInit = Math.hypot(
       e.touches[0].clientX - e.touches[1].clientX,
       e.touches[0].clientY - e.touches[1].clientY
     );
     scaleInit = stalyScale;
     txInit = translateX;
     tyInit = translateY;
     stredInitX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
     stredInitY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
  }
});

document.addEventListener('touchmove', function(e) {
  if (e.touches.length === 2 && vzdalenostInit > 0) {
    e.preventDefault(); // Zákaz výchozích nativních pokusů prohlížeče

    const vzdalenostAktual = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );

    const ptZStredX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    const ptZStredY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

    const pomer = vzdalenostAktual / vzdalenostInit;
    stalyScale = scaleInit * pomer;

    // Mantinely pro velikost textu (menší než vychozi o kousek a obří zvětšení)
    if (stalyScale < vychoziScale * 0.8) stalyScale = vychoziScale * 0.8;
    if (stalyScale > 5.0) stalyScale = 5.0;

    // Držení těžiště
    translateX = ptZStredX - ((stredInitX - txInit) * (stalyScale / scaleInit));
    translateY = ptZStredY - ((stredInitY - tyInit) * (stalyScale / scaleInit));

    applyTransform();
  } else if (e.touches.length === 1 && stalyScale > vychoziScale) {
     // Mírný pan/posun jednoho prstu pokusme neblokovat? Tady jen zablokovat default na okrajích
  }
}, { passive: false });

document.addEventListener('touchend', function(e) {
   if (e.touches.length < 2) vzdalenostInit = 0;
});

document.addEventListener('touchend', function(e) {
  if (e.touches.length < 2) vzdalenostInit = 0;
});
