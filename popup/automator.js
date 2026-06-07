import { els } from './dom.js';
import { state } from './state.js';
import { addLog, setRunningUI, setStatus, updateProgress } from './ui.js';

export async function startAutomation() {
  if (state.isRunning) return;

  // Validate
  const prompt = els.systemPrompt.value.trim();
  const model  = els.modelSelect.value;
  const col    = els.inputColumnSelect.value;
  const sRow   = parseInt(els.startRowInput.value, 10);
  const eRow   = parseInt(els.endRowInput.value,   10);

  if (!state.parsedRows.length) {
    addLog('err', 'No file loaded. Please load an xlsx/csv file first.');
    els.logBox.classList.remove('hidden');
    return;
  }
  if (!prompt) {
    addLog('err', 'System prompt is empty. Please enter a system instruction.');
    els.logBox.classList.remove('hidden');
    return;
  }
  if (isNaN(sRow) || isNaN(eRow) || sRow < 1 || eRow < sRow) {
    addLog('err', 'Invalid row range. Start must be ≥ 1 and ≤ End.');
    els.logBox.classList.remove('hidden');
    return;
  }

  // Get the slice of rows to process (1-indexed)
  const rows = state.parsedRows.slice(sRow - 1, eRow);

  if (!rows.length) {
    addLog('err', 'No rows in the selected range.');
    return;
  }

  els.logBox.classList.remove('hidden');

  // Send message to background script
  chrome.runtime.sendMessage({
    action: 'startAutomation',
    payload: { rows, model, prompt, col, sRow, eRow }
  });
}
