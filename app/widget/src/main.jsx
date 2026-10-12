import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { readOptions } from './api.js';
import css from './index.css?inline';

// Must be read synchronously: document.currentScript is null once the script has finished running.
const script = document.currentScript || document.querySelector('script[data-chatbot-id], script[src$="/widget.js"]');

if (!script) {
  console.error('[chatbot] Could not find the embed <script> tag.');
} else if (!document.getElementById('website-chatbot-host')) {
  const options = readOptions(script);
  const host = document.createElement('div');
  host.id = 'website-chatbot-host';
  const shadow = host.attachShadow({ mode: 'open' }); // Shadow DOM: host-page CSS can't leak in, ours can't leak out
  const style = document.createElement('style');
  style.textContent = css;
  const mount = document.createElement('div');
  shadow.append(style, mount);

  const attach = () => {
    document.body.appendChild(host);
    createRoot(mount).render(<App options={options} />);
  };
  document.body ? attach() : document.addEventListener('DOMContentLoaded', attach);
}
