import { DocumentEditor } from './document/editor';
import { BlockDocumentEditor } from './document/block_editor';
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
(window as any).BlockDocumentEditor = BlockDocumentEditor;
(window as any).DocumentEditor = DocumentEditor;

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
