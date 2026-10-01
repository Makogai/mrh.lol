import { StrictMode } from 'react';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import { App } from './App';
import { NotFound } from './seo/NotFound';
export { renderHead, renderNotFoundHead } from './seo/head';

export function render(): string {
  return renderToString(<StrictMode><App /></StrictMode>);
}
// The 404 page ships without JS: static markup, same CSS and fonts.
export function renderNotFound(): string {
  return renderToStaticMarkup(<NotFound />);
}
