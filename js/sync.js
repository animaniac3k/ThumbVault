/* =========================================================================
   CLOUDFLARE R2 SYNC (SMART 2-WAY, PULL, PUSH) & JSON IMPORT/EXPORT
   ========================================================================= */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MiB Worker upload limit

function loadR2Config() {
  try {
    const url = localStorage.getItem('thumbvault_r2_url') || '';
    const token = localStorage.getItem('thumbvault_r2_token') || '';
    const urlEl = document.getElementById('r2EndpointInput');
    const tokEl = document.getElementById('r2TokenInput');
    if (urlEl) {
      urlEl.value = url;
      urlEl.addEventListener('change', () => {
        try { localStorage.setItem('thumbvault_r2_url', urlEl.value.trim()); } catch (e) {}
      });
    }
    if (tokEl) {
      tokEl.value = token;
      tokEl.addEventListener('change', () => {
        try { localStorage.setItem('thumbvault_r2_token', tokEl.value.trim()); } catch (e) {}
      });
    }
    updateLastSyncLabel();
  } catch (e) {}
}

function updateLastSyncLabel() {
  const statusEl = document.getElementById('r2SyncStatus');
  if (!statusEl) return;
  try {
    const ts = Number(localStorage.getItem(LAST_SYNC_KEY));
    if (Number.isFinite(ts) && ts > 0) {
      const d = new Date(ts);
      const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      statusEl.textContent = `Last sync: ${dateStr}, ${timeStr}`;
    } else {
      statusEl.textContent = 'Not synced yet';
    }
  } catch (e) {
    statusEl.textContent = '';
  }
}

function getValidatedR2Credentials() {
  const endpoint = (document.getElementById('r2EndpointInput')?.value || '').trim();
  const token = (document.getElementById('r2TokenInput')?.value || '').trim();

  if (!endpoint) {
    showToast('Please enter your Cloudflare Worker URL');
    return null;
  }
  if (!/^https:\/\//i.test(endpoint)) {
    showToast('Endpoint must start with https://');
    return null;
  }
  if (!token) {
    showToast('Please enter your Secret Key (x-vault-key)');
    return null;
  }

  try {
    localStorage.setItem('thumbvault_r2_url', endpoint);
    localStorage.setItem('thumbvault_r2_token', token);
  } catch (e) {}

  return { endpoint, token };
}

function parseRemotePayload(data) {
  if (!data) return { remoteExpenses: [], remoteDeleted: {} };
  const rawList = Array.isArray(data)
    ? data
    : (Array.isArray(data.expenses) ? data.expenses : []);
  const remoteExpenses = rawList.map(sanitizeExpense).filter(Boolean);
  const remoteDeleted = (data.deletedIds && typeof data.deletedIds === 'object' && !Array.isArray(data.deletedIds))
    ? data.deletedIds
    : {};
  return { remoteExpenses, remoteDeleted };
}

async function fetchFromR2(endpoint, token) {
  const res = await fetch(endpoint, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'x-vault-key': token
    },
    cache: 'no-store'
  });

  if (res.status === 404) {
    return { empty: true, remoteExpenses: [], remoteDeleted: {} };
  }

  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }

  const text = await res.text();
  if (!text || !text.trim()) {
    return { empty: true, remoteExpenses: [], remoteDeleted: {} };
  }

  const parsed = JSON.parse(text);
  return { empty: false, ...parseRemotePayload(parsed) };
}

async function uploadToR2(endpoint, token) {
  const now = Date.now();
  const payload = JSON.stringify({
    expenses,
    deletedIds: deletedMap,
    lastSync: now
  });

  const payloadBytes = new TextEncoder().encode(payload).length;
  if (payloadBytes > MAX_UPLOAD_BYTES) {
    throw new Error('Backup exceeds the 5 MiB per-upload limit');
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-vault-key': token
    },
    body: payload
  });

  if (!res.ok) {
    const err = new Error(`Upload failed (Status ${res.status})`);
    err.status = res.status;
    throw err;
  }

  try {
    localStorage.setItem(LAST_SYNC_KEY, String(now));
  } catch (e) {}
  updateLastSyncLabel();
}

function setR2ButtonsDisabled(disabled) {
  ['btnR2SmartSync', 'btnR2Pull', 'btnR2Push'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = disabled;
  });
}

/* 1. Smart 2-Way Sync: Fetch remote, merge by ID & updatedAt/deletedMap, and push back */
async function syncWithR2() {
  const creds = getValidatedR2Credentials();
  if (!creds) return;

  setR2ButtonsDisabled(true);
  showToast('Syncing with Cloudflare R2...');

  try {
    let remoteData = { empty: true, remoteExpenses: [], remoteDeleted: {} };
    try {
      remoteData = await fetchFromR2(creds.endpoint, creds.token);
    } catch (getErr) {
      if (getErr.status === 401 || getErr.status === 403) {
        showToast('Authentication failed (check Secret Key)');
        return;
      }
      if (getErr.status === 405) {
        // Worker only supports POST so far; fall back to pushing local state
        await uploadToR2(creds.endpoint, creds.token);
        showToast('Pushed to R2 (enable GET on Worker for 2-way sync)');
        closeModal();
        return;
      }
      throw getErr;
    }

    // Merge deleted tombstones
    const mergedDeleted = { ...deletedMap };
    for (const [delId, delTime] of Object.entries(remoteData.remoteDeleted)) {
      const ts = Number(delTime) || 0;
      if (!mergedDeleted[delId] || ts > mergedDeleted[delId]) {
        mergedDeleted[delId] = ts;
      }
    }

    // Merge expenses by ID using updatedAt timestamp
    const mergedMap = new Map();
    expenses.forEach(item => {
      const clean = sanitizeExpense(item);
      if (clean) mergedMap.set(clean.id, clean);
    });

    remoteData.remoteExpenses.forEach(remItem => {
      const existing = mergedMap.get(remItem.id);
      if (!existing || remItem.updatedAt > existing.updatedAt) {
        mergedMap.set(remItem.id, remItem);
      }
    });

    // Filter out items deleted after their last update
    const finalExpenses = [];
    for (const [id, item] of mergedMap.entries()) {
      const deletedAt = mergedDeleted[id];
      if (deletedAt && deletedAt >= item.updatedAt) {
        continue;
      }
      finalExpenses.push(item);
    }

    expenses = finalExpenses;
    deletedMap = mergedDeleted;
    saveState();
    renderTotals();
    renderHistoryView();

    await uploadToR2(creds.endpoint, creds.token);
    triggerHaptic([12, 50, 12]);
    showToast(`Synced ${expenses.length} records with R2`);
    closeModal();
  } catch (err) {
    showToast(err.message || 'Network error during R2 sync');
  } finally {
    setR2ButtonsDisabled(false);
  }
}

/* 2. Pull from R2: Overwrite local records with cloud backup */
async function pullFromR2() {
  const creds = getValidatedR2Credentials();
  if (!creds) return;

  setR2ButtonsDisabled(true);
  showToast('Fetching from Cloudflare R2...');

  try {
    const remoteData = await fetchFromR2(creds.endpoint, creds.token);
    if (remoteData.empty) {
      showToast('No backup found on R2 yet');
      return;
    }

    expenses = remoteData.remoteExpenses;
    deletedMap = remoteData.remoteDeleted;
    saveState();
    try {
      localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
    } catch (e) {}
    updateLastSyncLabel();
    renderTotals();
    renderHistoryView();
    triggerHaptic([12, 50, 12]);
    showToast(`Pulled ${expenses.length} records from R2`);
    closeModal();
  } catch (err) {
    if (err.status === 401 || err.status === 403) {
      showToast('Authentication failed (check Secret Key)');
    } else if (err.status === 405) {
      showToast('Your Worker does not allow GET requests yet');
    } else {
      showToast(err.message || 'Failed to pull from R2');
    }
  } finally {
    setR2ButtonsDisabled(false);
  }
}

/* 3. Push to R2: Overwrite cloud backup with local records */
async function pushToR2() {
  const creds = getValidatedR2Credentials();
  if (!creds) return;

  setR2ButtonsDisabled(true);
  showToast('Uploading to Cloudflare R2...');

  try {
    await uploadToR2(creds.endpoint, creds.token);
    triggerHaptic([12, 50, 12]);
    showToast(`Pushed ${expenses.length} records to R2`);
    closeModal();
  } catch (err) {
    if (err.status === 401 || err.status === 403) {
      showToast('Authentication failed (check Secret Key)');
    } else {
      showToast(err.message || 'Failed to push to R2');
    }
  } finally {
    setR2ButtonsDisabled(false);
  }
}

/* =========================================================================
   CSV GENERATION, EMAIL EXPORT & LOCAL JSON BACKUP
   ========================================================================= */
function escapeCSVField(val) {
  const str = String(val ?? '');
  if (/[",\r\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function buildExpensesCSVString() {
  const headers = ['Date', 'Time', 'Category', 'Description', 'Amount', 'Currency'];
  const rows = [headers.join(',')];

  const sorted = [...expenses].sort((a, b) => b.timestamp - a.timestamp);
  sorted.forEach(tx => {
    const d = new Date(tx.timestamp);
    const pad = (n) => String(n).padStart(2, '0');
    const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const cat = CATEGORIES.find(c => c.id === tx.category);
    const catLabel = cat ? cat.label : tx.category;

    rows.push([
      escapeCSVField(dateStr),
      escapeCSVField(timeStr),
      escapeCSVField(catLabel),
      escapeCSVField(tx.note || ''),
      tx.amount.toFixed(2),
      escapeCSVField(currencySymbol)
    ].join(','));
  });

  return rows.join('\r\n');
}

function getCSVFilename() {
  return `thumbvault_${new Date().toISOString().slice(0, 10)}.csv`;
}

function triggerCSVDownload(csvContent, filename) {
  // Prefix UTF-8 BOM so Excel / Numbers renders currency symbols (£, €, ¥) accurately
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function shareOrDownloadCSV() {
  if (expenses.length === 0) {
    showToast('No expenses to export yet');
    return;
  }

  const csvContent = buildExpensesCSVString();
  const filename = getCSVFilename();
  const totalSum = expenses.reduce((acc, item) => acc + item.amount, 0);

  // Use Web Share API Level 2 on Android / iOS to share/attach the real .csv file
  if (navigator.canShare && typeof File === 'function') {
    try {
      const file = new File(['\uFEFF' + csvContent], filename, { type: 'text/csv' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `ThumbVault Expenses (${filename})`,
          text: `ThumbVault export: ${expenses.length} records, total ${currencySymbol}${totalSum.toFixed(2)}.`
        });
        closeModal();
        showToast('Shared CSV file');
        return;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
  }

  // Fallback on desktop / unsupported browsers: download the .csv file directly
  triggerCSVDownload(csvContent, filename);
  closeModal();
  showToast('Downloaded CSV file');
}

function exportBackupJSON() {
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(expenses, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', dataStr);
  downloadAnchor.setAttribute('download', `thumbvault_${new Date().toISOString().slice(0, 10)}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  closeModal();
  showToast('Exported JSON');
}

function importBackupJSON(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const parsed = JSON.parse(evt.target.result);
      const { remoteExpenses } = parseRemotePayload(parsed);
      const isValidFormat = Array.isArray(parsed) || (parsed && Array.isArray(parsed.expenses));

      if (isValidFormat) {
        expenses = remoteExpenses;
        deletedMap = {};
        saveState();
        renderTotals();
        renderHistoryView();
        closeModal();
        showToast(`Imported ${expenses.length} records`);
      } else {
        showToast('Invalid backup file format');
      }
    } catch (err) {
      showToast('Failed to parse JSON');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function wipeAllData() {
  const now = Date.now();
  expenses.forEach(item => {
    deletedMap[item.id] = now;
  });
  expenses = [];
  saveState();
  renderTotals();
  renderHistoryView();
  closeModal();
  showToast('All records erased');
}
