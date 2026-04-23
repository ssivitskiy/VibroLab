/**
 * VibroLab — Визуализация (Canvas).
 * Осциллограф, спектр, анимации.
 */

const Viz = (() => {
  const GRID_COLOR = 'rgba(0,229,255,0.04)';
  const CENTER_COLOR = 'rgba(0,229,255,0.08)';

  function toRgba(color, alpha = 1) {
    if (!color) return `rgba(0,229,255,${alpha})`;
    if (color.startsWith('rgba(')) {
      const body = color.slice(5, -1).split(',').slice(0, 3).join(',');
      return `rgba(${body},${alpha})`;
    }
    if (color.startsWith('rgb(')) {
      const body = color.slice(4, -1);
      return `rgba(${body},${alpha})`;
    }
    if (color.startsWith('#') && (color.length === 7 || color.length === 4)) {
      const hex = color.length === 4
        ? color.slice(1).split('').map((ch) => ch + ch).join('')
        : color.slice(1);
      const value = parseInt(hex, 16);
      const r = (value >> 16) & 255;
      const g = (value >> 8) & 255;
      const b = value & 255;
      return `rgba(${r},${g},${b},${alpha})`;
    }
    return color;
  }

  function setupCanvas(canvas) {
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    return canvas.getContext('2d');
  }

  function drawGrid(ctx, W, H, cols = 10, rows = 4) {
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += W / cols) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += H / rows) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.strokeStyle = CENTER_COLOR;
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
  }

  /**
   * Рисует сигнал на canvas.
   * @param {string|HTMLCanvasElement} canvasOrId
   * @param {Float64Array} signal
   * @param {string} color
   * @param {boolean} animated — анимировать прокрутку
   * @returns {Function} — stop() для остановки анимации
   */
  function drawSignal(canvasOrId, signal, color = '#00e5ff', animated = false) {
    const canvas = typeof canvasOrId === 'string' ? document.getElementById(canvasOrId) : canvasOrId;
    // Cancel any previous animation on this canvas
    if (canvas._animId) { cancelAnimationFrame(canvas._animId); canvas._animId = null; }
    const ctx = setupCanvas(canvas);
    const W = canvas.width, H = canvas.height;
    const maxV = Math.max(...Array.from(signal).map(v => Math.abs(v)), 0.001);

    let offset = 0, animId;

    function draw() {
      ctx.clearRect(0, 0, W, H);
      drawGrid(ctx, W, H);

      ctx.shadowBlur = 6;
      ctx.shadowColor = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();

      for (let i = 0; i < signal.length; i++) {
        const x = (i / signal.length) * W;
        const idx = (i + Math.floor(offset)) % signal.length;
        const y = H / 2 - signal[idx] / maxV * H * 0.4;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      if (animated) {
        offset += 0.3;
        animId = requestAnimationFrame(draw);
        canvas._animId = animId;
      }
    }
    draw();

    return () => { if (animId) cancelAnimationFrame(animId); canvas._animId = null; };
  }

  /**
   * Рисует спектр на canvas с анимацией роста.
   */
  function drawSpectrum(canvasOrId, freqs, spectrum, color = '#00e5ff', maxFreq = 2000) {
    const canvas = typeof canvasOrId === 'string' ? document.getElementById(canvasOrId) : canvasOrId;
    const ctx = setupCanvas(canvas);
    const W = canvas.width, H = canvas.height;

    // Filter to maxFreq
    const indices = [];
    for (let i = 0; i < freqs.length; i++) {
      if (freqs[i] <= maxFreq) indices.push(i);
    }

    const maxA = Math.max(...indices.map(i => spectrum[i]), 0.001);
    const barW = Math.max(2, W / indices.length - 0.5);

    let progress = 0;

    function draw() {
      ctx.clearRect(0, 0, W, H);

      // Grid
      ctx.strokeStyle = GRID_COLOR;
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += W / 10) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(0,229,255,0.06)';
      ctx.beginPath(); ctx.moveTo(0, H - 20); ctx.lineTo(W, H - 20); ctx.stroke();

      // Bars
      for (let j = 0; j < indices.length; j++) {
        const i = indices[j];
        const x = (j / indices.length) * W;
        const h = (spectrum[i] / maxA) * (H - 30) * Math.min(1, progress);
        const isGMF = Math.abs(freqs[i] - VM.GMF) < 15 ||
                       Math.abs(freqs[i] - VM.GMF * 2) < 15 ||
                       Math.abs(freqs[i] - VM.GMF * 3) < 15;
        ctx.fillStyle = isGMF ? '#fb923c' : color;
        ctx.globalAlpha = isGMF ? 1 : 0.7;
        ctx.fillRect(x, H - 20 - h, barW, h);
      }
      ctx.globalAlpha = 1;

      // Freq labels
      ctx.fillStyle = '#4a5568';
      ctx.font = `${Math.max(16, W * 0.014)}px "JetBrains Mono"`;
      for (let f = 0; f <= maxFreq; f += 500) {
        const x = (f / maxFreq) * W;
        ctx.fillText(f + 'Hz', x + 4, H - 4);
      }

      if (progress < 1) {
        progress += 0.04;
        requestAnimationFrame(draw);
      }
    }
    draw();
  }

  function drawSignalComparison(canvasOrId, baselineSignal, currentSignal, opts = {}) {
    const canvas = typeof canvasOrId === 'string' ? document.getElementById(canvasOrId) : canvasOrId;
    if (canvas._animId) { cancelAnimationFrame(canvas._animId); canvas._animId = null; }
    const ctx = setupCanvas(canvas);
    const W = canvas.width, H = canvas.height;
    const baseData = Array.from(baselineSignal || []);
    const currentData = Array.from(currentSignal || []);
    const maxV = Math.max(
      ...baseData.map((v) => Math.abs(v)),
      ...currentData.map((v) => Math.abs(v)),
      0.001,
    );
    const baselineColor = opts.baselineColor || '#94a3b8';
    const currentColor = opts.currentColor || '#00e5ff';
    const baselineLabel = opts.baselineLabel || 'Baseline';
    const currentLabel = opts.currentLabel || 'Current';

    ctx.clearRect(0, 0, W, H);
    drawGrid(ctx, W, H);

    const drawSeries = (data, color, lineWidth = 2, dashed = false, glow = false, alpha = 1) => {
      if (!data.length) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      if (dashed) ctx.setLineDash([10, 8]);
      if (glow) {
        ctx.shadowBlur = 8;
        ctx.shadowColor = color;
      }
      ctx.beginPath();
      for (let i = 0; i < data.length; i++) {
        const x = (i / Math.max(1, data.length - 1)) * W;
        const y = H / 2 - data[i] / maxV * H * 0.38;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    };

    drawSeries(baseData, toRgba(baselineColor, 0.9), 1.6, true, false, 0.85);
    drawSeries(currentData, currentColor, 2.4, false, true, 1);

    ctx.fillStyle = '#8ea0b5';
    ctx.font = `${Math.max(16, W * 0.014)}px "JetBrains Mono"`;
    ctx.fillText(baselineLabel, 14, 24);
    ctx.fillStyle = currentColor;
    ctx.fillText(currentLabel, 118, 24);
  }

  function drawSpectrumComparison(canvasOrId, freqs, currentSpectrum, baselineSpectrum = null, opts = {}) {
    const canvas = typeof canvasOrId === 'string' ? document.getElementById(canvasOrId) : canvasOrId;
    const ctx = setupCanvas(canvas);
    const W = canvas.width, H = canvas.height;
    const maxFreq = opts.maxFreq || 2000;
    const currentColor = opts.currentColor || '#00e5ff';
    const baselineColor = opts.baselineColor || '#94a3b8';
    const markers = Array.isArray(opts.markers) ? opts.markers : [];
    const baselineLabel = opts.baselineLabel || 'Baseline';
    const currentLabel = opts.currentLabel || 'Current';

    const indices = [];
    for (let i = 0; i < freqs.length; i++) {
      if (freqs[i] <= maxFreq) indices.push(i);
    }
    const currentMax = Math.max(...indices.map((i) => currentSpectrum[i] || 0), 0.001);
    const baselineMax = baselineSpectrum ? Math.max(...indices.map((i) => baselineSpectrum[i] || 0), 0.001) : 0.001;
    const maxA = Math.max(currentMax, baselineMax, 0.001);

    ctx.clearRect(0, 0, W, H);
    drawGrid(ctx, W, H, 10, 4);

    const drawLine = (data, color, width = 2, dashed = false, alpha = 1) => {
      if (!data) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      if (dashed) ctx.setLineDash([8, 7]);
      ctx.beginPath();
      indices.forEach((idx, j) => {
        const x = (j / Math.max(1, indices.length - 1)) * W;
        const h = ((data[idx] || 0) / maxA) * (H - 30);
        const y = H - 20 - h;
        j === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.restore();
    };

    drawLine(baselineSpectrum, toRgba(baselineColor, 0.88), 1.7, true, 0.95);

    ctx.save();
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = 2.2;
    ctx.shadowBlur = 8;
    ctx.shadowColor = currentColor;
    ctx.beginPath();
    indices.forEach((idx, j) => {
      const x = (j / Math.max(1, indices.length - 1)) * W;
      const h = ((currentSpectrum[idx] || 0) / maxA) * (H - 30);
      const y = H - 20 - h;
      j === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();

    markers.forEach((marker, index) => {
      if (marker.freq == null || marker.freq > maxFreq || marker.freq < 0) return;
      const x = (marker.freq / maxFreq) * W;
      const labelY = 18 + (index % 3) * 20;
      const label = marker.label;
      const tx = Math.min(Math.max(8, x + 8), W - 120);
      ctx.save();
      ctx.strokeStyle = toRgba(marker.color || '#fbbf24', 0.9);
      ctx.lineWidth = 1.4;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H - 20);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = marker.color || '#fbbf24';
      ctx.beginPath();
      ctx.arc(x, labelY + 2, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `${Math.max(14, W * 0.012)}px "JetBrains Mono"`;
      const textWidth = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(7,10,17,0.92)';
      ctx.fillRect(tx - 4, labelY - 12, textWidth + 10, 18);
      ctx.strokeStyle = toRgba(marker.color || '#fbbf24', 0.35);
      ctx.lineWidth = 1;
      ctx.strokeRect(tx - 4, labelY - 12, textWidth + 10, 18);
      ctx.fillStyle = marker.color || '#fbbf24';
      ctx.fillText(label, tx, labelY);
      ctx.restore();
    });

    ctx.fillStyle = '#8ea0b5';
    ctx.font = `${Math.max(14, W * 0.012)}px "JetBrains Mono"`;
    ctx.fillText(baselineLabel, 14, H - 34);
    ctx.fillStyle = currentColor;
    ctx.fillText(currentLabel, 102, H - 34);

    ctx.fillStyle = '#4a5568';
    ctx.font = `${Math.max(16, W * 0.014)}px "JetBrains Mono"`;
    for (let f = 0; f <= maxFreq; f += 500) {
      const x = (f / maxFreq) * W;
      ctx.fillText(`${f}Hz`, x + 4, H - 4);
    }
  }

  /**
   * Анимированный осциллограф для hero-секции.
   */
  function heroOscilloscope(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    function resize() { canvas.width = canvas.offsetWidth * 2; canvas.height = canvas.offsetHeight * 2; }
    resize();
    window.addEventListener('resize', resize);

    let t = 0, fault = false, fc = 0;

    function draw() {
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      drawGrid(ctx, W, H, 8, 4);

      ctx.shadowBlur = 10;
      ctx.shadowColor = '#00e5ff';
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 2;
      ctx.beginPath();

      const A = H * 0.18;
      for (let x = 0; x < W; x++) {
        const p = x * 0.06 + t;
        let y = H/2 + Math.sin(p)*A + Math.sin(p*3.1)*A*0.3 +
                Math.sin(p*5.7)*A*0.12 + Math.sin(p*0.4)*A*0.2;
        if (Math.abs(x - W*0.65) < 3 && fault) y = H/2 + A*3.5;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      if (fault) {
        ctx.fillStyle = '#fb923c';
        ctx.font = `${Math.max(12, W*0.012)}px "JetBrains Mono"`;
        ctx.fillText('АНОМАЛИЯ', W*0.65-48, H*0.2);
        ctx.strokeStyle = 'rgba(251,146,60,0.35)';
        ctx.setLineDash([4,4]);
        ctx.beginPath(); ctx.moveTo(W*0.65,0); ctx.lineTo(W*0.65,H); ctx.stroke();
        ctx.setLineDash([]);
      }

      t += 0.04;
      fc++;
      if (fc % 140 === 0) fault = !fault;
      requestAnimationFrame(draw);
    }
    draw();
  }

  /**
   * Рисует огибающую сигнала (приближение Гильберта) с заливкой.
   * @param {string|HTMLCanvasElement} canvasOrId
   * @param {Float64Array|number[]} signal
   * @param {string} color
   */
  function drawEnvelope(canvasOrId, signal, color = '#00e5ff') {
    const canvas = typeof canvasOrId === 'string' ? document.getElementById(canvasOrId) : canvasOrId;
    const ctx = setupCanvas(canvas);
    const W = canvas.width, H = canvas.height;

    // Hilbert-envelope approximation: sliding-window RMS
    const winSize = Math.max(4, Math.floor(signal.length / 80));
    const envelope = new Float64Array(signal.length);
    for (let i = 0; i < signal.length; i++) {
      let sum = 0, count = 0;
      for (let j = Math.max(0, i - winSize); j <= Math.min(signal.length - 1, i + winSize); j++) {
        sum += signal[j] * signal[j];
        count++;
      }
      envelope[i] = Math.sqrt(sum / count);
    }

    const maxV = Math.max(...Array.from(envelope), 0.001);

    ctx.clearRect(0, 0, W, H);
    drawGrid(ctx, W, H);

    // Filled area
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let i = 0; i < envelope.length; i++) {
      const x = (i / envelope.length) * W;
      const y = H - (envelope[i] / maxV) * H * 0.85;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fillStyle = color.replace(')', ',0.15)').replace('rgb(', 'rgba(');
    if (!ctx.fillStyle.startsWith('rgba')) {
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = color;
    }
    ctx.fill();
    ctx.globalAlpha = 1;

    // Stroke line
    ctx.shadowBlur = 6;
    ctx.shadowColor = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < envelope.length; i++) {
      const x = (i / envelope.length) * W;
      const y = H - (envelope[i] / maxV) * H * 0.85;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Label
    ctx.fillStyle = '#4a5568';
    ctx.font = `${Math.max(16, W * 0.014)}px "JetBrains Mono"`;
    ctx.fillText('Envelope', 8, Math.max(20, W * 0.018));
  }

  /**
   * Рисует спектрограмму (waterfall) с STFT и тепловой картой.
   * Палитра: тёмно-синий → cyan → жёлтый → красный.
   * @param {string|HTMLCanvasElement} canvasOrId
   * @param {Float64Array|number[]} signal
   * @param {number} fs — частота дискретизации
   * @param {string} color — (unused, palette is fixed heatmap)
   */
  function drawSpectrogram(canvasOrId, signal, fs = 8000, color) {
    const canvas = typeof canvasOrId === 'string' ? document.getElementById(canvasOrId) : canvasOrId;
    const ctx = setupCanvas(canvas);
    const W = canvas.width, H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    // STFT parameters
    const fftSize = 256;
    const hop = Math.max(1, Math.floor(fftSize / 2));
    const numFrames = Math.floor((signal.length - fftSize) / hop);
    const numBins = fftSize / 2;

    if (numFrames < 1) return;

    // Hann window
    const hann = new Float64Array(fftSize);
    for (let n = 0; n < fftSize; n++) hann[n] = 0.5 * (1 - Math.cos(2 * Math.PI * n / (fftSize - 1)));

    // Compute magnitude spectrogram
    const specData = [];
    let globalMax = 0;
    for (let f = 0; f < numFrames; f++) {
      const re = new Float64Array(fftSize);
      const im = new Float64Array(fftSize);
      for (let n = 0; n < fftSize; n++) re[n] = signal[f * hop + n] * hann[n];
      // DFT (simple radix-2 approximation via direct computation for small N)
      const mag = new Float64Array(numBins);
      for (let k = 0; k < numBins; k++) {
        let sumRe = 0, sumIm = 0;
        for (let n = 0; n < fftSize; n++) {
          const angle = -2 * Math.PI * k * n / fftSize;
          sumRe += re[n] * Math.cos(angle);
          sumIm += re[n] * Math.sin(angle);
        }
        mag[k] = Math.sqrt(sumRe * sumRe + sumIm * sumIm);
        if (mag[k] > globalMax) globalMax = mag[k];
      }
      specData.push(mag);
    }

    if (globalMax === 0) globalMax = 1;

    // Heatmap palette: dark blue → cyan → yellow → red
    function heatColor(t) {
      t = Math.max(0, Math.min(1, t));
      let r, g, b;
      if (t < 0.33) {
        const s = t / 0.33;
        r = 0; g = Math.floor(s * 229); b = Math.floor(80 + s * 175);
      } else if (t < 0.66) {
        const s = (t - 0.33) / 0.33;
        r = Math.floor(s * 255); g = Math.floor(229 + s * 26); b = Math.floor(255 - s * 255);
      } else {
        const s = (t - 0.66) / 0.34;
        r = 255; g = Math.floor(255 - s * 200); b = 0;
      }
      return `rgb(${r},${g},${b})`;
    }

    const cellW = W / numFrames;
    const cellH = H / numBins;

    for (let f = 0; f < numFrames; f++) {
      for (let k = 0; k < numBins; k++) {
        const val = specData[f][k] / globalMax;
        ctx.fillStyle = heatColor(val);
        // Frequency axis is inverted (low freq at bottom)
        ctx.fillRect(f * cellW, H - (k + 1) * cellH, Math.ceil(cellW) + 1, Math.ceil(cellH) + 1);
      }
    }

    // Axis labels
    ctx.fillStyle = '#4a5568';
    ctx.font = `${Math.max(16, W * 0.014)}px "JetBrains Mono"`;
    const nyq = fs / 2;
    for (let i = 0; i <= 4; i++) {
      const freq = Math.round((nyq * i) / 4);
      const y = H - (i / 4) * H;
      ctx.fillText(freq + 'Hz', 4, y - 4);
    }
    ctx.fillText('Time →', W - 120, H - 6);
  }

  /**
   * Рисует полукруглый датчик RUL (0-100%).
   * Зелёный > 70%, жёлтый 40-70%, красный < 40%.
   * @param {string|HTMLCanvasElement} canvasOrId
   * @param {number} value — 0..100
   * @param {string} status — 'good'|'warning'|'critical'
   */
  function drawRULGauge(canvasOrId, value, status) {
    const canvas = typeof canvasOrId === 'string' ? document.getElementById(canvasOrId) : canvasOrId;
    const ctx = setupCanvas(canvas);
    const W = canvas.width, H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    const cx = W / 2, cy = H * 0.65;
    const radius = Math.min(W, H) * 0.38;
    const lineW = radius * 0.18;

    // Background arc
    ctx.lineWidth = lineW;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,229,255,0.06)';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, Math.PI, 2 * Math.PI);
    ctx.stroke();

    // Colored segments: red (left), yellow (mid), green (right)
    const segments = [
      { start: Math.PI,             end: Math.PI + Math.PI * 0.4,  color: '#ef4444' },
      { start: Math.PI + Math.PI * 0.4, end: Math.PI + Math.PI * 0.7,  color: '#f59e0b' },
      { start: Math.PI + Math.PI * 0.7, end: 2 * Math.PI,              color: '#22c55e' },
    ];
    for (const seg of segments) {
      ctx.strokeStyle = seg.color;
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, seg.start, seg.end);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Active arc up to value
    const valAngle = Math.PI + (value / 100) * Math.PI;
    const valColor = value >= 70 ? '#22c55e' : value >= 40 ? '#f59e0b' : '#ef4444';
    ctx.strokeStyle = valColor;
    ctx.shadowBlur = 10;
    ctx.shadowColor = valColor;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, Math.PI, valAngle);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Needle
    const needleAngle = valAngle;
    const needleLen = radius * 0.85;
    const nx = cx + Math.cos(needleAngle) * needleLen;
    const ny = cy + Math.sin(needleAngle) * needleLen;
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(nx, ny);
    ctx.stroke();

    // Center dot
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, 2 * Math.PI);
    ctx.fill();

    // Digital readout
    ctx.fillStyle = valColor;
    ctx.font = `bold ${Math.max(28, W * 0.06)}px "JetBrains Mono"`;
    ctx.textAlign = 'center';
    ctx.fillText(Math.round(value) + '%', cx, cy + radius * 0.45);

    // Label
    ctx.fillStyle = '#4a5568';
    ctx.font = `${Math.max(16, W * 0.022)}px "JetBrains Mono"`;
    ctx.fillText('RUL', cx, cy + radius * 0.65);
    ctx.textAlign = 'start';
  }

  /**
   * Анимированный индикатор состояния здоровья с пульсирующим свечением.
   * green=good, orange=warning, red=critical.
   * @param {string|HTMLCanvasElement} canvasOrId
   * @param {string} status — 'good'|'warning'|'critical'
   * @param {number} confidence — 0..1
   * @returns {Function} stop() для остановки анимации
   */
  function drawHealthIndicator(canvasOrId, status = 'good', confidence = 0.95) {
    const canvas = typeof canvasOrId === 'string' ? document.getElementById(canvasOrId) : canvasOrId;
    if (canvas._animId) { cancelAnimationFrame(canvas._animId); canvas._animId = null; }
    const ctx = setupCanvas(canvas);
    const W = canvas.width, H = canvas.height;

    const colorMap = { good: '#22c55e', warning: '#f59e0b', critical: '#ef4444' };
    const labelMap = { good: 'GOOD', warning: 'WARNING', critical: 'CRITICAL' };
    const baseColor = colorMap[status] || colorMap.good;

    const cx = W / 2, cy = H * 0.42;
    const radius = Math.min(W, H) * 0.22;

    let t = 0, animId;

    function draw() {
      ctx.clearRect(0, 0, W, H);

      const pulse = 0.5 + 0.5 * Math.sin(t * 0.06);
      const glowRadius = radius * (1.3 + pulse * 0.4);

      // Pulsing glow
      const grad = ctx.createRadialGradient(cx, cy, radius * 0.3, cx, cy, glowRadius);
      grad.addColorStop(0, baseColor);
      grad.addColorStop(0.5, baseColor.replace(')', ',0.3)').replace('rgb(', 'rgba('));
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, glowRadius, 0, 2 * Math.PI);
      ctx.fill();

      // Main circle
      ctx.shadowBlur = 20 + pulse * 15;
      ctx.shadowColor = baseColor;
      ctx.fillStyle = baseColor;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Inner ring
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.7, 0, 2 * Math.PI);
      ctx.stroke();

      // Status label
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.max(16, radius * 0.35)}px "JetBrains Mono"`;
      ctx.textAlign = 'center';
      ctx.fillText(labelMap[status] || 'GOOD', cx, cy + radius * 0.12);

      // Confidence readout
      ctx.fillStyle = '#4a5568';
      ctx.font = `${Math.max(14, W * 0.022)}px "JetBrains Mono"`;
      ctx.fillText('Confidence: ' + (confidence * 100).toFixed(1) + '%', cx, cy + radius + Math.max(30, H * 0.06));
      ctx.textAlign = 'start';

      t++;
      animId = requestAnimationFrame(draw);
      canvas._animId = animId;
    }
    draw();

    return () => { if (animId) cancelAnimationFrame(animId); canvas._animId = null; };
  }

  /**
   * Горизонтальная столбчатая диаграмма сравнения предсказаний моделей.
   * @param {string|HTMLCanvasElement} canvasOrId
   * @param {Array<{name:string, value:number, color?:string}>} results
   */
  function drawMultiModelBars(canvasOrId, results) {
    const canvas = typeof canvasOrId === 'string' ? document.getElementById(canvasOrId) : canvasOrId;
    const ctx = setupCanvas(canvas);
    const W = canvas.width, H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    drawGrid(ctx, W, H, 10, results.length);

    const defaultColors = ['#00e5ff', '#fb923c', '#a78bfa', '#22c55e', '#f43f5e'];
    const maxVal = Math.max(...results.map(r => r.value), 0.001);
    const barH = Math.min(H / (results.length * 1.6), H * 0.15);
    const labelW = W * 0.18;
    const barAreaW = W - labelW - 100;
    const startY = (H - results.length * barH * 1.5) / 2;

    let progress = 0;

    function draw() {
      ctx.clearRect(0, 0, W, H);
      drawGrid(ctx, W, H, 10, results.length);

      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const color = r.color || defaultColors[i % defaultColors.length];
        const y = startY + i * barH * 1.5;
        const barW = (r.value / maxVal) * barAreaW * Math.min(1, progress);

        // Label
        ctx.fillStyle = '#4a5568';
        ctx.font = `bold ${Math.max(16, barH * 0.5)}px "JetBrains Mono"`;
        ctx.textAlign = 'right';
        ctx.fillText(r.name, labelW - 10, y + barH * 0.65);

        // Bar background
        ctx.fillStyle = 'rgba(0,229,255,0.04)';
        ctx.fillRect(labelW, y, barAreaW, barH);

        // Bar fill
        ctx.shadowBlur = 6;
        ctx.shadowColor = color;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(labelW, y, barW, barH);
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;

        // Value label
        if (progress >= 0.5) {
          ctx.fillStyle = '#e2e8f0';
          ctx.font = `${Math.max(14, barH * 0.4)}px "JetBrains Mono"`;
          ctx.textAlign = 'left';
          ctx.fillText((r.value * 100).toFixed(1) + '%', labelW + barW + 8, y + barH * 0.65);
        }
      }
      ctx.textAlign = 'start';

      if (progress < 1) {
        progress += 0.04;
        requestAnimationFrame(draw);
      }
    }
    draw();
  }

  /**
   * Горизонтальный измеритель аномалий: зелёная зона < порог, красная > порог.
   * @param {string|HTMLCanvasElement} canvasOrId
   * @param {number} score — текущий скор (0..1)
   * @param {number} threshold — порог (0..1)
   */
  function drawAnomalyMeter(canvasOrId, score, threshold = 0.5) {
    const canvas = typeof canvasOrId === 'string' ? document.getElementById(canvasOrId) : canvasOrId;
    const ctx = setupCanvas(canvas);
    const W = canvas.width, H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    const padX = W * 0.06, padY = H * 0.25;
    const barW = W - padX * 2;
    const barH = H * 0.25;
    const barY = H * 0.35;

    // Background
    ctx.fillStyle = 'rgba(0,229,255,0.04)';
    ctx.fillRect(padX, barY, barW, barH);

    // Green zone (0 → threshold)
    const threshX = padX + threshold * barW;
    ctx.fillStyle = 'rgba(34,197,94,0.25)';
    ctx.fillRect(padX, barY, threshold * barW, barH);

    // Red zone (threshold → 1)
    ctx.fillStyle = 'rgba(239,68,68,0.25)';
    ctx.fillRect(threshX, barY, (1 - threshold) * barW, barH);

    // Threshold line
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(threshX, barY - 10);
    ctx.lineTo(threshX, barY + barH + 10);
    ctx.stroke();
    ctx.setLineDash([]);

    // Threshold label
    ctx.fillStyle = '#f59e0b';
    ctx.font = `${Math.max(14, W * 0.018)}px "JetBrains Mono"`;
    ctx.textAlign = 'center';
    ctx.fillText('Threshold', threshX, barY - 16);

    // Score marker
    const scoreX = padX + Math.max(0, Math.min(1, score)) * barW;
    const isAnomaly = score >= threshold;
    const markerColor = isAnomaly ? '#ef4444' : '#22c55e';

    ctx.shadowBlur = 10;
    ctx.shadowColor = markerColor;
    ctx.fillStyle = markerColor;
    ctx.beginPath();
    // Triangle marker pointing down
    ctx.moveTo(scoreX, barY + 2);
    ctx.lineTo(scoreX - 10, barY - 14);
    ctx.lineTo(scoreX + 10, barY - 14);
    ctx.closePath();
    ctx.fill();
    // Vertical line through bar
    ctx.strokeStyle = markerColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(scoreX, barY);
    ctx.lineTo(scoreX, barY + barH);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Score value
    ctx.fillStyle = markerColor;
    ctx.font = `bold ${Math.max(20, W * 0.032)}px "JetBrains Mono"`;
    ctx.fillText(score.toFixed(3), scoreX, barY + barH + Math.max(30, H * 0.08));

    // Status label
    ctx.fillStyle = isAnomaly ? '#ef4444' : '#22c55e';
    ctx.font = `bold ${Math.max(16, W * 0.024)}px "JetBrains Mono"`;
    ctx.fillText(isAnomaly ? 'ANOMALY' : 'NORMAL', scoreX, barY + barH + Math.max(54, H * 0.14));
    ctx.textAlign = 'start';

    // Scale labels
    ctx.fillStyle = '#4a5568';
    ctx.font = `${Math.max(14, W * 0.016)}px "JetBrains Mono"`;
    ctx.fillText('0', padX, barY + barH + 20);
    ctx.textAlign = 'right';
    ctx.fillText('1', padX + barW, barY + barH + 20);
    ctx.textAlign = 'start';
  }

  /**
   * Crosshair overlay for canvas — shows time/amplitude or freq/amplitude on hover.
   * @param {HTMLCanvasElement} canvas
   * @param {object} opts — {type:'signal'|'spectrum', data, freqs, maxFreq, sampleRate, color}
   */
  function addCrosshair(canvas, opts) {
    if (!canvas) return;
    canvas._crosshairOpts = opts;
    if (!canvas._crosshairAdded) {
      canvas._crosshairAdded = true;
      const overlay = document.createElement('canvas');
      overlay.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2';
      canvas.parentElement.style.position = 'relative';
      canvas.parentElement.appendChild(overlay);
      canvas._crosshairOverlay = overlay;

      canvas.addEventListener('mousemove', e => {
        const overlayNode = canvas._crosshairOverlay;
        const liveOpts = canvas._crosshairOpts || opts;
        if (!overlayNode) return;
        const rect = canvas.getBoundingClientRect();
        const mx = (e.clientX - rect.left) / rect.width;
        const my = (e.clientY - rect.top) / rect.height;
        overlayNode.width = canvas.width;
        overlayNode.height = canvas.height;
        const ctx = overlayNode.getContext('2d');
        const W = overlayNode.width, H = overlayNode.height;
        ctx.clearRect(0, 0, W, H);

        const px = mx * W, py = my * H;

        // Crosshair lines
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(px, 0); ctx.lineTo(px, H);
        ctx.moveTo(0, py); ctx.lineTo(W, py);
        ctx.stroke();
        ctx.setLineDash([]);

        // Readout
        let label = '';
        if (liveOpts.type === 'spectrum' && liveOpts.freqs) {
          const idx = Math.floor(mx * liveOpts.freqs.length);
          const freq = liveOpts.freqs[Math.min(idx, liveOpts.freqs.length - 1)] || 0;
          const amp = liveOpts.data ? liveOpts.data[Math.min(idx, liveOpts.data.length - 1)] : 0;
          label = `${freq.toFixed(0)} Hz | ${amp.toFixed(4)}`;
        } else if (liveOpts.type === 'signal' && liveOpts.data) {
          const idx = Math.floor(mx * liveOpts.data.length);
          const t = liveOpts.sampleRate ? `${(idx / liveOpts.sampleRate * 1000).toFixed(1)} ms` : idx;
          const amp = liveOpts.data[Math.min(idx, liveOpts.data.length - 1)] || 0;
          label = `${t} | ${amp.toFixed(4)}`;
        }

        if (label) {
          ctx.font = '20px "JetBrains Mono"';
          const tw = ctx.measureText(label).width;
          const lx = Math.min(px + 10, W - tw - 20);
          const ly = Math.max(py - 10, 24);
          ctx.fillStyle = 'rgba(15,22,35,0.9)';
          ctx.fillRect(lx - 4, ly - 18, tw + 8, 22);
          ctx.fillStyle = liveOpts.color || '#00e5ff';
          ctx.fillText(label, lx, ly);
        }
      });

      canvas.addEventListener('mouseleave', () => {
        const overlayNode = canvas._crosshairOverlay;
        if (!overlayNode) return;
        overlayNode.width = canvas.width;
        overlayNode.height = canvas.height;
        const ctx = overlayNode.getContext('2d');
        ctx.clearRect(0, 0, overlayNode.width, overlayNode.height);
      });

      canvas.style.cursor = 'crosshair';
    }
  }

  /**
   * Очистить canvas.
   */
  function clear(canvasOrId) {
    const canvas = typeof canvasOrId === 'string' ? document.getElementById(canvasOrId) : canvasOrId;
    const ctx = setupCanvas(canvas);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  return {
    drawSignal, drawSpectrum, drawSignalComparison, drawSpectrumComparison, heroOscilloscope, clear,
    drawEnvelope, drawSpectrogram, drawRULGauge,
    drawHealthIndicator, drawMultiModelBars, drawAnomalyMeter,
    addCrosshair
  };
})();
