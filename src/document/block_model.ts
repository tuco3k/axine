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
  status: "verified" | "unknown" | "error" | "stale";
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

export function classifyBlockType(source: string): BlockType {
  const trimmed = source.trim();
  if (trimmed === "") {
    return "paragraph";
  }
  if (trimmed.startsWith("\\table") || trimmed.startsWith("\\cases")) {
    return "slot";
  }
  if (trimmed.startsWith("\\figure") || trimmed.includes("{\\axis")) {
    return "figure";
  }
  if (trimmed.startsWith("\\derive")) {
    return "derivation";
  }
  if (trimmed.startsWith("# ") || trimmed.startsWith("## ") || trimmed.startsWith("### ")) {
    return "heading";
  }
  if (trimmed.startsWith("#")) {
    return "paragraph";
  }
  // Relational definitions or equations: e.g. "x = 5", ":x := 10", "y = mx + b", "a <= b"
  if (/^(:?[a-zA-Z_][a-zA-Z0-9_]*(\([^)]*\))?\s*(:=|=|<=|>=|<|>)\s*.+)$/.test(trimmed)) {
    return "equation";
  }
  // Pure math expressions with operators (e.g. x^2 + y^2, 2 + 2)
  if (/^[a-zA-Z0-9_]+(\s*[\^+\-*/]\s*[a-zA-Z0-9_]+)+$/.test(trimmed)) {
    return "equation";
  }
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

export function parseAxDocument(text: string): DocumentModel {
  let rawFrontmatter = "";
  let frontmatter: Record<string, any> = {};
  let body = text;

  if (text.startsWith("---")) {
    const endFm = text.indexOf("\n---", 3);
    if (endFm !== -1) {
      const lineEnd = text.indexOf("\n", endFm + 4);
      const splitIdx = lineEnd !== -1 ? lineEnd + 1 : endFm + 4;
      rawFrontmatter = text.substring(0, splitIdx);
      body = text.substring(splitIdx);
      // Basic YAML-like key: value extraction
      const fmContent = text.substring(3, endFm);
      for (const line of fmContent.split("\n")) {
        const colonIdx = line.indexOf(":");
        if (colonIdx !== -1) {
          const k = line.substring(0, colonIdx).trim();
          const v = line.substring(colonIdx + 1).trim();
          if (k) frontmatter[k] = v;
        }
      }
    }
  }

  const lines = body.split("\n");
  const blocks: DocumentBlock[] = [];
  let currentLines: string[] = [];
  let currentType: BlockType | null = null;
  let braceDepth = 0;
  let parenDepth = 0;
  let blockStartLine = 0;

  function flush() {
    if (currentLines.length === 0) return;
    const src = currentLines.join("\n");
    const id = "block_" + blocks.length;
    const type = currentType || "equation";

    blocks.push({
      id,
      type,
      source: src,
      lines: [...currentLines],
      startLine: blockStartLine,
      endLine: blockStartLine + currentLines.length - 1,
      status: "unknown",
      definedSymbol: extractDefinedSymbol(src),
      referencedSymbols: extractReferencedSymbols(src),
    });

    currentLines = [];
    currentType = null;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (currentLines.length === 0) {
      blockStartLine = i;
      if (trimmed.startsWith("\\table") || trimmed.startsWith("\\cases")) {
        currentType = "slot";
      } else if (trimmed.startsWith("\\figure(") || trimmed.startsWith("\\figure ") || trimmed.includes("{\\axis")) {
        currentType = "figure";
      } else if (trimmed.startsWith("\\derive")) {
        currentType = "derivation";
      }
    }

    const hadDepth = braceDepth > 0 || parenDepth > 0;
    // Depth tracking across multiline constructs
    for (const ch of line) {
      if (ch === "{" && parenDepth === 0) braceDepth++;
      else if (ch === "}" && parenDepth === 0 && braceDepth > 0) braceDepth--;
      else if (ch === "(") parenDepth++;
      else if (ch === ")" && parenDepth > 0) parenDepth--;
    }

    if (braceDepth > 0 || parenDepth > 0) {
      currentLines.push(line);
      continue;
    }

    if (hadDepth && braceDepth === 0 && parenDepth === 0) {
      currentLines.push(line);
      flush();
      continue;
    }

    if (trimmed === "") {
      flush();
      blocks.push({
        id: "block_" + blocks.length,
        type: "blank",
        source: line,
        lines: [line],
        startLine: i,
        endLine: i,
        status: "verified",
      });
      continue;
    }

    if (trimmed.startsWith("### ") || trimmed.startsWith("## ") || (trimmed.startsWith("# ") && blocks.filter(b => b.type !== "blank").length === 0)) {
      flush();
      currentType = "heading";
      currentLines.push(line);
      flush();
      continue;
    }

    if (trimmed.startsWith("\\table") || trimmed.startsWith("\\cases")) {
      flush();
      currentType = "slot";
      currentLines.push(line);
      if (braceDepth === 0) flush();
      continue;
    }

    if (trimmed.startsWith("\\figure(") || trimmed.startsWith("\\figure ") || trimmed.includes("{\\axis")) {
      flush();
      currentType = "figure";
      currentLines.push(line);
      if (braceDepth === 0) flush();
      continue;
    }

    if (trimmed.startsWith("\\derive")) {
      flush();
      currentType = "derivation";
      currentLines.push(line);
      continue;
    }

    if (trimmed.startsWith("#")) {
      if (currentType && currentType !== "paragraph") flush();
      currentType = "paragraph";
      currentLines.push(line);
      continue;
    }

    const classified = classifyBlockType(line);
    if (currentType && currentType !== classified) flush();
    currentType = classified;
    currentLines.push(line);
    flush();
  }

  flush();

  return {
    frontmatter,
    rawFrontmatter,
    blocks,
  };
}

export function serializeAxDocument(model: DocumentModel): string {
  return (model.rawFrontmatter || "") + model.blocks.map(b => b.source).join("\n");
}
