(() => {
  'use strict';

  // ---------- DOM refs ----------
  const screenMain = document.getElementById('screen-main');
  const screenSettings = document.getElementById('screen-settings');
  const mainNavbar = document.getElementById('main-navbar');
  const mainScroll = document.getElementById('main-scroll');
  const triggerDot = document.getElementById('trigger-dot');
  const flashOverlay = document.getElementById('flash-overlay');
  const warpOverlay = document.getElementById('warp-overlay');
  const networkCard = document.getElementById('network-card');
  const heroIcon = document.getElementById('hero-icon');
  const zoneSettings = document.getElementById('zone-settings');

  const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  const SUITS = ['♠','♥','♦','♣'];

  // U+FE0E forces plain monochrome "text presentation" for ♥/♦ instead of
  // iOS possibly rendering them as colorful emoji glyphs that ignore CSS color.
  const TEXT_VARIANT = '︎';

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // Builds the SSID target as safe HTML with ♥/♦ colored red (matching a
  // real playing card), ♠/♣ left black. Custom free-text mode is plain
  // escaped text with no suit coloring.
  function currentTargetHTML() {
    const s = Store.getAll();
    if (s.mode === 'custom') {
      const t = (s.customText || '').trim();
      return escapeHtml(t.length ? t : '♠');
    }
    const dot = s.dotPrefix ? '.' : '';
    const isRed = (s.suit === '♥' || s.suit === '♦');
    const suitHtml = escapeHtml(s.suit + TEXT_VARIANT);
    const cls = 'suit-glyph' + (isRed ? ' suit-red' : '');
    return escapeHtml(dot + s.rank + ' ') + '<span class="' + cls + '">' + suitHtml + '</span>';
  }

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
    renderNetworkList(list);
    mainScroll.scrollTop = 0;
    mainNavbar.classList.remove('collapsed');
  }

  let flashGen = 0;

  function resetToIdle() {
    if (armTimer) { clearTimeout(armTimer); armTimer = null; }
    clearEffectTimers();
    Effect.cancelAll();
    flashGen++;
    effectState = 'idle';
    showTriggerDot(false);
    flashOverlay.classList.remove('on');
    screenMain.classList.remove('screen-warp');
    warpOverlay.classList.remove('on');
    disperseArmed = false;
    renderMainScreen();
  }

  // Brief whole-screen "signal glitch" wobble fired once partway through
  // the SSID conversion, matching the reference video's mid-effect distortion.
  const WARP_DURATION_MS = 420;
  function playScreenWarp() {
    screenMain.classList.remove('screen-warp');
    warpOverlay.classList.remove('on');
    void screenMain.offsetWidth; // force reflow so the animations can re-trigger
    screenMain.classList.add('screen-warp');
    warpOverlay.classList.add('on');
    const t = setTimeout(() => {
      screenMain.classList.remove('screen-warp');
      warpOverlay.classList.remove('on');
    }, WARP_DURATION_MS);
    effectTimers.push(t);
  }

  // Rapid full-screen black strobe played right before the SSID reveal
  // begins, matching the reference "hacker" video's flash-cut transition.
  const FLASH_PATTERN = [90, 70, 85, 65, 90, 70, 95, 75, 100, 80, 120, 90];

  function playFlash(onDone) {
    const myGen = ++flashGen;
    let i = 0;
    function step() {
      if (myGen !== flashGen) return; // superseded by a reset
      if (i >= FLASH_PATTERN.length) {
        flashOverlay.classList.remove('on');
        onDone();
        return;
      }
      flashOverlay.classList.toggle('on', i % 2 === 0);
      const t = setTimeout(step, FLASH_PATTERN[i]);
      effectTimers.push(t);
      i++;
    }
    step();
  }

  function runEffectNow() {
    effectState = 'running';
    showTriggerDot(false);
    playFlash(() => {
      if (effectState !== 'running') return; // reset happened mid-flash
      const target = currentTargetHTML();
      const handle = Effect.start(networkCard, target);
      effectTimers = effectTimers.concat(handle.timers);
      const doneTimer = setTimeout(() => {
        if (effectState === 'running') effectState = 'done';
      }, handle.totalMs + 200);
      effectTimers.push(doneTimer);
      const warpTimer = setTimeout(() => {
        if (effectState === 'running') playScreenWarp();
      }, 2200 + Math.random() * 1600);
      effectTimers.push(warpTimer);
    });
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

  // ---------- "SSID flying to everyone's phones" disperse phase ----------
  // After the card is showing, tapping the Wi-Fi icon again makes each row's
  // rank/suit text fade out one at a time (random order/timing, like the
  // conversion effect) — as if the SSID is being broadcast away. The list
  // stays scrollable throughout since this is just per-row opacity.
  const DISPERSE_DELAY_MS = 3000;
  const DISPERSE_SPREAD_MS = 6000;
  let disperseArmed = false;

  function runDisperse() {
    effectState = 'dispersed';
    const nameEls = Array.from(networkCard.querySelectorAll('.ssid-row .ssid-name'));
    nameEls.forEach((el) => {
      const delay = Math.random() * DISPERSE_SPREAD_MS;
      const t = setTimeout(() => {
        el.classList.add('vanished');
      }, delay);
      effectTimers.push(t);
    });
  }

  function canDisperse() {
    return effectState === 'running' || effectState === 'done';
  }

  function scheduleDisperse() {
    if (!canDisperse() || disperseArmed) return;
    disperseArmed = true;
    const t = setTimeout(() => {
      disperseArmed = false;
      if (canDisperse()) runDisperse();
    }, DISPERSE_DELAY_MS);
    effectTimers.push(t);
  }

  // ---------- Tap gesture recognition (single vs triple, on the Wi-Fi icon) ----------
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
        if (effectState === 'idle') {
          armEffect();
        } else if (canDisperse()) {
          scheduleDisperse();
        }
      } else if (count >= 3) {
        resetToIdle();
      }
      // count === 2 -> ambiguous, ignore intentionally
    }, TAP_WINDOW_MS);
  }

  heroIcon.addEventListener('pointerup', onTriggerZoneTap);

  // ---------- Hidden double-tap zone (bottom-right) -> settings screen ----------
  const SETTINGS_TAP_WINDOW_MS = 400;
  let settingsTapCount = 0;
  let settingsTapTimer = null;

  zoneSettings.addEventListener('pointerup', (e) => {
    e.preventDefault();
    settingsTapCount++;
    if (settingsTapTimer) clearTimeout(settingsTapTimer);
    settingsTapTimer = setTimeout(() => {
      const count = settingsTapCount;
      settingsTapCount = 0;
      settingsTapTimer = null;
      if (count === 2) enterSettings();
    }, SETTINGS_TAP_WINDOW_MS);
  });

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
  const dotSegmented = document.getElementById('dot-segmented');

  suitGrid.querySelectorAll('.suit-btn').forEach(b => {
    b.textContent = b.dataset.suit + TEXT_VARIANT;
  });

  function updateCardPreview() {
    cardPreview.innerHTML = currentTargetHTML();
  }

  function updateDotUI() {
    const on = Store.get('dotPrefix');
    dotSegmented.querySelectorAll('button').forEach(b => {
      b.classList.toggle('active', (b.dataset.dot === 'on') === on);
    });
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

  dotSegmented.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-dot]');
    if (!btn) return;
    Store.set('dotPrefix', btn.dataset.dot === 'on');
    updateDotUI();
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
    updateDotUI();
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
