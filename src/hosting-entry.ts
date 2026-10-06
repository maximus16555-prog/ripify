import './style.css';
import { createElement, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

// Freebuff hosting recognizes Vite + React. React owns only this static startup
// shell; the existing Three.js engine and its input/render loops remain intact.
function GameStartup() {
  useEffect(() => { void import('./main'); }, []);
  return createElement('div', { id: 'app' },
    createElement('div', { className: 'loading' },
      createElement('b', null, 'RIPIFY'),
      createElement('p', null, 'Loading your room…')));
}

createRoot(document.querySelector<HTMLElement>('#hosting-root')!)
  .render(createElement(GameStartup));
