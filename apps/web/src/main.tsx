import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from './lib/router';
import { App } from './app';
import './styles.css';
import { removeNorthwindOfflineState } from './browser-state';

void removeNorthwindOfflineState();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
