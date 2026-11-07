/* =========================================================================
   LIFECYCLE INITIALIZATION, PWA, NAVIGATION & KEYBOARD
   ========================================================================= */
window.addEventListener('DOMContentLoaded', () => {
  initPWA();
  loadState();
  applyCurrencySymbolToDOM();
  buildCategoryPills();
  updateThemeCategoryUI();
  refreshInputDisplay();
  renderTotals();
  renderHistoryView();
  updateScreenInertState();
  setupSwipeGestures();
  setupInputKeyboardBehavior();
  setupPhysicalKeyboard();
  loadR2Config();
});

function initPWA() {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('./service-worker.js', { scope: './' })
      .catch(err => console.warn('Service worker registration note:', err));
  }
}

/* =========================================================================
   SWIPE & SCREEN SWITCHER NAVIGATION
   ========================================================================= */
function resetViewportScroll() {
  const viewport = document.getElementById('viewport');
  const slider = document.getElementById('screensSlider');
  if (viewport && (viewport.scrollLeft !== 0 || viewport.scrollTop !== 0)) {
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
  }
  if (slider && (slider.scrollLeft !== 0 || slider.scrollTop !== 0)) {
    slider.scrollLeft = 0;
    slider.scrollTop = 0;
  }
}

function updateScreenInertState() {
  const capturePane = document.getElementById('screenCapture');
  const historyPane = document.getElementById('screenHistory');
  const chartPane = document.getElementById('screenChart');
  if (capturePane) {
    capturePane.inert = currentScreenIdx !== 0;
    capturePane.setAttribute('aria-hidden', String(currentScreenIdx !== 0));
  }
  if (historyPane) {
    historyPane.inert = currentScreenIdx !== 1;
    historyPane.setAttribute('aria-hidden', String(currentScreenIdx !== 1));
  }
  if (chartPane) {
    chartPane.inert = currentScreenIdx !== 2;
    chartPane.setAttribute('aria-hidden', String(currentScreenIdx !== 2));
  }
  resetViewportScroll();
}

function switchScreen(idx) {
  const clampedIdx = Math.max(0, Math.min(2, idx));
  resetViewportScroll();
  const slider = document.getElementById('screensSlider');
  const stepPct = 100 / 3;
  if (slider) {
    slider.style.transform = `translateX(-${clampedIdx * stepPct}%)`;
  }
  if (clampedIdx === currentScreenIdx) return;

  if (document.activeElement && typeof document.activeElement.blur === 'function') {
    document.activeElement.blur();
  }

  triggerHaptic(8);
  currentScreenIdx = clampedIdx;
  updateScreenInertState();

  document.getElementById('tabCapture')?.classList.toggle('active', currentScreenIdx === 0);
  document.getElementById('tabHistory')?.classList.toggle('active', currentScreenIdx === 1);
  document.getElementById('tabChart')?.classList.toggle('active', currentScreenIdx === 2);

  if (currentScreenIdx === 1) {
    renderHistoryView();
  } else if (currentScreenIdx === 2) {
    renderChartView();
  }
}

function setupSwipeGestures() {
  const viewport = document.getElementById('viewport');
  const slider = document.getElementById('screensSlider');
  if (!viewport || !slider) return;

  let startX = 0;
  let startY = 0;
  let currentDeltaX = 0;
  let isHorizontal = false;
  let isTouching = false;

  viewport.addEventListener('touchstart', (e) => {
    if (e.target.closest('#catCarousel') || e.target.closest('input') || e.target.closest('.modal-backdrop')) {
      return;
    }
    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    currentDeltaX = 0;
    isHorizontal = false;
    isTouching = true;
    slider.classList.add('no-anim');
  }, { passive: true });

  viewport.addEventListener('touchmove', (e) => {
    if (!isTouching) return;
    const touch = e.touches[0];
    const diffX = touch.clientX - startX;
    const diffY = touch.clientY - startY;

    if (!isHorizontal) {
      if (Math.abs(diffX) > 10 && Math.abs(diffX) > Math.abs(diffY)) {
        isHorizontal = true;
      } else if (Math.abs(diffY) > 10) {
        isTouching = false;
        slider.classList.remove('no-anim');
        return;
      }
    }

    if (isHorizontal) {
      currentDeltaX = diffX;
      const stepPct = 100 / 3;
      const baseOffset = -currentScreenIdx * stepPct;
      let percentDelta = (diffX / viewport.clientWidth) * stepPct;
      if ((currentScreenIdx === 0 && diffX > 0) || (currentScreenIdx === 2 && diffX < 0)) {
        percentDelta *= 0.3;
      }
      slider.style.transform = `translateX(${baseOffset + percentDelta}%)`;
    }
  }, { passive: true });

  const endTouch = () => {
    if (!isTouching) return;
    isTouching = false;
    slider.classList.remove('no-anim');

    const stepPct = 100 / 3;
    const threshold = 55;
    if (currentDeltaX < -threshold && currentScreenIdx < 2) {
      switchScreen(currentScreenIdx + 1);
    } else if (currentDeltaX > threshold && currentScreenIdx > 0) {
      switchScreen(currentScreenIdx - 1);
    } else {
      slider.style.transform = `translateX(-${currentScreenIdx * stepPct}%)`;
    }
    currentDeltaX = 0;
  };

  viewport.addEventListener('touchend', endTouch);
  viewport.addEventListener('touchcancel', endTouch);
}

/* =========================================================================
   OPTIONS MODAL & KEYBOARD CONTROLS
   ========================================================================= */
function openModal() {
  updateLastSyncLabel();
  document.getElementById('optionsModal')?.classList.add('open');
}

function closeModal() {
  document.getElementById('optionsModal')?.classList.remove('open');
}

function closeModalOnBackdrop(e) {
  if (e.target.id === 'optionsModal') {
    closeModal();
  }
}

function isAnyModalOpen() {
  return Boolean(
    document.getElementById('optionsModal')?.classList.contains('open') ||
    document.getElementById('editModal')?.classList.contains('open')
  );
}

function setupInputKeyboardBehavior() {
  // Prevent browser focus-into-view from scrolling the overflow:hidden viewport/slider
  const viewport = document.getElementById('viewport');
  const slider = document.getElementById('screensSlider');
  if (viewport) viewport.addEventListener('scroll', resetViewportScroll, { passive: true });
  if (slider) slider.addEventListener('scroll', resetViewportScroll, { passive: true });

  // Make the on-screen keyboard action button (Done / Next / -> / Enter) cleanly dismiss
  // the keyboard and preserve the typed value rather than jumping to off-screen inputs.
  const inputIds = [
    'txNoteInput',
    'historySearch',
    'editAmountInput',
    'editNoteInput',
    'r2EndpointInput',
    'r2TokenInput'
  ];

  inputIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'Tab' || e.keyCode === 13 || e.keyCode === 9) {
        e.preventDefault();
        e.stopPropagation();
        el.blur();
        resetViewportScroll();
      }
    });
  });
}

function setupPhysicalKeyboard() {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
      closeEditModal();
      return;
    }

    const activeTag = document.activeElement ? document.activeElement.tagName : '';
    if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') {
      return;
    }
    if (isAnyModalOpen()) {
      return;
    }

    if (e.key >= '0' && e.key <= '9' && currentScreenIdx === 0) {
      pressDigit(e.key);
    } else if (e.key === '.' && currentScreenIdx === 0) {
      pressDigit('.');
    } else if (e.key === 'Backspace' && currentScreenIdx === 0) {
      pressBackspace();
    } else if (e.key === 'Enter' && currentScreenIdx === 0) {
      commitRecord();
    } else if (e.key === 'ArrowRight') {
      if (currentScreenIdx < 2) switchScreen(currentScreenIdx + 1);
    } else if (e.key === 'ArrowLeft') {
      if (currentScreenIdx > 0) switchScreen(currentScreenIdx - 1);
    }
  });
}
