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

async function waitForVisible(selector, timeout = 10000) {
  const el = await waitForElement(selector, timeout);
  await sleep(100);
  return el;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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
