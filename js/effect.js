// SSID transformation / proliferation animation, modeled on the reference
// "SSID変化参考.mov" video: rows convert one at a time, top to bottom (not
// randomly), each briefly scrambling to random characters before snapping
// straight to the target text — no separate dim/fade step, the reveal is
// immediate; meanwhile new duplicate rows keep appearing over time so the
// list grows well beyond its original length.
const Effect = (() => {
  const ROW_STAGGER_MIN_MS = 90;     // floor so the scramble is still readable even with many rows
  const ROW_STAGGER_MAX_MS = 900;    // ceiling so a short list doesn't drag on forever
  const PROLIFERATE_EXTRA = 34;      // extra duplicate rows appended
  const PROLIFERATE_WINDOW_MS = 9000;
  const PROLIFERATE_START_DELAY = 900;

  let generation = 0;

  // Icon paths measured/refined against a real iPhone Wi-Fi settings screenshot
  // (bold filled lock, thick banded Wi-Fi glyph, solid info circle).
  function svgLock() { return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 10V8a5 5 0 0 1 10 0v2h1.4c.72 0 1.3.58 1.3 1.3v8.4c0 .72-.58 1.3-1.3 1.3H5.6c-.72 0-1.3-.58-1.3-1.3v-8.4c0-.72.58-1.3 1.3-1.3H7Zm2 0h6V8a3 3 0 0 0-6 0v2Z"/></svg>'; }
  function svgWifi() { return '<svg viewBox="0 0 24 24" fill="none"><path d="M8.9 17.0A4.0 4.0 0 0 1 15.1 17.0" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M6.0 14.6A7.8 7.8 0 0 1 18.0 14.6" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M3.1 12.1A11.6 11.6 0 0 1 20.9 12.1" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><circle cx="12" cy="19.6" r="1.55" fill="currentColor"/></svg>'; }
  function svgInfo() { return '<svg class="info-icon" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9.3" stroke="currentColor" stroke-width="2"/><rect x="11" y="10" width="2" height="7" rx="1" fill="currentColor"/><circle cx="12" cy="7.3" r="1.25" fill="currentColor"/></svg>'; }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // "Mojibake" scramble effect: rapidly cycles a row's text through random
  // characters during the glitch window, before it resolves to the real text.
  const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_#$%&@!?*ｱｲｳｴｵｶｷｸｹｺ';
  const SCRAMBLE_STEP_MS = 45;
  function scrambleText(len) {
    let s = '';
    for (let i = 0; i < len; i++) {
      s += SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
    }
    return s;
  }

  // `html` = true means `text` is already-safe HTML (e.g. a suit-colored
  // span built by app.js) and should be inserted as-is; otherwise it is
  // treated as plain text and escaped.
  function makeRow(text, html) {
    const row = document.createElement('div');
    row.className = 'row ssid-row';
    const nameHtml = html ? text : escapeHtml(text);
    row.innerHTML =
      '<div class="ssid-name">' + nameHtml + '</div>' +
      '<div class="ssid-icons">' + svgLock() + svgWifi() + svgInfo() + '</div>';
    return row;
  }

  function convertRow(nameEl, targetHtml, myGen, timers, glitchMs) {
    const origText = nameEl.textContent;
    const scrambleLen = Math.max(4, Math.min(origText.length, 24));
    nameEl.classList.add('glitch');
    const scrambleSteps = Math.max(2, Math.round(glitchMs / SCRAMBLE_STEP_MS));
    for (let i = 1; i < scrambleSteps; i++) {
      const ts = setTimeout(() => {
        if (myGen !== generation) return;
        nameEl.textContent = scrambleText(scrambleLen);
      }, i * SCRAMBLE_STEP_MS);
      timers.push(ts);
    }
    const t1 = setTimeout(() => {
      if (myGen !== generation) return;
      nameEl.classList.remove('glitch');
      nameEl.innerHTML = targetHtml;
      nameEl.classList.add('revealed');
    }, glitchMs);
    timers.push(t1);
  }

  // Starts the effect. `targetHtml` must be pre-escaped/trusted HTML (see
  // app.js's currentTargetHTML). `convertBudgetMs` is the total time the
  // row-by-row conversion cascade should take — the per-row stagger/scramble
  // duration is derived from it (budget / row count), so the same waterfall
  // look holds at any chosen total duration. Returns { generation, timers,
  // totalMs } so the caller can track completion and force-cancel via
  // clearTimeout on reset.
  function start(container, targetHtml, convertBudgetMs) {
    generation++;
    const myGen = generation;
    const timers = [];

    const nameEls = Array.from(container.querySelectorAll('.ssid-row .ssid-name'));
    const n = nameEls.length;
    const rawStagger = n > 0 ? convertBudgetMs / n : convertBudgetMs;
    const rowStagger = Math.max(ROW_STAGGER_MIN_MS, Math.min(rawStagger, ROW_STAGGER_MAX_MS));
    const glitchMs = rowStagger;

    nameEls.forEach((nameEl, i) => {
      const delay = i * rowStagger;
      const t = setTimeout(() => {
        if (myGen !== generation) return;
        convertRow(nameEl, targetHtml, myGen, timers, glitchMs);
      }, delay);
      timers.push(t);
    });

    for (let i = 0; i < PROLIFERATE_EXTRA; i++) {
      const delay = PROLIFERATE_START_DELAY + Math.random() * PROLIFERATE_WINDOW_MS;
      const t = setTimeout(() => {
        if (myGen !== generation) return;
        const row = makeRow(targetHtml, true);
        row.classList.add('new-row');
        container.appendChild(row);
        row.querySelector('.ssid-name').classList.add('revealed');
      }, delay);
      timers.push(t);
    }

    const convertPhaseMs = Math.max(0, n - 1) * rowStagger + glitchMs;
    const proliferatePhaseMs = PROLIFERATE_START_DELAY + PROLIFERATE_WINDOW_MS;
    const totalMs = Math.max(convertPhaseMs, proliferatePhaseMs);
    return { generation: myGen, timers, totalMs };
  }

  // Invalidate any in-flight callbacks (belt-and-suspenders alongside clearTimeout).
  function cancelAll() {
    generation++;
  }

  return { start, cancelAll, makeRow };
})();
