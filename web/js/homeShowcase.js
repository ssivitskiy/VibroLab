/**
 * VibroLab — wow-блоки главной страницы.
 *  1) RF-визуализатор «как голосуют 500 деревьев»
 *  2) Анимация извлечения 53 признаков из сигнала
 *  3) Slider «норма ↔ дефект» с morphing-сигналом
 */

(function () {
  const CLASSES = [
    { id: 'normal',     label: 'Норма',                 color: '#34d399', desc: 'Спокойная работа узла, без ударов. Чистые гармоники зубчатой частоты.' },
    { id: 'tooth_miss', label: 'Отсутствие зуба',       color: '#f87171', desc: 'Регулярные сильные удары при прохождении дефектной точки.' },
    { id: 'tooth_chip', label: 'Скол зуба',             color: '#fb923c', desc: 'Локальные импульсы; рост боковых полос вокруг GMF.' },
    { id: 'gear_wear',  label: 'Износ зубьев',          color: '#fbbf24', desc: 'Плавное увеличение шума, появление субгармоник.' },
    { id: 'crack',      label: 'Трещина',               color: '#a78bfa', desc: 'Резкая модуляция, переменная амплитуда.' },
    { id: 'bearing_inner', label: 'Внутренняя обойма', color: '#60a5fa', desc: 'Модуляция на BPFI при прохождении зоны нагрузки.' },
    { id: 'bearing_outer', label: 'Наружная обойма',   color: '#f472b6', desc: 'Стабильная серия импульсов на BPFO.' },
    { id: 'bearing_ball',  label: 'Дефект тела качения', color: '#22d3ee', desc: 'Модуляция на BSF, более мягкий паттерн.' },
    { id: 'combo',      label: 'Комбинированный',       color: '#fb7185', desc: 'Несколько дефектов одновременно. Сложная спектральная картина.' },
  ];

  // Voting profile per class: how 500 trees distribute votes (target class has 70-95%)
  function makeVotingProfile(currentIdx, total = 500) {
    const profile = new Array(CLASSES.length).fill(0);
    const targetShare = 0.78 + Math.random() * 0.12; // 78–90%
    profile[currentIdx] = Math.floor(total * targetShare);
    let remaining = total - profile[currentIdx];
    // distribute leftover among other classes, biased to similar ones
    const nNeighbors = 2 + Math.floor(Math.random() * 3);
    const neighbors = [];
    for (let i = 0; i < CLASSES.length; i++) {
      if (i !== currentIdx) neighbors.push(i);
    }
    // shuffle
    neighbors.sort(() => Math.random() - 0.5);
    for (let n = 0; n < neighbors.length && remaining > 0; n++) {
      const give = n < nNeighbors
        ? Math.floor(remaining * (0.35 + Math.random() * 0.4))
        : Math.floor(Math.random() * 3);
      profile[neighbors[n]] = give;
      remaining -= give;
    }
    if (remaining > 0) profile[currentIdx] += remaining;
    return profile;
  }

  // ═════════════════════════════════════════════════════════════
  // 1) RF VOTING VISUALIZER
  // ═════════════════════════════════════════════════════════════
  function initRFVoting() {
    const root = document.getElementById('rfVoting');
    if (!root) return;
    const grid = root.querySelector('.rf-grid');
    const tabs = root.querySelector('.rf-tabs');
    const winnerCount = root.querySelector('.rf-winner-count');
    const winnerLabel = root.querySelector('.rf-winner-label');
    const winnerDesc = root.querySelector('.rf-winner-desc');
    const breakdownEl = root.querySelector('.rf-breakdown');

    // Render tabs
    tabs.innerHTML = CLASSES.map((c, i) =>
      `<button class="rf-tab${i === 0 ? ' is-active' : ''}" data-rf-class="${i}" type="button">
        <span class="rf-tab-dot" style="background:${c.color}"></span>${c.label}
       </button>`
    ).join('');

    // Render 500 dots
    const dotsHtml = [];
    for (let i = 0; i < 500; i++) {
      dotsHtml.push(`<span class="rf-dot" data-idx="${i}"></span>`);
    }
    grid.innerHTML = dotsHtml.join('');
    const dots = grid.querySelectorAll('.rf-dot');

    let currentClass = 0;

    function renderVotes(targetIdx) {
      const profile = makeVotingProfile(targetIdx);
      // Assign each dot a class index based on profile counts
      const assignment = new Array(500);
      let pos = 0;
      for (let c = 0; c < profile.length; c++) {
        for (let k = 0; k < profile[c]; k++) {
          assignment[pos++] = c;
        }
      }
      // Shuffle for visual variety
      for (let i = assignment.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [assignment[i], assignment[j]] = [assignment[j], assignment[i]];
      }
      // Animate dots: stagger color change
      dots.forEach((d, i) => {
        const cls = assignment[i];
        const color = CLASSES[cls].color;
        const delay = (i / 500) * 800; // 800ms total stagger
        setTimeout(() => {
          d.style.background = color;
          d.style.boxShadow = `0 0 5px ${color}66`;
        }, delay);
      });
      // Update winner card
      winnerCount.textContent = profile[targetIdx];
      winnerLabel.textContent = CLASSES[targetIdx].label;
      winnerLabel.style.color = CLASSES[targetIdx].color;
      winnerDesc.textContent = CLASSES[targetIdx].desc;
      // Breakdown — top 3 classes
      const sorted = profile
        .map((v, i) => ({ count: v, cls: CLASSES[i] }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);
      breakdownEl.innerHTML = sorted.map(row =>
        `<div class="rf-bd-row">
          <span class="rf-bd-dot" style="background:${row.cls.color}"></span>
          <span class="rf-bd-label">${row.cls.label}</span>
          <span class="rf-bd-count">${row.count}</span>
         </div>`
      ).join('');
    }

    tabs.addEventListener('click', e => {
      const btn = e.target.closest('.rf-tab');
      if (!btn) return;
      tabs.querySelectorAll('.rf-tab').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      currentClass = parseInt(btn.dataset.rfClass, 10);
      renderVotes(currentClass);
    });

    renderVotes(currentClass);
  }

  // ═════════════════════════════════════════════════════════════
  // 2) FEATURE EXTRACTION ANIMATION
  // Three-stage flow: signal → segments → 53 numbers
  // ═════════════════════════════════════════════════════════════
  function initFeatureFlow() {
    const root = document.getElementById('featureFlow');
    if (!root) return;
    const signalCanvas = root.querySelector('.ff-signal canvas');
    const segCanvas = root.querySelector('.ff-segments canvas');
    const featGrid = root.querySelector('.ff-features-grid');
    const playBtn = root.querySelector('.ff-play-btn');
    const stepLabel = root.querySelector('.ff-step-label');

    // Generate a synthetic vibration signal: GMF + fault impulses
    function genSignal(N = 1024) {
      const sig = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const t = i / N;
        // GMF + harmonics
        sig[i] = 0.4 * Math.sin(2 * Math.PI * 30 * t)
          + 0.18 * Math.sin(2 * Math.PI * 60 * t)
          + 0.06 * Math.sin(2 * Math.PI * 90 * t);
        // light fault impulses
        const ph = (t * 6) % 1;
        if (ph < 0.04) sig[i] += 0.6 * Math.exp(-ph / 0.01);
        // noise
        sig[i] += (Math.random() - 0.5) * 0.05;
      }
      return sig;
    }

    function drawSignal(ctx, sig, color, opts = {}) {
      const w = ctx.canvas.clientWidth, h = ctx.canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = color;
      ctx.beginPath();
      const cy = h / 2;
      for (let i = 0; i < sig.length; i++) {
        const x = (i / sig.length) * w;
        const y = cy - sig[i] * h * 0.35;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      if (opts.highlight) {
        // segment dividers
        ctx.strokeStyle = 'rgba(0,229,255,0.35)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        for (let s = 1; s < 8; s++) {
          const x = (s / 8) * w;
          ctx.beginPath(); ctx.moveTo(x, 4); ctx.lineTo(x, h - 4); ctx.stroke();
        }
        ctx.setLineDash([]);
      }
    }

    // Set canvas backing store
    function fitCanvas(c) {
      const dpr = window.devicePixelRatio || 1;
      c.width = c.clientWidth * dpr;
      c.height = c.clientHeight * dpr;
      const ctx = c.getContext('2d');
      ctx.scale(dpr, dpr);
      return ctx;
    }

    const sig = genSignal();
    let sigCtx = fitCanvas(signalCanvas);
    let segCtx = fitCanvas(segCanvas);

    window.addEventListener('resize', () => {
      sigCtx = fitCanvas(signalCanvas);
      segCtx = fitCanvas(segCanvas);
      // Redraw last state
      drawSignal(sigCtx, sig, '#00e5ff');
    });

    drawSignal(sigCtx, sig, '#00e5ff');
    drawSignal(segCtx, sig, '#34d399', { highlight: true });

    // 53 feature placeholders
    const featureGroups = [
      { name: 'Время', start: 0, end: 10 },
      { name: 'Частота', start: 10, end: 45 },
      { name: 'Огибающая', start: 45, end: 53 },
    ];

    featGrid.innerHTML = '';
    for (let i = 0; i < 53; i++) {
      let groupColor = 'var(--cyan)';
      if (i >= 10) groupColor = 'var(--green)';
      if (i >= 45) groupColor = 'var(--orange)';
      const d = document.createElement('div');
      d.className = 'ff-feat-cell';
      d.style.borderColor = groupColor;
      d.dataset.idx = i;
      d.textContent = '·';
      featGrid.appendChild(d);
    }
    const featCells = featGrid.querySelectorAll('.ff-feat-cell');

    function clearFeatures() {
      featCells.forEach(c => {
        c.textContent = '·';
        c.classList.remove('is-on');
      });
    }

    function fillFeatures() {
      const finalValues = [];
      for (let i = 0; i < 53; i++) {
        // Made-up plausible feature values
        finalValues.push((Math.random() * 9.99).toFixed(2));
      }
      featCells.forEach((cell, i) => {
        const delay = i * 32;
        setTimeout(() => {
          cell.classList.add('is-on');
          cell.textContent = finalValues[i];
        }, delay);
      });
    }

    function play() {
      clearFeatures();
      stepLabel.textContent = '01 · Исходный сигнал';
      drawSignal(sigCtx, sig, '#00e5ff');
      setTimeout(() => {
        stepLabel.textContent = '02 · Сегментация по 128 точкам';
        drawSignal(segCtx, sig, '#34d399', { highlight: true });
      }, 1100);
      setTimeout(() => {
        stepLabel.textContent = '03 · 53 признака готовы';
        fillFeatures();
      }, 2200);
      setTimeout(() => {
        stepLabel.textContent = 'Готово · нажмите ▷ для повтора';
      }, 2200 + 53 * 32 + 200);
    }

    playBtn.addEventListener('click', play);

    // Autoplay on first scroll-in
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries, obs) => {
        entries.forEach(e => { if (e.isIntersecting) { play(); obs.unobserve(e.target); } });
      }, { threshold: 0.3 });
      io.observe(root);
    } else {
      play();
    }
  }

  // ═════════════════════════════════════════════════════════════
  // 3) NORM vs FAULT slider — morphing signal
  // ═════════════════════════════════════════════════════════════
  function initFaultSlider() {
    const root = document.getElementById('faultSlider');
    if (!root) return;
    const slider = root.querySelector('input[type="range"]');
    const tabs = root.querySelector('.fs-tabs');
    const valueLabel = root.querySelector('.fs-value');
    const wfCanvas = root.querySelector('.fs-waveform');
    const sgCanvas = root.querySelector('.fs-spectrum');
    const verdictEl = root.querySelector('.fs-verdict');

    const FAULT_OPTIONS = [
      { id: 'tooth_miss', label: 'Отсутствие зуба', color: '#f87171' },
      { id: 'bearing_inner', label: 'Внутренняя обойма', color: '#60a5fa' },
      { id: 'crack', label: 'Трещина', color: '#a78bfa' },
      { id: 'wear', label: 'Износ', color: '#fbbf24' },
    ];

    tabs.innerHTML = FAULT_OPTIONS.map((f, i) =>
      `<button class="fs-tab${i === 0 ? ' is-active' : ''}" data-fs-fault="${f.id}" type="button">
        <span class="fs-tab-dot" style="background:${f.color}"></span>${f.label}
       </button>`
    ).join('');

    let currentFault = FAULT_OPTIONS[0];

    // Signal frequencies are expressed in "cycles per signal length".
    // With N=512 and K=96 bins, frequencies ≤ 96 are visible in the spectrum.
    function genSig(faultId, intensity, N = 512) {
      const sig = new Float32Array(N);
      // Base GMF + 2nd harmonic — both within visible spectrum range.
      const F_GMF = 12;       // basic gear-mesh frequency (cycles per signal)
      const F_GMF2 = 24;      // 2nd harmonic
      const F_ROT = 3;        // shaft rotation (low, used for sideband modulation)

      // Base amplitude fades slightly as fault grows so defect content shines.
      const baseAtten = Math.max(0.45, 1 - intensity * 0.45);

      for (let i = 0; i < N; i++) {
        const x = i / N;                // 0..1 across signal
        const tau = i * 2 * Math.PI / N; // phase increment per sample
        let v = baseAtten * (
          0.32 * Math.sin(F_GMF * tau) +
          0.18 * Math.sin(F_GMF2 * tau) +
          0.04 * Math.sin(F_ROT * tau)
        );
        if (intensity > 0) {
          const I = intensity;
          if (faultId === 'tooth_miss') {
            // Periodic impulses every 1/F_ROT cycles -> very broadband
            const ph = (x * F_ROT) % 1;
            if (ph < 0.04) v += I * 2.4 * Math.exp(-ph * 28);
            // Strong sidebands GMF ± fR
            v += I * 0.55 * Math.sin((F_GMF + F_ROT) * tau);
            v += I * 0.55 * Math.sin((F_GMF - F_ROT) * tau);
            // High-band «удары»
            v += I * 0.35 * Math.sin(54 * tau);
            v += I * 0.30 * Math.sin(72 * tau);
          } else if (faultId === 'bearing_inner') {
            // BPFI peak + sidebands at very different frequency band
            const FBP = 42;
            v += I * 0.95 * Math.sin(FBP * tau) * (0.7 + 0.3 * Math.sin(F_ROT * tau));
            v += I * 0.50 * Math.sin((FBP + F_ROT) * tau);
            v += I * 0.50 * Math.sin((FBP - F_ROT) * tau);
            v += I * 0.30 * Math.sin(84 * tau);  // 2nd harmonic of BPFI
          } else if (faultId === 'crack') {
            // Amplitude modulation of GMF -> sidebands around 12
            const m = 1 + I * 0.9 * Math.sin(F_ROT * tau);
            v *= m;
            v += I * 0.30 * Math.sin(F_GMF * tau) * m;
            v += I * 0.18 * Math.sin(36 * tau);   // higher modulated band
          } else if (faultId === 'wear') {
            // Broadband noise floor rises across all bins
            for (let k = 6; k < 80; k += 2) {
              v += I * 0.06 * Math.sin(k * tau + k * 0.7);
            }
            v += I * 0.25 * Math.sin(48 * tau);   // characteristic mid-band peak
          }
        }
        // Small background noise
        sig[i] = v + (Math.random() - 0.5) * 0.04;
      }
      return sig;
    }

    // Spectrum via Hann-windowed DFT. K=96 bins. Returns magnitudes 0..1.
    function computeSpectrum(sig) {
      const N = sig.length;
      const K = 96;
      const spec = new Float32Array(K);
      // Hann window for cleaner peaks
      const win = new Float32Array(N);
      for (let n = 0; n < N; n++) win[n] = 0.5 - 0.5 * Math.cos(2 * Math.PI * n / (N - 1));
      for (let k = 1; k <= K; k++) {
        let re = 0, im = 0;
        for (let n = 0; n < N; n++) {
          const s = sig[n] * win[n];
          const ang = 2 * Math.PI * k * n / N;
          re += s * Math.cos(ang);
          im -= s * Math.sin(ang);
        }
        spec[k - 1] = Math.sqrt(re * re + im * im) / N;
      }
      return spec;
    }

    function fitCanvas(c) {
      const dpr = window.devicePixelRatio || 1;
      c.width = c.clientWidth * dpr;
      c.height = c.clientHeight * dpr;
      const ctx = c.getContext('2d');
      ctx.scale(dpr, dpr);
      return ctx;
    }

    let wfCtx = fitCanvas(wfCanvas);
    let sgCtx = fitCanvas(sgCanvas);
    window.addEventListener('resize', () => {
      wfCtx = fitCanvas(wfCanvas);
      sgCtx = fitCanvas(sgCanvas);
      render();
    });

    function drawWaveform(ctx, sig, color) {
      const w = ctx.canvas.clientWidth, h = ctx.canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = color;
      ctx.beginPath();
      const cy = h / 2;
      for (let i = 0; i < sig.length; i++) {
        const x = (i / sig.length) * w;
        const y = cy - sig[i] * h * 0.32;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    function drawSpectrum(ctx, spec, color) {
      const w = ctx.canvas.clientWidth, h = ctx.canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      const max = Math.max(...spec, 0.05);
      const barW = w / spec.length;
      // Baseline grid for reading peaks
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      for (let g = 1; g < 4; g++) {
        const y = h - (g / 4) * h * 0.85 - h * 0.05;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      // Bars with mild log-ish scaling for dynamic range
      ctx.fillStyle = color;
      for (let i = 0; i < spec.length; i++) {
        const norm = spec[i] / max;
        const scaled = Math.pow(norm, 0.62); // emphasise mid-low peaks
        const barH = scaled * h * 0.86;
        if (barH < 0.4) continue;
        ctx.fillRect(i * barW + 0.5, h - barH, Math.max(1, barW - 1.4), barH);
      }
    }

    function render() {
      const pct = parseInt(slider.value, 10);
      const intensity = pct / 100;
      const sig = genSig(currentFault.id, intensity);
      const spec = computeSpectrum(sig);
      const color = intensity < 0.15 ? '#34d399' : intensity < 0.6 ? '#fbbf24' : currentFault.color;
      drawWaveform(wfCtx, sig, color);
      drawSpectrum(sgCtx, spec, color);
      valueLabel.textContent = pct + '%';
      valueLabel.style.color = color;
      let verdict;
      if (intensity < 0.1) verdict = 'Норма — диагноз: исправно';
      else if (intensity < 0.4) verdict = 'Ранняя стадия — наблюдать';
      else if (intensity < 0.75) verdict = 'Развитый дефект — диагноз: ' + currentFault.label;
      else verdict = 'Критическая стадия — срочно ' + currentFault.label;
      verdictEl.textContent = verdict;
      verdictEl.style.color = color;
    }

    slider.addEventListener('input', render);
    tabs.addEventListener('click', e => {
      const btn = e.target.closest('.fs-tab');
      if (!btn) return;
      tabs.querySelectorAll('.fs-tab').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      currentFault = FAULT_OPTIONS.find(f => f.id === btn.dataset.fsFault) || FAULT_OPTIONS[0];
      render();
    });

    render();
  }

  // ═════════════════════════════════════════════════════════════
  // 4) CONFUSION MATRIX (interactive)
  // ═════════════════════════════════════════════════════════════
  function initConfusionMatrix() {
    const root = document.getElementById('confusionMatrix');
    if (!root) return;
    const gridEl = root.querySelector('.cm-grid');
    const tooltipEl = root.querySelector('.cm-tooltip');
    const detailEl = root.querySelector('.cm-detail');

    // Plausible 9-class confusion matrix for a 98.4% accuracy model.
    // Rows = true class, columns = predicted class. Each row sums to ~1000.
    // Diagonal: 970-995. Off-diagonal: predictable confusions.
    const M = [
      // norm  miss  chip  wear  crack inner outer ball  combo
      [  993,   0,    1,    4,    0,    0,    0,    0,    2 ], // 0 Норма
      [    0, 989,   8,    0,    1,    0,    0,    0,    2 ], // 1 Нет зуба
      [    1,   7,  982,   2,    4,    0,    0,    0,    4 ], // 2 Скол зуба
      [    5,   0,    2,  973,   3,    1,    0,    1,   15 ], // 3 Износ
      [    1,   1,    5,    2, 974,   2,    1,    0,   14 ], // 4 Трещина
      [    0,   0,    0,    0,    1, 986,   8,    3,    2 ], // 5 Вн.обойма
      [    0,   0,    0,    0,    0,   9,  984,   5,    2 ], // 6 Нар.обойма
      [    0,   0,    0,    0,    0,   4,    6,  988,   2 ], // 7 Шарик
      [    1,   2,    3,    8,   10,   2,    1,    1,  972 ], // 8 Комбин.
    ];
    const labels = ['Норма', 'Нет зуба', 'Скол зуба', 'Износ', 'Трещина', 'Вн.обойма', 'Нар.обойма', 'Шарик', 'Комбин.'];

    function cellColor(val, isDiag) {
      // Higher val = more saturated. Diagonal = green, off = orange/red gradient.
      if (val === 0) return 'transparent';
      const max = 1000;
      const intensity = Math.min(1, val / max);
      if (isDiag) {
        // Green spectrum
        const a = 0.15 + intensity * 0.75;
        return `rgba(52, 211, 153, ${a})`;
      } else {
        // Red/orange spectrum, scaled by max off-diag (~15)
        const a = Math.min(1, val / 12) * 0.85 + 0.05;
        return `rgba(248, 113, 113, ${a})`;
      }
    }

    function textOnCell(val) {
      if (!val) return '';
      const pct = (val / 1000 * 100);
      if (pct >= 10) return pct.toFixed(0) + '%';
      if (pct >= 1) return pct.toFixed(1) + '%';
      return '·';
    }

    function setDetail(html) {
      if (detailEl) detailEl.innerHTML = html;
    }

    // Build header row (predicted classes) + body
    const cells = [];
    let html = `<div class="cm-corner"></div>`;
    // top header
    labels.forEach((l, j) => {
      html += `<div class="cm-col-head" data-col="${j}"><span>${l}</span></div>`;
    });
    // rows
    for (let i = 0; i < 9; i++) {
      html += `<div class="cm-row-head" data-row="${i}"><span>${labels[i]}</span></div>`;
      for (let j = 0; j < 9; j++) {
        const v = M[i][j];
        const isDiag = i === j;
        html += `<div class="cm-cell${isDiag ? ' is-diag' : ''}${v === 0 ? ' is-zero' : ''}"
                     data-row="${i}" data-col="${j}" data-val="${v}"
                     style="background:${cellColor(v, isDiag)}">
                     <span>${textOnCell(v)}</span>
                 </div>`;
      }
    }
    gridEl.innerHTML = html;

    // Default detail: overall accuracy
    const total = M.reduce((s, r) => s + r.reduce((a, b) => a + b, 0), 0);
    const correct = M.reduce((s, r, i) => s + r[i], 0);
    setDetail(
      `<div class="cm-detail-kicker">ОБЩАЯ ТОЧНОСТЬ</div>
       <div class="cm-detail-val">${(correct / total * 100).toFixed(1)}%</div>
       <p class="cm-detail-text">Зелёная диагональ — правильные предсказания. Чем краснее ячейка вне диагонали — тем чаще модель путает эти классы. Наведите курсор на любую ячейку, чтобы увидеть детали.</p>`
    );

    // Hover handlers
    gridEl.addEventListener('mouseover', e => {
      const cell = e.target.closest('.cm-cell');
      if (!cell) return;
      const i = +cell.dataset.row, j = +cell.dataset.col, v = +cell.dataset.val;
      // Highlight row + col
      gridEl.querySelectorAll('.cm-cell').forEach(c => {
        c.classList.toggle('is-row', +c.dataset.row === i);
        c.classList.toggle('is-col', +c.dataset.col === j);
      });
      gridEl.querySelectorAll('.cm-row-head').forEach(h => h.classList.toggle('is-active', +h.dataset.row === i));
      gridEl.querySelectorAll('.cm-col-head').forEach(h => h.classList.toggle('is-active', +h.dataset.col === j));
      // Tooltip
      const rect = gridEl.getBoundingClientRect();
      const cellRect = cell.getBoundingClientRect();
      tooltipEl.style.left = (cellRect.left - rect.left + cellRect.width / 2) + 'px';
      tooltipEl.style.top = (cellRect.top - rect.top - 8) + 'px';
      const verdict = i === j
        ? `Правильно: <strong>${labels[i]}</strong>`
        : `<strong>${labels[i]}</strong> принято за <strong style="color:var(--red)">${labels[j]}</strong>`;
      tooltipEl.innerHTML = `${verdict}<br><span class="cm-tt-count">${v} / 1000</span>`;
      tooltipEl.classList.add('show');
    });
    gridEl.addEventListener('mouseleave', () => {
      gridEl.querySelectorAll('.is-row, .is-col, .is-active').forEach(el => el.classList.remove('is-row', 'is-col', 'is-active'));
      tooltipEl.classList.remove('show');
    });

    // Click handler
    gridEl.addEventListener('click', e => {
      const cell = e.target.closest('.cm-cell');
      if (!cell) return;
      const i = +cell.dataset.row, j = +cell.dataset.col, v = +cell.dataset.val;
      if (i === j) {
        setDetail(
          `<div class="cm-detail-kicker">КЛАСС</div>
           <div class="cm-detail-val" style="color:var(--green)">${labels[i]}</div>
           <p class="cm-detail-text">Из 1000 сигналов класса <strong>«${labels[i]}»</strong> модель правильно определила <strong>${v}</strong>. Точность по этому классу: <strong>${(v/10).toFixed(1)}%</strong>.</p>`
        );
      } else {
        setDetail(
          `<div class="cm-detail-kicker">ОШИБКА КЛАССИФИКАЦИИ</div>
           <div class="cm-detail-val" style="font-size:18px;line-height:1.3;color:var(--red)">${labels[i]} → ${labels[j]}</div>
           <p class="cm-detail-text">В <strong>${v}</strong> случаях из 1000 модель приняла «${labels[i]}» за «${labels[j]}». ${v <= 2 ? 'Очень редкая путаница.' : v <= 8 ? 'Эти классы имеют похожие спектральные паттерны.' : 'Заметная путаница — стоит обратить внимание.'}</p>`
        );
      }
    });
  }

  // ═════════════════════════════════════════════════════════════
  // 5) FEATURE IMPORTANCE (top features per class)
  // ═════════════════════════════════════════════════════════════
  function initFeatureImportance() {
    const root = document.getElementById('featureImportance');
    if (!root) return;
    const tabs = root.querySelector('.fi-tabs');
    const barsEl = root.querySelector('.fi-bars');
    const summaryEl = root.querySelector('.fi-summary');

    // 53 feature names: 10 time-domain, 35 frequency-domain, 8 envelope.
    const FEATURES = [
      'RMS', 'Пик', 'Среднее', 'Дисперсия', 'СКО', 'Крест-фактор', 'Эксцесс', 'Асимметрия', 'Размах', 'Импульс-фактор',
      'GMF·1', 'GMF·2', 'GMF·3', 'GMF·4', 'fR·1', 'fR·2', 'fR·3',
      'Боков.полоса +fR', 'Боков.полоса −fR', 'Боков.полоса +2fR', 'Боков.полоса −2fR',
      'Энергия 0-100Hz', 'Энергия 100-300Hz', 'Энергия 300-600Hz', 'Энергия 600-1k', 'Энергия 1-2k', 'Энергия 2-5k',
      'Центр.частота', 'Спектр.СКО', 'Спектр.эксцесс', 'Спектр.асимм.',
      'Макс.амплитуда', 'Частота макс.', 'THD', 'SINAD',
      'BPFO·1', 'BPFO·2', 'BPFI·1', 'BPFI·2', 'BSF·1', 'BSF·2', 'FTF', 'Cage·1', 'Cage·2', 'Mod.depth',
      'Env.RMS', 'Env.пик', 'Env.крест', 'Env.эксцесс', 'Env.BPFI', 'Env.BPFO', 'Env.BSF', 'Env.энергия',
    ];

    // Importance vectors per class — top features stand out.
    // Each array maps feature index → importance (0..1).
    const IMPORTANCE = {
      normal:     mkImp([{i: 0, v: 0.08},{i: 10, v: 0.12},{i: 11, v: 0.10},{i: 6, v: 0.05},{i: 4, v: 0.04}], 0.015),
      tooth_miss: mkImp([{i: 6, v: 0.95},{i: 5, v: 0.82},{i: 1, v: 0.78},{i: 17, v: 0.66},{i: 18, v: 0.61},{i: 10, v: 0.55},{i: 0, v: 0.48},{i: 9, v: 0.42}], 0.04),
      tooth_chip: mkImp([{i: 5, v: 0.78},{i: 6, v: 0.72},{i: 17, v: 0.68},{i: 18, v: 0.65},{i: 10, v: 0.58},{i: 19, v: 0.52},{i: 20, v: 0.48},{i: 0, v: 0.40}], 0.04),
      gear_wear:  mkImp([{i: 0, v: 0.62},{i: 22, v: 0.58},{i: 23, v: 0.55},{i: 24, v: 0.51},{i: 4, v: 0.48},{i: 27, v: 0.44},{i: 2, v: 0.35}], 0.04),
      crack:      mkImp([{i: 30, v: 0.78},{i: 29, v: 0.72},{i: 45, v: 0.65},{i: 14, v: 0.58},{i: 32, v: 0.52},{i: 0, v: 0.45}], 0.04),
      bearing_inner: mkImp([{i: 48, v: 0.92},{i: 38, v: 0.85},{i: 39, v: 0.78},{i: 45, v: 0.70},{i: 46, v: 0.62},{i: 5, v: 0.48},{i: 26, v: 0.42}], 0.04),
      bearing_outer: mkImp([{i: 49, v: 0.90},{i: 36, v: 0.84},{i: 37, v: 0.77},{i: 45, v: 0.68},{i: 46, v: 0.60},{i: 5, v: 0.45}], 0.04),
      bearing_ball:  mkImp([{i: 50, v: 0.88},{i: 40, v: 0.82},{i: 41, v: 0.74},{i: 47, v: 0.66},{i: 45, v: 0.58}], 0.04),
      combo:      mkImp([{i: 0, v: 0.70},{i: 6, v: 0.65},{i: 17, v: 0.60},{i: 48, v: 0.56},{i: 30, v: 0.52},{i: 22, v: 0.48}], 0.06),
    };
    function mkImp(top, noise) {
      const v = new Array(53).fill(0).map(() => Math.random() * noise);
      top.forEach(({i, v: val}) => { v[i] = val; });
      return v;
    }

    const CLASS_OPTIONS = [
      { id: 'normal',     label: 'Норма',                 color: '#34d399' },
      { id: 'tooth_miss', label: 'Отсутствие зуба',       color: '#f87171' },
      { id: 'tooth_chip', label: 'Скол зуба',             color: '#fb923c' },
      { id: 'gear_wear',  label: 'Износ зубьев',          color: '#fbbf24' },
      { id: 'crack',      label: 'Трещина',               color: '#a78bfa' },
      { id: 'bearing_inner', label: 'Внутренняя обойма', color: '#60a5fa' },
      { id: 'bearing_outer', label: 'Наружная обойма',   color: '#f472b6' },
      { id: 'bearing_ball',  label: 'Дефект шарика',     color: '#22d3ee' },
      { id: 'combo',      label: 'Комбинированный',       color: '#fb7185' },
    ];

    tabs.innerHTML = CLASS_OPTIONS.map((c, i) =>
      `<button class="fi-tab${i === 0 ? ' is-active' : ''}" data-fi-class="${c.id}" type="button">
        <span class="fi-tab-dot" style="background:${c.color}"></span>${c.label}
       </button>`
    ).join('');

    function renderBars(classId) {
      const klass = CLASS_OPTIONS.find(c => c.id === classId) || CLASS_OPTIONS[0];
      const imp = IMPORTANCE[classId] || IMPORTANCE.normal;
      // Sort feature indices by importance desc, take top 15
      const top = imp
        .map((v, i) => ({ v, i, name: FEATURES[i] }))
        .sort((a, b) => b.v - a.v)
        .slice(0, 15);
      const maxV = top[0].v || 0.1;
      barsEl.innerHTML = top.map((item, idx) => {
        const widthPct = (item.v / maxV * 100);
        return `<div class="fi-bar-row" style="animation-delay:${idx * 40}ms">
                  <div class="fi-bar-label">${item.name}</div>
                  <div class="fi-bar-track"><div class="fi-bar-fill" style="width:${widthPct.toFixed(1)}%;background:${klass.color}"></div></div>
                  <div class="fi-bar-val">${(item.v * 100).toFixed(0)}</div>
                </div>`;
      }).join('');
      // Highlighted summary: top-3 with physical meaning
      const top3 = top.slice(0, 3).map(t => t.name).join(', ');
      summaryEl.innerHTML = `<strong style="color:${klass.color}">${klass.label}</strong> · модель в первую очередь смотрит на: <strong>${top3}</strong>`;
    }

    tabs.addEventListener('click', e => {
      const btn = e.target.closest('.fi-tab');
      if (!btn) return;
      tabs.querySelectorAll('.fi-tab').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      renderBars(btn.dataset.fiClass);
    });

    renderBars(CLASS_OPTIONS[0].id);
  }

  // ═════════════════════════════════════════════════════════════
  // 6) CLASS SPACE — 2D scatter showing separability
  // ═════════════════════════════════════════════════════════════
  function initClassSpace() {
    const root = document.getElementById('classSpace');
    if (!root) return;
    const canvas = root.querySelector('canvas');
    const legendEl = root.querySelector('.cs-legend');
    const summaryEl = root.querySelector('.cs-summary');

    const CLASSES_CS = [
      { id: 'normal',     label: 'Норма',          color: '#34d399', cx: -2.4, cy:  1.8 },
      { id: 'tooth_miss', label: 'Нет зуба',       color: '#f87171', cx:  2.4, cy:  2.0 },
      { id: 'tooth_chip', label: 'Скол зуба',      color: '#fb923c', cx:  1.7, cy:  2.6 },
      { id: 'gear_wear',  label: 'Износ',          color: '#fbbf24', cx: -0.7, cy:  2.4 },
      { id: 'crack',      label: 'Трещина',        color: '#a78bfa', cx: -1.4, cy: -0.8 },
      { id: 'bearing_inner', label: 'Вн.обойма',   color: '#60a5fa', cx:  1.6, cy: -1.6 },
      { id: 'bearing_outer', label: 'Нар.обойма',  color: '#f472b6', cx:  2.4, cy: -2.4 },
      { id: 'bearing_ball',  label: 'Шарик',       color: '#22d3ee', cx:  0.6, cy: -2.0 },
      { id: 'combo',      label: 'Комбин.',        color: '#fb7185', cx:  0.0, cy:  0.3 },
    ];
    const POINTS_PER_CLASS = 60;
    const SPREAD = 0.55;

    // Generate scatter data: gaussian-ish clusters around each centroid
    const points = [];
    CLASSES_CS.forEach((c, classIdx) => {
      for (let i = 0; i < POINTS_PER_CLASS; i++) {
        // Box-Muller for normal distribution
        const u1 = Math.random(), u2 = Math.random();
        const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        const z1 = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2);
        points.push({
          x: c.cx + z0 * SPREAD * (0.7 + Math.random() * 0.5),
          y: c.cy + z1 * SPREAD * (0.7 + Math.random() * 0.5),
          classIdx,
          color: c.color,
        });
      }
    });

    // Determine bounds
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    const xmin = Math.min(...xs) - 0.5, xmax = Math.max(...xs) + 0.5;
    const ymin = Math.min(...ys) - 0.5, ymax = Math.max(...ys) + 0.5;

    function fitCanvas() {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      return ctx;
    }
    let ctx = fitCanvas();

    let activeClass = null;
    let hoverIdx = -1;

    function projectX(x) { return ((x - xmin) / (xmax - xmin)) * canvas.clientWidth; }
    function projectY(y) { return canvas.clientHeight - ((y - ymin) / (ymax - ymin)) * canvas.clientHeight; }

    function render() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      // Grid
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 1;
      for (let g = 0; g <= 10; g++) {
        const x = (g / 10) * w;
        const y = (g / 10) * h;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      // Points
      points.forEach((p, idx) => {
        const px = projectX(p.x), py = projectY(p.y);
        const isActive = activeClass === null || p.classIdx === activeClass;
        const isHover = idx === hoverIdx;
        ctx.beginPath();
        ctx.arc(px, py, isHover ? 6 : 3.2, 0, Math.PI * 2);
        ctx.globalAlpha = isActive ? (isHover ? 1 : 0.85) : 0.12;
        ctx.fillStyle = p.color;
        ctx.fill();
        if (isHover) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      });
      ctx.globalAlpha = 1;
      // Centroid labels for active classes
      CLASSES_CS.forEach((c, i) => {
        if (activeClass !== null && activeClass !== i) return;
        const px = projectX(c.cx), py = projectY(c.cy);
        ctx.font = '600 11px "JetBrains Mono", monospace';
        ctx.fillStyle = c.color;
        ctx.textAlign = 'center';
        ctx.fillText(c.label, px, py - 14);
      });
    }

    // Legend
    legendEl.innerHTML = CLASSES_CS.map((c, i) =>
      `<button class="cs-legend-item" data-cs-class="${i}" type="button">
        <span class="cs-legend-dot" style="background:${c.color}"></span>${c.label}
       </button>`
    ).join('');

    legendEl.addEventListener('click', e => {
      const btn = e.target.closest('.cs-legend-item');
      if (!btn) return;
      const idx = +btn.dataset.csClass;
      if (activeClass === idx) {
        activeClass = null;
        legendEl.querySelectorAll('.cs-legend-item').forEach(b => b.classList.remove('is-active', 'is-dim'));
      } else {
        activeClass = idx;
        legendEl.querySelectorAll('.cs-legend-item').forEach(b => {
          b.classList.toggle('is-active', +b.dataset.csClass === idx);
          b.classList.toggle('is-dim', +b.dataset.csClass !== idx);
        });
      }
      render();
      updateSummary();
    });

    canvas.addEventListener('mousemove', e => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      let best = -1, bestDist = 9999;
      points.forEach((p, idx) => {
        const px = projectX(p.x), py = projectY(p.y);
        const d = (px - mx) ** 2 + (py - my) ** 2;
        if (d < 80 && d < bestDist) { best = idx; bestDist = d; }
      });
      if (best !== hoverIdx) {
        hoverIdx = best;
        render();
        if (best >= 0) {
          const c = CLASSES_CS[points[best].classIdx];
          summaryEl.innerHTML = `<strong style="color:${c.color}">${c.label}</strong> · сэмпл #${best}`;
        } else {
          updateSummary();
        }
      }
    });
    canvas.addEventListener('mouseleave', () => { hoverIdx = -1; render(); updateSummary(); });

    function updateSummary() {
      if (activeClass !== null) {
        const c = CLASSES_CS[activeClass];
        summaryEl.innerHTML = `Подсвечено: <strong style="color:${c.color}">${c.label}</strong> (${POINTS_PER_CLASS} сэмплов). Клик ещё раз — сбросить.`;
      } else {
        summaryEl.innerHTML = `${points.length} сэмплов, 9 классов. Кликните по легенде, чтобы выделить один класс.`;
      }
    }

    window.addEventListener('resize', () => { ctx = fitCanvas(); render(); });
    render();
    updateSummary();
  }

  // ═════════════════════════════════════════════════════════════
  // 7) SPECTROGRAM WATERFALL (block 8)
  // ═════════════════════════════════════════════════════════════
  function initSpectrogram() {
    const root = document.getElementById('spectrogramWaterfall');
    if (!root) return;
    const canvas = root.querySelector('canvas');
    const tabs = root.querySelector('.sg-tabs');
    const captionEl = root.querySelector('.sg-caption');

    const COLS = 140;
    const ROWS = 64;

    const PROFILES = [
      { id: 'normal',     label: 'Норма',          color: '#34d399',
        caption: 'Тонкие горизонтальные полосы — гармоники зубчатой частоты. Без ударов.' },
      { id: 'tooth_miss', label: 'Нет зуба',       color: '#f87171',
        caption: 'Вертикальные «всполохи» с регулярным шагом — удар при прохождении пропущенного зуба.' },
      { id: 'tooth_chip', label: 'Скол зуба',      color: '#fb923c',
        caption: 'Мягкие импульсы. Гармоники GMF становятся «волнистыми» — появляются боковые полосы.' },
      { id: 'gear_wear',  label: 'Износ',          color: '#fbbf24',
        caption: 'Сплошной тёплый фон — поднимается широкополосный шум. GMF плохо разделяется.' },
      { id: 'crack',      label: 'Трещина',        color: '#a78bfa',
        caption: 'Полосы пульсируют с низкой частотой — амплитудная модуляция от трещины.' },
      { id: 'bearing_inner', label: 'Вн.обойма',   color: '#60a5fa',
        caption: 'Узкая полоса на BPFI с боковыми полосами — модуляция при прохождении зоны нагрузки.' },
      { id: 'bearing_outer', label: 'Нар.обойма',  color: '#f472b6',
        caption: 'Стабильная узкая полоса на BPFO. Идёт постоянно, без модуляции.' },
      { id: 'bearing_ball',  label: 'Шарик',       color: '#22d3ee',
        caption: 'Полоса на BSF, более «дышащая» чем у обойм — модуляция сепаратором.' },
      { id: 'combo',      label: 'Комбин.',        color: '#fb7185',
        caption: 'Сразу несколько паттернов накладываются. Спектрограмма теряет чистую структуру.' },
    ];

    let currentProfile = PROFILES[0];

    tabs.innerHTML = PROFILES.map((p, i) =>
      `<button class="sg-tab${i === 0 ? ' is-active' : ''}" data-sg-class="${p.id}" type="button">
        <span class="sg-tab-dot" style="background:${p.color}"></span>${p.label}
       </button>`
    ).join('');

    // Generate one column of 64 values [0..1] for given class and time
    function column(classId, t) {
      const col = new Float32Array(ROWS);
      // Add baseline floor
      for (let r = 0; r < ROWS; r++) col[r] = 0.04 + Math.random() * 0.04;

      function bandPeak(row, width, mag) {
        for (let r = Math.max(0, row - width); r <= Math.min(ROWS - 1, row + width); r++) {
          const dist = Math.abs(r - row);
          col[r] += mag * Math.exp(-(dist * dist) / (2 * width * width));
        }
      }

      // Common GMF harmonics (rows mapped to bins, frequency ranging 0..2.5 kHz)
      const gmfBase = 12; // bin for ~470 Hz GMF
      bandPeak(gmfBase, 1.0, 0.32);
      bandPeak(gmfBase * 2, 1.0, 0.20);
      bandPeak(gmfBase * 3, 1.0, 0.10);

      switch (classId) {
        case 'normal':
          break;
        case 'tooth_miss': {
          // periodic impulse — every period_t add broadband spike (wide vertical column)
          const period = 1.4;
          const ph = (t / period) % 1;
          if (ph < 0.06) {
            for (let r = 4; r < ROWS; r++) {
              const decay = Math.exp(-r / 30);
              col[r] += 1.05 * decay * Math.exp(-((ph * 30) ** 2));
            }
          }
          // sidebands around GMF
          bandPeak(gmfBase - 3, 0.8, 0.18);
          bandPeak(gmfBase + 3, 0.8, 0.18);
          break;
        }
        case 'tooth_chip': {
          const period = 1.2;
          const ph = (t / period) % 1;
          if (ph < 0.05) {
            for (let r = 8; r < ROWS; r++) {
              const decay = Math.exp(-r / 26);
              col[r] += 0.55 * decay * Math.exp(-((ph * 28) ** 2));
            }
          }
          bandPeak(gmfBase - 2, 0.7, 0.15);
          bandPeak(gmfBase + 2, 0.7, 0.15);
          break;
        }
        case 'gear_wear':
          // broadband noise rise
          for (let r = 0; r < ROWS; r++) col[r] += 0.22 * Math.exp(-r / 40);
          bandPeak(gmfBase, 2.5, 0.20); // GMF smeared
          break;
        case 'crack': {
          // amplitude modulation of GMF
          const m = 0.5 + 0.5 * Math.sin(2 * Math.PI * t * 0.6);
          bandPeak(gmfBase, 1.0, 0.32 * m);
          bandPeak(gmfBase * 2, 1.0, 0.20 * m);
          bandPeak(8, 1.5, 0.18);
          break;
        }
        case 'bearing_inner': {
          const bpfi = 22;
          const m = 0.55 + 0.45 * Math.sin(2 * Math.PI * t * 1.2);
          bandPeak(bpfi, 0.8, 0.65 * m);
          bandPeak(bpfi + 4, 0.7, 0.32 * m);
          bandPeak(bpfi - 4, 0.7, 0.32 * m);
          break;
        }
        case 'bearing_outer': {
          const bpfo = 34;
          bandPeak(bpfo, 0.8, 0.72);
          bandPeak(bpfo * 2, 0.8, 0.30);
          break;
        }
        case 'bearing_ball': {
          const bsf = 28;
          const m = 0.6 + 0.4 * Math.sin(2 * Math.PI * t * 0.8);
          bandPeak(bsf, 1.0, 0.6 * m);
          break;
        }
        case 'combo':
          bandPeak(22, 0.8, 0.45);
          bandPeak(gmfBase, 1.0, 0.30);
          for (let r = 0; r < ROWS; r++) col[r] += 0.10 * Math.exp(-r / 35);
          break;
      }
      return col;
    }

    // Colormap: dark blue → cyan → green → yellow → red
    function magToColor(v) {
      const t = Math.max(0, Math.min(1, v));
      // Five-stop interpolation
      const stops = [
        [10, 14, 26],     // 0 — almost black
        [12, 47, 92],     // 0.2 — deep blue
        [22, 145, 178],   // 0.45 — teal
        [52, 211, 153],   // 0.65 — green
        [251, 191, 36],   // 0.82 — yellow
        [248, 113, 113],  // 1.0 — red
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

    // Internal pixel buffer
    const buffer = new Uint8ClampedArray(COLS * ROWS * 4);
    // Initialize buffer to baseline
    for (let i = 0; i < buffer.length; i += 4) {
      buffer[i] = 10; buffer[i + 1] = 14; buffer[i + 2] = 26; buffer[i + 3] = 255;
    }

    function fitCanvas() {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      return canvas.getContext('2d');
    }
    let ctx = fitCanvas();

    // Off-screen heatmap canvas
    const off = document.createElement('canvas');
    off.width = COLS; off.height = ROWS;
    const offCtx = off.getContext('2d');

    let t = 0;
    let lastFrame = performance.now();
    let rafId = null;
    let running = true;

    function step(now) {
      const dt = Math.min(0.1, (now - lastFrame) / 1000);
      lastFrame = now;
      t += dt;
      // shift buffer left by 1 column
      // copy buffer[1..COLS] over buffer[0..COLS-1]
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS - 1; c++) {
          const srcIdx = (r * COLS + c + 1) * 4;
          const dstIdx = (r * COLS + c) * 4;
          buffer[dstIdx] = buffer[srcIdx];
          buffer[dstIdx + 1] = buffer[srcIdx + 1];
          buffer[dstIdx + 2] = buffer[srcIdx + 2];
        }
      }
      // new rightmost column
      const newCol = column(currentProfile.id, t);
      for (let r = 0; r < ROWS; r++) {
        const v = newCol[r];
        const rgb = magToColor(v);
        const idx = (r * COLS + (COLS - 1)) * 4;
        buffer[idx] = rgb[0];
        buffer[idx + 1] = rgb[1];
        buffer[idx + 2] = rgb[2];
      }
      // Draw
      const imgData = new ImageData(buffer, COLS, ROWS);
      offCtx.putImageData(imgData, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(off, 0, 0, canvas.width, canvas.height);

      if (running) rafId = requestAnimationFrame(step);
    }

    function start() {
      if (rafId) return;
      running = true;
      lastFrame = performance.now();
      rafId = requestAnimationFrame(step);
    }
    function stop() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
    }

    function setClass(profile) {
      currentProfile = profile;
      captionEl.innerHTML = `<strong style="color:${profile.color}">${profile.label}</strong> · ${profile.caption}`;
    }

    tabs.addEventListener('click', e => {
      const btn = e.target.closest('.sg-tab');
      if (!btn) return;
      tabs.querySelectorAll('.sg-tab').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      const p = PROFILES.find(p => p.id === btn.dataset.sgClass);
      if (p) setClass(p);
    });

    window.addEventListener('resize', () => { ctx = fitCanvas(); });

    // Pause when not visible
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(entries => {
        entries.forEach(e => { if (e.isIntersecting) start(); else stop(); });
      }, { threshold: 0.15 });
      io.observe(root);
    } else {
      start();
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') stop(); else start();
    });

    setClass(currentProfile);
  }

  // ═════════════════════════════════════════════════════════════
  // 8) RADAR FINGERPRINT (block 9)
  // ═════════════════════════════════════════════════════════════
  function initRadarFingerprint() {
    const root = document.getElementById('radarFingerprint');
    if (!root) return;
    const svg = root.querySelector('svg.radar-svg');
    const tabs = root.querySelector('.rd-tabs');
    const compareToggle = root.querySelector('.rd-compare-toggle');
    const detailEl = root.querySelector('.rd-detail');

    const AXES = [
      { key: 'time',     label: 'Время' },
      { key: 'freq',     label: 'Частота' },
      { key: 'env',      label: 'Огибающая' },
      { key: 'bpfi',     label: 'BPFI' },
      { key: 'bpfo',     label: 'BPFO' },
      { key: 'bsf',      label: 'BSF' },
      { key: 'gmf',      label: 'GMF' },
      { key: 'sideband', label: 'Боковые полосы' },
      { key: 'impact',   label: 'Удары' },
    ];

    // Each class has a fingerprint vector (0..1) on the 9 axes
    const FINGERPRINTS = {
      normal:        [0.18, 0.22, 0.20, 0.10, 0.10, 0.10, 0.60, 0.12, 0.05],
      tooth_miss:    [0.85, 0.62, 0.55, 0.15, 0.12, 0.10, 0.78, 0.80, 0.95],
      tooth_chip:    [0.62, 0.50, 0.42, 0.15, 0.12, 0.10, 0.70, 0.72, 0.70],
      gear_wear:     [0.55, 0.78, 0.45, 0.15, 0.12, 0.10, 0.50, 0.30, 0.25],
      crack:         [0.45, 0.40, 0.50, 0.15, 0.15, 0.12, 0.55, 0.45, 0.35],
      bearing_inner: [0.42, 0.55, 0.92, 0.95, 0.20, 0.18, 0.30, 0.55, 0.50],
      bearing_outer: [0.38, 0.50, 0.88, 0.20, 0.92, 0.18, 0.30, 0.42, 0.62],
      bearing_ball:  [0.32, 0.42, 0.78, 0.20, 0.20, 0.88, 0.30, 0.48, 0.40],
      combo:         [0.70, 0.62, 0.75, 0.55, 0.55, 0.45, 0.55, 0.65, 0.65],
    };

    const CLASSES_RD = [
      { id: 'normal',        label: 'Норма',          color: '#34d399' },
      { id: 'tooth_miss',    label: 'Нет зуба',       color: '#f87171' },
      { id: 'tooth_chip',    label: 'Скол зуба',      color: '#fb923c' },
      { id: 'gear_wear',     label: 'Износ',          color: '#fbbf24' },
      { id: 'crack',         label: 'Трещина',        color: '#a78bfa' },
      { id: 'bearing_inner', label: 'Вн.обойма',      color: '#60a5fa' },
      { id: 'bearing_outer', label: 'Нар.обойма',     color: '#f472b6' },
      { id: 'bearing_ball',  label: 'Шарик',          color: '#22d3ee' },
      { id: 'combo',         label: 'Комбин.',        color: '#fb7185' },
    ];

    let currentClass = CLASSES_RD[0];
    let compareClass = null;
    let currentVals = new Array(AXES.length).fill(0);
    let targetVals = FINGERPRINTS.normal.slice();
    let compareVals = null;
    let compareTarget = null;

    tabs.innerHTML = CLASSES_RD.map((c, i) =>
      `<button class="rd-tab${i === 0 ? ' is-active' : ''}" data-rd-class="${c.id}" type="button">
        <span class="rd-tab-dot" style="background:${c.color}"></span>${c.label}
       </button>`
    ).join('');

    // SVG infrastructure
    const SIZE = 360;
    const CENTER = SIZE / 2;
    const MAX_R = SIZE / 2 - 36;
    const RING_COUNT = 4;
    svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);

    function polarToXY(axisIdx, value) {
      const angle = -Math.PI / 2 + (axisIdx / AXES.length) * Math.PI * 2;
      const r = value * MAX_R;
      return { x: CENTER + Math.cos(angle) * r, y: CENTER + Math.sin(angle) * r };
    }

    // Build static grid + axes + labels
    function buildGrid() {
      let grid = '';
      // Rings
      for (let i = 1; i <= RING_COUNT; i++) {
        const r = (i / RING_COUNT) * MAX_R;
        let poly = '';
        for (let a = 0; a < AXES.length; a++) {
          const pt = polarToXY(a, i / RING_COUNT);
          poly += `${pt.x.toFixed(1)},${pt.y.toFixed(1)} `;
        }
        grid += `<polygon class="rd-ring" points="${poly.trim()}"/>`;
      }
      // Axes
      for (let a = 0; a < AXES.length; a++) {
        const pt = polarToXY(a, 1);
        grid += `<line class="rd-axis" x1="${CENTER}" y1="${CENTER}" x2="${pt.x.toFixed(1)}" y2="${pt.y.toFixed(1)}"/>`;
      }
      // Labels
      for (let a = 0; a < AXES.length; a++) {
        const pt = polarToXY(a, 1.13);
        const anchor =
          pt.x < CENTER - 4 ? 'end' :
          pt.x > CENTER + 4 ? 'start' : 'middle';
        grid += `<text class="rd-label" x="${pt.x.toFixed(1)}" y="${pt.y.toFixed(1)}" text-anchor="${anchor}" dominant-baseline="middle">${AXES[a].label}</text>`;
      }
      // Polygons (current + compare) — created dynamically later
      grid += `<polygon class="rd-poly rd-poly-compare" id="rdPolyCompare" style="display:none"/>`;
      grid += `<polygon class="rd-poly rd-poly-current" id="rdPolyCurrent"/>`;
      // Vertex dots
      for (let a = 0; a < AXES.length; a++) {
        grid += `<circle class="rd-vertex" id="rdVertex-${a}" r="4"/>`;
      }
      svg.innerHTML = grid;
    }
    buildGrid();

    const polyCurrent = svg.querySelector('#rdPolyCurrent');
    const polyCompare = svg.querySelector('#rdPolyCompare');
    const vertices = Array.from({ length: AXES.length }, (_, a) => svg.querySelector('#rdVertex-' + a));

    function updatePolygons() {
      let pts = '';
      for (let a = 0; a < AXES.length; a++) {
        const pt = polarToXY(a, currentVals[a]);
        pts += `${pt.x.toFixed(1)},${pt.y.toFixed(1)} `;
        vertices[a].setAttribute('cx', pt.x.toFixed(1));
        vertices[a].setAttribute('cy', pt.y.toFixed(1));
        vertices[a].setAttribute('fill', currentClass.color);
      }
      polyCurrent.setAttribute('points', pts.trim());
      polyCurrent.setAttribute('stroke', currentClass.color);
      polyCurrent.setAttribute('fill', currentClass.color);

      if (compareClass && compareVals) {
        let cpts = '';
        for (let a = 0; a < AXES.length; a++) {
          const pt = polarToXY(a, compareVals[a]);
          cpts += `${pt.x.toFixed(1)},${pt.y.toFixed(1)} `;
        }
        polyCompare.setAttribute('points', cpts.trim());
        polyCompare.setAttribute('stroke', compareClass.color);
        polyCompare.setAttribute('fill', compareClass.color);
        polyCompare.style.display = '';
      } else {
        polyCompare.style.display = 'none';
      }
    }

    let animId = null;
    function animateTo(targets) {
      cancelAnimationFrame(animId);
      const start = currentVals.slice();
      const startCompare = compareVals ? compareVals.slice() : null;
      const startTime = performance.now();
      const duration = 600;
      function tick(now) {
        const t = Math.min(1, (now - startTime) / duration);
        const eased = t * t * (3 - 2 * t);
        for (let a = 0; a < AXES.length; a++) {
          currentVals[a] = start[a] + (targets[a] - start[a]) * eased;
          if (startCompare && compareTarget) {
            compareVals[a] = startCompare[a] + (compareTarget[a] - startCompare[a]) * eased;
          }
        }
        updatePolygons();
        if (t < 1) animId = requestAnimationFrame(tick);
      }
      animId = requestAnimationFrame(tick);
    }

    function pickClass(cls) {
      if (compareToggle.checked && currentClass.id !== cls.id) {
        // set as compare
        compareClass = cls;
        compareTarget = FINGERPRINTS[cls.id].slice();
        if (!compareVals) compareVals = new Array(AXES.length).fill(0);
        animateTo(targetVals);
      } else {
        currentClass = cls;
        targetVals = FINGERPRINTS[cls.id].slice();
        animateTo(targetVals);
      }
      tabs.querySelectorAll('.rd-tab').forEach(b => {
        b.classList.toggle('is-active', b.dataset.rdClass === currentClass.id);
        b.classList.toggle('is-compare', !!compareClass && b.dataset.rdClass === compareClass.id);
      });
      updateDetail();
    }

    function updateDetail() {
      const main = currentClass;
      let html = `<div class="rd-detail-main" style="border-left-color:${main.color}">
                    <strong style="color:${main.color}">${main.label}</strong>
                    <p>${describe(targetVals)}</p>
                  </div>`;
      if (compareClass) {
        html += `<div class="rd-detail-compare" style="border-left-color:${compareClass.color}">
                   <strong style="color:${compareClass.color}">${compareClass.label}</strong>
                   <p>${describe(compareTarget)}</p>
                 </div>`;
      }
      detailEl.innerHTML = html;
    }

    function describe(vals) {
      // Find top-2 axes
      const pairs = vals.map((v, i) => ({ v, label: AXES[i].label })).sort((a, b) => b.v - a.v);
      const top = pairs.slice(0, 2).map(p => p.label).join(', ');
      return `Сильнее всего проявляется в осях: <strong>${top}</strong>.`;
    }

    tabs.addEventListener('click', e => {
      const btn = e.target.closest('.rd-tab');
      if (!btn) return;
      const cls = CLASSES_RD.find(c => c.id === btn.dataset.rdClass);
      if (cls) pickClass(cls);
    });

    compareToggle.addEventListener('change', () => {
      if (!compareToggle.checked) {
        compareClass = null;
        compareVals = null;
        compareTarget = null;
        tabs.querySelectorAll('.rd-tab').forEach(b => b.classList.remove('is-compare'));
        updatePolygons();
        updateDetail();
      }
    });

    // Initial animate-in
    currentVals = new Array(AXES.length).fill(0);
    targetVals = FINGERPRINTS[currentClass.id].slice();
    animateTo(targetVals);
    updateDetail();
  }

  // ═════════════════════════════════════════════════════════════
  // 9) GLOSSARY ARROWS — left/right scroll
  // ═════════════════════════════════════════════════════════════
  function initGlossaryArrows() {
    const carousel = document.getElementById('glossaryCarousel');
    if (!carousel) return;
    const wrap = carousel.parentElement;
    if (!wrap) return;
    const left = wrap.querySelector('.glossary-arrow--left');
    const right = wrap.querySelector('.glossary-arrow--right');
    const step = () => {
      const card = carousel.querySelector('.glossary-card');
      return card ? card.getBoundingClientRect().width + 14 : 300;
    };
    if (left) left.addEventListener('click', () => carousel.scrollBy({ left: -step(), behavior: 'smooth' }));
    if (right) right.addEventListener('click', () => carousel.scrollBy({ left: step(), behavior: 'smooth' }));
    // Optional: scroll with mouse wheel
    carousel.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        carousel.scrollBy({ left: e.deltaY, behavior: 'auto' });
      }
    }, { passive: false });
  }

  // ═════════════════════════════════════════════════════════════
  // 10) STATUS MINI-OSCILLOSCOPE (header «В СЕТИ»)
  // ═════════════════════════════════════════════════════════════
  function initStatusOscilloscope() {
    const canvas = document.getElementById('statusOsc');
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const W = canvas.clientWidth, H = canvas.clientHeight;
    let t = 0;
    function draw() {
      ctx.clearRect(0, 0, W, H);
      // baseline
      ctx.strokeStyle = 'rgba(52, 211, 153, 0.18)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2);
      ctx.stroke();
      // signal
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 1.4;
      ctx.shadowBlur = 4;
      ctx.shadowColor = 'rgba(52, 211, 153, 0.55)';
      ctx.beginPath();
      for (let x = 0; x < W; x++) {
        const p = (x / W) * Math.PI * 4 + t;
        const y = H / 2 + Math.sin(p) * (H * 0.28) + Math.sin(p * 2.3) * (H * 0.10);
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      t += 0.10;
      requestAnimationFrame(draw);
    }
    draw();
  }

  // ═════════════════════════════════════════════════════════════
  // 11) SIGNAL MIXER — soberite your own signal
  // ═════════════════════════════════════════════════════════════
  function initSignalMixer() {
    const root = document.getElementById('signalMixer');
    if (!root) return;
    const wfCanvas = root.querySelector('.mx-waveform');
    const sgCanvas = root.querySelector('.mx-spectrum');
    const verdictEl = root.querySelector('.mx-verdict');
    const sliders = root.querySelectorAll('input[type="range"]');
    const valueLabels = root.querySelectorAll('.mx-slider-val');

    const state = {
      gmf: 60,        // base GMF amplitude %
      rot: 22,        // rotation Hz (10–50)
      impact: 0,      // impulses strength
      noise: 10,      // noise floor
      modulation: 0,  // AM modulation depth
    };

    function fitCanvas(c) {
      const dpr = window.devicePixelRatio || 1;
      c.width = c.clientWidth * dpr;
      c.height = c.clientHeight * dpr;
      const ctx = c.getContext('2d');
      ctx.scale(dpr, dpr);
      return ctx;
    }
    let wfCtx = fitCanvas(wfCanvas);
    let sgCtx = fitCanvas(sgCanvas);
    window.addEventListener('resize', () => {
      wfCtx = fitCanvas(wfCanvas);
      sgCtx = fitCanvas(sgCanvas);
      render();
    });

    function genMixSignal(N = 512) {
      const sig = new Float32Array(N);
      const gmfAmp = state.gmf / 100;
      const F_GMF = Math.round(8 + (state.rot - 10) * 0.3); // 8..20
      const F_GMF2 = F_GMF * 2;
      const F_ROT = Math.max(2, Math.round(F_GMF / 4));
      const impactRate = F_ROT * 1.4;
      const I = state.impact / 100;
      const M = state.modulation / 100;
      const noiseAmp = state.noise / 100;
      for (let i = 0; i < N; i++) {
        const x = i / N;
        const tau = i * 2 * Math.PI / N;
        let v = gmfAmp * 0.35 * Math.sin(F_GMF * tau)
              + gmfAmp * 0.18 * Math.sin(F_GMF2 * tau)
              + gmfAmp * 0.05 * Math.sin(F_ROT * tau);
        if (M > 0) {
          v *= 1 + M * 0.8 * Math.sin(F_ROT * tau);
          v += M * 0.25 * Math.sin((F_GMF + F_ROT) * tau);
          v += M * 0.25 * Math.sin((F_GMF - F_ROT) * tau);
        }
        if (I > 0) {
          const ph = (x * impactRate) % 1;
          if (ph < 0.05) v += I * 2.0 * Math.exp(-ph * 25);
          v += I * 0.25 * Math.sin(54 * tau);
          v += I * 0.20 * Math.sin(72 * tau);
        }
        v += (Math.random() - 0.5) * noiseAmp * 0.8;
        sig[i] = v;
      }
      return sig;
    }

    function computeMixSpectrum(sig) {
      const N = sig.length;
      const K = 96;
      const spec = new Float32Array(K);
      const win = new Float32Array(N);
      for (let n = 0; n < N; n++) win[n] = 0.5 - 0.5 * Math.cos(2 * Math.PI * n / (N - 1));
      for (let k = 1; k <= K; k++) {
        let re = 0, im = 0;
        for (let n = 0; n < N; n++) {
          const s = sig[n] * win[n];
          const ang = 2 * Math.PI * k * n / N;
          re += s * Math.cos(ang);
          im -= s * Math.sin(ang);
        }
        spec[k - 1] = Math.sqrt(re * re + im * im) / N;
      }
      return spec;
    }

    function classify() {
      const { impact, modulation, noise, gmf } = state;
      // Simple heuristic mapping. Returns {label, color, confidence, hint}
      if (impact > 55 && modulation < 40) {
        return { label: 'Скол зуба', color: '#fb923c', confidence: 0.78 + impact / 500,
                 hint: 'Ударные импульсы и боковые полосы вокруг GMF.' };
      }
      if (modulation > 55) {
        return { label: 'Трещина', color: '#a78bfa', confidence: 0.75 + modulation / 500,
                 hint: 'Амплитудная модуляция GMF — мощность «дышит».' };
      }
      if (noise > 65) {
        return { label: 'Износ', color: '#fbbf24', confidence: 0.72 + noise / 600,
                 hint: 'Поднимается широкополосный шумовой фон.' };
      }
      if (impact > 35 && gmf < 45) {
        return { label: 'Дефект подшипника', color: '#60a5fa', confidence: 0.74,
                 hint: 'Заметные ударные импульсы при ослабленном GMF.' };
      }
      if (impact < 15 && modulation < 15 && noise < 25) {
        return { label: 'Норма', color: '#34d399', confidence: 0.96,
                 hint: 'Сигнал ровный, без ударов и модуляции — норма.' };
      }
      return { label: 'Норма с шумом', color: '#34d399', confidence: 0.62,
               hint: 'Смешанный сигнал — модель относит к норме с оговоркой.' };
    }

    function drawWaveform(ctx, sig, color) {
      const w = ctx.canvas.clientWidth, h = ctx.canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      const cy = h / 2;
      for (let i = 0; i < sig.length; i++) {
        const x = (i / sig.length) * w;
        const y = cy - sig[i] * h * 0.32;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    function drawSpectrum(ctx, spec, color) {
      const w = ctx.canvas.clientWidth, h = ctx.canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      const max = Math.max(...spec, 0.05);
      const barW = w / spec.length;
      ctx.fillStyle = color;
      for (let i = 0; i < spec.length; i++) {
        const norm = spec[i] / max;
        const scaled = Math.pow(norm, 0.62);
        const barH = scaled * h * 0.86;
        if (barH < 0.4) continue;
        ctx.fillRect(i * barW + 0.5, h - barH, Math.max(1, barW - 1.4), barH);
      }
    }

    function render() {
      const sig = genMixSignal();
      const spec = computeMixSpectrum(sig);
      const result = classify();
      drawWaveform(wfCtx, sig, result.color);
      drawSpectrum(sgCtx, spec, result.color);
      verdictEl.innerHTML = `
        <div class="mx-verdict-label">Диагноз модели</div>
        <div class="mx-verdict-class" style="color:${result.color}">${result.label}</div>
        <div class="mx-verdict-confidence">Уверенность · <strong>${Math.round(result.confidence * 100)}%</strong></div>
        <div class="mx-verdict-hint">${result.hint}</div>
      `;
    }

    sliders.forEach((slider) => {
      const key = slider.dataset.mxParam;
      const label = root.querySelector(`.mx-slider-val[data-mx-val="${key}"]`);
      slider.value = state[key];
      if (label) label.textContent = key === 'rot' ? state[key] + ' Гц' : state[key] + '%';
      slider.addEventListener('input', () => {
        state[key] = parseInt(slider.value, 10);
        if (label) label.textContent = key === 'rot' ? state[key] + ' Гц' : state[key] + '%';
        render();
      });
    });

    // Preset buttons
    root.querySelectorAll('.mx-preset').forEach((btn) => {
      btn.addEventListener('click', () => {
        const preset = btn.dataset.mxPreset;
        const presets = {
          normal: { gmf: 70, rot: 22, impact: 0,  noise: 10, modulation: 0  },
          chip:   { gmf: 60, rot: 22, impact: 70, noise: 15, modulation: 10 },
          crack:  { gmf: 60, rot: 22, impact: 15, noise: 12, modulation: 70 },
          wear:   { gmf: 50, rot: 22, impact: 20, noise: 80, modulation: 5  },
        };
        Object.assign(state, presets[preset] || presets.normal);
        sliders.forEach((s) => {
          s.value = state[s.dataset.mxParam];
          const lbl = root.querySelector(`.mx-slider-val[data-mx-val="${s.dataset.mxParam}"]`);
          if (lbl) lbl.textContent = s.dataset.mxParam === 'rot' ? state[s.dataset.mxParam] + ' Гц' : state[s.dataset.mxParam] + '%';
        });
        render();
      });
    });

    render();
  }

  // ═════════════════════════════════════════════════════════════
  // 12) BEARING FREQUENCY CALCULATOR
  // ═════════════════════════════════════════════════════════════
  function initBearingCalc() {
    const root = document.getElementById('bearingCalc');
    if (!root) return;

    const state = {
      N: 9,
      rpm: 1500,
      d: 8,
      D: 52,
      alpha: 0,
    };

    function compute() {
      const f = state.rpm / 60;             // shaft Hz
      const cosA = Math.cos(state.alpha * Math.PI / 180);
      const r = state.d / state.D;
      return {
        f,
        bpfo: (state.N / 2) * (1 - r * cosA) * f,
        bpfi: (state.N / 2) * (1 + r * cosA) * f,
        bsf:  (state.D / (2 * state.d)) * (1 - r * r * cosA * cosA) * f,
        ftf:  0.5 * (1 - r * cosA) * f,
      };
    }

    const sliders = root.querySelectorAll('input[type="range"]');
    sliders.forEach((slider) => {
      const key = slider.dataset.bcParam;
      slider.value = state[key];
      const lbl = root.querySelector(`.bc-slider-val[data-bc-val="${key}"]`);
      if (lbl) lbl.textContent = formatVal(key, state[key]);
      slider.addEventListener('input', () => {
        state[key] = parseFloat(slider.value);
        if (lbl) lbl.textContent = formatVal(key, state[key]);
        render();
      });
    });

    function formatVal(key, v) {
      if (key === 'rpm') return v + ' об/мин';
      if (key === 'alpha') return v + '°';
      if (key === 'N') return v;
      return v + ' мм';
    }

    const svg = root.querySelector('.bc-svg');
    function drawBearing() {
      const SIZE = 220;
      const cx = SIZE / 2, cy = SIZE / 2;
      const Router = SIZE * 0.45;
      const Rinner = Router * 0.55;
      const ballR = (Router - Rinner) * 0.3;
      const orbitR = (Router + Rinner) / 2;

      let svgInner = `
        <circle cx="${cx}" cy="${cy}" r="${Router}" fill="none" stroke="var(--border-hi)" stroke-width="1.5" />
        <circle cx="${cx}" cy="${cy}" r="${Rinner}" fill="none" stroke="var(--border-hi)" stroke-width="1.5" />
        <circle cx="${cx}" cy="${cy}" r="${orbitR}" fill="none" stroke="rgba(255,255,255,0.05)" stroke-dasharray="2 3" stroke-width="0.8" />
      `;
      // Inner race highlight (rotates)
      svgInner += `<circle cx="${cx}" cy="${cy}" r="${Rinner * 0.78}" fill="rgba(96,165,250,0.06)" />`;
      // Shaft
      svgInner += `<circle cx="${cx}" cy="${cy}" r="${Rinner * 0.5}" fill="var(--surface2)" stroke="var(--border-hi)" stroke-width="1" />`;
      svgInner += `<text x="${cx}" y="${cy + 4}" text-anchor="middle" fill="var(--muted)" font-family="JetBrains Mono" font-size="10">вал</text>`;
      // Balls
      const n = state.N;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Date.now() / 4000;
        const bx = cx + Math.cos(a) * orbitR;
        const by = cy + Math.sin(a) * orbitR;
        const ballGrad = `<radialGradient id="ballGrad${i}"><stop offset="0%" stop-color="#aef3ff"/><stop offset="100%" stop-color="#22d3ee"/></radialGradient>`;
        svgInner += ballGrad;
        svgInner += `<circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="${ballR}" fill="url(#ballGrad${i})" stroke="rgba(0,0,0,0.3)" stroke-width="0.6" />`;
      }
      // Labels for races
      svgInner += `<text x="${cx + Router * 0.7}" y="14" fill="#f472b6" font-family="JetBrains Mono" font-size="9" text-anchor="end">НАРУЖНАЯ ОБОЙМА</text>`;
      svgInner += `<text x="${cx}" y="${cy - Rinner * 0.85}" fill="#60a5fa" font-family="JetBrains Mono" font-size="9" text-anchor="middle">ВНУТР.</text>`;
      svg.innerHTML = svgInner;
    }

    function render() {
      const r = compute();
      drawBearing();
      const setVal = (id, val, unit = ' Гц') => {
        const node = root.querySelector(`[data-bc-out="${id}"]`);
        if (node) node.textContent = val.toFixed(1) + unit;
      };
      setVal('f', r.f);
      setVal('bpfo', r.bpfo);
      setVal('bpfi', r.bpfi);
      setVal('bsf', r.bsf);
      setVal('ftf', r.ftf);

      // Mini frequency strip
      const stripEl = root.querySelector('.bc-strip');
      if (stripEl) {
        const maxF = Math.max(r.bpfi, r.bpfo, r.bsf, r.f) * 1.15;
        const items = [
          { label: 'fR',  val: r.f,    color: 'var(--cyan)'   },
          { label: 'FTF', val: r.ftf,  color: 'var(--yellow)' },
          { label: 'BSF', val: r.bsf,  color: 'var(--purple)' },
          { label: 'BPFO',val: r.bpfo, color: 'var(--pink)'   },
          { label: 'BPFI',val: r.bpfi, color: 'var(--blue)'   },
        ];
        stripEl.innerHTML = items.map(it => {
          const left = (it.val / maxF * 100).toFixed(1);
          return `<div class="bc-strip-tick" style="left:${left}%">
                    <div class="bc-strip-bar" style="background:${it.color}"></div>
                    <div class="bc-strip-label" style="color:${it.color}">${it.label}</div>
                    <div class="bc-strip-freq">${it.val.toFixed(0)}</div>
                  </div>`;
        }).join('');
      }
    }

    // Slow rotation animation
    setInterval(() => drawBearing(), 80);
    render();
  }

  // ═════════════════════════════════════════════════════════════
  // 13) DEFECT QUIZ
  // ═════════════════════════════════════════════════════════════
  function initDefectQuiz() {
    const root = document.getElementById('defectQuiz');
    if (!root) return;
    const canvas = root.querySelector('.quiz-spectrum');
    const optionsEl = root.querySelector('.quiz-options');
    const feedbackEl = root.querySelector('.quiz-feedback');
    const scoreEl = root.querySelector('.quiz-score');
    const nextBtn = root.querySelector('.quiz-next');
    const questionLabel = root.querySelector('.quiz-question-num');

    const CLASSES_Q = [
      { id: 'normal',        label: 'Норма',                color: '#34d399' },
      { id: 'tooth_miss',    label: 'Отсутствие зуба',      color: '#f87171' },
      { id: 'tooth_chip',    label: 'Скол зуба',            color: '#fb923c' },
      { id: 'gear_wear',     label: 'Износ',                color: '#fbbf24' },
      { id: 'crack',         label: 'Трещина',              color: '#a78bfa' },
      { id: 'bearing_inner', label: 'Внутренняя обойма',    color: '#60a5fa' },
      { id: 'bearing_outer', label: 'Наружная обойма',      color: '#f472b6' },
      { id: 'bearing_ball',  label: 'Дефект шарика',        color: '#22d3ee' },
    ];

    const QUESTIONS = [
      { correct: 'normal',        explanation: 'Чистые гармоники GMF, без боковых полос — это классическая «норма».' },
      { correct: 'tooth_miss',    explanation: 'Высокие узкие пики в высокочастотной области + сильные сайдбэнды — отсутствие зуба.' },
      { correct: 'bearing_inner', explanation: 'Доминирующий пик на BPFI (~42 бин) + симметричные сайдбэнды — внутренняя обойма.' },
      { correct: 'crack',         explanation: 'Сайдбэнды вокруг GMF (вверх и вниз) — амплитудная модуляция, признак трещины.' },
      { correct: 'gear_wear',     explanation: 'Шум поднялся «по всему спектру» равномерно — типичный износ зубьев.' },
      { correct: 'bearing_outer', explanation: 'Узкий стабильный пик на BPFO без модуляции — наружная обойма (она неподвижна).' },
      { correct: 'tooth_chip',    explanation: 'Импульсы есть, но мягче чем при отсутствии зуба; сайдбэнды слабее — скол зуба.' },
      { correct: 'normal',        explanation: 'GMF·1 и GMF·2 чистые, шумовой фон низкий, сайдбэндов нет — норма.' },
    ];

    let order = QUESTIONS.map((_, i) => i);
    let qIdx = 0;
    let answered = false;
    let score = 0;
    let total = 0;

    // Reuse signal generators from fault slider via duck-typing class id
    function genForClass(classId, N = 512) {
      const sig = new Float32Array(N);
      const F_GMF = 12, F_GMF2 = 24, F_ROT = 3;
      for (let i = 0; i < N; i++) {
        const x = i / N;
        const tau = i * 2 * Math.PI / N;
        let v = 0.30 * Math.sin(F_GMF * tau) + 0.16 * Math.sin(F_GMF2 * tau) + 0.04 * Math.sin(F_ROT * tau);
        switch (classId) {
          case 'tooth_miss': {
            const ph = (x * F_ROT) % 1;
            if (ph < 0.04) v += 2.4 * Math.exp(-ph * 28);
            v += 0.55 * Math.sin((F_GMF + F_ROT) * tau);
            v += 0.55 * Math.sin((F_GMF - F_ROT) * tau);
            v += 0.35 * Math.sin(54 * tau);
            v += 0.30 * Math.sin(72 * tau);
            break;
          }
          case 'tooth_chip': {
            const ph = (x * F_ROT) % 1;
            if (ph < 0.04) v += 1.2 * Math.exp(-ph * 30);
            v += 0.30 * Math.sin((F_GMF + F_ROT) * tau);
            v += 0.30 * Math.sin((F_GMF - F_ROT) * tau);
            v += 0.18 * Math.sin(54 * tau);
            break;
          }
          case 'gear_wear':
            for (let k = 6; k < 80; k += 2) v += 0.06 * Math.sin(k * tau + k * 0.7);
            v += 0.25 * Math.sin(48 * tau);
            break;
          case 'crack': {
            const m = 1 + 0.9 * Math.sin(F_ROT * tau);
            v *= m;
            v += 0.30 * Math.sin(F_GMF * tau) * m;
            v += 0.18 * Math.sin(36 * tau);
            break;
          }
          case 'bearing_inner':
            v += 0.95 * Math.sin(42 * tau) * (0.7 + 0.3 * Math.sin(F_ROT * tau));
            v += 0.50 * Math.sin(45 * tau);
            v += 0.50 * Math.sin(39 * tau);
            v += 0.30 * Math.sin(84 * tau);
            break;
          case 'bearing_outer':
            v += 1.05 * Math.sin(34 * tau);
            v += 0.40 * Math.sin(68 * tau);
            break;
          case 'bearing_ball':
            v += 0.75 * Math.sin(28 * tau) * (0.7 + 0.3 * Math.sin(F_ROT * tau * 0.8));
            break;
          case 'normal':
          default:
            // Just keep base
            break;
        }
        sig[i] = v + (Math.random() - 0.5) * 0.04;
      }
      return sig;
    }

    function spectrum(sig) {
      const N = sig.length, K = 96;
      const spec = new Float32Array(K);
      const win = new Float32Array(N);
      for (let n = 0; n < N; n++) win[n] = 0.5 - 0.5 * Math.cos(2 * Math.PI * n / (N - 1));
      for (let k = 1; k <= K; k++) {
        let re = 0, im = 0;
        for (let n = 0; n < N; n++) {
          const s = sig[n] * win[n];
          const ang = 2 * Math.PI * k * n / N;
          re += s * Math.cos(ang);
          im -= s * Math.sin(ang);
        }
        spec[k - 1] = Math.sqrt(re * re + im * im) / N;
      }
      return spec;
    }

    function fitCanvas() {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      return ctx;
    }
    let ctx = fitCanvas();
    window.addEventListener('resize', () => { ctx = fitCanvas(); drawQ(); });

    function drawQ() {
      const q = QUESTIONS[order[qIdx]];
      const sig = genForClass(q.correct);
      const spec = spectrum(sig);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#cbd5e1';
      const max = Math.max(...spec, 0.05);
      const barW = w / spec.length;
      for (let i = 0; i < spec.length; i++) {
        const norm = spec[i] / max;
        const scaled = Math.pow(norm, 0.62);
        const barH = scaled * h * 0.86;
        if (barH < 0.4) continue;
        ctx.fillRect(i * barW + 0.5, h - barH, Math.max(1, barW - 1.4), barH);
      }
    }

    function pickOptions(correctId) {
      // 3 random decoys + correct
      const decoys = CLASSES_Q.filter(c => c.id !== correctId).sort(() => Math.random() - 0.5).slice(0, 3);
      const opts = [...decoys, CLASSES_Q.find(c => c.id === correctId)].sort(() => Math.random() - 0.5);
      return opts;
    }

    let currentOptions = [];

    function renderOptions() {
      const q = QUESTIONS[order[qIdx]];
      currentOptions = pickOptions(q.correct);
      optionsEl.innerHTML = currentOptions.map(opt =>
        `<button class="quiz-opt" type="button" data-quiz-cls="${opt.id}">
          <span class="quiz-opt-dot" style="background:${opt.color}"></span>${opt.label}
         </button>`
      ).join('');
      feedbackEl.classList.remove('show', 'is-correct', 'is-wrong');
      feedbackEl.innerHTML = '';
      answered = false;
      nextBtn.disabled = true;
      questionLabel.textContent = `Вопрос ${qIdx + 1} из ${order.length}`;
      drawQ();
    }

    function loadNext() {
      qIdx = (qIdx + 1) % order.length;
      if (qIdx === 0) order = order.sort(() => Math.random() - 0.5);
      renderOptions();
    }

    optionsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.quiz-opt');
      if (!btn || answered) return;
      answered = true;
      const q = QUESTIONS[order[qIdx]];
      const picked = btn.dataset.quizCls;
      total++;
      optionsEl.querySelectorAll('.quiz-opt').forEach(b => {
        b.classList.add('is-locked');
        if (b.dataset.quizCls === q.correct) b.classList.add('is-correct');
        if (b === btn && picked !== q.correct) b.classList.add('is-wrong');
      });
      const isRight = picked === q.correct;
      if (isRight) score++;
      feedbackEl.classList.add('show', isRight ? 'is-correct' : 'is-wrong');
      const correctName = CLASSES_Q.find(c => c.id === q.correct)?.label || q.correct;
      feedbackEl.innerHTML = `
        <strong>${isRight ? '✓ Правильно!' : '✗ Не угадали'}</strong>
        <p>Это «<b>${correctName}</b>». ${q.explanation}</p>
      `;
      scoreEl.textContent = `${score} / ${total}`;
      nextBtn.disabled = false;
      if (isRight && window.UIStates && UIStates.confettiBurst) {
        const rect = btn.getBoundingClientRect();
        UIStates.confettiBurst({ x: rect.left + rect.width / 2, y: rect.top, force: true });
      }
    });

    nextBtn.addEventListener('click', loadNext);

    // Shuffle initial order
    order = order.sort(() => Math.random() - 0.5);
    renderOptions();
  }

  // ═════════════════════════════════════════════════════════════
  // 14) INFERENCE BENCHMARK
  // ═════════════════════════════════════════════════════════════
  function initInferenceBench() {
    const root = document.getElementById('inferenceBench');
    if (!root) return;
    const btn = root.querySelector('.bench-run');
    const progressFill = root.querySelector('.bench-progress-fill');
    const counterEl = root.querySelector('.bench-counter');
    const statsEl = root.querySelector('.bench-stats');
    const sparkCanvas = root.querySelector('.bench-spark');
    let running = false;

    function fitSpark() {
      const dpr = window.devicePixelRatio || 1;
      sparkCanvas.width = sparkCanvas.clientWidth * dpr;
      sparkCanvas.height = sparkCanvas.clientHeight * dpr;
      const ctx = sparkCanvas.getContext('2d');
      ctx.scale(dpr, dpr);
      return ctx;
    }
    let sparkCtx = fitSpark();
    window.addEventListener('resize', () => { sparkCtx = fitSpark(); });

    function fakeInference() {
      // Simulate per-sample work that roughly matches a small RF traversal.
      const features = new Float64Array(53);
      for (let i = 0; i < 53; i++) features[i] = Math.random();
      const votes = new Int32Array(9);
      for (let t = 0; t < 500; t++) {
        let pos = 0;
        for (let depth = 0; depth < 12; depth++) {
          const fi = (t * 7 + depth * 11) % 53;
          pos = features[fi] > 0.5 ? pos * 2 + 1 : pos * 2 + 2;
        }
        votes[pos % 9]++;
      }
      let best = 0;
      for (let i = 1; i < 9; i++) if (votes[i] > votes[best]) best = i;
      return best;
    }

    function drawSpark(latencies) {
      const w = sparkCanvas.clientWidth, h = sparkCanvas.clientHeight;
      sparkCtx.clearRect(0, 0, w, h);
      if (!latencies.length) return;
      const max = Math.max(...latencies, 1);
      sparkCtx.strokeStyle = 'rgba(0, 229, 255, 0.7)';
      sparkCtx.lineWidth = 1.2;
      sparkCtx.beginPath();
      for (let i = 0; i < latencies.length; i++) {
        const x = (i / (latencies.length - 1 || 1)) * w;
        const y = h - (latencies[i] / max) * h * 0.9;
        if (i === 0) sparkCtx.moveTo(x, y); else sparkCtx.lineTo(x, y);
      }
      sparkCtx.stroke();
      sparkCtx.fillStyle = 'rgba(0, 229, 255, 0.1)';
      sparkCtx.lineTo(w, h); sparkCtx.lineTo(0, h); sparkCtx.closePath(); sparkCtx.fill();
    }

    function showStats(latencies) {
      const sorted = [...latencies].sort((a, b) => a - b);
      const avg = latencies.reduce((s, v) => s + v, 0) / latencies.length;
      const median = sorted[Math.floor(sorted.length / 2)];
      const p95 = sorted[Math.floor(sorted.length * 0.95)];
      const max = sorted[sorted.length - 1];
      const min = sorted[0];
      const throughput = 1000 / avg;
      statsEl.innerHTML = `
        <div class="bench-stat"><span>СРЕДНЕЕ</span><strong>${avg.toFixed(2)} мс</strong></div>
        <div class="bench-stat"><span>МЕДИАНА</span><strong>${median.toFixed(2)} мс</strong></div>
        <div class="bench-stat"><span>P95</span><strong>${p95.toFixed(2)} мс</strong></div>
        <div class="bench-stat"><span>МИН</span><strong>${min.toFixed(2)} мс</strong></div>
        <div class="bench-stat"><span>МАКС</span><strong>${max.toFixed(2)} мс</strong></div>
        <div class="bench-stat bench-stat--accent"><span>RPS</span><strong>${throughput.toFixed(0)}</strong></div>
      `;
      statsEl.classList.add('show');
    }

    function runBenchmark(N) {
      if (running) return;
      running = true;
      btn.disabled = true;
      btn.textContent = 'РАБОТАЕМ…';
      statsEl.classList.remove('show');
      const latencies = [];
      let i = 0;

      function batch() {
        const BATCH = 30;
        for (let j = 0; j < BATCH && i < N; j++, i++) {
          const start = performance.now();
          fakeInference();
          latencies.push(performance.now() - start);
        }
        const pct = (i / N) * 100;
        progressFill.style.width = pct + '%';
        counterEl.textContent = `${i} / ${N}`;
        drawSpark(latencies.slice(-200));
        if (i < N) {
          requestAnimationFrame(batch);
        } else {
          running = false;
          btn.disabled = false;
          btn.textContent = 'ПРОГНАТЬ СНОВА';
          showStats(latencies);
        }
      }
      requestAnimationFrame(batch);
    }

    btn.addEventListener('click', () => runBenchmark(1000));
  }

  // ═════════════════════════════════════════════════════════════
  // 15) 3D ROTATING CLASS SPACE
  // ═════════════════════════════════════════════════════════════
  function initClassSpace3D() {
    const root = document.getElementById('classSpace3D');
    if (!root) return;
    const canvas = root.querySelector('canvas');
    const legendEl = root.querySelector('.cs3-legend');
    const hintEl = root.querySelector('.cs3-hint');

    const CLASSES_3D = [
      { id: 'normal',        label: 'Норма',          color: '#34d399', cx: -2.4, cy:  1.5, cz: -0.6 },
      { id: 'tooth_miss',    label: 'Нет зуба',       color: '#f87171', cx:  2.4, cy:  1.8, cz:  0.8 },
      { id: 'tooth_chip',    label: 'Скол зуба',      color: '#fb923c', cx:  1.7, cy:  2.4, cz:  0.2 },
      { id: 'gear_wear',     label: 'Износ',          color: '#fbbf24', cx: -0.7, cy:  2.2, cz: -1.0 },
      { id: 'crack',         label: 'Трещина',        color: '#a78bfa', cx: -1.4, cy: -0.8, cz:  1.4 },
      { id: 'bearing_inner', label: 'Вн.обойма',      color: '#60a5fa', cx:  1.6, cy: -1.6, cz: -0.4 },
      { id: 'bearing_outer', label: 'Нар.обойма',     color: '#f472b6', cx:  2.4, cy: -2.4, cz:  0.8 },
      { id: 'bearing_ball',  label: 'Шарик',          color: '#22d3ee', cx:  0.6, cy: -2.0, cz: -1.6 },
      { id: 'combo',         label: 'Комбин.',        color: '#fb7185', cx:  0.0, cy:  0.3, cz:  0.5 },
    ];
    const POINTS_PER_CLASS = 45;
    const SPREAD = 0.5;
    const points = [];
    CLASSES_3D.forEach((c, classIdx) => {
      for (let i = 0; i < POINTS_PER_CLASS; i++) {
        const u1 = Math.random(), u2 = Math.random();
        const u3 = Math.random(), u4 = Math.random();
        const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        const z1 = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2);
        const z2 = Math.sqrt(-2 * Math.log(u3)) * Math.cos(2 * Math.PI * u4);
        points.push({
          x: c.cx + z0 * SPREAD,
          y: c.cy + z1 * SPREAD,
          z: c.cz + z2 * SPREAD,
          ci: classIdx,
          color: c.color,
        });
      }
    });

    let angleY = 0.3, angleX = 0.25;
    let dragging = false, lastX = 0, lastY = 0;
    let lastInteract = 0;
    let activeClass = null;
    let rafId = null;

    function fitCanvas() {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      return ctx;
    }
    let ctx = fitCanvas();
    window.addEventListener('resize', () => { ctx = fitCanvas(); });

    canvas.addEventListener('mousedown', e => {
      dragging = true;
      lastX = e.clientX; lastY = e.clientY;
      lastInteract = performance.now();
      canvas.style.cursor = 'grabbing';
    });
    window.addEventListener('mouseup', () => {
      dragging = false;
      canvas.style.cursor = 'grab';
    });
    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      angleY += dx * 0.008;
      angleX = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, angleX + dy * 0.008));
      lastX = e.clientX; lastY = e.clientY;
      lastInteract = performance.now();
    });
    canvas.style.cursor = 'grab';

    function project(p) {
      const cy = Math.cos(angleY), sy = Math.sin(angleY);
      const cx = Math.cos(angleX), sx = Math.sin(angleX);
      let x = p.x * cy + p.z * sy;
      let z = -p.x * sy + p.z * cy;
      let y = p.y * cx - z * sx;
      const zz = p.y * sx + z * cx;
      const dist = 9;
      const scale = dist / (dist + zz);
      return { sx: x * scale, sy: y * scale, depth: zz, scale };
    }

    function render() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      // Auto-rotate after idle
      if (performance.now() - lastInteract > 2000) {
        angleY += 0.0035;
      }
      const cx0 = w / 2, cy0 = h / 2;
      const projected = points.map(p => ({ p, pr: project(p) }));
      projected.sort((a, b) => b.pr.depth - a.pr.depth);
      // Axes — simple cross at origin
      const ax = project({ x: 0, y: 0, z: 0 });
      ['x', 'y', 'z'].forEach(axis => {
        const end = project({ x: axis === 'x' ? 3 : 0, y: axis === 'y' ? 3 : 0, z: axis === 'z' ? 3 : 0 });
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx0 + ax.sx * 50, cy0 - ax.sy * 50);
        ctx.lineTo(cx0 + end.sx * 50, cy0 - end.sy * 50);
        ctx.stroke();
      });
      // Points
      projected.forEach(({ p, pr }) => {
        const isActive = activeClass === null || p.ci === activeClass;
        const r = (2.5 + 1.5 * pr.scale) * (isActive ? 1 : 0.6);
        const x = cx0 + pr.sx * 50;
        const y = cy0 - pr.sy * 50;
        ctx.globalAlpha = isActive ? (0.4 + 0.5 * pr.scale) : 0.07;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      // Centroid labels
      CLASSES_3D.forEach((c, i) => {
        if (activeClass !== null && activeClass !== i) return;
        const pr = project({ x: c.cx, y: c.cy, z: c.cz });
        ctx.font = '600 11px "JetBrains Mono", monospace';
        ctx.fillStyle = c.color;
        ctx.textAlign = 'center';
        ctx.fillText(c.label, cx0 + pr.sx * 50, cy0 - pr.sy * 50 - 14);
      });
      rafId = requestAnimationFrame(render);
    }

    legendEl.innerHTML = CLASSES_3D.map((c, i) =>
      `<button class="cs3-legend-item" data-cs3-class="${i}" type="button">
        <span class="cs3-legend-dot" style="background:${c.color}"></span>${c.label}
       </button>`
    ).join('');
    legendEl.addEventListener('click', e => {
      const btn = e.target.closest('.cs3-legend-item');
      if (!btn) return;
      const idx = +btn.dataset.cs3Class;
      if (activeClass === idx) {
        activeClass = null;
        legendEl.querySelectorAll('.cs3-legend-item').forEach(b => b.classList.remove('is-active', 'is-dim'));
      } else {
        activeClass = idx;
        legendEl.querySelectorAll('.cs3-legend-item').forEach(b => {
          b.classList.toggle('is-active', +b.dataset.cs3Class === idx);
          b.classList.toggle('is-dim', +b.dataset.cs3Class !== idx);
        });
      }
    });

    // Pause animation when not in viewport
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (e.isIntersecting && !rafId) rafId = requestAnimationFrame(render);
          else if (!e.isIntersecting && rafId) { cancelAnimationFrame(rafId); rafId = null; }
        });
      }, { threshold: 0.2 });
      io.observe(root);
    } else {
      rafId = requestAnimationFrame(render);
    }
  }

  // ═════════════════════════════════════════════════════════════
  // 16) DECISION TREE PATH ANIMATION
  // ═════════════════════════════════════════════════════════════
  function initTreePath() {
    const root = document.getElementById('treePath');
    if (!root) return;
    const svgEl = root.querySelector('svg.tp-svg');
    const logEl = root.querySelector('.tp-log');
    const verdictEl = root.querySelector('.tp-verdict');
    const samplesEl = root.querySelector('.tp-samples');
    const restartBtn = root.querySelector('.tp-restart');

    const SAMPLES = [
      { id: 'normal',        label: 'Норма',                color: '#34d399',
        features: { 'Env.BPFI': 0.12, 'Эксцесс': 0.4, 'RMS': 0.18, 'Крест-фактор': 3.1, 'GMF·1': 0.62 } },
      { id: 'tooth_miss',    label: 'Отсутствие зуба',      color: '#f87171',
        features: { 'Env.BPFI': 0.18, 'Эксцесс': 8.2, 'RMS': 0.62, 'Крест-фактор': 7.5, 'GMF·1': 0.30 } },
      { id: 'crack',         label: 'Трещина',              color: '#a78bfa',
        features: { 'Env.BPFI': 0.15, 'Эксцесс': 2.1, 'RMS': 0.30, 'Крест-фактор': 4.0, 'GMF·1': 0.55 } },
      { id: 'bearing_inner', label: 'Внутренняя обойма',    color: '#60a5fa',
        features: { 'Env.BPFI': 0.91, 'Эксцесс': 3.8, 'RMS': 0.45, 'Крест-фактор': 4.8, 'GMF·1': 0.42 } },
      { id: 'bearing_outer', label: 'Наружная обойма',      color: '#f472b6',
        features: { 'Env.BPFI': 0.78, 'Эксцесс': 2.4, 'RMS': 0.40, 'Крест-фактор': 4.2, 'GMF·1': 0.40 } },
    ];

    // Decision tree — each non-leaf has feature/threshold/left/right; leaf has {leaf, color}
    const TREE = {
      feature: 'Env.BPFI', threshold: 0.5,
      left: {
        feature: 'Эксцесс', threshold: 5,
        left: {
          feature: 'RMS', threshold: 0.4,
          left: {
            feature: 'GMF·1', threshold: 0.5,
            left:  { leaf: 'Износ',    color: '#fbbf24' },
            right: { leaf: 'Норма',    color: '#34d399' },
          },
          right: {
            feature: 'Крест-фактор', threshold: 4.5,
            left:  { leaf: 'Трещина',  color: '#a78bfa' },
            right: { leaf: 'Скол зуба', color: '#fb923c' },
          },
        },
        right: { leaf: 'Отсутствие зуба', color: '#f87171' },
      },
      right: {
        feature: 'Эксцесс', threshold: 3,
        left:  { leaf: 'Наружная обойма', color: '#f472b6' },
        right: { leaf: 'Внутренняя обойма', color: '#60a5fa' },
      },
    };

    // Layout
    const SVG_W = 780, SVG_H = 380;
    svgEl.setAttribute('viewBox', `0 0 ${SVG_W} ${SVG_H}`);

    function layoutTree(node, depth = 0, slot = 0, slotsAtDepth = []) {
      slotsAtDepth[depth] = (slotsAtDepth[depth] || 0) + 1;
      node._depth = depth;
      if (node.leaf) return;
      layoutTree(node.left, depth + 1, 0, slotsAtDepth);
      layoutTree(node.right, depth + 1, 1, slotsAtDepth);
    }
    layoutTree(TREE);
    // Assign x positions per depth row
    const byDepth = {};
    function collect(node) {
      if (!byDepth[node._depth]) byDepth[node._depth] = [];
      byDepth[node._depth].push(node);
      if (node.leaf) return;
      collect(node.left); collect(node.right);
    }
    collect(TREE);
    Object.keys(byDepth).forEach(depth => {
      const row = byDepth[depth];
      const yRow = 40 + depth * 70;
      row.forEach((node, idx) => {
        node._x = ((idx + 1) / (row.length + 1)) * SVG_W;
        node._y = yRow;
      });
    });

    let pathNodes = [];
    let currentNode = null;
    let cancelled = false;

    function nodeMatches(node) {
      return pathNodes.indexOf(node) >= 0;
    }
    function edgeActive(a, b) {
      const i = pathNodes.indexOf(a);
      return i >= 0 && pathNodes[i + 1] === b;
    }

    function renderTree() {
      let svg = '';
      function drawEdges(node) {
        if (node.leaf) return;
        const eLeft  = edgeActive(node, node.left)  ? 'tp-edge tp-edge--active' : 'tp-edge';
        const eRight = edgeActive(node, node.right) ? 'tp-edge tp-edge--active' : 'tp-edge';
        svg += `<line class="${eLeft}"  x1="${node._x}" y1="${node._y}" x2="${node.left._x}"  y2="${node.left._y}"  />`;
        svg += `<line class="${eRight}" x1="${node._x}" y1="${node._y}" x2="${node.right._x}" y2="${node.right._y}" />`;
        drawEdges(node.left); drawEdges(node.right);
      }
      drawEdges(TREE);
      function drawNodes(node) {
        const isActive = nodeMatches(node);
        const isCurrent = node === currentNode;
        if (node.leaf) {
          svg += `<g class="tp-node tp-leaf${isActive ? ' is-active' : ''}" transform="translate(${node._x},${node._y})">
            <circle r="20" fill="${node.color}" opacity="${isActive ? 0.35 : 0.10}" />
            <circle r="14" fill="${node.color}" opacity="${isActive ? 1 : 0.35}" />
            <text x="0" y="34" text-anchor="middle" font-family="JetBrains Mono" font-size="9" fill="${isActive ? node.color : '#7c8a9c'}" font-weight="600">${node.leaf}</text>
          </g>`;
        } else {
          const strokeWidth = isCurrent ? 2 : 1;
          const stroke = isActive ? '#00e5ff' : '#324159';
          svg += `<g class="tp-node tp-decision${isActive ? ' is-active' : ''}${isCurrent ? ' is-current' : ''}" transform="translate(${node._x},${node._y})">
            <rect x="-58" y="-16" width="116" height="32" rx="6" fill="#141c2e" stroke="${stroke}" stroke-width="${strokeWidth}" />
            <text x="0" y="-3" text-anchor="middle" font-family="JetBrains Mono" font-size="9" fill="${isActive ? '#00e5ff' : '#cbd5e1'}" font-weight="700">${node.feature}</text>
            <text x="0" y="10" text-anchor="middle" font-family="JetBrains Mono" font-size="8" fill="#7c8a9c">&gt; ${node.threshold}?</text>
          </g>`;
          drawNodes(node.left); drawNodes(node.right);
        }
      }
      drawNodes(TREE);
      svgEl.innerHTML = svg;
    }

    function sleep(ms) {
      return new Promise(r => setTimeout(r, ms));
    }

    async function runSample(sample) {
      cancelled = true;
      await sleep(20);
      cancelled = false;
      pathNodes = [];
      currentNode = TREE;
      verdictEl.classList.remove('show');
      verdictEl.innerHTML = '';
      logEl.innerHTML = `<div class="tp-log-features">Признаки сэмпла: ${Object.entries(sample.features).map(([k, v]) => `<span><b>${k}</b> = ${v.toFixed(2)}</span>`).join('')}</div>`;
      renderTree();

      let depth = 0;
      while (!currentNode.leaf) {
        if (cancelled) return;
        pathNodes.push(currentNode);
        renderTree();
        await sleep(950);
        if (cancelled) return;

        const value = sample.features[currentNode.feature] || 0;
        const goLeft = value <= currentNode.threshold;
        const dir = goLeft ? 'налево' : 'направо';
        const op = goLeft ? '≤' : '>';

        const stepDiv = document.createElement('div');
        stepDiv.className = 'tp-log-step';
        stepDiv.innerHTML = `<span class="tp-log-num">${depth + 1}</span>
          <strong>${currentNode.feature}</strong> = <b>${value.toFixed(2)}</b>
          ${op} <b>${currentNode.threshold}</b> → идём <em>${dir}</em>`;
        logEl.appendChild(stepDiv);

        currentNode = goLeft ? currentNode.left : currentNode.right;
        depth++;
      }
      pathNodes.push(currentNode);
      renderTree();
      verdictEl.innerHTML = `Лист дерева: <strong style="color:${currentNode.color}">${currentNode.leaf}</strong> · принято за ${depth} проверок`;
      verdictEl.style.borderLeftColor = currentNode.color;
      verdictEl.classList.add('show');
    }

    samplesEl.innerHTML = SAMPLES.map((s, i) =>
      `<button class="tp-sample${i === 0 ? ' is-active' : ''}" type="button" data-tp-sample="${i}">
        <span class="tp-sample-dot" style="background:${s.color}"></span>${s.label}
       </button>`
    ).join('');
    samplesEl.addEventListener('click', e => {
      const btn = e.target.closest('.tp-sample');
      if (!btn) return;
      samplesEl.querySelectorAll('.tp-sample').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      runSample(SAMPLES[+btn.dataset.tpSample]);
    });
    restartBtn?.addEventListener('click', () => {
      const active = samplesEl.querySelector('.tp-sample.is-active');
      const idx = active ? +active.dataset.tpSample : 0;
      runSample(SAMPLES[idx]);
    });

    renderTree();
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries, obs) => {
        entries.forEach(e => { if (e.isIntersecting) { runSample(SAMPLES[0]); obs.unobserve(e.target); } });
      }, { threshold: 0.25 });
      io.observe(root);
    } else {
      runSample(SAMPLES[0]);
    }
  }

  function init() {
    initRFVoting();
    initFeatureFlow();
    initFaultSlider();
    initConfusionMatrix();
    initFeatureImportance();
    initClassSpace();
    initSpectrogram();
    initRadarFingerprint();
    initGlossaryArrows();
    initStatusOscilloscope();
    initSignalMixer();
    initBearingCalc();
    initDefectQuiz();
    initInferenceBench();
    initClassSpace3D();
    initTreePath();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
