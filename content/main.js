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
