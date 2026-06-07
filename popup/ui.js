import { els } from './dom.js';

export function setRunningUI(running) {
  els.startBtn.disabled = running;
  els.stopBtn.disabled  = !running;

  if (running) {
    els.startBtnText.classList.add('hidden');
    els.startBtnLoading.classList.remove('hidden');
  } else {
    els.startBtnText.classList.remove('hidden');
    els.startBtnLoading.classList.add('hidden');
  }
}

export function setStatus(label, stateClass) {
  els.statusBadge.textContent = label;
  els.statusBadge.className   = `status-badge status-${stateClass}`;
}

export function updateProgress(current, total, rowNum, label) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  els.progressBar.style.width = `${pct}%`;
  els.progressPct.textContent = `${pct}%`;
  els.progressLabel.textContent = label || `Processing rows…`;
  els.progressDetail.textContent = `Row ${rowNum} · ${current} of ${total} complete`;
}

export function addLog(type, message) {
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const classMap = { ok: 'log-ok', err: 'log-err', inf: 'log-inf', warn: 'log-warn' };
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = `<span class="log-ts">${ts}</span><span class="${classMap[type] || ''}">${escHtml(message)}</span>`;
  els.logBox.appendChild(entry);
  els.logBox.scrollTop = els.logBox.scrollHeight;
}

export function escHtml(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(String(str)));
  return d.innerHTML;
}

export function updateRowCountChip() {
  const s = parseInt(els.startRowInput.value, 10) || 1;
  const e = parseInt(els.endRowInput.value,   10) || 1;
  const count = Math.max(0, e - s + 1);
  els.rowCountChip.textContent = `${count} row${count !== 1 ? 's' : ''}`;
}
