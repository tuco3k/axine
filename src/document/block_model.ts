/**
 * Axine Block Document Model
 * 
 * Partitions plain text .ax documents into a structured block tree:
 * - heading: #, ##, ###
 * - paragraph: prose, comments
 * - equation: mathematical relations and definitions
 * - figure: embedded in-flow viewports (\\figure or {\\axis ...})
 * - derivation: step-by-step equivalence chains (\\derive)
 * - blank: empty lines preserving layout spacing
 * 
 * 100% lossless roundtrip serialization to plain text .ax.
 */

import { Value } from "../core/types";
import { segmentDocument } from "../core/segments";
import { MathDiagnostic } from "../core/errors";

export type BlockType =
  | "heading"
  | "paragraph"
  | "equation"
  | "figure"
  | "derivation"
  | "slot"
  | "blank";

export interface DocumentBlock {
  id: string;
  type: BlockType;
  source: string;
  lines: string[];
  startLine: number;
  endLine: number;
  // From evaluation (BlockState.applyEvaluation): pending until a result for
  // this text arrives; stale once the text changes after it.
  status: "pending" | "incomplete" | "computed" | "unknown" | "error" | "stale";
  definedSymbol?: string;
  referencedSymbols?: string[];
  result?: Value;
  error?: MathDiagnostic;
  metadata?: Record<string, any>;
}

export interface DocumentModel {
  frontmatter: Record<string, any>;
  rawFrontmatter: string;
  blocks: DocumentBlock[];
}

// The display type of a math unit, from its text.
function mathBlockType(source: string): BlockType {
  const trimmed = source.trim();
  if (trimmed.startsWith("\\table") || trimmed.startsWith("\\cases")) return "slot";
  if (trimmed.startsWith("\\figure") || trimmed.startsWith("\\axis") || trimmed.includes("{\\axis")) return "figure";
  if (trimmed.startsWith("\\derive")) return "derivation";
  return "equation";
}

// A comment line shown as a heading: "## " and "### " anywhere, "# " only as
// the first line of content, where it titles the document. Elsewhere "# "
// begins an Axine comment.
function isHeadingLine(line: string, isFirstContent: boolean): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("### ") || trimmed.startsWith("## ") || (isFirstContent && trimmed.startsWith("# "));
}

/**
 * The block type of one block's text, decided by the same segmentation the
 * evaluator uses (core/segments.ts): text that is one math unit is an
 * equation (or a figure, slot or derivation by its command); anything else is
 * a paragraph or heading.
 */
export function classifyBlockType(source: string, isFirstContent: boolean = false): BlockType {
  if (source.trim() === "") return "paragraph";
  const lines = source.split("\n");
  if (lines.length === 1 && isHeadingLine(lines[0], isFirstContent)) return "heading";
  const segments = segmentDocument(lines).filter((seg) => seg.kind !== "blank");
  if (segments.length === 1 && segments[0].kind === "math") return mathBlockType(source);
  return "paragraph";
}

export function extractDefinedSymbol(source: string): string | undefined {
  const trimmed = source.trim();
  const match = trimmed.match(/^(:?[a-zA-Z_][a-zA-Z0-9_]*)(?:\([^)]*\))?\s*(?::=|=)/);
  if (match) {
    return match[1];
  }
  return undefined;
}

export function extractReferencedSymbols(source: string): string[] {
  const symbols: Set<string> = new Set();

  // Match \\figure(:sym, ...) or \\figure :sym
  const figMatch = source.match(/\\figure\s*\(\s*(:?[a-zA-Z_][a-zA-Z0-9_]*)/);
  if (figMatch) {
    symbols.add(figMatch[1]);
  }

  // Match explicit symbol references :sym
  const colMatch = source.matchAll(/:([a-zA-Z_][a-zA-Z0-9_]*)/g);
  for (const m of colMatch) {
    symbols.add(":" + m[1]);
  }

  return Array.from(symbols);
}

/**
 * Partitions a document into blocks, one per segment of core/segments.ts, so
 * every block covers exactly the lines of one evaluation unit or one prose
 * line; consecutive comment lines form one paragraph. Line numbers are
 * document line indices.
 */
export function parseAxDocument(text: string): DocumentModel {
  const lines = text.split("\n");
  const segments = segmentDocument(lines);
  let rawFrontmatter = "";
  const frontmatter: Record<string, any> = {};
  const blocks: DocumentBlock[] = [];

  const pushBlock = (type: BlockType, start: number, end: number) => {
    const src = lines.slice(start, end + 1).join("\n");
    blocks.push({
      id: "block_" + blocks.length,
      type,
      source: src,
      lines: lines.slice(start, end + 1),
      startLine: start,
      endLine: end,
      status: "pending",
      definedSymbol: extractDefinedSymbol(src),
      referencedSymbols: extractReferencedSymbols(src),
    });
  };

  for (const seg of segments) {
    if (seg.kind === "frontmatter") {
      rawFrontmatter = lines.slice(0, seg.end + 1).join("\n") + (seg.end + 1 < lines.length ? "\n" : "");
      for (const line of lines.slice(1, seg.end)) {
        const colonIdx = line.indexOf(":");
        if (colonIdx !== -1) {
          const k = line.substring(0, colonIdx).trim();
          const v = line.substring(colonIdx + 1).trim();
          if (k) frontmatter[k] = v;
        }
      }
      continue;
    }
    if (seg.kind === "blank") {
      pushBlock("blank", seg.start, seg.end);
      continue;
    }
    if (seg.kind === "math") {
      pushBlock(mathBlockType(lines.slice(seg.start, seg.end + 1).join("\n")), seg.start, seg.end);
      continue;
    }
    if (seg.kind === "comment") {
      const isFirstContent = !blocks.some((b) => b.type !== "blank");
      if (isHeadingLine(lines[seg.start], isFirstContent)) {
        pushBlock("heading", seg.start, seg.end);
        continue;
      }
      const prev = blocks[blocks.length - 1];
      if (prev && prev.type === "paragraph" && prev.endLine === seg.start - 1 && prev.source.trim().startsWith("#")) {
        prev.endLine = seg.end;
        prev.lines = lines.slice(prev.startLine, seg.end + 1);
        prev.source = prev.lines.join("\n");
        continue;
      }
      pushBlock("paragraph", seg.start, seg.end);
      continue;
    }
    pushBlock("paragraph", seg.start, seg.end);
  }

  return {
    frontmatter,
    rawFrontmatter,
    blocks,
  };
}

export function serializeAxDocument(model: DocumentModel): string {
  return (model.rawFrontmatter || "") + model.blocks.map(b => b.source).join("\n");
}
