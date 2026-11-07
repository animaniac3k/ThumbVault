/* =========================================================================
   SCREEN 3: PIE CHART & 2-COLUMN CATEGORY BREAKDOWN (CONCEPT B)
   ========================================================================= */
let activeChartFilter = 'month';
let selectedChartCatId = null;

function applyChartTimeFilter(flt) {
  triggerHaptic(8);
  activeChartFilter = flt;
  selectedChartCatId = null;
  ['all', 'today', 'week', 'month'].forEach(f => {
    const el = document.getElementById('chart-flt-' + f);
    if (el) el.classList.toggle('active', f === flt);
  });
  renderChartView();
}

function toggleChartCategory(catId) {
  triggerHaptic(10);
  selectedChartCatId = (selectedChartCatId === catId) ? null : catId;
  renderChartView();
}

function polarToCartesian(cx, cy, r, angleInDegrees) {
  const rad = (angleInDegrees - 90) * Math.PI / 180.0;
  return {
    x: cx + (r * Math.cos(rad)),
    y: cy + (r * Math.sin(rad))
  };
}

function createSolidSlicePath(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
}

function buildSolidPieSVG(activeStats, totalSum) {
  const size = 142;
  const cx = size / 2;
  const cy = size / 2;
  const r = 61;

  if (totalSum <= 0 || activeStats.length === 0) {
    return `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-label="No expenses in period">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="#090e1a" stroke="#1e2c45" stroke-width="2" stroke-dasharray="5,4"/>
        <text x="${cx}" y="${cy + 4}" text-anchor="middle" fill="#64748b" font-size="11" font-weight="700">No Spend</text>
      </svg>
    `;
  }

  if (activeStats.length === 1) {
    const only = activeStats[0];
    return `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Category Pie Chart">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="${only.color}" stroke="#0c1220" stroke-width="2"
          class="pie-slice" onclick="toggleChartCategory('${only.id}')"/>
      </svg>
    `;
  }

  let currentAngle = 0;
  const slicesMarkup = activeStats.map(stat => {
    const rawAngle = (stat.amount / totalSum) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + rawAngle;
    const midAngle = startAngle + rawAngle / 2;
    currentAngle = endAngle;

    const isSelected = selectedChartCatId === stat.id;
    const offset = isSelected ? 6 : 0;
    const midRad = (midAngle - 90) * Math.PI / 180.0;
    const tx = (Math.cos(midRad) * offset).toFixed(2);
    const ty = (Math.sin(midRad) * offset).toFixed(2);
    const opacity = (selectedChartCatId && !isSelected) ? '0.42' : '1';

    const d = createSolidSlicePath(cx, cy, r, startAngle, endAngle);
    return `<path d="${d}" fill="${stat.color}" stroke="#0c1220" stroke-width="1.8"
      transform="translate(${tx}, ${ty})" opacity="${opacity}"
      class="pie-slice" onclick="toggleChartCategory('${stat.id}')"/>`;
  }).join('');

  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Category Pie Chart">
      ${slicesMarkup}
    </svg>
  `;
}

function renderChartView() {
  const svgContainer = document.getElementById('pieChartSvgContainer');
  const heroTagEl = document.getElementById('chartHeroTag');
  const heroAmountEl = document.getElementById('chartHeroAmount');
  const heroSubEl = document.getElementById('chartHeroSub');
  const heroHintEl = document.getElementById('chartHeroHint');
  const gridContainer = document.getElementById('chartCategoryGrid');

  if (!svgContainer || !gridContainer) return;

  const { startToday, startWeek, startMonth } = getTimeBoundaries();

  const periodExpenses = expenses.filter(item => {
    if (activeChartFilter === 'today') return item.timestamp >= startToday;
    if (activeChartFilter === 'week') return item.timestamp >= startWeek;
    if (activeChartFilter === 'month') return item.timestamp >= startMonth;
    return true;
  });

  const totalSum = periodExpenses.reduce((acc, item) => acc + item.amount, 0);

  // Aggregate by category
  const catStats = CATEGORIES.map(cat => {
    const matching = periodExpenses.filter(x => x.category === cat.id);
    const amount = matching.reduce((acc, x) => acc + x.amount, 0);
    const pct = totalSum > 0 ? (amount / totalSum) * 100 : 0;
    return {
      ...cat,
      amount: Math.round(amount * 100) / 100,
      count: matching.length,
      pct
    };
  });

  // Sort categories by spend descending so top categories appear first in the 2-column grid
  catStats.sort((a, b) => b.amount - a.amount);

  const activeStats = catStats.filter(s => s.amount > 0);

  // If the currently selected category has 0 spend in the new filter, clear selection
  if (selectedChartCatId && !activeStats.some(s => s.id === selectedChartCatId)) {
    selectedChartCatId = null;
  }

  // 1. Render Solid Pie SVG
  svgContainer.innerHTML = buildSolidPieSVG(activeStats, totalSum);

  // 2. Render Hero Readout on Right
  const periodLabels = {
    all: 'All-Time Total',
    today: 'Today Total',
    week: 'Week Total',
    month: 'Month Total'
  };

  const selectedStat = catStats.find(s => s.id === selectedChartCatId);
  if (selectedStat) {
    heroTagEl.textContent = selectedStat.label;
    heroTagEl.style.color = selectedStat.color;
    heroAmountEl.textContent = `${currencySymbol}${selectedStat.amount.toFixed(2)}`;
    heroSubEl.textContent = `${selectedStat.pct.toFixed(1)}% of ${currencySymbol}${totalSum.toFixed(2)}`;
    heroSubEl.style.color = selectedStat.color;
    heroHintEl.textContent = `${selectedStat.count} ${selectedStat.count === 1 ? 'record' : 'records'} • Tap to reset`;
  } else {
    heroTagEl.textContent = periodLabels[activeChartFilter] || 'Period Total';
    heroTagEl.style.color = 'var(--text-dim)';
    heroAmountEl.textContent = `${currencySymbol}${totalSum.toFixed(2)}`;
    heroSubEl.textContent = `${activeStats.length} active ${activeStats.length === 1 ? 'category' : 'categories'}`;
    heroSubEl.style.color = '#34d399';
    heroHintEl.textContent = totalSum > 0 ? 'Tap slice or card to inspect' : 'No expenses in this period';
  }

  // 3. Render 2-Column Category Grid
  gridContainer.innerHTML = '';
  catStats.forEach(stat => {
    const card = document.createElement('div');
    const isSelected = selectedChartCatId === stat.id;
    const isZero = stat.amount <= 0;

    card.className = `chart-cat-card ${isSelected ? 'selected' : ''} ${isZero ? 'zero-spend' : ''}`;
    card.style.setProperty('--cat-color', stat.color);
    card.style.setProperty('--cat-bg', stat.bg);

    const pctStr = stat.amount > 0 ? `${stat.pct.toFixed(1)}%` : '0%';
    const barWidth = stat.amount > 0 ? Math.max(stat.pct, 4).toFixed(1) : '0';

    card.innerHTML = `
      <div class="chart-cat-left">
        <span class="chart-cat-dot"></span>
        <div class="chart-cat-meta">
          <span class="chart-cat-name">${stat.label}</span>
          <span class="chart-cat-pct">${pctStr} (${stat.count})</span>
        </div>
      </div>
      <div class="chart-cat-amount">${currencySymbol}${stat.amount.toFixed(2)}</div>
      <div class="chart-cat-bar" style="width: ${barWidth}%;"></div>
    `;

    card.addEventListener('click', () => {
      if (isZero) return;
      toggleChartCategory(stat.id);
    });

    gridContainer.appendChild(card);
  });
}
