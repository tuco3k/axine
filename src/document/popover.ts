/**
 * Explainable Math Popover Component
 * 
 * Displays anchored popovers for mathematical constructs and symbols with
 * the 4 required sections: WHAT IT IS, WHY IT IS HERE, SHOW ME, and GO DEEPER.
 */

import { NodeExplanation } from '../core/explainer';
import { typesetMath, renderProseWithMath } from '../core/math_typeset';

export class MathPopover {
  private el: HTMLElement;
  private isVisible: boolean = false;
  private currentAnchor: HTMLElement | null = null;
  private keyListener?: (e: KeyboardEvent) => void;
  private clickOutsideListener?: (e: MouseEvent) => void;

  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'doc-math-popover';
    this.el.className = 'doc-math-popover hidden';
    document.body.appendChild(this.el);

    this.setupListeners();
  }

  private setupListeners() {
    this.keyListener = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.isVisible) {
        this.hide();
      }
    };
    window.addEventListener('keydown', this.keyListener);

    this.clickOutsideListener = (e: MouseEvent) => {
      if (!this.isVisible) return;
      const target = e.target as HTMLElement;
      if (!this.el.contains(target) && !this.currentAnchor?.contains(target)) {
        this.hide();
      }
    };
    window.addEventListener('mousedown', this.clickOutsideListener);
  }

  public show(explanation: NodeExplanation, anchorEl: HTMLElement) {
    this.currentAnchor = anchorEl;
    this.isVisible = true;

    const roleTypeset = renderProseWithMath(explanation.role);
    const whatTypeset = renderProseWithMath(explanation.whatItIs);
    const whyTypeset = renderProseWithMath(explanation.whyItIsHere);
    const showMeTypeset = renderProseWithMath(explanation.showMe);
    const deeperTypeset = renderProseWithMath(explanation.goDeeper);

    this.el.innerHTML = `
      <div class="popover-header">
        <div class="popover-symbol-badge">${typesetMath(explanation.symbol, { displayMode: false })}</div>
        <div class="popover-title-group">
          <span class="popover-role">${roleTypeset}</span>
        </div>
        <button class="popover-close-btn" title="Close (Esc)">&times;</button>
      </div>

      <div class="popover-body">
        <!-- 1. WHAT IT IS -->
        <div class="popover-section">
          <div class="popover-section-label">1. WHAT IT IS</div>
          <div class="popover-section-content">${whatTypeset}</div>
        </div>

        <!-- 2. WHY IT IS HERE -->
        <div class="popover-section">
          <div class="popover-section-label">2. WHY IT IS HERE</div>
          <div class="popover-section-content">${whyTypeset}</div>
        </div>

        <!-- 3. SHOW ME -->
        <div class="popover-section popover-showme-section">
          <div class="popover-section-label">3. SHOW ME</div>
          <div class="popover-section-content">
            <div class="popover-showme-preview">${showMeTypeset}</div>
          </div>
        </div>

        <!-- 4. GO DEEPER -->
        <div class="popover-section popover-deeper-section">
          <details class="popover-details">
            <summary class="popover-section-label">4. GO DEEPER</summary>
            <div class="popover-section-content deeper-content">${deeperTypeset}</div>
          </details>
        </div>
      </div>
    `;

    const closeBtn = this.el.querySelector('.popover-close-btn');
    closeBtn?.addEventListener('click', () => this.hide());

    this.el.classList.remove('hidden');
    this.positionAnchor(anchorEl);
  }

  private positionAnchor(anchorEl: HTMLElement) {
    const anchorRect = anchorEl.getBoundingClientRect();
    const popoverWidth = 380;
    const popoverHeight = 320;

    let left = anchorRect.left;
    let top = anchorRect.bottom + 8;

    // Check right viewport overflow
    if (left + popoverWidth > window.innerWidth - 16) {
      left = window.innerWidth - popoverWidth - 16;
    }
    if (left < 16) left = 16;

    // Check bottom viewport overflow
    if (top + popoverHeight > window.innerHeight - 16) {
      top = Math.max(16, anchorRect.top - popoverHeight - 8);
    }

    this.el.style.left = `${Math.round(left)}px`;
    this.el.style.top = `${Math.round(top)}px`;
  }

  public hide() {
    this.isVisible = false;
    this.currentAnchor = null;
    this.el.classList.add('hidden');
  }

  public dispose() {
    if (this.keyListener) window.removeEventListener('keydown', this.keyListener);
    if (this.clickOutsideListener) window.removeEventListener('mousedown', this.clickOutsideListener);
    if (this.el.parentElement) this.el.parentElement.removeChild(this.el);
  }
}
