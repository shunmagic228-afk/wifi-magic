(() => {
  'use strict';

  // ---------- DOM refs ----------
  const screenMain = document.getElementById('screen-main');
  const screenSettings = document.getElementById('screen-settings');
  const mainNavbar = document.getElementById('main-navbar');
  const mainScroll = document.getElementById('main-scroll');
  const triggerDot = document.getElementById('trigger-dot');
  const connectedName = document.getElementById('connected-name');
  const networkCard = document.getElementById('network-card');
  const zoneTrigger = document.getElementById('zone-trigger');
  const zoneSettings = document.getElementById('zone-settings');

  const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  const SUITS = ['♠','♥','♦','♣'];

  // ---------- Effect state machine (in-memory only; never persisted) ----------
  let effectState = 'idle'; // idle | armed | running | done
  let armTimer = null;
  let effectTimers = [];

  function clearEffectTimers() {
    effectTimers.forEach(id => clearTimeout(id));
    effectTimers = [];
  }

  function showTriggerDot(on) {
    triggerDot.classList.toggle('on', on);
  }

  function renderNetworkList(ssids) {
    networkCard.innerHTML = '';
    ssids.forEach(ssid => {
      networkCard.appendChild(Effect.makeRow(ssid));
    });
  }

  function renderMainScreen() {
    const s = Store.getAll();
    const list = (s.baseSsids && s.baseSsids.length) ? s.baseSsids : Store.DEFAULT_SSIDS;
    connectedName.textContent = list[0] || 'Network';
    renderNetworkList(list.slice(1));
    mainScroll.scrollTop = 0;
    mainNavbar.classList.remove('collapsed');
  }

  function resetToIdle() {
    if (armTimer) { clearTimeout(armTimer); armTimer = null; }
    clearEffectTimers();
    Effect.cancelAll();
    effectState = 'idle';
    showTriggerDot(false);
    renderMainScreen();
  }

  function currentTargetText() {
    const s = Store.getAll();
    if (s.mode === 'custom') {
      const t = (s.customText || '').trim();
      return t.length ? t : '♠';
    }
    return '.' + s.rank + ' ' + s.suit;
  }

  function runEffectNow() {
    effectState = 'running';
    showTriggerDot(false);
    const target = currentTargetText();
    const handle = Effect.start(networkCard, target);
    effectTimers = effectTimers.concat(handle.timers);
    const doneTimer = setTimeout(() => {
      if (effectState === 'running') effectState = 'done';
    }, handle.totalMs + 200);
    effectTimers.push(doneTimer);
  }

  function armEffect() {
    if (effectState !== 'idle') return;
    effectState = 'armed';
    showTriggerDot(true);
    const delaySec = Store.get('delaySeconds');
    armTimer = setTimeout(() => {
      armTimer = null;
      runEffectNow();
    }, delaySec * 1000);
  }

  // ---------- Tap gesture recognition (single vs triple, top-left zone) ----------
  const TAP_WINDOW_MS = 420;
  let tapCount = 0;
  let tapTimer = null;

  function onTriggerZoneTap(e) {
    e.preventDefault();
    tapCount++;
    if (tapTimer) clearTimeout(tapTimer);
    tapTimer = setTimeout(() => {
      const count = tapCount;
      tapCount = 0;
      tapTimer = null;
      if (count === 1) {
        armEffect();
      } else if (count >= 3) {
        resetToIdle();
      }
      // count === 2 -> ambiguous, ignore intentionally
    }, TAP_WINDOW_MS);
  }

  zoneTrigger.addEventListener('pointerup', onTriggerZoneTap);

  // ---------- Hidden long-press zone -> settings screen ----------
  const LONGPRESS_MS = 1400;
  let longPressTimer = null;

  function startLongPress() {
    cancelLongPress();
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      enterSettings();
    }, LONGPRESS_MS);
  }
  function cancelLongPress() {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
  }
  zoneSettings.addEventListener('pointerdown', startLongPress);
  zoneSettings.addEventListener('pointerup', cancelLongPress);
  zoneSettings.addEventListener('pointercancel', cancelLongPress);
  zoneSettings.addEventListener('pointerleave', cancelLongPress);

  // ---------- Scroll -> collapse large title ----------
  mainScroll.addEventListener('scroll', () => {
    mainNavbar.classList.toggle('collapsed', mainScroll.scrollTop > 60);
  }, { passive: true });

  // ================= Settings screen =================

  function showScreen(name) {
    screenMain.classList.toggle('active', name === 'main');
    screenSettings.classList.toggle('active', name === 'settings');
  }

  function enterSettings() {
    resetToIdle(); // settings must never be reachable mid-performance; guarantee clean state
    populateSettingsForm();
    showScreen('settings');
  }

  function exitSettings() {
    renderMainScreen();
    showScreen('main');
  }

  document.getElementById('settings-back-btn').addEventListener('click', exitSettings);

  // ---- mode segmented ----
  const modeSegmented = document.getElementById('mode-segmented');
  const blockCard = document.getElementById('block-card');
  const blockCustom = document.getElementById('block-custom');
  const modeBadge = document.getElementById('mode-badge');

  function updateModeUI(mode) {
    modeSegmented.querySelectorAll('button').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
    blockCard.classList.toggle('inactive-block', mode !== 'card');
    blockCustom.classList.toggle('inactive-block', mode !== 'custom');
    modeBadge.textContent = mode === 'card' ? '現在: トランプモード使用中' : '現在: 自由入力モード使用中';
  }

  modeSegmented.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-mode]');
    if (!btn) return;
    Store.set('mode', btn.dataset.mode);
    updateModeUI(btn.dataset.mode);
  });

  // ---- suit / rank ----
  const suitGrid = document.getElementById('suit-grid');
  const rankGrid = document.getElementById('rank-grid');
  const cardPreview = document.getElementById('card-preview');

  function updateCardPreview() {
    cardPreview.textContent = '.' + Store.get('rank') + ' ' + Store.get('suit');
  }

  function buildRankGrid() {
    rankGrid.innerHTML = '';
    RANKS.forEach(r => {
      const b = document.createElement('button');
      b.className = 'rank-btn';
      b.dataset.rank = r;
      b.textContent = r;
      rankGrid.appendChild(b);
    });
  }
  buildRankGrid();

  suitGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('.suit-btn');
    if (!btn) return;
    Store.set('suit', btn.dataset.suit);
    suitGrid.querySelectorAll('.suit-btn').forEach(b => b.classList.toggle('active', b === btn));
    updateCardPreview();
  });

  rankGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('.rank-btn');
    if (!btn) return;
    Store.set('rank', btn.dataset.rank);
    rankGrid.querySelectorAll('.rank-btn').forEach(b => b.classList.toggle('active', b === btn));
    updateCardPreview();
  });

  // ---- custom text ----
  const customTextInput = document.getElementById('custom-text');
  customTextInput.addEventListener('input', () => {
    Store.set('customText', customTextInput.value);
  });

  // ---- delay stepper ----
  const delayValueEl = document.getElementById('delay-value');
  function renderDelay() {
    const v = Store.get('delaySeconds');
    delayValueEl.innerHTML = v + '<span>秒</span>';
  }
  document.getElementById('delay-minus').addEventListener('click', () => {
    const v = Math.max(3, Store.get('delaySeconds') - 1);
    Store.set('delaySeconds', v);
    renderDelay();
  });
  document.getElementById('delay-plus').addEventListener('click', () => {
    const v = Math.min(20, Store.get('delaySeconds') + 1);
    Store.set('delaySeconds', v);
    renderDelay();
  });

  // ---- base SSID list editor (also driven by OCR import) ----
  const ocrListEl = document.getElementById('ocr-list');
  const ocrStatusEl = document.getElementById('ocr-status');

  function saveSsidListFromDom() {
    const items = Array.from(ocrListEl.querySelectorAll('.ocr-item')).map(row => {
      const checked = row.querySelector('input[type="checkbox"]').checked;
      const text = row.querySelector('input[type="text"]').value.trim();
      return { checked, text };
    }).filter(it => it.checked && it.text.length);
    Store.set('baseSsids', items.map(it => it.text));
  }

  function addSsidRow(text, checked) {
    const row = document.createElement('div');
    row.className = 'ocr-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !!checked;
    checkbox.addEventListener('change', saveSsidListFromDom);

    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.value = text;
    textInput.addEventListener('input', saveSsidListFromDom);

    const delBtn = document.createElement('button');
    delBtn.className = 'del-btn';
    delBtn.textContent = '×';
    delBtn.addEventListener('click', () => {
      row.remove();
      saveSsidListFromDom();
    });

    row.appendChild(checkbox);
    row.appendChild(textInput);
    row.appendChild(delBtn);
    ocrListEl.appendChild(row);
  }

  function renderSsidList() {
    ocrListEl.innerHTML = '';
    const list = Store.get('baseSsids') || [];
    list.forEach(ssid => addSsidRow(ssid, true));
  }

  document.getElementById('manual-ssid-add').addEventListener('click', () => {
    const input = document.getElementById('manual-ssid-input');
    const val = input.value.trim();
    if (!val) return;
    addSsidRow(val, true);
    saveSsidListFromDom();
    input.value = '';
  });

  // ---- OCR import ----
  const ocrFileInput = document.getElementById('ocr-file-input');
  ocrFileInput.addEventListener('change', async () => {
    const file = ocrFileInput.files && ocrFileInput.files[0];
    ocrFileInput.value = '';
    if (!file) return;
    ocrStatusEl.textContent = '画像を解析中…(数秒〜10秒程度かかります)';
    try {
      const { candidates } = await OCR.extractSsids(file);
      if (!candidates.length) {
        ocrStatusEl.textContent = 'SSIDらしき文字列を検出できませんでした。手入力で追加してください。';
        return;
      }
      ocrListEl.innerHTML = '';
      candidates.forEach(c => addSsidRow(c, true));
      saveSsidListFromDom();
      ocrStatusEl.textContent = candidates.length + '件のSSID候補を抽出しました。誤認識があれば修正してください。';
    } catch (err) {
      ocrStatusEl.textContent = '解析に失敗しました: ' + (err && err.message ? err.message : err);
    }
  });

  function populateSettingsForm() {
    const s = Store.getAll();
    updateModeUI(s.mode);
    suitGrid.querySelectorAll('.suit-btn').forEach(b => b.classList.toggle('active', b.dataset.suit === s.suit));
    rankGrid.querySelectorAll('.rank-btn').forEach(b => b.classList.toggle('active', b.dataset.rank === s.rank));
    updateCardPreview();
    customTextInput.value = s.customText || '';
    renderDelay();
    ocrStatusEl.textContent = '';
    renderSsidList();
  }

  // ---------- boot ----------
  renderMainScreen();
  showScreen('main');

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
})();
