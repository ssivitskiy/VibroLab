/**
 * VibroLab — ONNX Runtime Web inference для нейросетевых моделей.
 *
 * Загружает и выполняет CNN, LSTM, Autoencoder, RUL через ort.js.
 * Requires: onnxruntime-web (ort.min.js)
 */

const ModelONNX = (() => {
  const sessions = {};  // { cnn: InferenceSession, lstm: ..., ae: ..., rul: ... }
  const metas = {};     // { cnn: {meta}, ... }
  const scalers = {};   // { ae: {mean, scale}, rul: {mean, scale} }

  const MODELS = {
    cnn:  { path: 'model/cnn_model.onnx',  meta: 'model/meta_cnn.json',  type: 'classifier' },
    lstm: { path: 'model/lstm_model.onnx', meta: 'model/meta_lstm.json', type: 'classifier' },
    ae:   { path: 'model/autoencoder.onnx', meta: 'model/meta_ae.json', scaler: 'model/scaler_ae.json', type: 'anomaly' },
    rul:  { path: 'model/rul_model.onnx',  meta: 'model/meta_rul.json', scaler: 'model/scaler_rul.json', type: 'regression' },
  };

  /**
   * Загружает одну ONNX модель.
   */
  async function loadModel(name) {
    const cfg = MODELS[name];
    if (!cfg) { console.warn(`[ONNX] Unknown model: ${name}`); return false; }

    try {
      // Check if ort is available
      if (typeof ort === 'undefined') {
        console.warn('[ONNX] ort.js not loaded. Add onnxruntime-web to page.');
        return false;
      }

      sessions[name] = await ort.InferenceSession.create(cfg.path);

      // Load meta
      try {
        const resp = await fetch(cfg.meta);
        if (resp.ok) metas[name] = await resp.json();
      } catch (e) { /* meta is optional */ }

      // Load scaler if exists
      if (cfg.scaler) {
        try {
          const resp = await fetch(cfg.scaler);
          if (resp.ok) scalers[name] = await resp.json();
        } catch (e) { /* scaler is optional */ }
      }

      console.log(`[ONNX] Loaded: ${name}`);
      return true;
    } catch (e) {
      console.warn(`[ONNX] Failed to load ${name}:`, e.message);
      return false;
    }
  }

  /**
   * Загружает все доступные модели.
   */
  async function loadAll() {
    const results = {};
    for (const name of Object.keys(MODELS)) {
      results[name] = await loadModel(name);
    }
    return results;
  }

  /**
   * Масштабирует признаки через scaler.
   */
  function scaleFeatures(features, scalerName) {
    const s = scalers[scalerName];
    if (!s) return features;
    return features.map((v, i) => (v - s.mean[i]) / s.scale[i]);
  }

  /**
   * Softmax для логитов.
   */
  function softmax(logits) {
    const max = Math.max(...logits);
    const exp = logits.map(x => Math.exp(x - max));
    const sum = exp.reduce((a, b) => a + b, 0);
    return exp.map(x => x / sum);
  }

  /**
   * CNN предсказание: сырой сигнал → класс.
   * @param {Float32Array|number[]} signal — сигнал (2560 точек)
   */
  async function predictCNN(signal) {
    if (!sessions.cnn) return null;

    const input = new ort.Tensor('float32', Float32Array.from(signal), [1, 1, signal.length]);
    const results = await sessions.cnn.run({ signal: input });
    const logits = Array.from(results.logits.data);
    const probs = softmax(logits);

    let maxIdx = 0;
    for (let i = 1; i < probs.length; i++) {
      if (probs[i] > probs[maxIdx]) maxIdx = i;
    }

    const probMap = {};
    VM.CLASSES.forEach((cls, i) => { probMap[cls] = probs[i]; });

    return {
      model: 'cnn',
      cls: VM.CLASSES[maxIdx],
      clsIdx: maxIdx,
      confidence: probs[maxIdx],
      probabilities: probMap,
    };
  }

  /**
   * LSTM/GRU предсказание: сигнал → фреймы → класс.
   */
  async function predictLSTM(signal) {
    if (!sessions.lstm) return null;

    const meta = metas.lstm || {};
    const nSteps = (meta.lstm_params && meta.lstm_params.n_steps) || 32;
    const stepSize = Math.floor(signal.length / nSteps);
    const frames = new Float32Array(nSteps * stepSize);

    for (let i = 0; i < nSteps * stepSize; i++) {
      frames[i] = signal[i];
    }

    const input = new ort.Tensor('float32', frames, [1, nSteps, stepSize]);
    const results = await sessions.lstm.run({ frames: input });
    const logits = Array.from(results.logits.data);
    const probs = softmax(logits);

    let maxIdx = 0;
    for (let i = 1; i < probs.length; i++) {
      if (probs[i] > probs[maxIdx]) maxIdx = i;
    }

    const probMap = {};
    VM.CLASSES.forEach((cls, i) => { probMap[cls] = probs[i]; });

    return {
      model: 'lstm',
      cls: VM.CLASSES[maxIdx],
      clsIdx: maxIdx,
      confidence: probs[maxIdx],
      probabilities: probMap,
    };
  }

  /**
   * Autoencoder: features → reconstruction error → anomaly detection.
   */
  async function predictAE(features) {
    if (!sessions.ae) return null;

    const meta = metas.ae || {};
    const threshold = meta.threshold || 0.1;

    const scaled = scaleFeatures(features, 'ae');
    const input = new ort.Tensor('float32', Float32Array.from(scaled), [1, scaled.length]);
    const results = await sessions.ae.run({ features: input });
    const reconstructed = Array.from(results.reconstructed.data);

    // MSE
    let mse = 0;
    for (let i = 0; i < scaled.length; i++) {
      mse += (scaled[i] - reconstructed[i]) ** 2;
    }
    mse /= scaled.length;

    return {
      model: 'autoencoder',
      isAnomaly: mse > threshold,
      reconstructionError: mse,
      threshold: threshold,
      anomalyScore: Math.min(mse / threshold, 5.0),  // normalized 0-5
    };
  }

  /**
   * RUL: features → remaining useful life [0, 1].
   */
  async function predictRUL(features) {
    if (!sessions.rul) return null;

    const scaled = scaleFeatures(features, 'rul');
    const input = new ort.Tensor('float32', Float32Array.from(scaled), [1, scaled.length]);
    const results = await sessions.rul.run({ features: input });
    const rul = results.rul.data[0];

    return {
      model: 'rul',
      remainingLife: rul,                          // 0.0 (failure) to 1.0 (healthy)
      remainingLifePct: Math.round(rul * 100),     // percentage
      healthStatus: rul > 0.7 ? 'good' : rul > 0.4 ? 'warning' : 'critical',
    };
  }

  /**
   * Полная диагностика всеми доступными моделями.
   * @param {number[]} signal — сырой сигнал
   * @param {number[]} features — 53 извлечённых признака
   */
  async function diagnoseAdvanced(signal, features) {
    const result = {};

    const promises = [];

    if (sessions.cnn) {
      promises.push(predictCNN(signal).then(r => { result.cnn = r; }));
    }
    if (sessions.lstm) {
      promises.push(predictLSTM(signal).then(r => { result.lstm = r; }));
    }
    if (sessions.ae) {
      promises.push(predictAE(features).then(r => { result.autoencoder = r; }));
    }
    if (sessions.rul) {
      promises.push(predictRUL(features).then(r => { result.rul = r; }));
    }

    await Promise.all(promises);

    // Ensemble: majority vote across classifiers
    const classifiers = [result.cnn, result.lstm].filter(Boolean);
    if (classifiers.length > 0) {
      const votes = {};
      classifiers.forEach(c => {
        votes[c.cls] = (votes[c.cls] || 0) + 1;
      });
      const ensembleCls = Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
      const avgConf = classifiers.reduce((s, c) => s + c.confidence, 0) / classifiers.length;

      result.ensemble = {
        cls: ensembleCls,
        confidence: avgConf,
        agreement: classifiers.every(c => c.cls === ensembleCls),
        n_models: classifiers.length,
      };
    }

    return result;
  }

  function isLoaded(name) {
    return !!sessions[name];
  }

  function getAvailable() {
    return Object.keys(sessions);
  }

  return {
    loadModel, loadAll, isLoaded, getAvailable,
    predictCNN, predictLSTM, predictAE, predictRUL,
    diagnoseAdvanced,
  };
})();
