import { els } from './dom.js';
import { state } from './state.js';
import { addLog, updateRowCountChip, escHtml } from './ui.js';

export function clearFile() {
  state.parsedRows = [];
  els.fileInput.value = '';
  els.fileInfo.classList.add('hidden');
  els.fileDropZone.classList.remove('hidden');
  els.columnSelectorWrap.classList.add('hidden');
  els.inputColumnSelect.innerHTML = '';
  addLog('inf', 'File cleared.');
}

export async function processFile(file) {
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
    const workbook = window.XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Convert to array-of-objects (first row = headers)
    const rows = window.XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (!rows.length) {
      addLog('warn', 'File is empty or has no data rows.');
      return;
    }

    state.parsedRows = rows;

    // Populate column selector
    const columns = Object.keys(rows[0]);
    els.inputColumnSelect.innerHTML = columns
      .map(col => `<option value="${escHtml(col)}">${escHtml(col)}</option>`)
      .join('');

    // Update UI
    els.fileNameEl.textContent  = file.name;
    els.fileRowsEl.textContent  = `${rows.length} rows`;
    els.fileInfo.classList.remove('hidden');
    els.fileDropZone.classList.add('hidden');
    els.columnSelectorWrap.classList.remove('hidden');
    els.logBox.classList.remove('hidden');

    // Auto-set end row
    els.endRowInput.value = rows.length;
    updateRowCountChip();

    addLog('ok', `Loaded ${rows.length} rows, ${columns.length} columns from "${sheetName}".`);
  } catch (err) {
    addLog('err', `Parse error: ${err.message}`);
  }
}
