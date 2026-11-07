/* =========================================================================
   CAPTURE ENGINE, CATEGORY CHIPS & SUMMARY TOTALS
   ========================================================================= */
function pressDigit(char) {
  triggerHaptic(12);

  if (activeInputStr === '0' && char !== '.') {
    activeInputStr = char;
  } else {
    if (char === '.' && activeInputStr.includes('.')) return;

    if (activeInputStr.includes('.')) {
      const decimals = activeInputStr.split('.')[1];
      if (decimals && decimals.length >= 2) return;
    }

    if (activeInputStr.replace('.', '').length >= 7) return;

    activeInputStr += char;
  }
  refreshInputDisplay();
}

function pressBackspace() {
  triggerHaptic(14);
  if (activeInputStr.length <= 1) {
    activeInputStr = '0';
  } else {
    activeInputStr = activeInputStr.slice(0, -1);
  }
  refreshInputDisplay();
}

function clearInput() {
  triggerHaptic(10);
  activeInputStr = '0';
  const noteInput = document.getElementById('txNoteInput');
  if (noteInput) noteInput.value = '';
  refreshInputDisplay();
}

function refreshInputDisplay() {
  const amtEl = document.getElementById('activeAmountText');
  if (amtEl) amtEl.textContent = activeInputStr;

  const num = parseFloat(activeInputStr) || 0;
  const formatted = num % 1 === 0 ? num.toString() : num.toFixed(2);
  const recLabel = document.getElementById('recordLabel');
  if (recLabel) recLabel.textContent = `Record ${currencySymbol}${num > 0 ? formatted : '0'}`;
}

function commitRecord() {
  const noteInput = document.getElementById('txNoteInput');
  if (noteInput && document.activeElement === noteInput) {
    noteInput.blur();
  }

  const amountVal = parseFloat(activeInputStr);
  if (!amountVal || amountVal <= 0) {
    showToast('Enter an amount first');
    triggerHaptic(30);
    return;
  }

  const noteRaw = noteInput ? noteInput.value.trim() : '';
  const catObj = CATEGORIES.find(c => c.id === selectedCatId) || CATEGORIES[0];
  const now = Date.now();

  const newTx = {
    id: 'tx_' + now + '_' + Math.random().toString(36).slice(2, 6),
    amount: Math.round(amountVal * 100) / 100,
    category: selectedCatId,
    note: noteRaw || catObj.label,
    timestamp: now,
    updatedAt: now
  };

  expenses.unshift(newTx);
  saveState();

  // Reset dial state
  activeInputStr = '0';
  if (noteInput) noteInput.value = '';
  refreshInputDisplay();

  // Refresh aggregations & history screen
  renderTotals();
  renderHistoryView();
  triggerHaptic([15, 60, 15]);
  showToast(`Recorded ${currencySymbol}${newTx.amount.toFixed(2)} in ${catObj.label}`);
}

function buildCategoryPills() {
  const container = document.getElementById('catCarousel');
  if (!container) return;
  container.innerHTML = '';

  CATEGORIES.forEach(cat => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `cat-pill ${cat.id === selectedCatId ? 'selected' : ''}`;
    btn.style.setProperty('--cat-color', cat.color);
    btn.style.setProperty('--cat-bg', cat.bg);
    btn.onclick = () => selectCategory(cat.id);

    btn.innerHTML = `
      <span class="pill-dot"></span>
      <span>${cat.label}</span>
    `;
    container.appendChild(btn);
  });
}

function selectCategory(id) {
  triggerHaptic(10);
  selectedCatId = id;
  buildCategoryPills();
  updateThemeCategoryUI();
}

function updateThemeCategoryUI() {
  const cat = CATEGORIES.find(c => c.id === selectedCatId) || CATEGORIES[0];
  const card = document.getElementById('dialCard');
  if (card) {
    card.style.setProperty('--cat-color', cat.color);
    card.style.setProperty('--cat-bg', cat.bg);
  }
  const catText = document.getElementById('currentCatText');
  if (catText) catText.textContent = cat.label;
}

function renderTotals() {
  const { now, startToday, startWeek, startMonth } = getTimeBoundaries();

  let sumToday = 0;
  let countToday = 0;
  let sumWeek = 0;
  let sumMonth = 0;

  expenses.forEach(item => {
    const t = item.timestamp;
    const val = item.amount;
    if (t >= startToday) {
      sumToday += val;
      countToday++;
    }
    if (t >= startWeek) {
      sumWeek += val;
    }
    if (t >= startMonth) {
      sumMonth += val;
    }
  });

  document.getElementById('valToday').textContent = `${currencySymbol}${sumToday.toFixed(2)}`;
  document.getElementById('countToday').textContent = `${countToday} ${countToday === 1 ? 'item' : 'items'}`;
  document.getElementById('valWeek').textContent = `${currencySymbol}${sumWeek.toFixed(2)}`;
  document.getElementById('valMonth').textContent = `${currencySymbol}${sumMonth.toFixed(2)}`;

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthStartObj = new Date(startMonth);
  const labelMonthEl = document.getElementById('labelMonth');
  if (labelMonthEl) {
    labelMonthEl.textContent = monthStartDay === 1
      ? monthNames[now.getMonth()]
      : `From ${monthStartObj.getDate()} ${monthNames[monthStartObj.getMonth()]}`;
  }

  const histCountEl = document.getElementById('historyPillCount');
  if (histCountEl) {
    histCountEl.textContent = `(${expenses.length})`;
  }

  if (typeof renderChartView === 'function') {
    renderChartView();
  }
}
