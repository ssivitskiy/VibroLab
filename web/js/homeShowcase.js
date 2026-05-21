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

  function init() {
    initRFVoting();
    initFeatureFlow();
    initFaultSlider();
    initConfusionMatrix();
    initFeatureImportance();
    initClassSpace();
    initSpectrogram();
    initRadarFingerprint();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
