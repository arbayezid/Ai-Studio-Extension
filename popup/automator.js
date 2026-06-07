import { els } from './dom.js';
import { state } from './state.js';
import { addLog, setRunningUI, setStatus, updateProgress } from './ui.js';

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
  state.isRunning = true;
  state.stopRequested = false;
  setRunningUI(true);
  setStatus('Running', 'running');
  els.logBox.classList.remove('hidden');
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
    if (state.stopRequested) {
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
  const finalLabel = state.stopRequested ? 'Stopped' : 'Complete';
  updateProgress(rows.length, rows.length, eRow, finalLabel);
  setStatus(state.stopRequested ? 'Stopped' : 'Done', state.stopRequested ? 'stopped' : 'done');
  addLog(state.stopRequested ? 'warn' : 'ok', `Automation ${finalLabel.toLowerCase()}. ${done} rows processed.`);

  state.isRunning = false;
  setRunningUI(false);
}
