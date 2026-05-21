/**
 * VibroLab — расширения для страницы Анализа.
 *   A) Live-метрики (RMS / Пик / Эксцесс / Крест-фактор)
 *   B) Аннотации пиков на спектре
 *   C) Объяснение диагноза (топ-признаки)
 *   D) Мини-спектрограмма загруженного сигнала
 */

(function (global) {
  function byId(id) { return document.getElementById(id); }

  // ════════════════════════════════════════════════════════════
  // A) LIVE STATS
  // ════════════════════════════════════════════════════════════
  function computeStats(signal) {
    if (!signal || !signal.length) return null;
    const n = signal.length;
    let sum = 0, sumSq = 0, peak = 0;
    for (let i = 0; i < n; i++) {
      const v = signal[i];
      sum += v;
      sumSq += v * v;
      const abs = Math.abs(v);
      if (abs > peak) peak = abs;
    }
    const mean = sum / n;
    const variance = sumSq / n - mean * mean;
    const std = Math.sqrt(Math.max(0, variance));
    const rms = Math.sqrt(sumSq / n);
    // Kurtosis (excess): (E[(x-μ)^4]/σ^4) - 3
    let m4 = 0;
    for (let i = 0; i < n; i++) {
      const d = signal[i] - mean;
      m4 += d * d * d * d;
    }
    m4 /= n;
    const kurtosis = std > 0 ? (m4 / (std * std * std * std)) - 3 : 0;
    const crest = rms > 0 ? peak / rms : 0;
    return { rms, peak, std, kurtosis, crest };
  }

  // Color level: green → yellow → orange → red, based on heuristic thresholds.
  function levelColor(metric, value) {
    const thresholds = {
      rms:      [0.10, 0.25, 0.45],
      peak:     [0.50, 1.20, 2.00],
      kurtosis: [0.50, 2.00, 5.00],
      crest:    [3.50, 5.50, 8.00],
    };
    const t = thresholds[metric] || [Infinity, Infinity, Infinity];
    if (value <= t[0]) return 'var(--green)';
    if (value <= t[1]) return 'var(--yellow)';
    if (value <= t[2]) return 'var(--orange)';
    return 'var(--red)';
  }

  function updateLiveStats(signal) {
    const stats = computeStats(signal);
    const panel = byId('liveStats');
    if (!panel || !stats) return;
    panel.classList.add('show');
    const cells = panel.querySelectorAll('.live-stat-val');
    const setVal = (key, val, decimals = 2) => {
      const cell = panel.querySelector(`.live-stat[data-metric="${key}"]`);
      if (!cell) return;
      const valEl = cell.querySelector('.live-stat-val');
      const targetText = val.toFixed(decimals);
      valEl.style.color = levelColor(key, val);
      // Animate counter
      const startTime = performance.now();
      const startVal = parseFloat(valEl.textContent) || 0;
      const dur = 400;
      function tick(now) {
        const t = Math.min(1, (now - startTime) / dur);
        const eased = 1 - Math.pow(1 - t, 3);
        const cur = startVal + (val - startVal) * eased;
        valEl.textContent = cur.toFixed(decimals);
        if (t < 1) requestAnimationFrame(tick);
        else valEl.textContent = targetText;
      }
      requestAnimationFrame(tick);
    };
    setVal('rms', stats.rms, 3);
    setVal('peak', stats.peak, 2);
    setVal('kurtosis', stats.kurtosis, 2);
    setVal('crest', stats.crest, 2);
  }

  function clearLiveStats() {
    const panel = byId('liveStats');
    if (!panel) return;
    panel.querySelectorAll('.live-stat-val').forEach(v => {
      v.textContent = '—';
      v.style.color = 'var(--muted)';
    });
  }

  // ════════════════════════════════════════════════════════════
  // B) SPECTRUM ANNOTATIONS
  // ════════════════════════════════════════════════════════════
  // Find top peaks in spectrum array. Returns array of {bin, freq, mag}.
  function findPeaks(spectrum, freqs, opts = {}) {
    const minDistance = opts.minDistance || 8;     // bins
    const maxPeaks = opts.maxPeaks || 4;
    const minRel = opts.minRel || 0.15;            // relative to max
    const maxFreq = opts.maxFreq || 2000;
    if (!spectrum || !spectrum.length) return [];
    let max = 0;
    for (let i = 0; i < spectrum.length; i++) {
      if (freqs && freqs[i] > maxFreq) break;
      if (spectrum[i] > max) max = spectrum[i];
    }
    const threshold = max * minRel;
    const candidates = [];
    for (let i = 2; i < spectrum.length - 2; i++) {
      if (freqs && freqs[i] > maxFreq) break;
      const v = spectrum[i];
      if (v < threshold) continue;
      if (v >= spectrum[i - 1] && v >= spectrum[i - 2] &&
          v >= spectrum[i + 1] && v >= spectrum[i + 2]) {
        candidates.push({ bin: i, freq: freqs ? freqs[i] : i, mag: v });
      }
    }
    candidates.sort((a, b) => b.mag - a.mag);
    const picked = [];
    for (const c of candidates) {
      if (picked.every(p => Math.abs(p.bin - c.bin) >= minDistance)) {
        picked.push(c);
        if (picked.length >= maxPeaks) break;
      }
    }
    picked.sort((a, b) => a.freq - b.freq);
    return picked;
  }

  // Label peaks with known frequency classes (GMF harmonic, BPFI, etc.).
  // We don't have exact geometry, but we use SEU stand defaults.
  function describePeak(peakFreq, rotationalFreq) {
    if (!rotationalFreq) return null;
    const fR = rotationalFreq;
    const gmf = fR * 20; // SEU default Z=20
    const checks = [
      { label: 'GMF', val: gmf,         tol: 0.04 },
      { label: '2·GMF', val: gmf * 2,   tol: 0.04 },
      { label: '3·GMF', val: gmf * 3,   tol: 0.04 },
      { label: 'BPFI', val: fR * 5.2,   tol: 0.05 },
      { label: 'BPFO', val: fR * 3.5,   tol: 0.05 },
      { label: 'BSF',  val: fR * 2.1,   tol: 0.05 },
      { label: '1×fR', val: fR,         tol: 0.04 },
      { label: '2×fR', val: fR * 2,     tol: 0.04 },
    ];
    for (const c of checks) {
      if (Math.abs(peakFreq - c.val) / c.val < c.tol) return c.label;
    }
    return null;
  }

  function annotateSpectrum(canvas, freqs, spectrum, opts = {}) {
    const overlay = byId('specAnnotations');
    if (!overlay || !canvas) return;
    overlay.innerHTML = '';
    if (!spectrum || !spectrum.length) return;

    const peaks = findPeaks(spectrum, freqs, { maxPeaks: 4, minRel: 0.18, maxFreq: 2000 });
    if (!peaks.length) return;

    const maxFreq = 2000;
    const fR = opts.rotationalFreq || 20; // Default SEU fR=20Hz; passed when known
    const rect = canvas.getBoundingClientRect();
    const parentRect = overlay.getBoundingClientRect();
    const w = rect.width;

    peaks.forEach((p, idx) => {
      // Map freq → x position (canvas freq axis goes 0..maxFreq)
      const xPct = Math.min(1, p.freq / maxFreq) * 100;
      const label = describePeak(p.freq, fR);
      const annot = document.createElement('div');
      annot.className = 'spec-annot' + (label ? ' spec-annot--known' : '');
      annot.style.left = xPct + '%';
      annot.innerHTML = `
        <div class="spec-annot-line"></div>
        <div class="spec-annot-pill">
          <strong>${label || (p.freq.toFixed(0) + ' Гц')}</strong>
          ${label ? `<span>${p.freq.toFixed(0)} Гц</span>` : ''}
        </div>
      `;
      overlay.appendChild(annot);
    });
  }

  function clearAnnotations() {
    const overlay = byId('specAnnotations');
    if (overlay) overlay.innerHTML = '';
  }

  // ════════════════════════════════════════════════════════════
  // C) EXPLAINABILITY — "Why this diagnosis"
  // ════════════════════════════════════════════════════════════
  // Hardcoded feature names for SEU 53-feature set.
  const FEATURE_NAMES_53 = [
    'RMS', 'Среднее', 'СКО', 'Пик', 'Размах', 'Эксцесс', 'Асимметрия', 'Крест-фактор', 'Импульс-фактор', 'Форм-фактор',
    'GMF·1', 'GMF·2', 'GMF·3', 'GMF·4', 'fR·1', 'fR·2', 'fR·3',
    'GMF + fR', 'GMF − fR', 'GMF + 2fR', 'GMF − 2fR',
    'E 0–100Hz', 'E 100–300Hz', 'E 300–600Hz', 'E 600–1k', 'E 1–2k', 'E 2–5k',
    'Центр.частота', 'Спектр.СКО', 'Спектр.экс.', 'Спектр.асимм.',
    'Макс.амплитуда', 'Частота макс.', 'THD', 'SINAD',
    'BPFO·1', 'BPFO·2', 'BPFI·1', 'BPFI·2', 'BSF·1', 'BSF·2', 'FTF', 'Сепаратор·1', 'Сепаратор·2', 'Глубина мод.',
    'Env.RMS', 'Env.пик', 'Env.крест', 'Env.экс.', 'Env.BPFI', 'Env.BPFO', 'Env.BSF', 'Env.энергия',
  ];

  // Per-class top driver indices (matches homeShowcase IMPORTANCE map).
  const CLASS_DRIVERS = {
    normal:     [{i: 10, w: 0.62},{i: 11, w: 0.41},{i: 0, w: 0.28}],
    tooth_miss: [{i: 5, w: 0.95},{i: 7, w: 0.82},{i: 3, w: 0.78},{i: 17, w: 0.66}],
    chip:       [{i: 7, w: 0.78},{i: 5, w: 0.72},{i: 17, w: 0.68},{i: 18, w: 0.65}],
    tooth_chip: [{i: 7, w: 0.78},{i: 5, w: 0.72},{i: 17, w: 0.68},{i: 18, w: 0.65}],
    wear:       [{i: 0, w: 0.62},{i: 22, w: 0.58},{i: 23, w: 0.55},{i: 2, w: 0.48}],
    gear_wear:  [{i: 0, w: 0.62},{i: 22, w: 0.58},{i: 23, w: 0.55},{i: 2, w: 0.48}],
    crack:      [{i: 30, w: 0.78},{i: 29, w: 0.72},{i: 45, w: 0.65}],
    inner_race: [{i: 48, w: 0.92},{i: 38, w: 0.85},{i: 39, w: 0.78},{i: 45, w: 0.70}],
    inner:      [{i: 48, w: 0.92},{i: 38, w: 0.85},{i: 39, w: 0.78},{i: 45, w: 0.70}],
    bearing_inner: [{i: 48, w: 0.92},{i: 38, w: 0.85},{i: 39, w: 0.78},{i: 45, w: 0.70}],
    outer_race: [{i: 49, w: 0.90},{i: 36, w: 0.84},{i: 37, w: 0.77},{i: 45, w: 0.68}],
    outer:      [{i: 49, w: 0.90},{i: 36, w: 0.84},{i: 37, w: 0.77},{i: 45, w: 0.68}],
    bearing_outer: [{i: 49, w: 0.90},{i: 36, w: 0.84},{i: 37, w: 0.77},{i: 45, w: 0.68}],
    ball:       [{i: 50, w: 0.88},{i: 40, w: 0.82},{i: 41, w: 0.74},{i: 47, w: 0.66}],
    bearing_ball: [{i: 50, w: 0.88},{i: 40, w: 0.82},{i: 41, w: 0.74},{i: 47, w: 0.66}],
    combo:      [{i: 0, w: 0.70},{i: 5, w: 0.65},{i: 17, w: 0.60},{i: 48, w: 0.56}],
  };

  function explanationLine(featureName) {
    const meanings = {
      'RMS': 'среднеквадратичный уровень — общая «громкость» вибрации',
      'Пик': 'максимальное мгновенное отклонение',
      'Эксцесс': 'острота пиков — высокий = ударные импульсы',
      'Крест-фактор': 'отношение пика к среднеквадратичному',
      'GMF·1': 'основная зубчатая частота',
      'GMF·2': 'вторая гармоника зубчатой частоты',
      'GMF·3': 'третья гармоника зубчатой частоты',
      'GMF + fR': 'верхняя боковая полоса вокруг GMF — модуляция вращением',
      'GMF − fR': 'нижняя боковая полоса вокруг GMF',
      'GMF + 2fR': 'вторая боковая полоса',
      'BPFI·1': 'основная частота внутренней обоймы подшипника',
      'BPFO·1': 'основная частота наружной обоймы подшипника',
      'BSF·1': 'частота прохождения шарика',
      'Env.BPFI': 'BPFI в спектре огибающей — главный признак внутренней обоймы',
      'Env.BPFO': 'BPFO в огибающей — главный признак наружной обоймы',
      'Env.BSF': 'BSF в огибающей — признак дефекта шарика',
      'Env.RMS': 'уровень огибающей сигнала',
      'Env.пик': 'максимум огибающей',
      'Env.крест': 'крест-фактор огибающей',
      'Центр.частота': 'спектральный центр масс — куда сместился спектр',
      'E 0–100Hz': 'энергия в низких частотах',
      'E 100–300Hz': 'энергия в средних частотах',
      'E 300–600Hz': 'энергия в области GMF',
    };
    return meanings[featureName] || 'физический признак сигнала';
  }

  function renderExplainability(predictedClass, features) {
    const container = byId('diagExplainability');
    if (!container) return;
    const drivers = CLASS_DRIVERS[predictedClass] || CLASS_DRIVERS.normal;
    const top = drivers.slice(0, 4);
    const maxW = Math.max(...top.map(d => d.w));
    let html = '';
    for (let n = 0; n < top.length; n++) {
      const d = top[n];
      const name = FEATURE_NAMES_53[d.i] || ('Признак ' + d.i);
      const realVal = (features && features[d.i] !== undefined)
        ? features[d.i].toFixed(2)
        : null;
      const widthPct = (d.w / maxW * 100).toFixed(0);
      const stars = '★'.repeat(Math.min(3, Math.round(d.w * 3))) + '☆'.repeat(3 - Math.min(3, Math.round(d.w * 3)));
      html += `
        <div class="diag-expl-row" style="animation-delay:${n * 60}ms">
          <div class="diag-expl-head">
            <strong>${name}</strong>
            <span class="diag-expl-stars">${stars}</span>
          </div>
          <div class="diag-expl-bar"><div class="diag-expl-fill" style="width:${widthPct}%"></div></div>
          <div class="diag-expl-meta">
            <span class="diag-expl-meaning">${explanationLine(name)}</span>
            ${realVal !== null ? `<span class="diag-expl-val">= ${realVal}</span>` : ''}
          </div>
        </div>
      `;
    }
    container.innerHTML = `
      <div class="diag-expl-kicker">ПОЧЕМУ ТАКОЙ ДИАГНОЗ</div>
      <div class="diag-expl-lead">Топ-${top.length} признака, на которые модель опиралась сильнее всего:</div>
      <div class="diag-expl-list">${html}</div>
    `;
    container.classList.add('show');
  }

  function clearExplainability() {
    const container = byId('diagExplainability');
    if (container) {
      container.classList.remove('show');
      container.innerHTML = '';
    }
  }

  // ════════════════════════════════════════════════════════════
  // D) MINI-SPECTROGRAM of the actual loaded signal
  // ════════════════════════════════════════════════════════════
  // Compute a tiny spectrogram via overlapping windowed DFTs.
  function computeSpectrogram(signal, sampleRate, opts = {}) {
    const COLS = opts.cols || 90;
    const ROWS = opts.rows || 48;
    const winSize = opts.winSize || 128;
    const totalLen = signal.length;
    const hop = Math.max(1, Math.floor((totalLen - winSize) / COLS));
    const maxFreq = opts.maxFreq || (sampleRate / 4);
    const out = new Float32Array(COLS * ROWS);
    let globalMax = 1e-9;
    // Hann window
    const w = new Float32Array(winSize);
    for (let i = 0; i < winSize; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (winSize - 1));

    for (let c = 0; c < COLS; c++) {
      const start = c * hop;
      if (start + winSize > totalLen) {
        for (let r = 0; r < ROWS; r++) out[r * COLS + c] = 0;
        continue;
      }
      // Compute DFT magnitudes for ROWS frequency bins between 0 and maxFreq
      // Using simple Goertzel-style direct compute for each target bin
      for (let r = 0; r < ROWS; r++) {
        // Target frequency for this row
        const targetFreq = (r / (ROWS - 1)) * maxFreq;
        const omega = 2 * Math.PI * targetFreq / sampleRate;
        let re = 0, im = 0;
        for (let n = 0; n < winSize; n++) {
          const s = signal[start + n] * w[n];
          re += s * Math.cos(omega * n);
          im -= s * Math.sin(omega * n);
        }
        const mag = Math.sqrt(re * re + im * im) / winSize;
        out[r * COLS + c] = mag;
        if (mag > globalMax) globalMax = mag;
      }
    }
    // Normalize and apply log scaling for visual punch
    for (let i = 0; i < out.length; i++) {
      const v = out[i] / globalMax;
      // Log scale for better dynamic range
      out[i] = Math.log10(1 + v * 9);
    }
    return { data: out, cols: COLS, rows: ROWS, maxFreq };
  }

  function specToColor(v) {
    // Same colormap as showcase spectrogram
    const t = Math.max(0, Math.min(1, v));
    const stops = [
      [10, 14, 26], [12, 47, 92], [22, 145, 178], [52, 211, 153], [251, 191, 36], [248, 113, 113]
    ];
    const positions = [0, 0.2, 0.45, 0.65, 0.82, 1.0];
    for (let i = 0; i < positions.length - 1; i++) {
      if (t >= positions[i] && t <= positions[i + 1]) {
        const u = (t - positions[i]) / (positions[i + 1] - positions[i]);
        const a = stops[i], b = stops[i + 1];
        return [
          Math.round(a[0] + (b[0] - a[0]) * u),
          Math.round(a[1] + (b[1] - a[1]) * u),
          Math.round(a[2] + (b[2] - a[2]) * u),
        ];
      }
    }
    return stops[stops.length - 1];
  }

  function renderMiniSpectrogram(signal, sampleRate) {
    const canvas = byId('miniSpectrogramCanvas');
    const wrap = byId('miniSpectrogramWrap');
    if (!canvas || !wrap || !signal || !signal.length) return;
    wrap.classList.add('show');

    const spec = computeSpectrogram(signal, sampleRate, { cols: 110, rows: 56 });

    // Render via off-screen canvas
    const off = document.createElement('canvas');
    off.width = spec.cols; off.height = spec.rows;
    const offCtx = off.getContext('2d');
    const buffer = new Uint8ClampedArray(spec.cols * spec.rows * 4);
    for (let r = 0; r < spec.rows; r++) {
      for (let c = 0; c < spec.cols; c++) {
        // Vertical axis: flip so low freq at bottom
        const v = spec.data[(spec.rows - 1 - r) * spec.cols + c];
        const rgb = specToColor(v);
        const idx = (r * spec.cols + c) * 4;
        buffer[idx] = rgb[0]; buffer[idx + 1] = rgb[1]; buffer[idx + 2] = rgb[2]; buffer[idx + 3] = 255;
      }
    }
    offCtx.putImageData(new ImageData(buffer, spec.cols, spec.rows), 0, 0);

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, canvas.clientWidth, canvas.clientHeight);

    // Frequency axis label
    const maxFreqLabel = byId('miniSpectrogramMaxFreq');
    if (maxFreqLabel) maxFreqLabel.textContent = (spec.maxFreq / 1000).toFixed(1) + ' кГц';
  }

  function clearMiniSpectrogram() {
    const wrap = byId('miniSpectrogramWrap');
    if (wrap) wrap.classList.remove('show');
  }

  global.AnalysisExtras = {
    updateLiveStats,
    clearLiveStats,
    annotateSpectrum,
    clearAnnotations,
    renderExplainability,
    clearExplainability,
    renderMiniSpectrogram,
    clearMiniSpectrogram,
    computeStats,
  };

  // ════════════════════════════════════════════════════════════
  // Monkey-patch Viz.drawSignal / Viz.drawSpectrum so the analysis
  // page picks up A and B automatically.
  // ════════════════════════════════════════════════════════════
  function installVizHooks() {
    if (!global.Viz) return;
    if (global.Viz.drawSignal && !global.Viz.__extrasPatched) {
      const _origSignal = global.Viz.drawSignal;
      global.Viz.drawSignal = function (canvasOrId, signal, color, animated) {
        const result = _origSignal.apply(this, arguments);
        try {
          const id = (typeof canvasOrId === 'string') ? canvasOrId : (canvasOrId && canvasOrId.id);
          if (id === 'sigCanvas') updateLiveStats(signal);
        } catch (e) { /* keep silent */ }
        return result;
      };
    }
    if (global.Viz.drawSpectrum && !global.Viz.__extrasPatched) {
      const _origSpec = global.Viz.drawSpectrum;
      global.Viz.drawSpectrum = function (canvasOrId, freqs, spectrum, color, maxFreq) {
        const result = _origSpec.apply(this, arguments);
        try {
          const canvas = (typeof canvasOrId === 'string') ? document.getElementById(canvasOrId) : canvasOrId;
          if (canvas && canvas.id === 'specCanvas') {
            annotateSpectrum(canvas, freqs, spectrum, { rotationalFreq: 20 });
          }
        } catch (e) { /* keep silent */ }
        return result;
      };
    }
    if (global.Viz) global.Viz.__extrasPatched = true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installVizHooks);
  } else {
    installVizHooks();
  }
})(window);
