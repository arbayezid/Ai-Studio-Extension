let isRunning = false;
let stopRequested = false;
let currentLogs = [];
let progressState = { current: 0, total: 0, rowNum: 0, label: '' };
let statusState = { label: 'Idle', stateClass: 'idle' };

function broadcastState() {
  chrome.runtime.sendMessage({
    action: 'stateUpdate',
    isRunning,
    progressState,
    statusState,
    currentLogs
  }).catch(() => {});
}

function broadcastLog(type, message) {
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const log = { type, message, ts };
  currentLogs.push(log);
  if (currentLogs.length > 200) currentLogs.shift();
  chrome.runtime.sendMessage({
    action: 'newLog',
    log
  }).catch(() => {});
}

function updateProgress(current, total, rowNum, label) {
  progressState = { current, total, rowNum, label };
  chrome.runtime.sendMessage({ action: 'progressUpdate', progressState }).catch(() => {});
}

function setStatus(label, stateClass) {
  statusState = { label, stateClass };
  chrome.runtime.sendMessage({ action: 'statusUpdate', statusState }).catch(() => {});
}

function setRunningUI(running) {
  isRunning = running;
  chrome.runtime.sendMessage({ action: 'runningUpdate', isRunning }).catch(() => {});
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'getState') {
    sendResponse({ isRunning, currentLogs, progressState, statusState });
    return true;
  }
  if (msg.action === 'stopAutomation') {
    stopRequested = true;
    broadcastLog('warn', 'Stop requested — finishing current row…');
    sendResponse({ success: true });
    return true;
  }
  if (msg.action === 'startAutomation') {
    if (isRunning) {
      sendResponse({ success: false, message: 'Already running' });
      return true;
    }
    currentLogs = [];
    runAutomation(msg.payload);
    sendResponse({ success: true });
    return true;
  }
});

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

async function runAutomation({ rows, model, prompt, col, sRow, eRow }) {
  setRunningUI(true);
  stopRequested = false;
  setStatus('Running', 'running');
  broadcastLog('inf', `Starting automation: ${rows.length} rows, model "${model}"`);

  // Keep-alive to prevent Service Worker suspension during long generation times
  const keepAliveInterval = setInterval(() => {
    chrome.runtime.getPlatformInfo();
  }, 15000);

  let aiTab = null;
  try {
    const tabs = await chrome.tabs.query({ url: 'https://aistudio.google.com/*' });
    if (tabs.length > 0) {
      aiTab = tabs[0];
      await chrome.tabs.update(aiTab.id, { active: true });
    } else {
      aiTab = await chrome.tabs.create({ url: 'https://aistudio.google.com/prompts/new_chat' });
      broadcastLog('inf', 'Opening AI Studio tab…');
      await waitForTabLoad(aiTab.id);
      await sleep(2000);
    }
  } catch (e) {
    broadcastLog('err', `Could not access tabs: ${e.message}`);
    setRunningUI(false);
    clearInterval(keepAliveInterval);
    return;
  }

  // ── Step A: Setup AI Studio ──
  try {
    const setupResult = await chrome.tabs.sendMessage(aiTab.id, {
      action: 'setupStudio',
      model,
      systemPrompt: prompt,
    });
    if (setupResult && !setupResult.success) {
      broadcastLog('warn', `Setup warning: ${setupResult.message}`);
    } else {
      broadcastLog('ok', 'AI Studio configured (model + system prompt).');
    }
  } catch (e) {
    if (e.message.includes('Receiving end does not exist')) {
      broadcastLog('warn', 'Content script not ready — reload AI Studio and try again.');
    } else {
      broadcastLog('warn', `Setup issue: ${e.message}`);
    }
  }

  // ── Step B: Process each row ──
  let done = 0;
  for (let i = 0; i < rows.length; i++) {
    if (stopRequested) {
      broadcastLog('warn', `Stopped by user after ${done} rows.`);
      break;
    }

    const cellValue = String(rows[i][col] ?? '').trim();
    const globalRowNum = sRow + i;

    updateProgress(i + 1, rows.length, globalRowNum);

    if (!cellValue) {
      broadcastLog('warn', `Row ${globalRowNum}: empty cell, skipped.`);
      done++;
      continue;
    }

    broadcastLog('inf', `Row ${globalRowNum}: sending "${cellValue.slice(0, 60)}${cellValue.length > 60 ? '…' : ''}"`);

    try {
      const result = await chrome.tabs.sendMessage(aiTab.id, {
        action: 'runPrompt',
        inputText: cellValue,
      });

      if (result && result.success) {
        broadcastLog('ok', `Row ${globalRowNum}: ✓ done.`);
      } else {
        broadcastLog('err', `Row ${globalRowNum}: ${result?.message || 'Unknown error'}`);
      }
    } catch (e) {
      broadcastLog('err', `Row ${globalRowNum}: ${e.message}`);
    }

    done++;
    await sleep(500);
  }

  const finalLabel = stopRequested ? 'Stopped' : 'Complete';
  updateProgress(rows.length, rows.length, eRow, finalLabel);
  setStatus(stopRequested ? 'Stopped' : 'Done', stopRequested ? 'stopped' : 'done');
  broadcastLog(stopRequested ? 'warn' : 'ok', `Automation ${finalLabel.toLowerCase()}. ${done} rows processed.`);

  setRunningUI(false);
  clearInterval(keepAliveInterval);
}
