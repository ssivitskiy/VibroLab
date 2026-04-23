"""
VibroLab — Экспорт модели → JSON для браузера.
Экспортирует rf_model.json + meta.json в web/model/

Поддерживает feature selection: если meta.json содержит feature_names
(подмножество всех признаков), экспортирует маппинг индексов фич,
чтобы браузер извлекал только нужные признаки.
"""

import json
import os
import shutil
import numpy as np
import joblib
from config import MODEL_PATH, SCALER_PATH, EXPORT_PATH, META_PATH
from features import FEATURE_ORDER


def export():
    model = joblib.load(MODEL_PATH)
    scaler = joblib.load(SCALER_PATH)

    # Проверяем, есть ли feature selection в meta.json
    selected_features = None
    if os.path.exists(META_PATH):
        with open(META_PATH, 'r', encoding='utf-8') as f:
            meta = json.load(f)
        selected_features = meta.get('feature_names')

    def tree_to_array(est):
        t = est.tree_
        nodes = []
        for i in range(t.node_count):
            if t.feature[i] == -2:
                nodes.append([-2, 0, 0, 0, int(np.argmax(t.value[i]))])
            else:
                nodes.append([int(t.feature[i]), round(float(t.threshold[i]), 6),
                              int(t.children_left[i]), int(t.children_right[i])])
        return nodes

    data = {
        'm': scaler.mean_.tolist(),
        's': scaler.scale_.tolist(),
        't': [tree_to_array(e) for e in model.estimators_]
    }

    # Если есть feature selection, добавляем маппинг
    if selected_features and len(selected_features) < len(FEATURE_ORDER):
        # Индексы выбранных фич в полном наборе (47 фич)
        feat_indices = []
        for name in selected_features:
            if name in FEATURE_ORDER:
                feat_indices.append(FEATURE_ORDER.index(name))
        if feat_indices:
            data['f'] = feat_indices  # feature indices for browser
            print(f"[EXPORT] Feature selection: {len(feat_indices)}/{len(FEATURE_ORDER)} features")

    os.makedirs(os.path.dirname(EXPORT_PATH), exist_ok=True)
    with open(EXPORT_PATH, 'w') as f:
        json.dump(data, f, separators=(',', ':'))

    # Copy meta.json to web/model/ too
    meta_dst = os.path.join(os.path.dirname(EXPORT_PATH), 'meta.json')
    if os.path.exists(META_PATH):
        shutil.copy2(META_PATH, meta_dst)
        print(f"[EXPORT] meta.json → {meta_dst}")

    size = os.path.getsize(EXPORT_PATH)
    n_nodes = sum(len(t) for t in data['t'])
    print(f"[EXPORT] {len(data['t'])} trees, {n_nodes} nodes → {EXPORT_PATH} ({size / 1024:.1f} KB)")


if __name__ == '__main__':
    export()
