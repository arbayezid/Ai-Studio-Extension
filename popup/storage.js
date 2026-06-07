import { els } from './dom.js';

export function restoreSettings() {
  chrome.storage.local.get(['automatorSettings'], (res) => {
    const s = res.automatorSettings || {};
    if (s.model) els.modelSelect.value = s.model;
    if (s.systemPrompt) {
      els.systemPrompt.value = s.systemPrompt;
      els.promptCharCount.textContent = s.systemPrompt.length;
    }
    if (s.startRow) els.startRowInput.value = s.startRow;
    if (s.endRow)   els.endRowInput.value   = s.endRow;
  });
}

export function saveSettings() {
  chrome.storage.local.set({
    automatorSettings: {
      model:        els.modelSelect.value,
      systemPrompt: els.systemPrompt.value,
      startRow:     els.startRowInput.value,
      endRow:       els.endRowInput.value,
    }
  });
}
