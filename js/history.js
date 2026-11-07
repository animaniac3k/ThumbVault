/* =========================================================================
   HISTORY SCREEN: FILTERING, SWIPE-TO-DELETE & ENTRY EDITING
   ========================================================================= */
let editingTxId = null;
let editingCatId = 'coffee';

function applyTimeFilter(flt) {
  triggerHaptic(8);
  activeHistoryFilter = flt;
  ['all', 'today', 'week', 'month'].forEach(f => {
    const el = document.getElementById('flt-' + f);
    if (el) el.classList.toggle('active', f === flt);
  });
  renderHistoryView();
}

function onSearchChange() {
  const input = document.getElementById('historySearch');
  historySearchQuery = input ? input.value.toLowerCase().trim() : '';
  renderHistoryView();
}

function renderHistoryView() {
  const container = document.getElementById('historyFeed');
  const empty = document.getElementById('historyEmptyNotice');
  if (!container || !empty) return;
  container.innerHTML = '';

  const { now, startToday, startWeek, startMonth } = getTimeBoundaries();

  const filtered = expenses.filter(item => {
    let inTime = true;
    if (activeHistoryFilter === 'today') inTime = item.timestamp >= startToday;
    if (activeHistoryFilter === 'week') inTime = item.timestamp >= startWeek;
    if (activeHistoryFilter === 'month') inTime = item.timestamp >= startMonth;
    if (!inTime) return false;

    if (historySearchQuery) {
      const cat = CATEGORIES.find(c => c.id === item.category);
      const catLabel = cat ? cat.label.toLowerCase() : '';
      const noteMatch = (item.note || '').toLowerCase().includes(historySearchQuery);
      const catMatch = catLabel.includes(historySearchQuery);
      return noteMatch || catMatch;
    }
    return true;
  });

  const totalFilteredSum = filtered.reduce((acc, curr) => acc + curr.amount, 0);
  const countLabel = document.getElementById('filteredCountLabel');
  if (countLabel) {
    countLabel.textContent = `${filtered.length} ${filtered.length === 1 ? 'record' : 'records'}`;
  }
  const sumLabel = document.getElementById('filteredSumLabel');
  if (sumLabel) {
    sumLabel.textContent = `${currencySymbol}${totalFilteredSum.toFixed(2)}`;
  }

  if (filtered.length === 0) {
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';

  filtered.forEach(tx => {
    const cat = CATEGORIES.find(c => c.id === tx.category) || CATEGORIES[6];
    const dateObj = new Date(tx.timestamp);
    const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const sameYear = dateObj.getFullYear() === now.getFullYear();
    const dateStr = dateObj.toLocaleDateString([], sameYear
      ? { month: 'short', day: 'numeric' }
      : { year: 'numeric', month: 'short', day: 'numeric' }
    );

    const item = document.createElement('div');
    item.className = 'tx-item';
    item.style.setProperty('--cat-color', cat.color);
    item.style.setProperty('--cat-bg', cat.bg);

    item.innerHTML = `
      <div class="tx-left">
        <div class="tx-icon-pill">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            ${cat.svg}
          </svg>
        </div>
        <div class="tx-meta">
          <span class="tx-category-badge">${cat.label}</span>
          <span class="tx-note">${escapeHTML(tx.note)}</span>
          <span class="tx-time">${dateStr} • ${timeStr}</span>
        </div>
      </div>

      <div class="tx-right">
        <span class="tx-amount">${currencySymbol}${tx.amount.toFixed(2)}</span>
        <button type="button" class="tx-del-btn" aria-label="Delete entry" title="Delete">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    `;

    const delBtn = item.querySelector('.tx-del-btn');
    if (delBtn) {
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeTx(tx.id);
      });
    }

    let startX = 0;
    let startY = 0;
    let moved = false;
    item.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      moved = false;
    }, { passive: true });
    item.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      if (Math.abs(t.clientX - startX) > 8 || Math.abs(t.clientY - startY) > 8) {
        moved = true;
      }
    }, { passive: true });
    item.addEventListener('click', () => {
      if (moved) return;
      openEditModal(tx.id);
    });

    container.appendChild(item);
  });
}

function removeTx(id) {
  triggerHaptic(15);
  const target = expenses.find(x => x.id === id);
  if (!target) return;

  const backupItem = { ...target };
  expenses = expenses.filter(x => x.id !== id);
  deletedMap[id] = Date.now();
  saveState();
  renderTotals();
  renderHistoryView();

  showToast(`Removed ${currencySymbol}${backupItem.amount.toFixed(2)}`, () => {
    delete deletedMap[backupItem.id];
    expenses.push(backupItem);
    saveState();
    renderTotals();
    renderHistoryView();
    triggerHaptic(10);
    showToast('Restored entry');
  });
}

/* =========================================================================
   EDIT TRANSACTION MODAL
   ========================================================================= */
function toLocalDateTimeInputValue(timestamp) {
  const d = new Date(timestamp);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function openEditModal(id) {
  const tx = expenses.find(x => x.id === id);
  if (!tx) return;

  triggerHaptic(10);
  editingTxId = tx.id;
  editingCatId = tx.category;

  document.getElementById('editAmountInput').value = tx.amount.toFixed(2);
  document.getElementById('editNoteInput').value = tx.note || '';
  document.getElementById('editDateInput').value = toLocalDateTimeInputValue(tx.timestamp);

  renderEditCategoryButtons();
  document.getElementById('editModal').classList.add('open');
}

function closeEditModal() {
  editingTxId = null;
  const modal = document.getElementById('editModal');
  if (modal) modal.classList.remove('open');
}

function closeEditModalOnBackdrop(e) {
  if (e.target.id === 'editModal') {
    closeEditModal();
  }
}

function renderEditCategoryButtons() {
  const container = document.getElementById('editCatContainer');
  if (!container) return;
  container.innerHTML = '';

  CATEGORIES.forEach(cat => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `edit-cat-Grid-btn ${cat.id === editingCatId ? 'selected' : ''}`;
    btn.style.setProperty('--cat-color', cat.color);
    btn.style.setProperty('--cat-bg', cat.bg);
    btn.onclick = () => {
      triggerHaptic(8);
      editingCatId = cat.id;
      renderEditCategoryButtons();
    };
    btn.innerHTML = `
      <span class="pill-dot"></span>
      <span>${cat.label}</span>
    `;
    container.appendChild(btn);
  });
}

function saveEditedTx() {
  if (!editingTxId) return;
  const idx = expenses.findIndex(x => x.id === editingTxId);
  if (idx === -1) {
    closeEditModal();
    return;
  }

  const rawAmount = parseFloat(document.getElementById('editAmountInput').value);
  if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
    showToast('Please enter a valid amount');
    return;
  }

  const rawDate = document.getElementById('editDateInput').value;
  const parsedTime = rawDate ? new Date(rawDate).getTime() : NaN;
  const finalTimestamp = Number.isFinite(parsedTime) ? parsedTime : expenses[idx].timestamp;

  const catObj = CATEGORIES.find(c => c.id === editingCatId) || CATEGORIES[0];
  const noteRaw = document.getElementById('editNoteInput').value.trim();

  expenses[idx] = {
    ...expenses[idx],
    amount: Math.round(rawAmount * 100) / 100,
    category: editingCatId,
    note: noteRaw || catObj.label,
    timestamp: finalTimestamp,
    updatedAt: Date.now()
  };

  saveState();
  renderTotals();
  renderHistoryView();
  closeEditModal();
  triggerHaptic([12, 40, 12]);
  showToast('Entry updated');
}

function deleteFromEditModal() {
  if (!editingTxId) return;
  const idToRemove = editingTxId;
  closeEditModal();
  removeTx(idToRemove);
}
