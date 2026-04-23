"""
VibroLab — Калибровка вероятностей + OOD детекция.

1. Platt scaling (CalibratedClassifierCV) — калибрует RF вероятности
2. Mahalanobis distance — детектор Out-of-Distribution (OOD) данных
3. Экспорт параметров калибровки для браузерного инференса

Использование:
  python calibration.py <data_dir>
  python calibration.py --synthetic
"""

import os
import sys
import json

import numpy as np
import joblib
from sklearn.calibration import CalibratedClassifierCV
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import accuracy_score, f1_score, log_loss, brier_score_loss

from config import (
    CLASSES, CLASS_LABELS_RU, FS, DURATION, N_POINTS, F_ROT, GMF,
    TEST_SIZE, RANDOM_SEED, RF_PARAMS, CALIBRATION_PARAMS, MODEL_DIR,
)
from features import extract_batch
from train import load_data


def compute_mahalanobis_params(X, y, classes):
    """Вычисляет параметры для Mahalanobis OOD детекции.

    Returns:
        class_means: {class_name: mean_vector}
        precision_matrix: обратная ковариационная матрица (общая для всех классов)
        threshold: порог OOD по percentile
    """
    n_features = X.shape[1]

    # Классо-условные средние
    class_means = {}
    all_centered = []

    for i, cls in enumerate(classes):
        mask = y == i
        X_cls = X[mask]
        class_means[cls] = X_cls.mean(axis=0)
        all_centered.append(X_cls - class_means[cls])

    # Общая ковариационная матрица (pooled covariance)
    centered = np.vstack(all_centered)
    cov = np.cov(centered, rowvar=False)
    # Регуляризация для стабильности
    cov += np.eye(n_features) * 1e-6

    try:
        precision = np.linalg.inv(cov)
    except np.linalg.LinAlgError:
        precision = np.linalg.pinv(cov)

    # Вычисляем расстояния для training данных (чтобы найти порог)
    distances = []
    for i in range(len(X)):
        min_dist = float('inf')
        for cls in classes:
            diff = X[i] - class_means[cls]
            dist = float(diff @ precision @ diff)
            min_dist = min(min_dist, dist)
        distances.append(min_dist)

    distances = np.array(distances)
    percentile = CALIBRATION_PARAMS['ood_percentile']
    threshold = float(np.percentile(distances, percentile))

    return class_means, precision, threshold, distances


def calibrate(data_dir=None):
    os.makedirs(MODEL_DIR, exist_ok=True)

    print("=" * 65)
    print("  VIBROLAB — Probability Calibration + OOD Detection")
    print("=" * 65)

    # 1. Load data
    print("\n[1/5] Loading data...")
    signals, labels, y, classes, source = load_data(data_dir, multichannel=False)
    n_classes = len(classes)
    print(f"  Source: {source} | Classes: {n_classes} | Samples: {len(signals)}")

    # 2. Features
    print("\n[2/5] Extracting features...")
    X, feature_names = extract_batch(signals)

    bad = np.isnan(X).any(axis=1) | np.isinf(X).any(axis=1)
    if bad.any():
        X, y = X[~bad], y[~bad]
        labels = [lbl for lbl, b in zip(labels, ~bad) if b]

    # 3. Split: train / calibration / test
    cal_frac = CALIBRATION_PARAMS['cal_fraction']
    print(f"\n[3/5] Splitting data (cal={cal_frac:.0%})...")

    X_traintest, X_cal, y_traintest, y_cal = train_test_split(
        X, y, test_size=cal_frac, random_state=RANDOM_SEED, stratify=y)
    X_tr, X_te, y_tr, y_te = train_test_split(
        X_traintest, y_traintest, test_size=TEST_SIZE, random_state=RANDOM_SEED, stratify=y_traintest)

    scaler = StandardScaler()
    X_tr_s = scaler.fit_transform(X_tr)
    X_te_s = scaler.transform(X_te)
    X_cal_s = scaler.transform(X_cal)

    print(f"  Train: {len(y_tr)} | Cal: {len(y_cal)} | Test: {len(y_te)}")

    # 4. Train base RF + calibrate
    print(f"\n[4/5] Training RF + Platt scaling...")
    from sklearn.ensemble import RandomForestClassifier

    base_rf = RandomForestClassifier(**RF_PARAMS)
    base_rf.fit(X_tr_s, y_tr)

    # Uncalibrated metrics
    y_pred_uncal = base_rf.predict(X_te_s)
    y_proba_uncal = base_rf.predict_proba(X_te_s)
    acc_uncal = accuracy_score(y_te, y_pred_uncal)

    # Calibrated model (Platt scaling на calibration set)
    cal_model = CalibratedClassifierCV(
        base_rf, method=CALIBRATION_PARAMS['method'],
        cv='prefit')
    cal_model.fit(X_cal_s, y_cal)

    # Calibrated metrics
    y_pred_cal = cal_model.predict(X_te_s)
    y_proba_cal = cal_model.predict_proba(X_te_s)
    acc_cal = accuracy_score(y_te, y_pred_cal)
    f1_cal = f1_score(y_te, y_pred_cal, average='weighted')

    # Brier score (мера калибровки, ниже = лучше)
    brier_uncal = 0
    brier_cal = 0
    for i in range(n_classes):
        y_bin = (y_te == i).astype(float)
        brier_uncal += brier_score_loss(y_bin, y_proba_uncal[:, i])
        brier_cal += brier_score_loss(y_bin, y_proba_cal[:, i])
    brier_uncal /= n_classes
    brier_cal /= n_classes

    print(f"  Uncalibrated: acc={acc_uncal:.4f} | brier={brier_uncal:.6f}")
    print(f"  Calibrated:   acc={acc_cal:.4f} | brier={brier_cal:.6f}")
    print(f"  Brier improvement: {(brier_uncal - brier_cal) / brier_uncal * 100:.1f}%")

    # 5. OOD Detection (Mahalanobis)
    print(f"\n[5/5] Computing OOD thresholds (Mahalanobis)...")
    X_all_s = scaler.transform(X)
    class_means, precision, ood_threshold, train_distances = compute_mahalanobis_params(
        X_all_s, y, classes)

    print(f"  Mahalanobis threshold ({CALIBRATION_PARAMS['ood_percentile']}%): {ood_threshold:.4f}")
    print(f"  Distance range: [{train_distances.min():.4f}, {train_distances.max():.4f}]")

    # Save
    cal_model_path = f'{MODEL_DIR}/rf_calibrated.pkl'
    scaler_path = f'{MODEL_DIR}/scaler_cal.pkl'
    joblib.dump(cal_model, cal_model_path)
    joblib.dump(scaler, scaler_path)

    # Сериализуем параметры калибровки для браузера
    cal_params = {
        'method': CALIBRATION_PARAMS['method'],
        'classes': classes,
        'class_labels_ru': {c: CLASS_LABELS_RU.get(c, c) for c in classes},
        'accuracy_uncalibrated': round(acc_uncal, 4),
        'accuracy_calibrated': round(acc_cal, 4),
        'f1_calibrated': round(f1_cal, 4),
        'brier_uncalibrated': round(brier_uncal, 6),
        'brier_calibrated': round(brier_cal, 6),
        'ood': {
            'method': 'mahalanobis',
            'threshold': round(ood_threshold, 6),
            'percentile': CALIBRATION_PARAMS['ood_percentile'],
            'class_means': {cls: mean.tolist() for cls, mean in class_means.items()},
            'precision_matrix': precision.tolist(),
        },
        'scaler': {
            'mean': scaler.mean_.tolist(),
            'scale': scaler.scale_.tolist(),
        },
    }

    meta_path = f'{MODEL_DIR}/meta_calibration.json'
    with open(meta_path, 'w', encoding='utf-8') as f:
        json.dump(cal_params, f, indent=2, ensure_ascii=False)

    print(f"\n  ✓ {cal_model_path}")
    print(f"  ✓ {scaler_path}")
    print(f"  ✓ {meta_path}")
    print("=" * 65)
    print(f"  CALIBRATION | Brier: {brier_uncal:.6f} → {brier_cal:.6f} "
          f"| OOD threshold: {ood_threshold:.4f}")
    print("=" * 65)

    return cal_model, cal_params


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    data_dir = args[0] if args else None
    calibrate(data_dir)
