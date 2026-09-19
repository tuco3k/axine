/**
 * Slot Command Declarations and Registry
 * 
 * Defines the unified slot insert command architecture:
 * - Each command defines its parameter schema, slot IDs, parser, serializer, and visual renderers.
 * - Supports in-place partial rendering while being edited and typeset rendering on exit.
 * - Handles Tab and Shift+Tab traversal across targetable slots.
 */

import { typesetMath } from "../../core/math_typeset";

export interface SlotValues {
  [slotId: string]: string;
}

export interface SlotCommandData {
  command: string;
  params: Record<string, any>;
  slots: SlotValues;
}

export interface SlotCommandDeclaration {
  name: string;
  parse: (source: string) => SlotCommandData | null;
  serialize: (data: SlotCommandData) => string;
  getSlotIds: (data: SlotCommandData) => string[];
  getNextSlotId: (currentSlotId: string, data: SlotCommandData, reverse?: boolean) => string | null;
  renderStatic: (data: SlotCommandData) => string;
  renderScaffold: (
    data: SlotCommandData,
    renderSlotInput: (slotId: string, value: string, placeholder?: string) => string
  ) => string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Command 1: \table(rows, cols){ c00, c01; c10, c11 }
 * 2D grid of slots with row-major Tab navigation.
 */
export const tableCommand: SlotCommandDeclaration = {
  name: "table",
  parse(source: string): SlotCommandData | null {
    const trimmed = source.trim();
    if (!trimmed.startsWith("\\table")) return null;

    let rows = 2;
    let cols = 2;
    const slots: SlotValues = {};

    // Match optional dimensions \table(r, c)
    const dimMatch = trimmed.match(/^\\table\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)/);
    if (dimMatch) {
      rows = parseInt(dimMatch[1], 10);
      cols = parseInt(dimMatch[2], 10);
    }

    // Match body {...}
    const bodyMatch = trimmed.match(/\{([\s\S]*)\}/);
    if (bodyMatch) {
      const body = bodyMatch[1].trim();
      const rowLines = body.split(";").map(r => r.trim()).filter(r => r.length > 0);
      if (!dimMatch && rowLines.length > 0) {
        rows = rowLines.length;
        const firstRowCells = rowLines[0].split(",").map(c => c.trim());
        cols = Math.max(1, firstRowCells.length);
      }

      for (let r = 0; r < rows; r++) {
        const rowStr = rowLines[r] || "";
        const cellItems = rowStr ? rowStr.split(",").map(c => c.trim()) : [];
        for (let c = 0; c < cols; c++) {
          slots[`slot_${r}_${c}`] = cellItems[c] || "";
        }
      }
    } else {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          slots[`slot_${r}_${c}`] = "";
        }
      }
    }

    return {
      command: "table",
      params: { rows, cols },
      slots,
    };
  },

  serialize(data: SlotCommandData): string {
    const rows = data.params.rows || 2;
    const cols = data.params.cols || 2;
    const rowLines: string[] = [];

    for (let r = 0; r < rows; r++) {
      const cells: string[] = [];
      for (let c = 0; c < cols; c++) {
        cells.push(data.slots[`slot_${r}_${c}`] || "");
      }
      rowLines.push("  " + cells.join(", "));
    }

    return `\\table(${rows}, ${cols}) {\n${rowLines.join(";\n")}\n}`;
  },

  getSlotIds(data: SlotCommandData): string[] {
    const rows = data.params.rows || 2;
    const cols = data.params.cols || 2;
    const list: string[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        list.push(`slot_${r}_${c}`);
      }
    }
    return list;
  },

  getNextSlotId(currentSlotId: string, data: SlotCommandData, reverse?: boolean): string | null {
    const ids = this.getSlotIds(data);
    const idx = ids.indexOf(currentSlotId);
    if (idx === -1) return ids[0] || null;

    if (reverse) {
      return idx > 0 ? ids[idx - 1] : ids[ids.length - 1];
    } else {
      return idx + 1 < ids.length ? ids[idx + 1] : ids[0];
    }
  },

  renderStatic(data: SlotCommandData): string {
    const rows = data.params.rows || 2;
    const cols = data.params.cols || 2;

    let html = '<div class="doc-slot-table-wrapper"><table class="doc-slot-table">';
    for (let r = 0; r < rows; r++) {
      html += '<tr>';
      for (let c = 0; c < cols; c++) {
        const val = data.slots[`slot_${r}_${c}`] || "";
        if (val.trim() === "") {
          html += '<td class="doc-slot-cell empty"><span class="doc-slot-placeholder"><span class="doc-slot-box"></span></span></td>';
        } else {
          try {
            const typeset = typesetMath(val, { displayMode: false });
            html += `<td class="doc-slot-cell"><span class="doc-slot-rendered">${typeset}</span></td>`;
          } catch {
            html += `<td class="doc-slot-cell"><span class="doc-slot-literal">${escapeHtml(val)}</span></td>`;
          }
        }
      }
      html += '</tr>';
    }
    html += '</table></div>';
    return html;
  },

  renderScaffold(
    data: SlotCommandData,
    renderSlotInput: (slotId: string, value: string, placeholder?: string) => string
  ): string {
    const rows = data.params.rows || 2;
    const cols = data.params.cols || 2;

    let html = '<div class="doc-slot-table-wrapper editing"><table class="doc-slot-table scaffold">';
    for (let r = 0; r < rows; r++) {
      html += '<tr>';
      for (let c = 0; c < cols; c++) {
        const id = `slot_${r}_${c}`;
        const val = data.slots[id] || "";
        html += `<td class="doc-slot-cell editable">${renderSlotInput(id, val, "")}</td>`;
      }
      html += '</tr>';
    }
    html += '</table></div>';
    return html;
  },
};

/**
 * Command 2: \cases(branches){ val1, cond1; val2, cond2 }
 * Piecewise conditional definition with paired [value, condition] slots
 * and a large mathematical grouping brace.
 */
export const casesCommand: SlotCommandDeclaration = {
  name: "cases",
  parse(source: string): SlotCommandData | null {
    const trimmed = source.trim();
    if (!trimmed.startsWith("\\cases")) return null;

    let branches = 2;
    const slots: SlotValues = {};

    const dimMatch = trimmed.match(/^\\cases\s*\(\s*(\d+)\s*\)/);
    if (dimMatch) {
      branches = parseInt(dimMatch[1], 10);
    }

    const bodyMatch = trimmed.match(/\{([\s\S]*)\}/);
    if (bodyMatch) {
      const body = bodyMatch[1].trim();
      const branchLines = body.split(";").map(b => b.trim()).filter(b => b.length > 0);
      if (!dimMatch && branchLines.length > 0) {
        branches = branchLines.length;
      }

      for (let b = 0; b < branches; b++) {
        const line = branchLines[b] || "";
        const parts = line.split(",").map(p => p.trim());
        slots[`slot_${b}_val`] = parts[0] || "";
        slots[`slot_${b}_cond`] = parts[1] || "";
      }
    } else {
      for (let b = 0; b < branches; b++) {
        slots[`slot_${b}_val`] = "";
        slots[`slot_${b}_cond`] = "";
      }
    }

    return {
      command: "cases",
      params: { branches },
      slots,
    };
  },

  serialize(data: SlotCommandData): string {
    const branches = data.params.branches || 2;
    const lines: string[] = [];

    for (let b = 0; b < branches; b++) {
      const val = data.slots[`slot_${b}_val`] || "";
      const cond = data.slots[`slot_${b}_cond`] || "";
      lines.push(`  ${val}, ${cond}`);
    }

    return `\\cases(${branches}) {\n${lines.join(";\n")}\n}`;
  },

  getSlotIds(data: SlotCommandData): string[] {
    const branches = data.params.branches || 2;
    const list: string[] = [];
    for (let b = 0; b < branches; b++) {
      list.push(`slot_${b}_val`);
      list.push(`slot_${b}_cond`);
    }
    return list;
  },

  getNextSlotId(currentSlotId: string, data: SlotCommandData, reverse?: boolean): string | null {
    const ids = this.getSlotIds(data);
    const idx = ids.indexOf(currentSlotId);
    if (idx === -1) return ids[0] || null;

    if (reverse) {
      return idx > 0 ? ids[idx - 1] : ids[ids.length - 1];
    } else {
      return idx + 1 < ids.length ? ids[idx + 1] : ids[0];
    }
  },

  renderStatic(data: SlotCommandData): string {
    const branches = data.params.branches || 2;

    let html = '<div class="doc-slot-cases-wrapper"><div class="doc-cases-brace">{</div><div class="doc-cases-branches">';
    for (let b = 0; b < branches; b++) {
      const valRaw = data.slots[`slot_${b}_val`]?.trim() || "";
      const condRaw = data.slots[`slot_${b}_cond`]?.trim() || "";

      const valHtml = valRaw === ""
        ? '<span class="doc-slot-placeholder"><span class="doc-slot-box"></span></span>'
        : `<span class="doc-slot-rendered">${typesetMath(valRaw, { displayMode: false })}</span>`;

      const condHtml = condRaw === ""
        ? '<span class="doc-slot-placeholder"><span class="doc-slot-box"></span></span>'
        : `<span class="doc-slot-rendered">${typesetMath(condRaw, { displayMode: false })}</span>`;

      html += `<div class="doc-cases-branch"><span class="doc-slot-val">${valHtml}</span><span class="doc-cases-separator">if</span><span class="doc-slot-cond">${condHtml}</span></div>`;
    }
    html += '</div></div>';
    return html;
  },

  renderScaffold(
    data: SlotCommandData,
    renderSlotInput: (slotId: string, value: string, placeholder?: string) => string
  ): string {
    const branches = data.params.branches || 2;

    let html = '<div class="doc-slot-cases-wrapper editing">';
    html += '<div class="doc-cases-scaffold-brace">{</div>';
    html += '<div class="doc-cases-scaffold-branches">';

    for (let b = 0; b < branches; b++) {
      const valId = `slot_${b}_val`;
      const condId = `slot_${b}_cond`;
      const val = data.slots[valId] || "";
      const cond = data.slots[condId] || "";

      html += '<div class="doc-cases-scaffold-row">';
      html += `<div class="doc-slot-cell editable">${renderSlotInput(valId, val, "expression")}</div>`;
      html += '<span class="doc-cases-scaffold-label">if</span>';
      html += `<div class="doc-slot-cell editable">${renderSlotInput(condId, cond, "condition")}</div>`;
      html += '</div>';
    }

    html += '</div></div>';
    return html;
  },
};

/**
 * Registry holding all active slot commands
 */
export class SlotCommandRegistry {
  private static declarations: Map<string, SlotCommandDeclaration> = new Map([
    [tableCommand.name, tableCommand],
    [casesCommand.name, casesCommand],
  ]);

  public static register(declaration: SlotCommandDeclaration): void {
    this.declarations.set(declaration.name, declaration);
  }

  public static get(name: string): SlotCommandDeclaration | undefined {
    return this.declarations.get(name);
  }

  public static getAll(): SlotCommandDeclaration[] {
    return Array.from(this.declarations.values());
  }

  public static findMatching(source: string): { declaration: SlotCommandDeclaration; data: SlotCommandData } | null {
    const trimmed = source.trim();
    for (const decl of this.declarations.values()) {
      if (trimmed.startsWith(`\\${decl.name}`)) {
        const data = decl.parse(trimmed);
        if (data) {
          return { declaration: decl, data };
        }
      }
    }
    return null;
  }
}
