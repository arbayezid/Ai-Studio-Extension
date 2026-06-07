// ============================================================
//  GEMINI AI STUDIO AUTOMATOR — content.js  v2.0
//  Runs on: aistudio.google.com
//  Handles two actions from popup:
//    1. setupStudio  — select model + inject system prompt
//    2. runPrompt    — paste input text and click Run
// ============================================================

/** Wait for a DOM element matching selector to appear */
function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);

    const observer = new MutationObserver(() => {
      const found = document.querySelector(selector);
      if (found) { observer.disconnect(); resolve(found); }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout: "${selector}" not found after ${timeout}ms`));
    }, timeout);
  });
}

/** Wait for element and check it's visible */
async function waitForVisible(selector, timeout = 10000) {
  const el = await waitForElement(selector, timeout);
  await sleep(100);
  return el;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Set value on an Angular/React-managed input or textarea
 * and fire the necessary events so the framework picks it up.
 */
function setNativeValue(el, value) {
  el.focus();
  // Select all and delete existing content first
  el.select?.();
  document.execCommand('selectAll', false, null);
  document.execCommand('delete', false, null);

  // Use execCommand to type the value (most compatible with Angular)
  document.execCommand('insertText', false, value);

  // Also dispatch raw events as fallback
  el.dispatchEvent(new Event('input',  { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

// ─────────────────────────────────────────────────────────────
// ACTION 1: setupStudio
//   · Selects AI model from the model picker
//   · Injects system prompt into the System Instructions panel
// ─────────────────────────────────────────────────────────────
async function setupStudio({ model, systemPrompt }) {
  try {
    // ── 1a. Select the model ────────────────────────────────
    await selectModel(model);
    await sleep(600);

    // ── 1b. Inject system prompt ────────────────────────────
    await injectSystemPrompt(systemPrompt);

    return { success: true, message: 'Studio configured.' };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

async function selectModel(modelValue) {
  try {
    // 1. Wait for and click model selector
    let modelBtn = null;
    const btnSelectors = [
      'button[data-test-model-selector-card]',
      'button[data-test-id="model-selector-card"]',
      'button.model-selector-card',
      'ms-model-selector button.model-selector-card'
    ];
    
    // First, try to wait for known selectors
    for (const sel of btnSelectors) {
      try {
        modelBtn = await waitForElement(sel, 1500);
        if (modelBtn) break;
      } catch (e) { /* ignore and try next */ }
    }

    // Fallback: search all buttons
    if (!modelBtn) {
      const allBtns = Array.from(document.querySelectorAll('button, [role="button"]'));
      modelBtn = allBtns.find(btn => {
        const text = btn.textContent.toLowerCase();
        // Model button should have gemini text, not be the system instruction or run button
        // and usually has a fairly long description or title
        return text.includes('gemini') && 
               !text.includes('system instruction') && 
               !text.includes('send') &&
               text.length > 5;
      });
    }

    if (!modelBtn) {
      throw new Error('Model selector button not found.');
    }

    modelBtn.click();
    await sleep(1500); // Wait for the modal/dialog to fully open

    // 1.5 Click the "All" tab/filter if present
    const dialogs = document.querySelectorAll('mat-dialog-container, mdc-dialog, [role="dialog"], [data-test-id="model-picker-dialog"]');
    const searchRoot = dialogs.length > 0 ? dialogs[dialogs.length - 1] : document;

    const filterChips = searchRoot.querySelectorAll('button[data-test-category-button], button[variant="filter-chip"]');
    const allTabBtn = Array.from(filterChips).find(btn => btn.textContent.trim().toLowerCase() === 'all');
    if (allTabBtn && allTabBtn.getAttribute('aria-selected') !== 'true') {
      allTabBtn.click();
      await sleep(600); // Wait for the list to update
    }

    // 2. Find and use the search input
    let searchInput = null;
    const searchSelectors = [
      'input[placeholder*="Search for a model" i]',
      'input[placeholder*="Search" i]',
      'input[aria-label*="Search" i]',
      'mat-dialog-container input[type="text"]',
      '[role="dialog"] input[type="text"]'
    ];
    
    for (const sel of searchSelectors) {
      searchInput = document.querySelector(sel);
      if (searchInput) break;
    }

    if (searchInput) {
      setNativeValue(searchInput, modelValue);
      await sleep(1000); // Wait for search results to filter
    }

    // 3. Find options in the dropdown/dialog
    const options = document.querySelectorAll('mat-option, .model-option, [role="option"], ms-model-item, button[role="option"], [data-test-id*="model-option"]');
    const normalize = (s) => (s || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
    const normTarget = normalize(modelValue);

    let clicked = false;
    
    // First try exact match
    for (const opt of options) {
      const text = normalize(opt.textContent);
      const val  = normalize(opt.getAttribute('value') || opt.getAttribute('data-value') || '');
      if (text === normTarget || val === normTarget) {
        opt.click();
        clicked = true;
        await sleep(500);
        break;
      }
    }
    
    // If no exact match, try includes match
    if (!clicked) {
      for (const opt of options) {
        const text = normalize(opt.textContent);
        const val  = normalize(opt.getAttribute('value') || opt.getAttribute('data-value') || '');
        if (text.includes(normTarget) || val.includes(normTarget)) {
          opt.click();
          clicked = true;
          await sleep(500);
          break;
        }
      }
    }

    // 4. Close the prompt selection box if it's still open
    const closeBtn = document.querySelector('button[aria-label="Close panel"], button[data-test-close-button], button[aria-label="Close" i]');
    if (closeBtn) {
      closeBtn.click();
      await sleep(400);
    }
  } catch (e) {
    console.warn('[Automator] Model selection skipped:', e.message);
  }
}

async function injectSystemPrompt(promptText) {
  if (!promptText) return;

  // 4. Open system prompt
  let sysBtn = null;
  try {
    sysBtn = await waitForElement('button[data-test-system-instructions-card]', 5000);
  } catch {
    // Fallback
    const allBtns = document.querySelectorAll('button');
    for (const btn of allBtns) {
      if (btn.textContent.trim().toLowerCase().includes('system instruction')) {
        sysBtn = btn;
        break;
      }
    }
  }

  if (!sysBtn) {
    throw new Error('System instructions button not found. Are you on a prompt/chat page?');
  }

  sysBtn.click();
  await sleep(700);

  // 5. Paste the prompt
  let textarea = null;
  try {
    textarea = await waitForElement('ms-system-instructions textarea[aria-label="System instructions"], textarea[aria-label="System instructions"]', 3000);
  } catch {
    // Fallback selectors if the primary one fails
    textarea = document.querySelector('ms-system-instructions textarea');
  }

  if (!textarea) {
    throw new Error('System instructions textarea not found. Panel may not have opened.');
  }

  setNativeValue(textarea, promptText);
  await sleep(300);

  // 6. Close the system prompt box
  const closeBtn = document.querySelector('button[aria-label="Close panel"], button[data-test-close-button]');
  if (closeBtn) {
    closeBtn.click();
    await sleep(300);
  }
}

// ─────────────────────────────────────────────────────────────
// ACTION 2: runPrompt
//   · Paste input text into the chat/prompt input field
//   · Click the Run / Send button
//   · Wait for the response to complete
// ─────────────────────────────────────────────────────────────
async function runPrompt({ inputText }) {
  try {
    // ── Find the prompt input area ─────────────────────────
    let inputEl = null;
    const inputSelectors = [
      'ms-prompt-input-wrapper textarea',
      'ms-autosize-textarea textarea',
      '[data-test-id="prompt-input"] textarea',
      'textarea[aria-label*="prompt" i]',
      'textarea[placeholder*="Type something" i]',
      'textarea[placeholder*="Enter a prompt" i]',
      '.input-area textarea',
      'rich-textarea .ql-editor',          // Quill editor variant
      '[contenteditable="true"][aria-label*="prompt" i]',
    ];

    for (const sel of inputSelectors) {
      try {
        inputEl = await waitForElement(sel, 2000);
        if (inputEl) break;
      } catch { /* try next */ }
    }

    if (!inputEl) {
      throw new Error('Prompt input field not found on the page.');
    }

    // Clear existing and set new value
    inputEl.focus();
    await sleep(150);
    setNativeValue(inputEl, inputText);
    await sleep(400);

    // ── Click the Run / Send button ────────────────────────
    let runBtn = null;
    const runSelectors = [
      'button[aria-label="Run"]',
      'button[aria-label="Send message"]',
      'button[aria-label*="run" i]',
      'button[data-test-id="run-button"]',
      'ms-prompt-input-wrapper button[type="submit"]',
      '.run-button',
      'button.send-button',
    ];

    for (const sel of runSelectors) {
      runBtn = document.querySelector(sel);
      if (runBtn && !runBtn.disabled) break;
    }

    if (!runBtn) {
      // Fallback: find any enabled button near the input
      const allBtns = document.querySelectorAll('button');
      for (const btn of [...allBtns].reverse()) {
        const label = (btn.getAttribute('aria-label') || '').toLowerCase();
        const text  = btn.textContent.trim().toLowerCase();
        if ((label.includes('run') || label.includes('send') || text === 'run') && !btn.disabled) {
          runBtn = btn;
          break;
        }
      }
    }

    if (!runBtn) {
      throw new Error('Run/Send button not found.');
    }

    runBtn.click();
    await sleep(500);

    // ── Wait for response to finish streaming ──────────────
    await waitForResponseComplete();

    return { success: true, message: 'Row processed.' };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

/**
 * Wait for the AI response to finish.
 * Detects a "stop generating" button disappearing, or a stable DOM period.
 */
async function waitForResponseComplete(timeout = 60000) {
  const start = Date.now();

  // Give it a moment to start generating
  await sleep(1200);

  while (Date.now() - start < timeout) {
    // Check if a "stop generating" / "stop" button is present (means still running)
    const stopBtn = document.querySelector(
      'button[aria-label*="Stop" i], button[aria-label*="stop generating" i], button[data-test-id="stop-button"]'
    );

    if (!stopBtn) {
      // No stop button → generation is done (or never started)
      await sleep(500); // Extra buffer
      return;
    }

    await sleep(600);
  }

  // Timed out — continue anyway
  console.warn('[Automator] Response wait timed out, continuing.');
}

// ─────────────────────────────────────────────────────────────
// MESSAGE LISTENER
// ─────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'setupStudio') {
    setupStudio(request)
      .then(sendResponse)
      .catch(err => sendResponse({ success: false, message: err.message }));
    return true;
  }

  if (request.action === 'runPrompt') {
    runPrompt(request)
      .then(sendResponse)
      .catch(err => sendResponse({ success: false, message: err.message }));
    return true;
  }

  // Legacy: keep backward compat
  if (request.action === 'injectSystemInstruction') {
    injectSystemPrompt(request.text)
      .then(() => sendResponse({ success: true, message: 'Injected.' }))
      .catch(err => sendResponse({ success: false, message: err.message }));
    return true;
  }
});
