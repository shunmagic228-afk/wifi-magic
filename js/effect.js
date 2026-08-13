// SSID transformation / proliferation animation, modeled on the reference
// "hacker" effect video: each row briefly glitches (magenta flash + scanline),
// dims, then reveals the target text; meanwhile new duplicate rows keep
// appearing over time so the list grows well beyond its original length.
const Effect = (() => {
  const GLITCH_MS = 250;
  const FADE_MS = 160;
  const SPREAD_MS = 4200;            // window over which original rows convert
  const PROLIFERATE_EXTRA = 34;      // extra duplicate rows appended
  const PROLIFERATE_WINDOW_MS = 6000;
  const PROLIFERATE_START_DELAY = 500;

  let generation = 0;

  // Icon paths measured/refined against a real iPhone Wi-Fi settings screenshot
  // (bold filled lock, thick banded Wi-Fi glyph, solid info circle).
  function svgLock() { return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 10V8a5 5 0 0 1 10 0v2h1.4c.72 0 1.3.58 1.3 1.3v8.4c0 .72-.58 1.3-1.3 1.3H5.6c-.72 0-1.3-.58-1.3-1.3v-8.4c0-.72.58-1.3 1.3-1.3H7Zm2 0h6V8a3 3 0 0 0-6 0v2Z"/></svg>'; }
  function svgWifi() { return '<svg viewBox="0 0 24 24" fill="none"><path d="M8.9 17.0A4.0 4.0 0 0 1 15.1 17.0" stroke="currentColor" stroke-width="2.9" stroke-linecap="round"/><path d="M6.0 14.6A7.8 7.8 0 0 1 18.0 14.6" stroke="currentColor" stroke-width="2.9" stroke-linecap="round"/><path d="M3.1 12.1A11.6 11.6 0 0 1 20.9 12.1" stroke="currentColor" stroke-width="2.9" stroke-linecap="round"/><circle cx="12" cy="19.6" r="1.55" fill="currentColor"/></svg>'; }
  function svgInfo() { return '<svg class="info-icon" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9.3" stroke="currentColor" stroke-width="2"/><rect x="11" y="10" width="2" height="7" rx="1" fill="currentColor"/><circle cx="12" cy="7.3" r="1.25" fill="currentColor"/></svg>'; }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
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

  function convertRow(nameEl, targetHtml, myGen, timers) {
    nameEl.classList.add('glitch');
    const t1 = setTimeout(() => {
      if (myGen !== generation) return;
      nameEl.classList.remove('glitch');
      nameEl.classList.add('fading');
      const t2 = setTimeout(() => {
        if (myGen !== generation) return;
        nameEl.innerHTML = targetHtml;
        nameEl.classList.remove('fading');
        nameEl.classList.add('revealed');
      }, FADE_MS);
      timers.push(t2);
    }, GLITCH_MS);
    timers.push(t1);
  }

  function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Starts the effect. `targetHtml` must be pre-escaped/trusted HTML (see
  // app.js's currentTargetHTML). Returns { generation, timers, totalMs } so
  // the caller can track completion and force-cancel via clearTimeout on reset.
  function start(container, targetHtml) {
    generation++;
    const myGen = generation;
    const timers = [];

    const nameEls = shuffled(Array.from(container.querySelectorAll('.ssid-row .ssid-name')));
    nameEls.forEach((nameEl) => {
      const delay = Math.random() * SPREAD_MS;
      const t = setTimeout(() => {
        if (myGen !== generation) return;
        convertRow(nameEl, targetHtml, myGen, timers);
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

    const convertPhaseMs = SPREAD_MS + GLITCH_MS + FADE_MS;
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
