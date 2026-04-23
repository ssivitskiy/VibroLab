"""
VibroLab — Обучение модели.

Использование:
  python train.py <data_dir>        # Обучение на SEU данных
  python train.py --synthetic       # Обучение на синтетике (fallback)
  python train.py                   # Ищет ./data/, иначе синтетика
"""

import os
import sys
import json
import hashlib
from datetime import datetime, timezone
import numpy as np
import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, cross_val_score, StratifiedKFold
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score, f1_score

from config import (
    CLASSES, GEAR_CLASSES, BEARING_CLASSES, CLASS_LABELS_RU, FS, DURATION, N_POINTS, F_ROT, GMF,
    Z_PINION, Z_GEAR, TEST_SIZE, RANDOM_SEED, RF_PARAMS, MODEL_DIR,
)
from features import extract_batch, extract_batch_multichannel


def infer_dataset_scope(classes):
    """Определяет, какая часть датасета использовалась для модели."""
    classes_set = set(classes)
    gear_set = set(GEAR_CLASSES)
    bearing_set = set(BEARING_CLASSES)

    if classes_set <= gear_set:
        return 'gear'
    if classes_set <= bearing_set:
        return 'bearing'
    return 'combined'


def load_data(data_dir=None, multichannel=False):
    """Загружает данные: SEU если есть, иначе синтетика."""
    if data_dir == '--synthetic':
        print("[DATA] Генерация синтетических данных")
        from generate_data import generate_dataset
        _, signals, labels, indices = generate_dataset(multichannel=multichannel)
        return signals, labels, indices, CLASSES, 'synthetic'
    elif data_dir and os.path.isdir(data_dir):
        # Пробуем авто-определение датасета (CWRU, MFPT, Paderborn, SEU)
        try:
            from datasets import load_dataset_auto
            signals, labels, indices, classes, meta = load_dataset_auto(
                data_dir, multichannel=multichannel)
            return signals, labels, indices, classes, meta.get('source', 'auto')
        except Exception:
            # Fallback к SEU загрузчику
            from load_seu import load_dataset
            signals, labels, indices, classes, meta = load_dataset(
                data_dir, multichannel=multichannel)
            return signals, labels, indices, classes, 'seu'
    elif data_dir is None:
        # Поиск данных в стандартных местах
        for path in ['./data', './data/gear', '../data', '../data/gear']:
            if os.path.isdir(path):
                from load_seu import load_dataset
                try:
                    signals, labels, indices, classes, meta = load_dataset(
                        path, multichannel=multichannel)
                    if len(set(classes)) >= 2:
                        return signals, labels, indices, classes, 'seu'
                except Exception:
                    pass
        # Fallback: синтетика
        print("[DATA] SEU данные не найдены → генерация синтетических")
        from generate_data import generate_dataset
        _, signals, labels, indices = generate_dataset(multichannel=multichannel)
        return signals, labels, indices, CLASSES, 'synthetic'
    else:
        print(f"[ERROR] Директория {data_dir} не найдена")
        sys.exit(1)


def train(data_dir=None, multichannel=False):
    import config as _cfg
    model_path = _cfg.MODEL_PATH
    scaler_path = _cfg.SCALER_PATH
    meta_path = _cfg.META_PATH
    os.makedirs(MODEL_DIR, exist_ok=True)

    print("=" * 65)
    mode = "MULTI-CHANNEL" if multichannel else "SINGLE-CHANNEL"
    print(f"  VIBROLAB — Training Pipeline ({mode})")
    print("=" * 65)

    # 1. Data
    print("\n[1/6] Loading data...")
    signals, labels, y, classes, source = load_data(data_dir, multichannel=multichannel)
    n_classes = len(classes)
    print(f"  Source: {source} | Classes: {n_classes} | Samples: {len(signals)}")
    if multichannel and signals.ndim == 3:
        print(f"  Channels: {signals.shape[1]} | Shape: {signals.shape}")

    # 2. Features
    if multichannel and signals.ndim == 3:
        n_ch = signals.shape[1]
        print(f"\n[2/6] Extracting multi-channel features ({n_ch} channels)...")
        X, feature_names = extract_batch_multichannel(signals)
    else:
        print("\n[2/6] Extracting features (single channel)...")
        X, feature_names = extract_batch(signals)

    # Проверка на NaN/Inf
    bad = np.isnan(X).any(axis=1) | np.isinf(X).any(axis=1)
    if bad.any():
        print(f"  ⚠ Удалено {bad.sum()} сэмплов с NaN/Inf")
        X, y = X[~bad], y[~bad]
        labels = [lbl for lbl, b in zip(labels, ~bad) if b]

    # 3. Split
    print("\n[3/6] Train/test split (80/20, stratified)...")
    X_tr, X_te, y_tr, y_te = train_test_split(
        X, y, test_size=TEST_SIZE, random_state=RANDOM_SEED, stratify=y)
    scaler = StandardScaler()
    X_tr_s = scaler.fit_transform(X_tr)
    X_te_s = scaler.transform(X_te)
    print(f"  Train: {len(y_tr)} | Test: {len(y_te)}")

    # 4. Train
    print(f"\n[4/6] Training Random Forest ({RF_PARAMS['n_estimators']} trees)...")
    model = RandomForestClassifier(**RF_PARAMS)
    model.fit(X_tr_s, y_tr)

    cv = cross_val_score(model, X_tr_s, y_tr,
                         cv=StratifiedKFold(5, shuffle=True, random_state=RANDOM_SEED),
                         scoring='accuracy')
    print(f"  CV: {cv.mean():.4f} ± {cv.std():.4f}")

    # 5. Evaluate
    print("\n[5/6] Evaluating...")
    y_pred = model.predict(X_te_s)
    acc = accuracy_score(y_te, y_pred)
    f1 = f1_score(y_te, y_pred, average='weighted')
    cm = confusion_matrix(y_te, y_pred)
    print(f"  Accuracy: {acc:.4f} | F1: {f1:.4f}")
    print(classification_report(y_te, y_pred, target_names=classes))

    # Feature importances
    imp = model.feature_importances_
    top_idx = np.argsort(imp)[::-1]
    print("  Top-10 features:")
    for i in range(min(10, len(feature_names))):
        print(f"    {i + 1:2d}. {feature_names[top_idx[i]]:20s} {imp[top_idx[i]]:.4f}")

    # 6. Save
    print("\n[6/6] Saving...")
    joblib.dump(model, model_path)
    joblib.dump(scaler, scaler_path)

    # Class metrics
    class_metrics = {}
    for i, cls in enumerate(classes):
        tp = cm[i][i]
        fp = cm[:, i].sum() - tp
        fn = cm[i, :].sum() - tp
        p = tp / (tp + fp) if (tp + fp) > 0 else 0
        r = tp / (tp + fn) if (tp + fn) > 0 else 0
        f = 2 * p * r / (p + r) if (p + r) > 0 else 0
        class_metrics[cls] = {'precision': round(p, 4), 'recall': round(r, 4), 'f1': round(f, 4)}

    # Model versioning
    model_bytes = open(model_path, 'rb').read()
    model_hash = hashlib.sha256(model_bytes).hexdigest()[:12]
    timestamp = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

    meta = {
        'version': f"1.0.0-{model_hash}",
        'trained_at': timestamp,
        'model_hash': model_hash,
        'source': source,
        'dataset_scope': infer_dataset_scope(classes),
        'multichannel': multichannel,
        'n_channels': int(signals.shape[1]) if multichannel and signals.ndim == 3 else 1,
        'accuracy': round(acc, 4),
        'f1': round(f1, 4),
        'cv_mean': round(cv.mean(), 4),
        'cv_std': round(cv.std(), 4),
        'n_features': len(feature_names),
        'feature_names': feature_names,
        'classes': classes,
        'class_labels_ru': {c: CLASS_LABELS_RU.get(c, c) for c in classes},
        'confusion_matrix': cm.tolist(),
        'feature_importances': [
            {'name': feature_names[top_idx[i]], 'importance': round(float(imp[top_idx[i]]), 6)}
            for i in range(min(20, len(feature_names)))
        ],
        'class_metrics': class_metrics,
        'config': {'fs': FS, 'duration': DURATION, 'n_points': N_POINTS,
                   'f_rot': F_ROT, 'gmf': GMF, 'z_pinion': Z_PINION, 'z_gear': Z_GEAR},
        'model_params': {k: v for k, v in RF_PARAMS.items() if k != 'n_jobs'},
        'train_size': int(len(y_tr)),
        'test_size': int(len(y_te)),
    }

    with open(meta_path, 'w', encoding='utf-8') as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)

    print(f"  ✓ {model_path}")
    print(f"  ✓ {scaler_path}")
    print(f"  ✓ {meta_path}")
    print("=" * 65)
    print(f"  ACCURACY: {acc:.4f} | F1: {f1:.4f} | SOURCE: {source}")
    print("=" * 65)

    return model, scaler, meta


if __name__ == '__main__':
    mc = '--multichannel' in sys.argv or '--mc' in sys.argv
    # Dataset mode: --gear (default), --bearing, --all, --combined/--full
    mode = 'gear'
    if '--bearing' in sys.argv:
        mode = 'bearing'
    elif '--all' in sys.argv:
        mode = 'all'
    elif '--combined' in sys.argv or '--full' in sys.argv:
        mode = 'combined'

    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    data_dir = args[0] if args else None

    # If mode is specific, try to find subfolder
    if data_dir and mode in ('gear', 'bearing'):
        subdir = os.path.join(data_dir, mode)
        if os.path.isdir(subdir):
            data_dir = subdir
            print(f"[MODE] {mode} → {data_dir}")

    if mode == 'all' and data_dir:
        # Train on both gear and bearing sequentially
        import config as _cfg
        for sub in ('gear', 'bearing'):
            subdir = os.path.join(data_dir, sub)
            if os.path.isdir(subdir):
                print(f"\n{'=' * 65}")
                print(f"  TRAINING: {sub.upper()}")
                print(f"{'=' * 65}")
                _cfg.MODEL_PATH = f'{MODEL_DIR}/rf_{sub}.pkl'
                _cfg.SCALER_PATH = f'{MODEL_DIR}/scaler_{sub}.pkl'
                _cfg.META_PATH = f'{MODEL_DIR}/meta_{sub}.json'
                train(subdir, multichannel=mc)
            else:
                print(f"[SKIP] {subdir} не найдена")
    else:
        train(data_dir, multichannel=mc)
