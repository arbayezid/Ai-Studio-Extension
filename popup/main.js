import { els } from './dom.js';
import { state } from './state.js';
import { updateRowCountChip, addLog } from './ui.js';
import { restoreSettings, saveSettings } from './storage.js';
import { processFile, clearFile } from './file.js';
import { startAutomation } from './automator.js';
import { setRunningUI, setStatus, updateProgress, addLogRaw } from './ui.js';

document.addEventListener('DOMContentLoaded', async () => {
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

  // Restore state from background script
  chrome.runtime.sendMessage({ action: 'getState' }, (res) => {
    if (res) {
      state.isRunning = res.isRunning;
      setRunningUI(res.isRunning);
      if (res.progressState) {
        updateProgress(res.progressState.current, res.progressState.total, res.progressState.rowNum, res.progressState.label);
      }
      if (res.statusState) {
        setStatus(res.statusState.label, res.statusState.stateClass);
      }
      if (res.currentLogs && res.currentLogs.length > 0) {
        els.logBox.innerHTML = '';
        res.currentLogs.forEach(log => {
          addLogRaw(log.type, log.message, log.ts);
        });
        els.logBox.classList.remove('hidden');
        els.logBox.scrollTop = els.logBox.scrollHeight;
      }
    }
  });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'newLog') {
    els.logBox.classList.remove('hidden');
    addLogRaw(msg.log.type, msg.log.message, msg.log.ts);
  } else if (msg.action === 'progressUpdate') {
    updateProgress(msg.progressState.current, msg.progressState.total, msg.progressState.rowNum, msg.progressState.label);
  } else if (msg.action === 'statusUpdate') {
    setStatus(msg.statusState.label, msg.statusState.stateClass);
  } else if (msg.action === 'runningUpdate') {
    state.isRunning = msg.isRunning;
    setRunningUI(msg.isRunning);
  }
});

// Settings & UI bindings
els.systemPrompt.addEventListener('input', () => {
  els.promptCharCount.textContent = els.systemPrompt.value.length.toLocaleString();
  saveSettings();
});

els.modelSelect.addEventListener('change', saveSettings);
els.startRowInput.addEventListener('input', () => { updateRowCountChip(); saveSettings(); });
els.endRowInput.addEventListener('input', () => { updateRowCountChip(); saveSettings(); });

// File bindings
els.fileBrowseBtn.addEventListener('click', (e) => { e.stopPropagation(); els.fileInput.click(); });
els.fileDropZone.addEventListener('click', () => els.fileInput.click());

els.fileDropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  els.fileDropZone.classList.add('drag-over');
});
els.fileDropZone.addEventListener('dragleave', () => els.fileDropZone.classList.remove('drag-over'));
els.fileDropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  els.fileDropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) processFile(file);
});

els.fileInput.addEventListener('change', () => {
  if (els.fileInput.files[0]) processFile(els.fileInput.files[0]);
});

els.fileClearBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  clearFile();
});

// Automator bindings
els.startBtn.addEventListener('click', () => {
  startAutomation();
});

els.stopBtn.addEventListener('click', () => {
  if (!state.isRunning) return;
  chrome.runtime.sendMessage({ action: 'stopAutomation' });
  els.stopBtn.disabled = true;
});
