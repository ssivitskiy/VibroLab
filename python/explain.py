"""
VibroLab — SHAP Explainability.

Генерирует объяснения предсказаний:
  - TreeExplainer для Random Forest (точные SHAP values)
  - Per-class feature importance
  - Экспорт для браузерной визуализации

Использование:
  python explain.py <data_dir>
  python explain.py --synthetic
"""

import os
import sys
import json

import numpy as np
import joblib

try:
    import shap
    HAS_SHAP = True
except ImportError:
    HAS_SHAP = False

from config import (
    CLASSES, CLASS_LABELS_RU, MODEL_DIR, MODEL_PATH, SCALER_PATH,
    RANDOM_SEED, TEST_SIZE,
)
from features import extract_batch
from train import load_data
from sklearn.model_selection import train_test_split


def explain_rf(data_dir=None, n_background=100, n_explain=50):
    """Генерирует SHAP объяснения для Random Forest."""
    if not HAS_SHAP:
        print("[ERROR] shap not installed. Run: pip install shap")
        return None

    os.makedirs(f'{MODEL_DIR}/plots', exist_ok=True)

    print("=" * 65)
    print("  VIBROLAB — SHAP Explainability")
    print("=" * 65)

    # 1. Load model + data
    print("\n[1/4] Loading model and data...")
    if not os.path.exists(MODEL_PATH):
        print(f"  [ERROR] Model not found: {MODEL_PATH}")
        print("  Run `make train` first.")
        return None

    model = joblib.load(MODEL_PATH)
    scaler = joblib.load(SCALER_PATH)

    signals, labels, y, classes, source = load_data(data_dir, multichannel=False)
    print(f"  Source: {source} | Samples: {len(signals)}")

    # 2. Features
    print("\n[2/4] Extracting features...")
    X, feature_names = extract_batch(signals)

    bad = np.isnan(X).any(axis=1) | np.isinf(X).any(axis=1)
    if bad.any():
        X, y = X[~bad], y[~bad]
        labels = [lbl for lbl, b in zip(labels, ~bad) if b]

    _, X_te, _, y_te = train_test_split(
        X, y, test_size=TEST_SIZE, random_state=RANDOM_SEED, stratify=y)

    X_te_s = scaler.transform(X_te)

    # 3. SHAP
    print(f"\n[3/4] Computing SHAP values (background={n_background}, explain={n_explain})...")

    # Background для TreeExplainer (представительная выборка)
    rng = np.random.default_rng(RANDOM_SEED)
    bg_idx = rng.choice(len(X_te_s), min(n_background, len(X_te_s)), replace=False)
    background = X_te_s[bg_idx]

    # Объясняемые сэмплы
    exp_idx = rng.choice(len(X_te_s), min(n_explain, len(X_te_s)), replace=False)
    X_explain = X_te_s[exp_idx]
    y_explain = y_te[exp_idx]

    explainer = shap.TreeExplainer(model, background)
    shap_values = explainer.shap_values(X_explain)
    # shap_values: list of (n_explain, n_features) arrays, one per class

    # 4. Analyze and export
    print("\n[4/4] Analyzing SHAP values...")

    n_classes = len(classes)
    n_features = len(feature_names)

    # Global feature importance per class (mean |SHAP|)
    global_importance = {}
    for i, cls in enumerate(classes):
        sv = np.abs(shap_values[i])
        mean_abs = sv.mean(axis=0)
        top_idx = np.argsort(mean_abs)[::-1]

        importance = []
        for j in range(min(20, n_features)):
            importance.append({
                'feature': feature_names[top_idx[j]],
                'importance': round(float(mean_abs[top_idx[j]]), 6),
            })
        global_importance[cls] = importance

        print(f"\n  {cls} ({CLASS_LABELS_RU.get(cls, cls)}):")
        for j in range(min(5, len(importance))):
            print(f"    {j + 1}. {importance[j]['feature']:20s} {importance[j]['importance']:.6f}")

    # Overall importance (averaged across classes)
    overall_abs = np.mean([np.abs(shap_values[i]) for i in range(n_classes)], axis=0)
    overall_mean = overall_abs.mean(axis=0)
    overall_top = np.argsort(overall_mean)[::-1]

    overall_importance = []
    for j in range(min(20, n_features)):
        overall_importance.append({
            'feature': feature_names[overall_top[j]],
            'importance': round(float(overall_mean[overall_top[j]]), 6),
        })

    print(f"\n  OVERALL Top-10:")
    for j in range(min(10, len(overall_importance))):
        print(f"    {j + 1}. {overall_importance[j]['feature']:20s} "
              f"{overall_importance[j]['importance']:.6f}")

    # Per-class mean SHAP (signed, for browser visualization)
    # Показывает направление влияния каждого признака
    class_shap_means = {}
    for i, cls in enumerate(classes):
        class_shap_means[cls] = {
            feature_names[j]: round(float(shap_values[i][:, j].mean()), 6)
            for j in range(n_features)
        }

    # Export
    shap_export = {
        'global_importance': global_importance,
        'overall_importance': overall_importance,
        'class_shap_means': class_shap_means,
        'feature_names': feature_names,
        'classes': classes,
        'n_background': int(len(background)),
        'n_explained': int(len(X_explain)),
    }

    export_path = f'{MODEL_DIR}/shap_analysis.json'
    with open(export_path, 'w', encoding='utf-8') as f:
        json.dump(shap_export, f, indent=2, ensure_ascii=False)

    # Copy to web/model/ for browser access
    web_path = '../web/model/shap_analysis.json'
    os.makedirs(os.path.dirname(web_path), exist_ok=True)
    with open(web_path, 'w', encoding='utf-8') as f:
        json.dump(shap_export, f, separators=(',', ':'))

    print(f"\n  ✓ {export_path}")
    print(f"  ✓ {web_path}")

    # Try to save plots
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt

        # Summary plot
        fig, ax = plt.subplots(figsize=(10, 8))
        shap.summary_plot(shap_values, X_explain,
                          feature_names=feature_names,
                          class_names=classes,
                          show=False)
        plt.tight_layout()
        plt.savefig(f'{MODEL_DIR}/plots/shap_summary.png', dpi=150, bbox_inches='tight')
        plt.close()
        print(f"  ✓ {MODEL_DIR}/plots/shap_summary.png")

        # Bar plot
        fig, ax = plt.subplots(figsize=(10, 6))
        shap.summary_plot(shap_values, X_explain,
                          feature_names=feature_names,
                          class_names=classes,
                          plot_type='bar',
                          show=False)
        plt.tight_layout()
        plt.savefig(f'{MODEL_DIR}/plots/shap_bar.png', dpi=150, bbox_inches='tight')
        plt.close()
        print(f"  ✓ {MODEL_DIR}/plots/shap_bar.png")

    except Exception as e:
        print(f"  ⚠ Plots skipped: {e}")

    print("=" * 65)
    print(f"  SHAP analysis complete | {n_explain} samples × {n_features} features")
    print("=" * 65)

    return shap_export


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    data_dir = args[0] if args else None
    explain_rf(data_dir)
