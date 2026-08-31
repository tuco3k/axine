import { DocumentEditor } from './document/editor';
import './styles/main.css';

function init() {
  const root = document.getElementById('app');
  if (root) {
    (window as any).editor = new DocumentEditor(root);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
