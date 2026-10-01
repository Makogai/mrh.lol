import './styles/global.css';
import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { App } from './App';

const root = document.getElementById('root')!;
const app = <StrictMode><App /></StrictMode>;
// Dev serves the raw template (only the <!--app-html--> comment) — nothing to hydrate there.
if (root.firstElementChild) hydrateRoot(root, app);
else createRoot(root).render(app);
