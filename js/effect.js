// SSID transformation / proliferation animation, modeled on the reference
// "hacker" effect video: each row briefly glitches (magenta flash + scanline),
// dims, then reveals the target text; meanwhile new duplicate rows keep
// appearing over time so the list grows well beyond its original length.
const Effect = (() => {
  const GLITCH_MS = 340;
  const FADE_MS = 220;
  const SPREAD_MS = 9000;            // window over which original rows convert
  const PROLIFERATE_EXTRA = 34;      // extra duplicate rows appended
  const PROLIFERATE_WINDOW_MS = 11000;
  const PROLIFERATE_START_DELAY = 1200;

  let generation = 0;

  function svgLock() { return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 10V8a5 5 0 0 1 10 0v2h1.2c.66 0 1.2.54 1.2 1.2v8.6c0 .66-.54 1.2-1.2 1.2H5.8A1.2 1.2 0 0 1 4.6 19.8v-8.6C4.6 10.54 5.14 10 5.8 10H7Zm2 0h6V8a3 3 0 0 0-6 0v2Z"/></svg>'; }
  function svgWifi() { return '<svg viewBox="0 0 24 24" fill="none"><path d="M2.5 9C6 5.5 9 4 12 4C15 4 18 5.5 21.5 9" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M5.5 12.3C7.8 10 9.8 9 12 9C14.2 9 16.2 10 18.5 12.3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M8.7 15.6C10 14.3 11 13.8 12 13.8C13 13.8 14 14.3 15.3 15.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="12" cy="18.6" r="1.1" fill="currentColor"/></svg>'; }
  function svgInfo() { return '<svg class="info-icon" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><rect x="11.1" y="10.2" width="1.8" height="6.4" rx="0.9" fill="currentColor"/><circle cx="12" cy="7.6" r="1.05" fill="currentColor"/></svg>'; }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function makeRow(text) {
    const row = document.createElement('div');
    row.className = 'row ssid-row';
    row.innerHTML =
      '<div class="ssid-name">' + escapeHtml(text) + '</div>' +
      '<div class="ssid-icons">' + svgLock() + svgWifi() + svgInfo() + '</div>';
    return row;
  }

  function convertRow(nameEl, targetText, myGen, timers) {
    nameEl.classList.add('glitch');
    const t1 = setTimeout(() => {
      if (myGen !== generation) return;
      nameEl.classList.remove('glitch');
      nameEl.classList.add('fading');
      const t2 = setTimeout(() => {
        if (myGen !== generation) return;
        nameEl.textContent = targetText;
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

  // Starts the effect. Returns { generation, timers, totalMs } so the caller
  // can track completion and force-cancel via clearTimeout on reset.
  function start(container, targetText) {
    generation++;
    const myGen = generation;
    const timers = [];

    const nameEls = shuffled(Array.from(container.querySelectorAll('.ssid-row .ssid-name')));
    nameEls.forEach((nameEl) => {
      const delay = Math.random() * SPREAD_MS;
      const t = setTimeout(() => {
        if (myGen !== generation) return;
        convertRow(nameEl, targetText, myGen, timers);
      }, delay);
      timers.push(t);
    });

    for (let i = 0; i < PROLIFERATE_EXTRA; i++) {
      const delay = PROLIFERATE_START_DELAY + Math.random() * PROLIFERATE_WINDOW_MS;
      const t = setTimeout(() => {
        if (myGen !== generation) return;
        const row = makeRow(targetText);
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
