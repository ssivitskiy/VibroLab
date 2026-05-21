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
      const w = ctx.canvas.width, h = ctx.canvas.height;
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

    function genSig(faultId, intensity, N = 512) {
      const sig = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const t = i / N * 4;
        let v = 0.35 * Math.sin(2 * Math.PI * 30 * t)
          + 0.15 * Math.sin(2 * Math.PI * 60 * t);
        const ph = (t * 8) % 1;

        if (intensity > 0) {
          const I = intensity;
          if (faultId === 'tooth_miss') {
            if (ph < 0.05) v += I * 1.4 * Math.exp(-ph / 0.012) * Math.sin(2 * Math.PI * 700 * t);
            v += I * 0.15 * Math.sin(2 * Math.PI * 90 * t);
          } else if (faultId === 'bearing_inner') {
            v += I * 0.45 * Math.sin(2 * Math.PI * 110 * t) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 6 * t));
          } else if (faultId === 'crack') {
            v *= 1 + I * 0.6 * Math.sin(2 * Math.PI * 7 * t);
          } else if (faultId === 'wear') {
            v += I * 0.4 * (Math.random() - 0.5);
            v += I * 0.15 * Math.sin(2 * Math.PI * 45 * t);
          }
        }
        sig[i] = v + (Math.random() - 0.5) * 0.03;
      }
      return sig;
    }

    function computeSpectrum(sig) {
      // Simple |DFT| approximation using sin/cos sums (not real FFT, fine for demo)
      const N = sig.length;
      const K = 64; // bins
      const spec = new Float32Array(K);
      for (let k = 1; k <= K; k++) {
        let re = 0, im = 0;
        for (let n = 0; n < N; n++) {
          const ang = 2 * Math.PI * k * n / N;
          re += sig[n] * Math.cos(ang);
          im -= sig[n] * Math.sin(ang);
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
      const w = ctx.canvas.width, h = ctx.canvas.height;
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
      const w = ctx.canvas.width, h = ctx.canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = color;
      const max = Math.max(...spec, 0.05);
      const barW = w / spec.length;
      for (let i = 0; i < spec.length; i++) {
        const barH = (spec[i] / max) * h * 0.85;
        ctx.fillRect(i * barW + 1, h - barH, barW - 2, barH);
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

  function init() {
    initRFVoting();
    initFeatureFlow();
    initFaultSlider();
    initConfusionMatrix();
    initFeatureImportance();
    initClassSpace();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
