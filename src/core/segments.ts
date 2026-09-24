/**
 * Segmentation of an .ax document into the units the evaluator runs and the
 * document displays. There is one segmentation: evaluation and display both
 * read it, so a line is never evaluated while being shown as prose, or shown
 * as mathematics while being skipped.
 *
 *   frontmatter  a leading block between two --- lines
 *   blank        an empty line
 *   comment      a line starting with #
 *   prose        a line of text (lineKind)
 *   math         one evaluation unit: a line, or several lines joined while
 *                brackets are open or while the text so far is unfinished
 */

import { lineKind } from './classifier';

export type SegmentKind = 'frontmatter' | 'blank' | 'comment' | 'prose' | 'math';

export interface SourceSegment {
  kind: SegmentKind;
  // First and last line index, inclusive.
  start: number;
  end: number;
}

/**
 * Net count of opened brackets on a line: ( [ { minus ) ] }. Brackets inside
 * a "string" and after a # comment are not counted. ' is a prime in Axine,
 * not a quote.
 */
export function delimiterDelta(line: string): number {
  let delta = 0;
  let inString = false;
  for (let idx = 0; idx < line.length; idx++) {
    const ch = line[idx];
    if (inString) {
      if (ch === '"' && line[idx - 1] !== '\\') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '#') break;
    if (ch === '(' || ch === '[' || ch === '{') delta++;
    else if (ch === ')' || ch === ']' || ch === '}') delta--;
  }
  return delta;
}

function frontmatterEnd(lines: string[]): number {
  if (lines.length === 0 || lines[0].trim() !== '---') return -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') return i;
  }
  return -1;
}

/**
 * The last line of the math unit starting at `start`. Lines join while
 * brackets opened on earlier lines are still open, or while the text so far is
 * an unfinished expression and the next line is not blank or a comment. A
 * unit whose brackets never close ends before the next blank line, so an
 * unclosed bracket does not absorb the rest of the document.
 */
function mathUnitEnd(lines: string[], start: number): number {
  let depth = Math.max(0, delimiterDelta(lines[start]));
  let end = start;
  let text = lines[start];

  while (end + 1 < lines.length) {
    if (depth > 0) {
      end++;
      text += '\n' + lines[end];
      depth = Math.max(0, depth + delimiterDelta(lines[end]));
      continue;
    }
    const next = lineKind(lines[end + 1]);
    if (lineKind(text) === 'incomplete' && next !== 'blank' && next !== 'comment') {
      end++;
      text += '\n' + lines[end];
      depth = Math.max(0, delimiterDelta(lines[end]));
      continue;
    }
    break;
  }

  if (depth > 0) {
    for (let i = start + 1; i <= end; i++) {
      if (lines[i].trim() === '') return i - 1;
    }
  }
  return end;
}

export function segmentDocument(lines: string[]): SourceSegment[] {
  const segments: SourceSegment[] = [];
  let i = 0;

  const fmEnd = frontmatterEnd(lines);
  if (fmEnd !== -1) {
    segments.push({ kind: 'frontmatter', start: 0, end: fmEnd });
    i = fmEnd + 1;
  }

  while (i < lines.length) {
    const kind = lineKind(lines[i]);
    if (kind === 'blank' || kind === 'comment') {
      segments.push({ kind, start: i, end: i });
      i++;
      continue;
    }
    if (kind === 'prose') {
      // A line that opens brackets may begin a multi-line expression that
      // only parses as a whole, such as a {\axis ...} block spread over
      // lines. Classify the joined unit; if it is not math, the line is prose.
      if (delimiterDelta(lines[i]) > 0) {
        const end = mathUnitEnd(lines, i);
        const unitKind = end > i ? lineKind(lines.slice(i, end + 1).join('\n')) : kind;
        if (unitKind === 'math' || unitKind === 'incomplete') {
          segments.push({ kind: 'math', start: i, end });
          i = end + 1;
          continue;
        }
      }
      segments.push({ kind, start: i, end: i });
      i++;
      continue;
    }
    const end = mathUnitEnd(lines, i);
    segments.push({ kind: 'math', start: i, end });
    i = end + 1;
  }

  return segments;
}
