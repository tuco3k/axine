/**
 * SlotBlockComponent — In-flow atomic block with discrete addressable slots
 * 
 * Generalizes Word's equation object model to multi-slot composite commands:
 * 1. Default (Idle): Typeset construct rendered in place with filled parts and empty slot indicators.
 * 2. Single click: Selects block as an atomic unit (Word object contract, single arrow steps over).
 * 3. Double-click (or Enter when selected): Enters in-place slot editing space.
 * 4. In edit mode: Each slot is an addressable input element. Tab and Shift+Tab step between slots.
 * 5. Escape (or blur): Commits changes, serializes to .ax syntax, and returns to rendered atomic view.
 * 6. Caret accuracy: Slot inputs maintain subpixel alignment <= 1.0px.
 */

import { DocumentBlock, BlockType } from "../block_model";
import { SlotCommandDeclaration, SlotCommandData, SlotCommandRegistry } from "./slot_command";

export interface SlotBlockOptions {
  onSelect?: (blockId: string) => void;
  onCommit?: (blockId: string, newSource: string) => void;
  onStepNext?: () => void;
  onStepPrev?: () => void;
  onDeleteRequest?: (blockId: string) => void;
  onRequestTransform?: (blockId: string, targetType: BlockType, source: string, caretOffset?: number) => void;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export class SlotBlockComponent {
  public readonly el: HTMLElement;
  private block: DocumentBlock;
  private options: SlotBlockOptions;
  private decl: SlotCommandDeclaration;
  private data: SlotCommandData;
  private renderedContainer: HTMLElement;
  private editorContainer: HTMLElement;
  private activeSlotInputs: Map<string, HTMLInputElement> = new Map();
  private currentFocusedSlotId: string | null = null;
  private isEditing: boolean = false;
  private isSelected: boolean = false;

  constructor(block: DocumentBlock, options: SlotBlockOptions = {}) {
    this.block = block;
    this.options = options;

    const match = SlotCommandRegistry.findMatching(block.source);
    if (match) {
      this.decl = match.declaration;
      this.data = match.data;
    } else {
      // Fallback to table
      const fallback = SlotCommandRegistry.get("table")!;
      this.decl = fallback;
      this.data = fallback.parse(block.source) || {
        command: "table",
        params: { rows: 2, cols: 2 },
        slots: { slot_0_0: "", slot_0_1: "", slot_1_0: "", slot_1_1: "" },
      };
    }

    this.el = document.createElement("div");
    this.el.className = `doc-block doc-block-slot doc-block-${this.decl.name}`;
    this.el.tabIndex = 0;
    this.el.setAttribute("data-block-id", block.id);
    this.el.setAttribute("data-atomic", "true");
    this.el.setAttribute("data-command", this.decl.name);

    this.renderedContainer = document.createElement("div");
    this.renderedContainer.className = "doc-slot-rendered-view";
    this.el.appendChild(this.renderedContainer);

    this.editorContainer = document.createElement("div");
    this.editorContainer.className = "doc-slot-editor-view hidden";
    this.el.appendChild(this.editorContainer);

    this.renderStaticView();
    this.bindEvents();
  }

  private renderStaticView(): void {
    this.renderedContainer.innerHTML = this.decl.renderStatic(this.data);
  }

  private bindEvents(): void {
    // Single Click: Select atomic block
    this.el.addEventListener("click", (_e) => {
      if (!this.isEditing) {
        this.setSelected(true);
        this.options.onSelect?.(this.block.id);
      }
    });

    // Double Click: Enter edit mode
    this.el.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      this.enterEditMode();
    });

    // Keydown navigation when selected
    this.el.addEventListener("keydown", (e: KeyboardEvent) => {
      if (!this.isEditing) {
        if (e.key === "Enter") {
          e.preventDefault();
          this.enterEditMode();
          return;
        }
        if (e.key === "ArrowDown" || e.key === "ArrowRight") {
          e.preventDefault();
          this.options.onStepNext?.();
          return;
        }
        if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
          e.preventDefault();
          this.options.onStepPrev?.();
          return;
        }
        if (e.key === "Backspace" || e.key === "Delete") {
          e.preventDefault();
          this.options.onRequestTransform?.(this.block.id, "paragraph", "", 0);
          return;
        }
      }
    });
  }

  public enterEditMode(targetSlotId?: string, caretOffset: number = 0): void {
    if (this.isEditing) return;
    this.isEditing = true;

    this.renderedContainer.classList.add("hidden");
    this.editorContainer.classList.remove("hidden");
    this.el.classList.add("editing");
    this.el.removeAttribute("data-atomic");

    this.buildEditorScaffold();

    const slotIds = this.decl.getSlotIds(this.data);
    const initialSlot = targetSlotId || slotIds[0];
    if (initialSlot) {
      this.focusSlot(initialSlot, false, caretOffset);
    }
  }

  private buildEditorScaffold(): void {
    this.activeSlotInputs.clear();
    this.editorContainer.innerHTML = "";

    const scaffoldHtml = this.decl.renderScaffold(this.data, (slotId, value, placeholder) => {
      return `<input
        class="doc-slot-input"
        data-slot-id="${slotId}"
        value="${escapeHtml(value)}"
        placeholder="${placeholder || ""}"
        spellcheck="false"
        autocomplete="off"
        autocapitalize="off"
      />`;
    });

    this.editorContainer.innerHTML = scaffoldHtml;

    // Attach event listeners to all slot inputs
    const inputs = this.editorContainer.querySelectorAll<HTMLInputElement>(".doc-slot-input");
    inputs.forEach((input) => {
      const slotId = input.getAttribute("data-slot-id");
      if (!slotId) return;

      this.activeSlotInputs.set(slotId, input);

      input.addEventListener("focus", () => {
        this.currentFocusedSlotId = slotId;
        input.select();
      });

      input.addEventListener("input", () => {
        this.data.slots[slotId] = input.value;
        const serialized = this.decl.serialize(this.data);
        this.block.source = serialized;
        this.options.onCommit?.(this.block.id, serialized);
      });

      input.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Tab") {
          e.preventDefault();
          const nextSlot = this.decl.getNextSlotId(slotId, this.data, e.shiftKey);
          if (nextSlot) {
            this.focusSlot(nextSlot, true);
          }
        } else if (e.key === "Escape") {
          e.preventDefault();
          this.exitEditMode(true);
        } else if (e.key === "Enter") {
          e.preventDefault();
          const nextSlot = this.decl.getNextSlotId(slotId, this.data, false);
          if (nextSlot && nextSlot !== slotId) {
            this.focusSlot(nextSlot, true);
          } else {
            this.exitEditMode(true);
          }
        } else if (e.key === "Backspace") {
          const slotIds = this.decl.getSlotIds(this.data);
          const isFirstSlot = slotId === slotIds[0];
          if (isFirstSlot && input.selectionStart === 0 && input.selectionEnd === 0 && input.value === "") {
            e.preventDefault();
            this.options.onRequestTransform?.(this.block.id, "paragraph", "", 0);
            return;
          }
        }
      });
    });

    // Blur container exit handler
    this.editorContainer.addEventListener("focusout", (_e: FocusEvent) => {
      // If focus moves outside editorContainer, exit edit mode
      setTimeout(() => {
        if (this.isEditing && !this.editorContainer.contains(document.activeElement)) {
          this.exitEditMode(true);
        }
      }, 100);
    });
  }

  public focusSlot(slotId: string, selectAll: boolean = false, caretOffset: number = 0): void {
    const input = this.activeSlotInputs.get(slotId);
    if (input) {
      this.currentFocusedSlotId = slotId;
      input.focus();
      if (selectAll) {
        input.select();
      } else if (typeof input.setSelectionRange === "function") {
        input.setSelectionRange(caretOffset, caretOffset);
      }
    }
  }

  public exitEditMode(commit: boolean = true): void {
    if (!this.isEditing) return;
    this.isEditing = false;

    if (commit) {
      // Gather latest input values
      for (const [slotId, input] of this.activeSlotInputs.entries()) {
        this.data.slots[slotId] = input.value;
      }
      const serialized = this.decl.serialize(this.data);
      if (serialized !== this.block.source) {
        this.block.source = serialized;
        this.options.onCommit?.(this.block.id, serialized);
      }
    }

    this.editorContainer.classList.add("hidden");
    this.renderedContainer.classList.remove("hidden");
    this.el.classList.remove("editing");
    this.el.setAttribute("data-atomic", "true");

    this.renderStaticView();
    this.setSelected(true);
  }

  public setSelected(selected: boolean): void {
    this.isSelected = selected;
    if (selected) {
      this.el.classList.add("selected");
      if (typeof this.el.focus === "function") {
        this.el.focus();
      }
    } else {
      this.el.classList.remove("selected");
    }
  }

  public updateBlock(newBlock: DocumentBlock): void {
    this.block = newBlock;
    const match = SlotCommandRegistry.findMatching(newBlock.source);
    if (match) {
      this.decl = match.declaration;
      this.data = match.data;
    }
    if (!this.isEditing) {
      this.renderStaticView();
    }
  }

  public getIsEditing(): boolean {
    return this.isEditing;
  }

  public getIsSelected(): boolean {
    return this.isSelected;
  }

  public getCommandName(): string {
    return this.decl.name;
  }

  public getData(): SlotCommandData {
    return this.data;
  }

  public getActiveSlotInput(slotId: string): HTMLInputElement | undefined {
    return this.activeSlotInputs.get(slotId);
  }

  public getCurrentFocusedSlotId(): string | null {
    return this.currentFocusedSlotId;
  }

  public dispose(): void {
    this.activeSlotInputs.clear();
    if (this.el.parentElement) {
      this.el.parentElement.removeChild(this.el);
    }
  }
}
