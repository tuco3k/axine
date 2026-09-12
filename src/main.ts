import { DocumentEditor } from './document/editor';
import { Evaluator, evaluate, createInitialEnvironment } from './core/evaluator';
import { FileManager } from './document/file_manager';
import { typesetMath } from './core/math_typeset';
import { SpaceViewport } from './plot/space_viewport';
import './styles/main.css';

(window as any).Evaluator = Evaluator;
(window as any).evaluate = evaluate;
(window as any).createInitialEnvironment = createInitialEnvironment;
(window as any).SpaceViewport = SpaceViewport;
(window as any).FileManager = FileManager;
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
