import { DocumentEditor } from './document/editor';
import './styles/main.css';

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('app');
  if (root) {
    new DocumentEditor(root);
  }
});
