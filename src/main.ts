import { DocumentEditor } from './document/editor';
import { typesetMath } from './core/math_typeset';
import { explainSymbol } from './core/explainer';
import { ExplainerVisualizer } from './plot/explainer_visualizer';
import './styles/main.css';

(window as any).typesetMath = typesetMath;
(window as any).explainSymbol = explainSymbol;
(window as any).ExplainerVisualizer = ExplainerVisualizer;

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
