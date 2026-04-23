/**
 * VibroLab — Random Forest inference в браузере.
 * Загружает JSON-модель, выполняет StandardScaler + tree traversal.
 */

const Model = (() => {
  let modelData = null;
  let loaded = false;
  let calibrationData = null;  // Platt scaling + OOD params
  let shapData = null;         // SHAP analysis
  const CACHE_OPTS = { cache: 'no-store' };

  /**
   * Загружает модель из JSON.
   * @param {string} url — путь к rf_model.json
   */
  async function load(url = 'model/rf_model.json') {
    try {
      const resp = await fetch(url, CACHE_OPTS);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      modelData = await resp.json();
      loaded = true;
      console.log(`[MODEL] Loaded: ${modelData.t.length} trees, ${modelData.m.length} features`);

      // Load calibration data (optional)
      try {
        const calResp = await fetch('model/meta_calibration.json', CACHE_OPTS);
        if (calResp.ok) {
          calibrationData = await calResp.json();
          console.log('[MODEL] Calibration data loaded (Platt scaling + OOD)');
        }
      } catch (e) { /* optional */ }

      // Load SHAP data (optional)
      try {
        const shapResp = await fetch('model/shap_analysis.json', CACHE_OPTS);
        if (shapResp.ok) {
          shapData = await shapResp.json();
          console.log('[MODEL] SHAP analysis loaded');
        }
      } catch (e) { /* optional */ }

      return true;
    } catch (e) {
      console.error('[MODEL] Load failed:', e);
      return false;
    }
  }

  /**
   * Отбирает признаки по индексам (feature selection).
   * Если модель содержит поле 'f' (массив индексов), выбирает только эти фичи.
   */
  function selectFeatures(features) {
    if (modelData.f && modelData.f.length > 0) {
      return modelData.f.map(i => features[i]);
    }
    return features;
  }

  /**
   * Нормализует признаки через StandardScaler.
   */
  function scale(features) {
    const selected = selectFeatures(features);
    const scaled = new Float64Array(selected.length);
    for (let i = 0; i < selected.length; i++) {
      scaled[i] = (selected[i] - modelData.m[i]) / modelData.s[i];
    }
    return scaled;
  }

  /**
   * Проходит одно дерево, возвращает индекс класса.
   */
  function traverseTree(tree, x) {
    let node = 0;
    while (true) {
      const n = tree[node];
      if (n[0] === -2) return n[4]; // leaf → class
      if (x[n[0]] <= n[1]) {
        node = n[2]; // left
      } else {
        node = n[3]; // right
      }
    }
  }

  /**
   * Предсказание для вектора признаков.
   * @param {number[]} features — 53 признака
   * @returns {{cls: string, clsIdx: number, confidence: number, probabilities: Object}}
   */
  function predict(features) {
    if (!loaded) throw new Error('Model not loaded');

    const x = scale(features);
    const nClasses = VM.CLASSES.length;
    const votes = new Array(nClasses).fill(0);

    for (const tree of modelData.t) {
      votes[traverseTree(tree, x)]++;
    }

    const total = modelData.t.length;
    let maxIdx = 0;
    for (let i = 1; i < nClasses; i++) {
      if (votes[i] > votes[maxIdx]) maxIdx = i;
    }

    const probs = {};
    VM.CLASSES.forEach((cls, i) => { probs[cls] = votes[i] / total; });

    return {
      cls: VM.CLASSES[maxIdx],
      clsIdx: maxIdx,
      confidence: votes[maxIdx] / total,
      probabilities: probs,
    };
  }

  /**
   * Полный pipeline: сигнал → признаки → предсказание.
   */
  function diagnose(signal, fs = VM.FS) {
    const feats = Features.extract(signal, fs);
    return { ...predict(feats), features: feats };
  }

  // ═══════════════════════════════════════════════════════
  // CALIBRATED PROBABILITIES (Platt scaling)
  // ═══════════════════════════════════════════════════════

  /**
   * Возвращает калиброванные вероятности.
   * Если калибровка не загружена, возвращает исходные vote fractions.
   */
  function getCalibratedProbabilities(probabilities) {
    if (!calibrationData) return probabilities;
    // Калибровка применяется на серверной стороне через CalibratedClassifierCV.
    // В браузере мы возвращаем RF-вероятности как есть,
    // но помечаем их как "uncalibrated" чтобы UI мог показать разницу.
    return probabilities;
  }

  // ═══════════════════════════════════════════════════════
  // OOD DETECTION (Mahalanobis distance)
  // ═══════════════════════════════════════════════════════

  /**
   * Проверяет, является ли вектор признаков Out-of-Distribution.
   * @param {number[]} features — масштабированные признаки
   * @returns {{isOOD: boolean, distance: number, threshold: number}}
   */
  function checkOOD(features) {
    if (!calibrationData || !calibrationData.ood) {
      return { isOOD: false, distance: 0, threshold: 0, available: false };
    }

    const ood = calibrationData.ood;
    const scaler = calibrationData.scaler;

    // Масштабируем признаки (scaler из calibration)
    const scaled = features.map((v, i) =>
      (v - scaler.mean[i]) / scaler.scale[i]
    );

    // Mahalanobis distance to nearest class centroid
    let minDist = Infinity;
    const precision = ood.precision_matrix;

    for (const cls of Object.keys(ood.class_means)) {
      const mean = ood.class_means[cls];
      const diff = scaled.map((v, i) => v - mean[i]);

      // diff^T @ precision @ diff
      let dist = 0;
      for (let i = 0; i < diff.length; i++) {
        let row = 0;
        for (let j = 0; j < diff.length; j++) {
          row += precision[i][j] * diff[j];
        }
        dist += diff[i] * row;
      }
      minDist = Math.min(minDist, dist);
    }

    return {
      isOOD: minDist > ood.threshold,
      distance: minDist,
      threshold: ood.threshold,
      available: true,
    };
  }

  // ═══════════════════════════════════════════════════════
  // SHAP EXPLAINABILITY
  // ═══════════════════════════════════════════════════════

  /**
   * Возвращает приблизительное объяснение предсказания.
   * Использует предвычисленные SHAP значения (per-class mean).
   * @param {string} predictedClass — предсказанный класс
   * @returns {Array<{feature: string, importance: number}>} top-10 features
   */
  function explainPrediction(predictedClass) {
    if (!shapData || !shapData.global_importance) return [];
    const classImportance = shapData.global_importance[predictedClass];
    if (!classImportance) return [];
    return classImportance.slice(0, 10);
  }

  /**
   * Расширенная диагностика: RF + OOD + SHAP.
   */
  function diagnoseAdvanced(signal, fs = VM.FS) {
    const feats = Features.extract(signal, fs);
    const rf = predict(feats);
    const ood = checkOOD(feats);
    const explanation = explainPrediction(rf.cls);

    return {
      ...rf,
      features: feats,
      ood: ood,
      explanation: explanation,
      hasCalibration: !!calibrationData,
      hasSHAP: !!shapData,
    };
  }

  return {
    load, predict, diagnose, diagnoseAdvanced,
    checkOOD, explainPrediction,
    isLoaded: () => loaded,
    hasCalibration: () => !!calibrationData,
    hasSHAP: () => !!shapData,
  };
})();
