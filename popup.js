// ============================================================
//  GEMINI AI STUDIO AUTOMATOR — popup.js  v2.0
//  Features:
//    · Load .xlsx / .csv file (via SheetJS bundled inline)
//    · Select input column, start row, end row
//    · Start automation: open AI Studio tab, select model,
//      inject system prompt, paste each row, trigger run
//    · Live progress bar + log
//    · Stop button
// ============================================================

// ── SheetJS (xlsx) CDN is loaded dynamically at runtime ──
// We inject it into the popup page itself (not content scripts)
const SHEETJS_URL = 'https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js';

// ────────────────────────────────────────────────────────────
// 1. DOM REFERENCES
// ────────────────────────────────────────────────────────────
const modelSelect       = document.getElementById('model-select');
const systemPrompt      = document.getElementById('system-prompt');
const promptCharCount   = document.getElementById('prompt-char-count');

const fileInput         = document.getElementById('file-input');
const fileBrowseBtn     = document.getElementById('file-browse-btn');
const fileDropZone      = document.getElementById('file-drop-zone');
const fileInfo          = document.getElementById('file-info');
const fileNameEl        = document.getElementById('file-name');
const fileRowsEl        = document.getElementById('file-rows');
const fileClearBtn      = document.getElementById('file-clear-btn');
const columnSelectorWrap= document.getElementById('column-selector-wrap');
const inputColumnSelect = document.getElementById('input-column');

const startRowInput     = document.getElementById('start-row');
const endRowInput       = document.getElementById('end-row');
const rowCountChip      = document.getElementById('row-count-chip');

const progressWrap      = document.getElementById('progress-wrap');
const progressLabel     = document.getElementById('progress-label');
const progressPct       = document.getElementById('progress-pct');
const progressBar       = document.getElementById('progress-bar');
const progressDetail    = document.getElementById('progress-detail');

const startBtn          = document.getElementById('start-btn');
const startBtnText      = document.getElementById('start-btn-text');
const startBtnLoading   = document.getElementById('start-btn-loading');
const stopBtn           = document.getElementById('stop-btn');
const statusBadge       = document.getElementById('status-badge');
const logBox            = document.getElementById('log-box');

// ────────────────────────────────────────────────────────────
// 2. STATE
// ────────────────────────────────────────────────────────────
let parsedRows   = [];   // Array of row objects from the file
let isRunning    = false;
let stopRequested= false;

// ────────────────────────────────────────────────────────────
// 3. INITIALISATION
// ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  loadSheetJS();
  restoreSettings();
  updateRowCountChip();

  // Initially open the AI Studio tab if it's not already open
  try {
    const tabs = await chrome.tabs.query({ url: 'https://aistudio.google.com/*' });
    if (tabs.length === 0) {
      await chrome.tabs.create({ url: 'https://aistudio.google.com/prompts/new_chat', active: false });
    }
  } catch (e) {
    console.error('Error opening initial tab:', e);
  }
});

/** Dynamically load SheetJS into the popup page */
function loadSheetJS() {
  if (window.XLSX) return; // already loaded
  const script = document.createElement('script');
  script.src = SHEETJS_URL;
  script.onerror = () => addLog('warn', 'SheetJS failed to load (offline?). xlsx support disabled.');
  document.head.appendChild(script);
}

/** Restore saved settings from chrome.storage.local */
function restoreSettings() {
  chrome.storage.local.get(['automatorSettings'], (res) => {
    const s = res.automatorSettings || {};
    if (s.model)        modelSelect.value = s.model;
    if (s.systemPrompt) { systemPrompt.value = s.systemPrompt; promptCharCount.textContent = s.systemPrompt.length; }
    if (s.startRow)     startRowInput.value = s.startRow;
    if (s.endRow)       endRowInput.value   = s.endRow;
  });
}

/** Persist current settings */
function saveSettings() {
  chrome.storage.local.set({
    automatorSettings: {
      model:        modelSelect.value,
      systemPrompt: systemPrompt.value,
      startRow:     startRowInput.value,
      endRow:       endRowInput.value,
    }
  });
}

// ────────────────────────────────────────────────────────────
// 4. CHAR COUNTER
// ────────────────────────────────────────────────────────────
systemPrompt.addEventListener('input', () => {
  promptCharCount.textContent = systemPrompt.value.length.toLocaleString();
  saveSettings();
});

modelSelect.addEventListener('change',   saveSettings);
startRowInput.addEventListener('input',  () => { updateRowCountChip(); saveSettings(); });
endRowInput.addEventListener('input',    () => { updateRowCountChip(); saveSettings(); });

function updateRowCountChip() {
  const s = parseInt(startRowInput.value, 10) || 1;
  const e = parseInt(endRowInput.value,   10) || 1;
  const count = Math.max(0, e - s + 1);
  rowCountChip.textContent = `${count} row${count !== 1 ? 's' : ''}`;
}

// ────────────────────────────────────────────────────────────
// 5. FILE HANDLING
// ────────────────────────────────────────────────────────────
fileBrowseBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
fileDropZone.addEventListener('click', () => fileInput.click());

fileDropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  fileDropZone.classList.add('drag-over');
});
fileDropZone.addEventListener('dragleave', () => fileDropZone.classList.remove('drag-over'));
fileDropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  fileDropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) processFile(file);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) processFile(fileInput.files[0]);
});

fileClearBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  clearFile();
});

function clearFile() {
  parsedRows = [];
  fileInput.value = '';
  fileInfo.classList.add('hidden');
  fileDropZone.classList.remove('hidden');
  columnSelectorWrap.classList.add('hidden');
  inputColumnSelect.innerHTML = '';
  addLog('inf', 'File cleared.');
}

/**
 * Parse the loaded file using SheetJS (xlsx/csv)
 * @param {File} file
 */
async function processFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();

  if (!['xlsx', 'xls', 'csv'].includes(ext)) {
    addLog('err', `Unsupported file type ".${ext}". Use .xlsx, .xls, or .csv.`);
    return;
  }

  if (!window.XLSX) {
    addLog('err', 'SheetJS not loaded yet. Check your internet and try again.');
    return;
  }

  addLog('inf', `Loading "${file.name}"…`);

  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Convert to array-of-objects (first row = headers)
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (!rows.length) {
      addLog('warn', 'File is empty or has no data rows.');
      return;
    }

    parsedRows = rows;

    // Populate column selector
    const columns = Object.keys(rows[0]);
    inputColumnSelect.innerHTML = columns
      .map(col => `<option value="${escHtml(col)}">${escHtml(col)}</option>`)
      .join('');

    // Update UI
    fileNameEl.textContent  = file.name;
    fileRowsEl.textContent  = `${rows.length} rows`;
    fileInfo.classList.remove('hidden');
    fileDropZone.classList.add('hidden');
    columnSelectorWrap.classList.remove('hidden');
    logBox.classList.remove('hidden');

    // Auto-set end row
    endRowInput.value = rows.length;
    updateRowCountChip();

    addLog('ok', `Loaded ${rows.length} rows, ${columns.length} columns from "${sheetName}".`);
  } catch (err) {
    addLog('err', `Parse error: ${err.message}`);
  }
}

// ────────────────────────────────────────────────────────────
// 6. START BUTTON
// ────────────────────────────────────────────────────────────
startBtn.addEventListener('click', async () => {
  if (isRunning) return;

  // Validate
  const prompt = systemPrompt.value.trim();
  const model  = modelSelect.value;
  const col    = inputColumnSelect.value;
  const sRow   = parseInt(startRowInput.value, 10);
  const eRow   = parseInt(endRowInput.value,   10);

  if (!parsedRows.length) {
    addLog('err', 'No file loaded. Please load an xlsx/csv file first.');
    logBox.classList.remove('hidden');
    return;
  }
  if (!prompt) {
    addLog('err', 'System prompt is empty. Please enter a system instruction.');
    logBox.classList.remove('hidden');
    return;
  }
  if (isNaN(sRow) || isNaN(eRow) || sRow < 1 || eRow < sRow) {
    addLog('err', 'Invalid row range. Start must be ≥ 1 and ≤ End.');
    logBox.classList.remove('hidden');
    return;
  }

  // Get the slice of rows to process (1-indexed)
  const rows = parsedRows.slice(sRow - 1, eRow);

  if (!rows.length) {
    addLog('err', 'No rows in the selected range.');
    return;
  }

  // Get or open AI Studio tab
  let aiTab = null;
  try {
    const tabs = await chrome.tabs.query({ url: 'https://aistudio.google.com/*' });
    if (tabs.length > 0) {
      aiTab = tabs[0];
      await chrome.tabs.update(aiTab.id, { active: true });
    } else {
      aiTab = await chrome.tabs.create({ url: 'https://aistudio.google.com/prompts/new_chat' });
      addLog('inf', 'Opening AI Studio tab…');
      // Wait for page to load
      await waitForTabLoad(aiTab.id);
      await sleep(2000);
    }
  } catch (e) {
    addLog('err', `Could not access tabs: ${e.message}`);
    return;
  }

  // Enter running state
  isRunning = true;
  stopRequested = false;
  setRunningUI(true);
  setStatus('Running', 'running');
  logBox.classList.remove('hidden');
  addLog('inf', `Starting automation: ${rows.length} rows, model "${model}"`);

  // ── Step A: Setup AI Studio (model + system prompt) ──
  try {
    const setupResult = await chrome.tabs.sendMessage(aiTab.id, {
      action: 'setupStudio',
      model,
      systemPrompt: prompt,
    });
    if (setupResult && !setupResult.success) {
      addLog('warn', `Setup warning: ${setupResult.message}`);
    } else {
      addLog('ok', 'AI Studio configured (model + system prompt).');
    }
  } catch (e) {
    if (e.message.includes('Receiving end does not exist')) {
      addLog('warn', 'Content script not ready — reload AI Studio and try again.');
    } else {
      addLog('warn', `Setup issue: ${e.message}`);
    }
  }

  // ── Step B: Process each row ──
  let done = 0;
  for (let i = 0; i < rows.length; i++) {
    if (stopRequested) {
      addLog('warn', `Stopped by user after ${done} rows.`);
      break;
    }

    const cellValue = String(rows[i][col] ?? '').trim();
    const globalRowNum = sRow + i;

    updateProgress(i + 1, rows.length, globalRowNum);

    if (!cellValue) {
      addLog('warn', `Row ${globalRowNum}: empty cell, skipped.`);
      done++;
      continue;
    }

    addLog('inf', `Row ${globalRowNum}: sending "${cellValue.slice(0, 60)}${cellValue.length > 60 ? '…' : ''}"`);

    try {
      const result = await chrome.tabs.sendMessage(aiTab.id, {
        action: 'runPrompt',
        inputText: cellValue,
      });

      if (result && result.success) {
        addLog('ok', `Row ${globalRowNum}: ✓ done.`);
      } else {
        addLog('err', `Row ${globalRowNum}: ${result?.message || 'Unknown error'}`);
      }
    } catch (e) {
      addLog('err', `Row ${globalRowNum}: ${e.message}`);
    }

    done++;
    // Small delay between rows to avoid overwhelming the UI
    await sleep(500);
  }

  // ── Done ──
  const finalLabel = stopRequested ? 'Stopped' : 'Complete';
  updateProgress(rows.length, rows.length, eRow, finalLabel);
  setStatus(stopRequested ? 'Stopped' : 'Done', stopRequested ? 'stopped' : 'done');
  addLog(stopRequested ? 'warn' : 'ok', `Automation ${finalLabel.toLowerCase()}. ${done} rows processed.`);

  isRunning = false;
  setRunningUI(false);
});

// ────────────────────────────────────────────────────────────
// 7. STOP BUTTON
// ────────────────────────────────────────────────────────────
stopBtn.addEventListener('click', () => {
  if (!isRunning) return;
  stopRequested = true;
  addLog('warn', 'Stop requested — finishing current row…');
  stopBtn.disabled = true;
});

// ────────────────────────────────────────────────────────────
// 8. UI HELPERS
// ────────────────────────────────────────────────────────────
function setRunningUI(running) {
  startBtn.disabled = running;
  stopBtn.disabled  = !running;

  if (running) {
    startBtnText.classList.add('hidden');
    startBtnLoading.classList.remove('hidden');
  } else {
    startBtnText.classList.remove('hidden');
    startBtnLoading.classList.add('hidden');
  }
}

function setStatus(label, state) {
  statusBadge.textContent = label;
  statusBadge.className   = `status-badge status-${state}`;
}

function updateProgress(current, total, rowNum, label) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  progressBar.style.width = `${pct}%`;
  progressPct.textContent = `${pct}%`;
  progressLabel.textContent = label || `Processing rows…`;
  progressDetail.textContent = `Row ${rowNum} · ${current} of ${total} complete`;
}

function addLog(type, message) {
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const classMap = { ok: 'log-ok', err: 'log-err', inf: 'log-inf', warn: 'log-warn' };
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = `<span class="log-ts">${ts}</span><span class="${classMap[type] || ''}">${escHtml(message)}</span>`;
  logBox.appendChild(entry);
  logBox.scrollTop = logBox.scrollHeight;
}

// ────────────────────────────────────────────────────────────
// 9. UTILITIES
// ────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function waitForTabLoad(tabId) {
  return new Promise(resolve => {
    function listener(id, changeInfo) {
      if (id === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

function escHtml(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(String(str)));
  return d.innerHTML;
}
