import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AlertProvider } from './components/AlertProvider';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import '@fontsource-variable/inter';
import '@fontsource/rajdhani/latin-600.css';
import '@fontsource/rajdhani/latin-700.css';
import '@fontsource/rajdhani/latin-ext-600.css';
import '@fontsource/rajdhani/latin-ext-700.css';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Chybí element #root v index.html');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AlertProvider>
        <App />
      </AlertProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);

/** Úvodní animace z index.html: zmizí, až je aplikace vykreslená – nejdřív ale po dohrání (min. 1,5 s) */
const SPLASH_MIN_MS = 1500;
const hideSplash = () => {
  const splash = document.getElementById('splash');
  if (!splash) return;
  const wait = Math.max(0, SPLASH_MIN_MS - performance.now());
  setTimeout(() => {
    splash.classList.add('out');
    setTimeout(() => splash.remove(), 500);
  }, wait);
};
// Dva snímky po prvním vykreslení – React už má obsah na obrazovce
requestAnimationFrame(() => requestAnimationFrame(hideSplash));
