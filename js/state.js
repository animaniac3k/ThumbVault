/* =========================================================================
   TAXONOMY, STATE & SHARED UTILITIES
   ========================================================================= */
const CATEGORIES = [
  {
    id: 'coffee',
    label: 'Coffee & Snacks',
    color: '#f59e0b', // Amber
    bg: 'rgba(245, 158, 11, 0.18)',
    svg: '<path d="M18 8h1a4 4 0 0 1 0 8h-1"></path><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path><line x1="6" y1="1" x2="6" y2="4"></line><line x1="10" y1="1" x2="10" y2="4"></line><line x1="14" y1="1" x2="14" y2="4"></line>'
  },
  {
    id: 'food',
    label: 'Food & Dining',
    color: '#10b981', // Emerald
    bg: 'rgba(16, 185, 129, 0.18)',
    svg: '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path>'
  },
  {
    id: 'groceries',
    label: 'Groceries',
    color: '#06b6d4', // Cyan
    bg: 'rgba(6, 182, 212, 0.18)',
    svg: '<circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>'
  },
  {
    id: 'transit',
    label: 'Transit',
    color: '#3b82f6', // Blue
    bg: 'rgba(59, 130, 246, 0.18)',
    svg: '<rect x="3" y="3" width="18" height="15" rx="3"></rect><path d="M3 11h18"></path><path d="M6 18l-2 3"></path><path d="M18 18l2 3"></path>'
  },
  {
    id: 'shopping',
    label: 'Shopping',
    color: '#ec4899', // Pink
    bg: 'rgba(236, 72, 153, 0.18)',
    svg: '<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path>'
  },
  {
    id: 'bills',
    label: 'Bills',
    color: '#a855f7', // Purple
    bg: 'rgba(168, 85, 247, 0.18)',
    svg: '<rect x="2" y="4" width="20" height="16" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line>'
  },
  {
    id: 'misc',
    label: 'Misc',
    color: '#94a3b8', // Slate
    bg: 'rgba(148, 163, 184, 0.18)',
    svg: '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>'
  }
];

const STORAGE_KEY = 'thumbvault_expenses_v2';
const DELETED_KEY = 'thumbvault_deleted_v2';
const LAST_SYNC_KEY = 'thumbvault_last_sync';
const CURRENCY_KEY = 'thumbvault_currency';
const MONTH_START_KEY = 'thumbvault_month_start_day';
const CURRENCY_OPTIONS = ['£', '$', '€', '¥', '₹', 'kr', 'CHF'];

let expenses = [];
let deletedMap = {}; // { [txId]: deletedTimestamp } for multi-device 2-way sync
let currencySymbol = '£';
let monthStartDay = 1; // 1..31 custom billing/month cycle start day
let currentScreenIdx = 0; // 0 = Capture, 1 = History
let activeInputStr = '0';
let selectedCatId = 'coffee';
let activeHistoryFilter = 'all';
let historySearchQuery = '';

function sanitizeExpense(item) {
  if (!item || typeof item !== 'object') return null;
  const amount = Math.round(Number(item.amount) * 100) / 100;
  const timestamp = Number(item.timestamp);
  if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(timestamp)) {
    return null;
  }
  const category = CATEGORIES.some(c => c.id === item.category) ? item.category : 'misc';
  const catObj = CATEGORIES.find(c => c.id === category) || CATEGORIES[0];
  const note = String(item.note || catObj.label).trim().slice(0, 120) || catObj.label;
  const id = String(item.id || ('tx_' + timestamp + '_' + Math.random().toString(36).slice(2, 7)));
  const updatedAt = Number.isFinite(Number(item.updatedAt)) ? Number(item.updatedAt) : timestamp;
  return { id, amount, category, note, timestamp, updatedAt };
}

function sortExpenses() {
  expenses.sort((a, b) => b.timestamp - a.timestamp);
}

function loadState() {
  try {
    const savedCurr = localStorage.getItem(CURRENCY_KEY);
    if (savedCurr && savedCurr.trim()) {
      currencySymbol = savedCurr.trim().slice(0, 5);
    }
  } catch (e) {
    currencySymbol = '£';
  }

  try {
    const savedStartDay = parseInt(localStorage.getItem(MONTH_START_KEY), 10);
    if (Number.isFinite(savedStartDay) && savedStartDay >= 1 && savedStartDay <= 31) {
      monthStartDay = savedStartDay;
    }
  } catch (e) {
    monthStartDay = 1;
  }

  try {
    const rawDel = localStorage.getItem(DELETED_KEY);
    if (rawDel) {
      const parsedDel = JSON.parse(rawDel);
      if (parsedDel && typeof parsedDel === 'object') {
        deletedMap = parsedDel;
      }
    }
  } catch (e) {
    deletedMap = {};
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        expenses = parsed.map(sanitizeExpense).filter(Boolean);
        sortExpenses();
        return;
      }
    }
    expenses = [];
  } catch (e) {
    expenses = [];
  }
}

function setCurrencySymbol(sym) {
  const clean = String(sym || '').trim().slice(0, 5);
  if (!clean) return;
  triggerHaptic(10);
  currencySymbol = clean;
  try {
    localStorage.setItem(CURRENCY_KEY, currencySymbol);
  } catch (e) {}
  applyCurrencySymbolToDOM();
  renderTotals();
  renderHistoryView();
  if (typeof refreshInputDisplay === 'function') {
    refreshInputDisplay();
  }
}

function applyCurrencySymbolToDOM() {
  const activeSign = document.getElementById('activeCurrencySign');
  if (activeSign) activeSign.textContent = currencySymbol;

  const editPrefix = document.getElementById('editCurrencyPrefix');
  if (editPrefix) editPrefix.textContent = currencySymbol;

  const editLabel = document.getElementById('editAmountLabel');
  if (editLabel) editLabel.textContent = `Amount (${currencySymbol})`;

  renderCurrencySelector();
}

function renderCurrencySelector() {
  const container = document.getElementById('currencyPillsContainer');
  if (!container) return;
  container.innerHTML = '';

  CURRENCY_OPTIONS.forEach(sym => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `currency-pill-btn ${sym === currencySymbol ? 'selected' : ''}`;
    btn.textContent = sym;
    btn.onclick = () => setCurrencySymbol(sym);
    container.appendChild(btn);
  });

  populateMonthStartSelect();
}

function getOrdinalSuffix(n) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

function populateMonthStartSelect() {
  const select = document.getElementById('monthStartDaySelect');
  if (!select) return;
  if (select.options.length === 0) {
    for (let d = 1; d <= 31; d++) {
      const opt = document.createElement('option');
      opt.value = String(d);
      opt.textContent = d === 1 ? '1st of month (Default)' : `${getOrdinalSuffix(d)} of month`;
      select.appendChild(opt);
    }
  }
  select.value = String(monthStartDay);
}

function setMonthStartDay(val) {
  const parsed = parseInt(val, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 31) return;
  triggerHaptic(10);
  monthStartDay = parsed;
  try {
    localStorage.setItem(MONTH_START_KEY, String(monthStartDay));
  } catch (e) {}
  renderTotals();
  renderHistoryView();
  showToast(`Month cycle starts on the ${getOrdinalSuffix(monthStartDay)}`);
}

function saveState() {
  try {
    sortExpenses();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
    localStorage.setItem(DELETED_KEY, JSON.stringify(deletedMap));
  } catch (e) {
    console.warn('LocalStorage error', e);
  }
}

function getEffectiveDayInMonth(year, monthIndex, targetDay) {
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  return Math.min(targetDay, daysInMonth);
}

function getTimeBoundaries() {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const startWeek = new Date(now.getFullYear(), now.getMonth(), diff).setHours(0, 0, 0, 0);

  const curYear = now.getFullYear();
  const curMonth = now.getMonth();
  const curBoundaryDay = getEffectiveDayInMonth(curYear, curMonth, monthStartDay);

  let startMonth;
  if (now.getDate() >= curBoundaryDay) {
    startMonth = new Date(curYear, curMonth, curBoundaryDay).getTime();
  } else {
    const prevYear = curMonth === 0 ? curYear - 1 : curYear;
    const prevMonth = curMonth === 0 ? 11 : curMonth - 1;
    const prevBoundaryDay = getEffectiveDayInMonth(prevYear, prevMonth, monthStartDay);
    startMonth = new Date(prevYear, prevMonth, prevBoundaryDay).getTime();
  }

  return { now, startToday, startWeek, startMonth };
}

function escapeHTML(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function triggerHaptic(pattern = 10) {
  if ('vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch (e) {}
  }
}

let toastTimer;
let currentToastUndoHandler = null;

function showToast(msg, undoCallback = null) {
  const toast = document.getElementById('toastBox');
  const msgEl = document.getElementById('toastMessage');
  const undoBtn = document.getElementById('toastUndoBtn');
  if (!toast || !msgEl) return;

  msgEl.textContent = msg;
  currentToastUndoHandler = undoCallback;

  if (undoBtn) {
    if (typeof undoCallback === 'function') {
      undoBtn.style.display = 'inline-block';
    } else {
      undoBtn.style.display = 'none';
    }
  }

  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    currentToastUndoHandler = null;
  }, undoCallback ? 8000 : 2400);
}

function handleToastUndo() {
  if (typeof currentToastUndoHandler === 'function') {
    const fn = currentToastUndoHandler;
    currentToastUndoHandler = null;
    const toast = document.getElementById('toastBox');
    if (toast) toast.classList.remove('show');
    clearTimeout(toastTimer);
    fn();
  }
}
