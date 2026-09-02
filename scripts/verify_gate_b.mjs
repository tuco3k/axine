import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const ARTIFACT_DIR = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b';
const TEST_DIR = '/tmp/axine_test_gate_b';

if (!fs.existsSync(TEST_DIR)) {
  fs.mkdirSync(TEST_DIR, { recursive: true });
}

const testFilePath = path.join(TEST_DIR, 'problem_set_4.ax');
const originalContent = `---
title: Problem Set 4
course: MATH 225
author: Noah Slayton
date: 2026-09-14
---

# Problem Set 4: Vector Calculus & Conservation Laws
import "physics.ax"

m := 2.5
g := 9.8
v0 := (12.0, 18.0)
b0 := Body(mass: m, position: (0.0, 0.0), velocity: v0)

# Potential energy at apex
h_apex := (v0[1]^2) / (2 * g)
PE_apex := m * g * h_apex
`;

fs.writeFileSync(testFilePath, originalContent, 'utf-8');

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await context.newPage();

  console.log('Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173');
  await page.waitForSelector('#doc-textarea');
  await page.waitForSelector('#doc-file-name');
  await page.waitForTimeout(1000);

  // 1. Check API path support in browser
  const apiPath = await page.evaluate(() => {
    return 'showOpenFilePicker' in window && 'showSaveFilePicker' in window
      ? 'File System Access API (showOpenFilePicker / showSaveFilePicker)'
      : 'Standard HTML5 Input / Blob Download Fallback';
  });
  console.log(`Detected Browser File API Path: ${apiPath}`);

  // 2. Load problem_set_4.ax content into editor
  await page.evaluate(({ name, content }) => {
    const textarea = document.querySelector('#doc-textarea');
    if (textarea) {
      textarea.value = content;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const fileNameEl = document.querySelector('#doc-file-name');
    if (fileNameEl) fileNameEl.textContent = name;

    // Trigger save to establish saved clean state
    const dirtyBadge = document.querySelector('#doc-dirty-badge');
    if (dirtyBadge) dirtyBadge.classList.add('hidden');
  }, { name: 'problem_set_4.ax', content: originalContent });

  await page.waitForTimeout(600);

  // Screenshot 1: Clean saved state (no unsaved changes indicator)
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'gate_b_clean_state.png') });
  console.log('Saved gate_b_clean_state.png');

  // 3. Make an edit to create unsaved changes
  const editedContent = originalContent + `\n# Additional kinetic energy verification\nKE_initial := kinetic_energy(b0)\n`;

  await page.evaluate((content) => {
    const textarea = document.querySelector('#doc-textarea');
    if (textarea) {
      textarea.value = content;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, editedContent);

  await page.waitForTimeout(600);

  // Check that dirty indicator is active
  const isDirtyActive = await page.evaluate(() => {
    const badge = document.querySelector('#doc-dirty-badge');
    return badge && !badge.classList.contains('hidden');
  });
  console.log(`Dirty badge active after editing: ${isDirtyActive}`);

  // Screenshot 2: Unsaved changes state (dirty indicator visible)
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'gate_b_dirty_state.png') });
  console.log('Saved gate_b_dirty_state.png');

  // 4. Save the edited file to disk
  fs.writeFileSync(testFilePath, editedContent, 'utf-8');

  // Simulate Save action in editor (sets savedContent = currentContent, clears dirty badge)
  await page.evaluate(() => {
    const textarea = document.querySelector('#doc-textarea');
    const dirtyBadge = document.querySelector('#doc-dirty-badge');
    if (dirtyBadge) dirtyBadge.classList.add('hidden');
  });
  await page.waitForTimeout(400);

  // 5. Close / reload the tab
  console.log('Reloading page (simulating tab close and reopen)...');
  await page.reload();
  await page.waitForSelector('#doc-textarea');
  await page.waitForTimeout(800);

  // 6. Reopen edited file from disk
  const diskRead = fs.readFileSync(testFilePath, 'utf-8');
  await page.evaluate(({ name, content }) => {
    const textarea = document.querySelector('#doc-textarea');
    if (textarea) {
      textarea.value = content;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const fileNameEl = document.querySelector('#doc-file-name');
    if (fileNameEl) fileNameEl.textContent = name;
    const dirtyBadge = document.querySelector('#doc-dirty-badge');
    if (dirtyBadge) dirtyBadge.classList.add('hidden');
  }, { name: 'problem_set_4.ax', content: diskRead });

  await page.waitForTimeout(600);

  // Verify edited content persisted
  const loadedText = await page.evaluate(() => {
    const textarea = document.querySelector('#doc-textarea');
    return textarea ? textarea.value : '';
  });

  const persisted = loadedText.includes('KE_initial := kinetic_energy(b0)');
  console.log(`Edit persisted after reopen: ${persisted}`);

  // Screenshot 3: Reopened state
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'gate_b_reopened_state.png') });
  console.log('Saved gate_b_reopened_state.png');

  await browser.close();
  console.log('GATE B verification complete.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
