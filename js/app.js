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

  // U+FE0F (VS16) forces the colorful native emoji presentation for
  // ♠/♥/♦/♣ (Apple's built-in card-suit emoji glyphs/colors) instead of
  // the plain monochrome text glyph.
  const EMOJI_VARIANT = '️';

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // Builds the SSID target as safe HTML using the native colored suit emoji
  // (its color comes from the OS emoji font, not CSS). Custom free-text
  // mode is plain escaped text with no suit styling.
  function currentTargetHTML() {
    const s = Store.getAll();
    if (s.mode === 'custom') {
      const t = (s.customText || '').trim();
      return escapeHtml(t.length ? t : '♠');
    }
    const dot = s.dotPrefix ? '.' : '';
    const suitHtml = escapeHtml(s.suit + EMOJI_VARIANT);
    return escapeHtml(dot) + '<span class="suit-glyph">' + suitHtml + '</span>' + escapeHtml(s.rank);
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
  let bugGen = 0;

  function resetToIdle() {
    if (armTimer) { clearTimeout(armTimer); armTimer = null; }
    clearEffectTimers();
    Effect.cancelAll();
    flashGen++;
    bugGen++;
    clearBugGhosts();
    effectState = 'idle';
    showTriggerDot(false);
    flashOverlay.classList.remove('on');
    screenMain.classList.remove('screen-warp');
    warpOverlay.classList.remove('on');
    disperseArmed = false;
    renderMainScreen();
  }

  // Pre-conversion "screen bug": short, randomly-timed glitch pulses hit
  // random rows/header elements — each pulse dims+desaturates the real
  // element in place and overlays a translucent, slightly offset clone of
  // it (a local double-exposure stutter), then removes the clone and
  // un-dims. Targets the real elements at their live position each pulse
  // (getBoundingClientRect), so it looks correct regardless of scroll.
  const BUG_DURATION_MS = 2800;
  const BUG_PULSE_GAP_MIN = 50, BUG_PULSE_GAP_MAX = 150;
  const BUG_PULSE_LEN_MIN = 90, BUG_PULSE_LEN_MAX = 220;
  let bugGhosts = [];

  function clearBugGhosts() {
    bugGhosts.forEach(g => g.remove());
    bugGhosts = [];
    document.querySelectorAll('.bug-dim').forEach(el => el.classList.remove('bug-dim'));
  }

  function bugCandidates() {
    return [
      heroIcon,
      document.querySelector('.hero-title'),
      document.querySelector('.hero-desc'),
      document.querySelector('#main-scroll .section-title'),
      ...Array.from(document.querySelectorAll('#main-scroll .row'))
    ].filter(Boolean);
  }

  function spawnBugGhost(el) {
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const clone = el.cloneNode(true);
    clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    clone.className = (clone.className ? clone.className + ' ' : '') + 'bug-ghost';
    const dx = (Math.random() - 0.5) * 16;
    const dy = 5 + Math.random() * 11;
    clone.style.left = (rect.left + dx) + 'px';
    clone.style.top = (rect.top + dy) + 'px';
    clone.style.width = rect.width + 'px';
    clone.style.height = rect.height + 'px';
    document.body.appendChild(clone);
    return clone;
  }

  function playBugGlitch(durationMs) {
    const myGen = ++bugGen;
    const start = performance.now();

    function pulse() {
      if (myGen !== bugGen) return;
      if (performance.now() - start >= durationMs) return;

      const candidates = bugCandidates();
      if (candidates.length) {
        const runStart = Math.floor(Math.random() * candidates.length);
        const runLen = 1 + Math.floor(Math.random() * 4);
        const targets = candidates.slice(runStart, runStart + runLen);
        const pulseMs = BUG_PULSE_LEN_MIN + Math.random() * (BUG_PULSE_LEN_MAX - BUG_PULSE_LEN_MIN);

        targets.forEach(el => {
          el.classList.add('bug-dim');
          const ghost = spawnBugGhost(el);
          if (ghost) bugGhosts.push(ghost);
          const t = setTimeout(() => {
            if (myGen !== bugGen) return;
            el.classList.remove('bug-dim');
            if (ghost) {
              ghost.remove();
              bugGhosts = bugGhosts.filter(g => g !== ghost);
            }
          }, pulseMs);
          effectTimers.push(t);
        });
      }

      const gap = BUG_PULSE_GAP_MIN + Math.random() * (BUG_PULSE_GAP_MAX - BUG_PULSE_GAP_MIN);
      const t = setTimeout(pulse, gap);
      effectTimers.push(t);
    }
    pulse();
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
      // The screen-bug glitch plays alone first (matching the reference:
      // no SSID scrambling happens until it's done), then the SSID
      // conversion begins. The screen-warp wobble fires once during this
      // pre-conversion bug phase (not during the SSID conversion).
      playBugGlitch(BUG_DURATION_MS);
      const warpTimer = setTimeout(() => {
        if (effectState === 'running') playScreenWarp();
      }, 700 + Math.random() * 1300);
      effectTimers.push(warpTimer);
      const bugDoneTimer = setTimeout(() => {
        if (effectState !== 'running') return;
        const target = currentTargetHTML();
        const handle = Effect.start(networkCard, target);
        effectTimers = effectTimers.concat(handle.timers);
        const doneTimer = setTimeout(() => {
          if (effectState === 'running') effectState = 'done';
        }, handle.totalMs + 200);
        effectTimers.push(doneTimer);
      }, BUG_DURATION_MS);
      effectTimers.push(bugDoneTimer);
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
  const DISPERSE_SPREAD_MS = 6000;
  let disperseArmed = false;

  function runDisperse() {
    effectState = 'dispersed';
    showTriggerDot(false);
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
    showTriggerDot(true);
    const delayMs = Store.get('disperseDelaySeconds') * 1000;
    const t = setTimeout(() => {
      disperseArmed = false;
      if (canDisperse()) runDisperse();
    }, delayMs);
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
    b.textContent = b.dataset.suit + EMOJI_VARIANT;
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

  // ---- disperse delay stepper ----
  const disperseDelayValueEl = document.getElementById('disperse-delay-value');
  function renderDisperseDelay() {
    const v = Store.get('disperseDelaySeconds');
    disperseDelayValueEl.innerHTML = v + '<span>秒</span>';
  }
  document.getElementById('disperse-delay-minus').addEventListener('click', () => {
    const v = Math.max(3, Store.get('disperseDelaySeconds') - 1);
    Store.set('disperseDelaySeconds', v);
    renderDisperseDelay();
  });
  document.getElementById('disperse-delay-plus').addEventListener('click', () => {
    const v = Math.min(20, Store.get('disperseDelaySeconds') + 1);
    Store.set('disperseDelaySeconds', v);
    renderDisperseDelay();
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
    renderDisperseDelay();
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
