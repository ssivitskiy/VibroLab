"""
Smoke-test: сравнивает Python pickle модель vs браузерную JSON модель
на эталонных сигналах из web/model/demo_cases.json.

Загружает обе модели, прогоняет одинаковые сигналы,
проверяет что вероятности совпадают до 5 знаков.
"""

import os
import sys
import json
import numpy as np
import joblib

THIS = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, THIS)

from features import extract_features as extract  # type: ignore
from config import FS  # type: ignore

WEB_MODEL = os.path.normpath(os.path.join(THIS, '../web/model/rf_model.json'))
DEMO_CASES = os.path.normpath(os.path.join(THIS, '../web/model/demo_cases.json'))
PY_MODEL = os.path.join(THIS, 'models/rf_model.pkl')
PY_SCALER = os.path.join(THIS, 'models/scaler.pkl')


def js_traverse_tree(tree, x):
    """Воспроизводит логику из web/js/model.js traverseTree()."""
    node = 0
    while True:
        n = tree[node]
        if n[0] == -2:
            return n[4]  # leaf -> class
        if x[n[0]] <= n[1]:
            node = n[2]
        else:
            node = n[3]


def js_predict(model_json, features, class_list):
    """Воспроизводит web/js/model.js predict()."""
    if model_json.get('f') and len(model_json['f']) > 0:
        selected = [features[i] for i in model_json['f']]
    else:
        selected = list(features)
    means = model_json['m']
    stds = model_json['s']
    scaled = [(selected[i] - means[i]) / stds[i] for i in range(len(selected))]

    n_classes = len(class_list)
    votes = [0] * n_classes
    for tree in model_json['t']:
        votes[js_traverse_tree(tree, scaled)] += 1
    total = len(model_json['t'])
    probs = {class_list[i]: votes[i] / total for i in range(n_classes)}
    best_idx = max(range(n_classes), key=lambda i: votes[i])
    return {
        'cls': class_list[best_idx],
        'confidence': votes[best_idx] / total,
        'probabilities': probs,
    }


def main():
    print('=' * 70)
    print(' VibroLab — Browser model vs Python pickle parity check')
    print('=' * 70)

    if not os.path.isfile(WEB_MODEL):
        print(f'[!] {WEB_MODEL} not found'); sys.exit(1)
    if not os.path.isfile(PY_MODEL):
        print(f'[!] {PY_MODEL} not found — run train.py first'); sys.exit(1)
    if not os.path.isfile(DEMO_CASES):
        print(f'[!] {DEMO_CASES} not found'); sys.exit(1)

    print('[1] Loading Python pickle model...')
    rf = joblib.load(PY_MODEL)
    scaler = joblib.load(PY_SCALER)
    print(f'    {rf.n_estimators} trees, {rf.n_classes_} classes')

    print('[2] Loading browser JSON model...')
    with open(WEB_MODEL) as f:
        web_model = json.load(f)
    print(f"    {len(web_model['t'])} trees, {len(web_model['m'])} features in scaler")

    print('[2.5] Loading class order from meta.json...')
    with open(os.path.join(os.path.dirname(WEB_MODEL), 'meta.json')) as f:
        meta = json.load(f)
    class_list = meta['classes']
    print(f'    Classes: {class_list}')

    print('[3] Loading demo cases...')
    with open(DEMO_CASES) as f:
        demos_root = json.load(f)
    cases = demos_root.get('cases', {})
    items = list(cases.items())
    print(f'    {len(items)} demo signals (sample_rate={demos_root.get("sample_rate", FS)})\n')

    fs = demos_root.get('sample_rate', FS)
    max_prob_diff = 0.0
    mismatches = 0
    label_mismatches = 0

    print(f"{'CLASS':<14} {'PY_PRED':<12} {'JS_PRED':<12} {'PY_CONF':<8} {'JS_CONF':<8} {'Δp':<10} STATUS")
    print('-' * 80)

    for case_label, case_data in items:
        # Normalize input
        if isinstance(case_data, list):
            signal = np.array(case_data, dtype=np.float32)
            true_cls = case_label
        elif isinstance(case_data, dict):
            sig_raw = case_data.get('signal') or case_data.get('data') or case_data.get('values')
            if sig_raw is None:
                continue
            signal = np.array(sig_raw, dtype=np.float32)
            true_cls = case_data.get('class') or case_label
            fs = case_data.get('fs', FS)
        else:
            continue

        if len(signal) < 64:
            continue

        # Extract features (returns dict → array in deterministic order)
        feats_dict = extract(signal, fs)
        feats = list(feats_dict.values())

        # Python prediction (rf returns numeric class index; map to names via class_list)
        scaled_py = scaler.transform([feats])
        py_pred_raw = rf.predict(scaled_py)[0]
        py_probs = rf.predict_proba(scaled_py)[0]
        py_pred_idx = int(py_pred_raw)
        py_pred = class_list[py_pred_idx]
        py_conf = float(py_probs[py_pred_idx])
        py_probs_dict = {class_list[i]: float(p) for i, p in enumerate(py_probs)}

        # JS-style prediction
        js_result = js_predict(web_model, feats, class_list)

        # Compare
        py_keys = sorted(py_probs_dict.keys())
        js_keys = sorted(js_result['probabilities'].keys())
        if py_keys == js_keys:
            diffs = [abs(py_probs_dict[k] - js_result['probabilities'][k]) for k in py_keys]
            max_diff = max(diffs)
        else:
            max_diff = float('inf')

        max_prob_diff = max(max_prob_diff, max_diff)

        labels_match = (str(py_pred) == js_result['cls'])
        probs_match = max_diff < 0.005  # within 0.5% across all 9 classes

        if not labels_match:
            label_mismatches += 1
        if not probs_match:
            mismatches += 1

        status = '✓' if (labels_match and probs_match) else '✗'
        print(f"{true_cls:<14} {str(py_pred):<12} {js_result['cls']:<12} "
              f"{py_conf:.3f}    {js_result['confidence']:.3f}    {max_diff:.5f}    {status}")

    print('-' * 80)
    print()
    print(f' Max probability divergence across all signals: {max_prob_diff:.6f}')
    print(f' Label mismatches: {label_mismatches} / {len(items)}')
    print(f' Probability mismatches (>0.5%): {mismatches} / {len(items)}')
    if max_prob_diff < 0.005 and label_mismatches == 0:
        print(' ✓ Browser JSON model is functionally identical to Python pickle.')
        sys.exit(0)
    else:
        print(' ✗ Discrepancies detected — check feature extraction or export pipeline.')
        sys.exit(2)


if __name__ == '__main__':
    main()
