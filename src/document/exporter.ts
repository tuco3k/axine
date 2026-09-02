import { DocumentLineRecord } from './document_state';
import { typesetMath } from '../core/math_typeset';
import { GraphSpec, GraphValue } from '../core/types';
import { formatValue } from './editor';

export interface FrontMatterData {
  title?: string;
  course?: string;
  author?: string;
  date?: string;
  [key: string]: string | undefined;
}

export function parseFrontMatter(docText: string): { frontMatter: FrontMatterData; body: string } {
  const lines = docText.split('\n');
  if (lines.length === 0 || lines[0].trim() !== '---') {
    return { frontMatter: {}, body: docText };
  }

  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endIdx = i;
      break;
    }
  }

  if (endIdx === -1) {
    return { frontMatter: {}, body: docText };
  }

  const fmLines = lines.slice(1, endIdx);
  const frontMatter: FrontMatterData = {};
  for (const line of fmLines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx !== -1) {
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim();
      if (key) frontMatter[key] = val;
    }
  }

  const body = lines.slice(endIdx + 1).join('\n');
  return { frontMatter, body };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const DEFAULT_SERIES_COLORS = [
  '#38bdf8', // sky-400
  '#f43f5e', // rose-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#a855f7', // purple-500
  '#06b6d4', // cyan-500
];

/**
 * Render a GraphSpec directly into an SVG string without requiring browser DOM APIs.
 */
export function renderSVGGraphToString(
  spec: GraphSpec,
  options?: { width?: number; height?: number; theme?: 'dark' | 'light' }
): string {
  const width = options?.width ?? 580;
  const height = options?.height ?? 260;
  const isDark = options?.theme !== 'light';

  const bg = isDark ? '#18181b' : '#ffffff';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
  const axisColor = isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)';
  const textColor = isDark ? '#a1a1aa' : '#555555';
  const legendBg = isDark ? 'rgba(24, 24, 27, 0.85)' : 'rgba(255, 255, 255, 0.85)';
  const legendBorder = isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)';

  const padLeft = 60;
  const padRight = 24;
  const padTop = 20;
  const padBottom = 40;

  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  // Determine xRange & yRange
  let xMin = spec.domain?.min ?? 0;
  let xMax = spec.domain?.max ?? 10;
  let yMin = spec.domainY?.min ?? -1;
  let yMax = spec.domainY?.max ?? 1;

  // Compute bounding box from series explicit points if range is not specified or too small
  const allExplicitPoints: { x: number; y: number }[] = [];
  if (spec.series) {
    for (const s of spec.series) {
      if (s.explicitPoints) {
        for (const pt of s.explicitPoints) {
          if (pt.valid !== false && Number.isFinite(pt.x) && Number.isFinite(pt.y)) {
            allExplicitPoints.push(pt);
          }
        }
      }
    }
  }

  if (allExplicitPoints.length > 0 && (!spec.domainY || spec.domain?.isDefault)) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const pt of allExplicitPoints) {
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }
    if (minX !== Infinity && maxX !== -Infinity && minX < maxX) {
      xMin = minX;
      xMax = maxX;
    }
    if (minY !== Infinity && maxY !== -Infinity && minY < maxY) {
      const yPadding = (maxY - minY) * 0.1 || 1;
      yMin = minY - yPadding;
      yMax = maxY + yPadding;
    }
  }

  const toSvgX = (x: number) => padLeft + ((x - xMin) / (xMax - xMin || 1)) * plotW;
  const toSvgY = (y: number) => padTop + plotH - ((y - yMin) / (yMax - yMin || 1)) * plotH;

  // Generate grid lines and tick labels
  const numXTicks = 5;
  const numYTicks = 5;
  let gridSvg = '';

  for (let i = 0; i <= numXTicks; i++) {
    const frac = i / numXTicks;
    const dataX = xMin + frac * (xMax - xMin);
    const svgX = padLeft + frac * plotW;
    gridSvg += `<line x1="${svgX.toFixed(1)}" y1="${padTop}" x2="${svgX.toFixed(1)}" y2="${(padTop + plotH).toFixed(1)}" stroke="${gridColor}" stroke-width="1" />`;
    gridSvg += `<text x="${svgX.toFixed(1)}" y="${(padTop + plotH + 15).toFixed(1)}" fill="${textColor}" font-size="10" font-family="monospace" text-anchor="middle">${dataX.toFixed(1)}</text>`;
  }

  for (let i = 0; i <= numYTicks; i++) {
    const frac = i / numYTicks;
    const dataY = yMin + frac * (yMax - yMin);
    const svgY = padTop + plotH - frac * plotH;
    gridSvg += `<line x1="${padLeft}" y1="${svgY.toFixed(1)}" x2="${(padLeft + plotW).toFixed(1)}" y2="${svgY.toFixed(1)}" stroke="${gridColor}" stroke-width="1" />`;
    gridSvg += `<text x="${(padLeft - 8).toFixed(1)}" y="${(svgY + 3).toFixed(1)}" fill="${textColor}" font-size="10" font-family="monospace" text-anchor="end">${dataY >= 1000 || dataY <= -1000 ? dataY.toExponential(1) : dataY.toFixed(1)}</text>`;
  }

  // Draw axes
  const originX = toSvgX(0);
  const originY = toSvgY(0);
  let axesSvg = '';
  if (xMin <= 0 && xMax >= 0) {
    axesSvg += `<line x1="${originX.toFixed(1)}" y1="${padTop}" x2="${originX.toFixed(1)}" y2="${(padTop + plotH).toFixed(1)}" stroke="${axisColor}" stroke-width="1.5" />`;
  }
  if (yMin <= 0 && yMax >= 0) {
    axesSvg += `<line x1="${padLeft}" y1="${originY.toFixed(1)}" x2="${(padLeft + plotW).toFixed(1)}" y2="${originY.toFixed(1)}" stroke="${axisColor}" stroke-width="1.5" />`;
  }

  // Draw series
  let seriesSvg = '';
  const seriesList = spec.series ?? [];
  const legendItems: { name: string; color: string }[] = [];

  for (let sIdx = 0; sIdx < seriesList.length; sIdx++) {
    const s = seriesList[sIdx];
    const color = s.color || DEFAULT_SERIES_COLORS[sIdx % DEFAULT_SERIES_COLORS.length];
    const seriesName = s.label || `Series ${sIdx + 1}`;
    legendItems.push({ name: seriesName, color });

    if (s.explicitPoints && s.explicitPoints.length > 0) {
      const pts = s.explicitPoints
        .filter(pt => pt.valid !== false && Number.isFinite(pt.x) && Number.isFinite(pt.y))
        .map(pt => `${toSvgX(pt.x).toFixed(1)},${toSvgY(pt.y).toFixed(1)}`)
        .join(' ');
      if (pts) {
        seriesSvg += `<polyline fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${pts}" />`;
      }
    }
  }

  // Determine Axis Labels
  const xLabel = spec.xAxisLabel || (spec.domain?.var === 't' ? 't (s)' : (spec.domain?.var || 'x'));
  const yLabel = spec.yAxisLabel || (spec.series?.length === 1 ? (spec.series[0].label || '') : '');

  // X Axis Label
  let xLabelSvg = `<text x="${(padLeft + plotW / 2).toFixed(1)}" y="${(height - 4).toFixed(1)}" fill="${textColor}" font-size="11" font-weight="500" font-family="system-ui, -apple-system, sans-serif" text-anchor="middle">${escapeHtml(xLabel)}</text>`;

  // Y Axis Label (Rotated)
  let yLabelSvg = '';
  if (yLabel) {
    yLabelSvg = `<text transform="rotate(-90)" x="${(-(padTop + plotH / 2)).toFixed(1)}" y="16" fill="${textColor}" font-size="11" font-weight="500" font-family="system-ui, -apple-system, sans-serif" text-anchor="middle">${escapeHtml(yLabel)}</text>`;
  }

  // Draw Title ONLY if explicitly provided and distinct from yLabel
  let titleSvg = '';
  if (spec.title && spec.title !== yLabel) {
    titleSvg = `<text x="${(padLeft + plotW / 2).toFixed(1)}" y="${(padTop - 6).toFixed(1)}" fill="${textColor}" font-size="12" font-weight="600" font-family="system-ui, -apple-system, sans-serif" text-anchor="middle">${escapeHtml(spec.title)}</text>`;
  }

  // Draw Legend ONLY when there is MORE than 1 series
  let legendSvg = '';
  if (legendItems.length > 1) {
    const legItemHeight = 16;
    const legH = legendItems.length * legItemHeight + 10;
    const legW = 140;
    const legX = width - padRight - legW - 8;
    const legY = padTop + 8;

    legendSvg += `<g class="svg-legend" transform="translate(${legX}, ${legY})">`;
    legendSvg += `<rect width="${legW}" height="${legH}" rx="4" fill="${legendBg}" stroke="${legendBorder}" stroke-width="1" />`;
    for (let i = 0; i < legendItems.length; i++) {
      const item = legendItems[i];
      const itemY = 14 + i * legItemHeight;
      legendSvg += `<line x1="8" y1="${itemY - 3}" x2="24" y2="${itemY - 3}" stroke="${item.color}" stroke-width="2" />`;
      legendSvg += `<text x="28" y="${itemY}" fill="${textColor}" font-size="10" font-family="system-ui, sans-serif">${escapeHtml(item.name)}</text>`;
    }
    legendSvg += `</g>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="background-color:${bg};border-radius:6px;display:block;">
    <rect width="${width}" height="${height}" fill="${bg}" rx="6" />
    <g class="grid">${gridSvg}</g>
    <g class="axes">${axesSvg}</g>
    <g class="series">${seriesSvg}</g>
    ${xLabelSvg}
    ${yLabelSvg}
    ${titleSvg}
    ${legendSvg}
  </svg>`;
}

/**
 * Generate a standalone, self-contained HTML document with inline typeset math,
 * embedded SVG plots, current theme styling, and zero external dependencies.
 */
export function exportToHtml(
  fileName: string,
  docText: string,
  records: DocumentLineRecord[],
  theme: 'dark' | 'light' = 'dark'
): string {
  const { frontMatter } = parseFrontMatter(docText);
  const title = frontMatter.title || fileName.replace(/\.ax$/, '') || 'Axine Document';

  const isDark = theme === 'dark';
  const bg = isDark ? '#121214' : '#ffffff';
  const text = isDark ? '#f0f0f4' : '#1a1a1e';
  const textMuted = isDark ? '#a0a0a8' : '#606068';
  const border = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
  const accent = isDark ? '#00e5ff' : '#0077cc';
  const codeBg = isDark ? '#1a1a1e' : '#f4f4f6';
  const resultBg = isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)';

  let frontMatterHtml = '';
  if (Object.keys(frontMatter).length > 0) {
    frontMatterHtml = `
      <header class="export-header">
        ${frontMatter.title ? `<h1 class="export-title">${escapeHtml(frontMatter.title)}</h1>` : ''}
        <div class="export-meta">
          ${frontMatter.course ? `<span class="meta-item"><strong>Course:</strong> ${escapeHtml(frontMatter.course)}</span>` : ''}
          ${frontMatter.author ? `<span class="meta-item"><strong>Author:</strong> ${escapeHtml(frontMatter.author)}</span>` : ''}
          ${frontMatter.date ? `<span class="meta-item"><strong>Date:</strong> ${escapeHtml(frontMatter.date)}</span>` : ''}
        </div>
      </header>
    `;
  }

  let inFm = docText.split('\n')[0]?.trim() === '---';
  let fmDone = !inFm;

  let linesHtml = '';
  for (let idx = 0; idx < records.length; idx++) {
    const rec = records[idx];
    const rawLine = rec?.text ?? '';

    // Skip YAML frontmatter lines in body
    if (!fmDone) {
      if (idx > 0 && rawLine.trim() === '---') fmDone = true;
      continue;
    }

    const trimmed = rawLine.trim();

    if (trimmed.startsWith('### ')) {
      linesHtml += `<h3 class="export-prose-h3">${escapeHtml(trimmed.slice(4))}</h3>`;
      continue;
    }
    if (trimmed.startsWith('## ')) {
      linesHtml += `<h2 class="export-prose-h2">${escapeHtml(trimmed.slice(3))}</h2>`;
      continue;
    }
    if (trimmed.startsWith('#')) {
      const commentText = trimmed.replace(/^#+\s*/, '');
      linesHtml += `<div class="export-prose-comment">${escapeHtml(commentText)}</div>`;
      continue;
    }

    if (!trimmed) {
      linesHtml += `<div class="export-empty-line"></div>`;
      continue;
    }

    let resultHtml = '';
    let isPlot = false;

    if (rec?.result) {
      if (rec.result.type === 'graph') {
        isPlot = true;
        const spec = (rec.result as GraphValue).spec;
        const svgStr = renderSVGGraphToString(spec, { width: 580, height: 260, theme });
        resultHtml = `<div class="export-plot-container">${svgStr}</div>`;
      } else {
        const formatted = formatValue(rec.result);
        const typeset = typesetMath(formatted, { displayMode: false });
        resultHtml = `<div class="export-math-result">${typeset}</div>`;
      }
    } else if (rec?.error) {
      resultHtml = `<div class="export-error-result">${escapeHtml(rec.error.message)}</div>`;
    }

    const typesetSource = typesetMath(rawLine, { displayMode: false });

    linesHtml += `
      <div class="export-line-row ${isPlot ? 'plot-row' : ''}">
        <div class="export-source-typeset">${typesetSource}</div>
        ${resultHtml ? `<div class="export-line-result">${resultHtml}</div>` : ''}
      </div>
    `;
  }

  return `<!DOCTYPE html>
<html lang="en" data-theme="${theme}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - Axine Export</title>
  <style>
    :root {
      --bg: ${bg};
      --text: ${text};
      --text-muted: ${textMuted};
      --border: ${border};
      --accent: ${accent};
      --code-bg: ${codeBg};
      --result-bg: ${resultBg};
    }
    @page {
      size: letter;
      margin: 0.75in;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 36px 48px;
      max-width: 900px;
      margin: 0 auto;
    }
    .export-header {
      margin-bottom: 28px;
      padding-bottom: 16px;
      border-bottom: 2px solid var(--border);
    }
    .export-title {
      font-size: 26px;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 8px;
    }
    .export-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 20px;
      font-size: 13px;
      color: var(--text-muted);
    }
    .meta-item strong {
      color: var(--text);
      font-weight: 600;
    }
    .hidden { display: none !important; }
    .export-prose-h2 {
      font-size: 18px;
      font-weight: 700;
      color: var(--text);
      margin-top: 24px;
      margin-bottom: 8px;
      page-break-after: avoid;
      break-after: avoid;
    }
    .export-prose-h3 {
      font-size: 15px;
      font-weight: 600;
      color: var(--text);
      margin-top: 18px;
      margin-bottom: 6px;
      page-break-after: avoid;
      break-after: avoid;
    }
    .export-prose-comment {
      font-family: Georgia, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, serif;
      font-size: 14px;
      font-style: italic;
      color: var(--text-muted);
      margin-top: 14px;
      margin-bottom: 6px;
      line-height: 1.4;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .export-empty-line {
      height: 10px;
    }
    .export-line-row {
      margin: 6px 0;
      padding: 2px 0;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .export-source-typeset {
      font-size: 14px;
      line-height: 1.5;
      color: var(--text);
    }
    .export-line-result {
      margin-top: 4px;
      margin-left: 20px;
      padding-left: 10px;
      border-left: 2px solid var(--border);
      font-size: 13.5px;
      overflow-x: auto;
    }
    .export-math-result {
      display: inline-flex;
      align-items: center;
      background: var(--result-bg);
      padding: 2px 6px;
      border-radius: 4px;
      max-width: 100%;
    }
    .export-error-result {
      color: #ff5252;
      background: rgba(255, 82, 82, 0.1);
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      white-space: pre-wrap;
    }
    .export-plot-container {
      margin: 10px 0;
      background: var(--code-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 12px;
      display: inline-block;
      max-width: 100%;
      overflow-x: auto;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    /* Typography formatting */
    .tm-var {
      font-style: italic;
      font-family: "Times New Roman", Times, Georgia, serif;
    }
    .tm-num {
      font-style: normal;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .tm-rel {
      padding: 0 4px;
      font-weight: 500;
    }
    .tm-bin {
      padding: 0 2px;
    }
    .tm-string {
      color: var(--accent);
    }
    .tm-op {
      color: var(--text-muted);
      font-weight: 600;
    }
    .tm-fn {
      font-style: normal;
      font-weight: 500;
    }
    .tm-const {
      font-style: normal;
    }
    /* Stacked fraction math formatting */
    .tm-frac {
      display: inline-flex;
      flex-direction: column;
      vertical-align: -0.4em;
      text-align: center;
      font-size: 0.9em;
      line-height: 1;
      padding: 0 2px;
      white-space: nowrap;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .tm-num-box {
      display: block;
      text-align: center;
      border-bottom: 1px solid currentColor;
      padding: 0 2px 1px 2px;
      font-size: 0.9em;
      line-height: 1;
    }
    .tm-den-box {
      display: block;
      text-align: center;
      padding: 1px 2px 0 2px;
      font-size: 0.9em;
      line-height: 1;
    }
    .tm-frac-bar, .tm-frac-slash {
      display: none;
    }
    .tm-rational-exact-wrapper { display: inline-flex; align-items: center; gap: 4px; }
    .tm-large-rational { display: inline-flex; align-items: center; gap: 4px; flex-wrap: wrap; }
    .tm-approx-val { font-family: ui-monospace, Menlo, Consolas, monospace; }
    .tm-exact-badge {
      font-size: 10px;
      font-weight: 600;
      padding: 1px 4px;
      border-radius: 3px;
      background: rgba(0, 229, 255, 0.15);
      color: var(--accent);
      cursor: pointer;
      user-select: none;
    }
    .tm-exact-badge:hover {
      background: rgba(0, 229, 255, 0.25);
    }
    .tm-exact-expanded {
      margin-left: 6px;
      padding: 2px 6px;
      border: 1px dashed var(--border);
      border-radius: 4px;
      background: var(--code-bg);
    }
    .tm-exact-expanded.hidden {
      display: none !important;
    }
    @media print {
      @page {
        size: letter;
        margin: 0.75in;
      }
      *, *:before, *:after {
        background: transparent !important;
        color: #111111 !important;
        box-shadow: none !important;
        text-shadow: none !important;
      }
      body { background: #ffffff !important; color: #111111 !important; padding: 0 !important; font-size: 11pt !important; }
      .export-header { border-bottom: 2px solid #222222 !important; }
      .export-title { color: #111111 !important; }
      .export-meta { color: #444444 !important; }
      .export-prose-comment { color: #333333 !important; }
      .export-line-row { break-inside: avoid !important; page-break-inside: avoid !important; margin: 6px 0 !important; }
      .export-line-result { margin-top: 4px !important; margin-left: 20px !important; padding-left: 10px !important; border-left: 2px solid #999999 !important; font-size: 11pt !important; }
      .export-plot-container { border: 1px solid #cccccc !important; background: #ffffff !important; margin: 10px 0 !important; break-inside: avoid !important; page-break-inside: avoid !important; }
      .tm-num-box { border-bottom: 1px solid #111111 !important; }
    }
  </style>
</head>
<body>
  ${frontMatterHtml}
  <main class="export-content">
    ${linesHtml}
  </main>
  <script>
    document.addEventListener('click', function(e) {
      var badge = e.target.closest('.tm-exact-badge');
      if (badge) {
        var rational = badge.closest('.tm-large-rational');
        if (rational) {
          var expanded = rational.querySelector('.tm-exact-expanded');
          if (expanded) expanded.classList.toggle('hidden');
        }
      }
    });
  </script>
</body>
</html>`;
}

/**
 * Generate Markdown export with Unicode math representations and linked PNG plots.
 */
export function exportToMarkdown(
  fileName: string,
  docText: string,
  records: DocumentLineRecord[]
): { markdown: string; plotImages: { filename: string; svgString: string }[] } {
  const { frontMatter } = parseFrontMatter(docText);
  const plotImages: { filename: string; svgString: string }[] = [];

  let md = '';
  if (Object.keys(frontMatter).length > 0) {
    md += '---\n';
    for (const [k, v] of Object.entries(frontMatter)) {
      md += `${k}: ${v}\n`;
    }
    md += '---\n\n';
  }

  const title = frontMatter.title || fileName.replace(/\.ax$/, '');
  if (title) {
    md += `# ${title}\n\n`;
  }

  let codeBlockLines: string[] = [];

  const flushCodeBlock = () => {
    if (codeBlockLines.length > 0) {
      md += '```axine\n' + codeBlockLines.join('\n') + '\n```\n\n';
      codeBlockLines = [];
    }
  };

  let inFm = docText.split('\n')[0]?.trim() === '---';
  let fmDone = !inFm;

  for (let idx = 0; idx < records.length; idx++) {
    const rec = records[idx];
    const raw = rec?.text ?? '';

    if (!fmDone) {
      if (idx > 0 && raw.trim() === '---') {
        fmDone = true;
      }
      continue;
    }

    if (raw.trim().startsWith('#')) {
      flushCodeBlock();
      md += `${raw.trim()}\n\n`;
      continue;
    }

    if (!raw.trim()) {
      flushCodeBlock();
      continue;
    }

    codeBlockLines.push(raw);

    if (rec?.result) {
      if (rec.result.type === 'graph') {
        flushCodeBlock();
        const spec = (rec.result as GraphValue).spec;
        const plotFilename = `plot_L${idx + 1}.svg`;
        const svgStr = renderSVGGraphToString(spec, { width: 600, height: 300, theme: 'light' });
        plotImages.push({ filename: plotFilename, svgString: svgStr });
        md += `![Plot Line ${idx + 1}](plots/${plotFilename})\n\n`;
      } else {
        const formatted = formatValue(rec.result);
        codeBlockLines.push(`// => ${formatted}`);
      }
    } else if (rec?.error) {
      codeBlockLines.push(`// [Error: ${rec.error.message}]`);
    }
  }

  flushCodeBlock();
  return { markdown: md, plotImages };
}
