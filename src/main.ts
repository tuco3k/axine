import { DocumentEditor } from './document/editor';
import { typesetMath } from './core/math_typeset';
import './styles/main.css';

(window as any).typesetMath = typesetMath;

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
