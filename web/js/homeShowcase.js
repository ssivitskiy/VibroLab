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

  function init() {
    initRFVoting();
    initFeatureFlow();
    initFaultSlider();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
