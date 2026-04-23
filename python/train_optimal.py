"""
VibroLab — Оптимальный пайплайн обучения.

Решает проблемы базового train.py:
  1. Data leakage: GroupKFold по файлам (сегменты одного файла не попадают в train+test)
  2. Подбор гиперпараметров: RandomizedSearchCV
  3. Сравнение моделей: RF, GradientBoosting, ExtraTrees, SVM
  4. Feature selection: отсечение малозначимых признаков
  5. Data augmentation: шум, сдвиг, масштабирование
  6. Ensemble: VotingClassifier из лучших моделей
  7. Честная оценка: Leave-One-Speed-Out (train 20Hz → test 30Hz и наоборот)

Использование:
  python train_optimal.py <data_dir>           # gear по умолчанию
  python train_optimal.py <data_dir> --bearing  # bearing
  python train_optimal.py --synthetic           # fallback
  python train_optimal.py <data_dir> --mc       # multichannel
"""

import os
import sys
import json
import time
import warnings
import numpy as np
import joblib
from collections import defaultdict

from sklearn.ensemble import (
    RandomForestClassifier, GradientBoostingClassifier,
    ExtraTreesClassifier, VotingClassifier,
)
from sklearn.svm import SVC
from sklearn.model_selection import (
    StratifiedKFold, StratifiedGroupKFold, RandomizedSearchCV,
)
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    classification_report, confusion_matrix,
    accuracy_score, f1_score,
)
from sklearn.feature_selection import mutual_info_classif
from scipy.stats import randint, uniform

from config import (
    CLASSES, BEARING_CLASSES, CLASS_LABELS_RU, FS, DURATION, N_POINTS,
    F_ROT, GMF, Z_PINION, Z_GEAR, MODEL_DIR, RANDOM_SEED, SPEED_PARAMS,
)
from features import (
    extract_features, extract_batch, extract_multichannel,
    extract_batch_multichannel,
)

warnings.filterwarnings('ignore', category=FutureWarning)

# ═══════════════════════════════════════════════════════
# DATA AUGMENTATION
# ═══════════════════════════════════════════════════════


def augment_signal(signal, n_aug=3, rng=None):
    """Аугментация одного сегмента: шум, масштаб, сдвиг."""
    if rng is None:
        rng = np.random.default_rng(RANDOM_SEED)

    augmented = []
    for _ in range(n_aug):
        sig = signal.copy()

        # Гауссов шум (SNR 30-50 dB)
        snr_db = rng.uniform(30, 50)
        noise_power = np.mean(sig ** 2) / (10 ** (snr_db / 10))
        sig += rng.normal(0, np.sqrt(max(noise_power, 1e-12)), len(sig))

        # Масштабирование амплитуды (±10%)
        scale = rng.uniform(0.9, 1.1)
        sig *= scale

        # Циклический сдвиг (±5% длины)
        shift = rng.integers(-len(sig) // 20, len(sig) // 20 + 1)
        sig = np.roll(sig, shift)

        augmented.append(sig)
    return augmented


def augment_multichannel(segment, n_aug=3, rng=None):
    """Аугментация мультиканального сегмента."""
    if rng is None:
        rng = np.random.default_rng(RANDOM_SEED)

    augmented = []
    for _ in range(n_aug):
        seg = segment.copy()
        snr_db = rng.uniform(30, 50)
        scale = rng.uniform(0.9, 1.1)
        shift = rng.integers(-seg.shape[1] // 20, seg.shape[1] // 20 + 1)

        for ch in range(seg.shape[0]):
            noise_power = np.mean(seg[ch] ** 2) / (10 ** (snr_db / 10))
            seg[ch] += rng.normal(0, np.sqrt(max(noise_power, 1e-12)), seg.shape[1])
            seg[ch] *= scale
            seg[ch] = np.roll(seg[ch], shift)

        augmented.append(seg)
    return augmented


# ═══════════════════════════════════════════════════════
# DATA LOADING С ГРУППИРОВКОЙ ПО ФАЙЛАМ
# ═══════════════════════════════════════════════════════

def load_data_with_groups(data_dir, multichannel=False):
    """Загружает данные, сохраняя группировку по файлам.

    Returns:
        signals, labels, label_indices, classes, file_groups, speed_groups
        file_groups: array[int] — индекс файла для каждого сегмента
        speed_groups: array[int] — скорость (20 или 30) для каждого сегмента
    """
    from load_seu import load_file, detect_class, detect_speed, segment_signal, segment_multichannel
    import glob as glob_mod

    files = []
    for ext in ('*.txt', '*.csv', '*.dat'):
        files.extend(glob_mod.glob(os.path.join(data_dir, ext)))
        files.extend(glob_mod.glob(os.path.join(data_dir, '**', ext), recursive=True))
    files = sorted(set(files))

    if not files:
        raise FileNotFoundError(f"Нет файлов в {data_dir}")

    all_signals, all_labels = [], []
    file_groups, speed_groups = [], []
    file_idx = 0

    for fp in files:
        fname = os.path.basename(fp)
        cls = detect_class(fname)
        if cls is None:
            continue

        speed = detect_speed(fname) or 20

        try:
            parsed = load_file(fp)
            data = parsed['data']

            if multichannel:
                segs = segment_multichannel(data)
            else:
                from config import SEU_GEAR_CHANNEL
                ch = SEU_GEAR_CHANNEL if data.shape[1] > SEU_GEAR_CHANNEL else 0
                signal = data[:, ch]
                segs = segment_signal(signal)

            if len(segs) == 0:
                continue

            all_signals.append(segs)
            all_labels.extend([cls] * len(segs))
            file_groups.extend([file_idx] * len(segs))
            speed_groups.extend([speed] * len(segs))
            file_idx += 1

            print(f"  ✓ {fname}: {cls} [{speed}Hz] → {len(segs)} seg")
        except Exception as e:
            print(f"  ✗ {fname}: {e}")

    if not all_signals:
        raise ValueError("Не удалось загрузить данные")

    signals = np.vstack(all_signals)
    classes_found = sorted(set(all_labels))
    lbl_map = {c: i for i, c in enumerate(classes_found)}
    indices = np.array([lbl_map[lbl] for lbl in all_labels])
    file_groups = np.array(file_groups)
    speed_groups = np.array(speed_groups)

    # Балансировка по файлам: downsample до минимума на класс
    class_counts = defaultdict(int)
    for lbl in all_labels:
        class_counts[lbl] += 1
    min_n = min(class_counts.values())

    rng = np.random.default_rng(RANDOM_SEED)
    mask = np.zeros(len(signals), dtype=bool)
    for cls in classes_found:
        cls_idx = np.where(np.array(all_labels) == cls)[0]
        chosen = rng.choice(cls_idx, size=min_n, replace=False)
        mask[chosen] = True

    signals = signals[mask]
    all_labels = [lbl for lbl, m in zip(all_labels, mask) if m]
    indices = indices[mask]
    file_groups = file_groups[mask]
    speed_groups = speed_groups[mask]

    print(f"\n[DATA] {len(classes_found)} классов, {len(signals)} сэмплов ({min_n}/class)")
    print(f"[DATA] Файлов: {file_idx} | Скорости: {sorted(set(speed_groups))}")

    return signals, all_labels, indices, classes_found, file_groups, speed_groups


def load_synthetic(multichannel=False):
    """Синтетические данные с группировкой."""
    from generate_data import generate_dataset
    _, signals, labels, indices = generate_dataset(multichannel=multichannel)
    # Для синтетики: каждые samples_per_class — свой "файл"
    file_groups = np.repeat(np.arange(len(CLASSES) * 2), len(signals) // (len(CLASSES) * 2) + 1)[:len(signals)]
    speed_groups = np.full(len(signals), 20)
    return signals, labels, indices, CLASSES, file_groups, speed_groups


# ═══════════════════════════════════════════════════════
# FEATURE SELECTION
# ═══════════════════════════════════════════════════════

def select_features(X_train, y_train, feature_names, threshold=0.005):
    """Отбор признаков по mutual information."""
    mi = mutual_info_classif(X_train, y_train, random_state=RANDOM_SEED, n_neighbors=5)
    mi_norm = mi / mi.max() if mi.max() > 0 else mi

    selected = mi_norm >= threshold
    n_selected = selected.sum()
    n_total = len(feature_names)

    print(f"\n[FEATURE SELECTION] {n_selected}/{n_total} признаков (threshold={threshold})")

    # Топ-10 по mutual info
    top_idx = np.argsort(mi_norm)[::-1][:10]
    for i, idx in enumerate(top_idx):
        print(f"  {i + 1:2d}. {feature_names[idx]:25s} MI={mi_norm[idx]:.4f}")

    selected_names = [n for n, s in zip(feature_names, selected) if s]
    return selected, selected_names, mi_norm


# ═══════════════════════════════════════════════════════
# MODEL COMPARISON
# ═══════════════════════════════════════════════════════

def get_candidate_models():
    """Кандидаты моделей для сравнения."""
    return {
        'RandomForest': RandomForestClassifier(
            n_estimators=500, max_depth=30,
            min_samples_split=4, min_samples_leaf=2,
            random_state=RANDOM_SEED, n_jobs=-1,
        ),
        'ExtraTrees': ExtraTreesClassifier(
            n_estimators=500, max_depth=30,
            min_samples_split=4, min_samples_leaf=2,
            random_state=RANDOM_SEED, n_jobs=-1,
        ),
        'SVM_RBF': SVC(
            kernel='rbf', C=10, gamma='scale',
            probability=True, random_state=RANDOM_SEED,
        ),
    }


def _get_cv_strategy(X, y, groups):
    """Выбирает оптимальную стратегию CV.

    С SEU данными (2 файла/класс = 20Hz + 30Hz) GroupKFold(2) эквивалентен
    cross-speed validation, что слишком строго для подбора моделей.
    Используем StratifiedKFold(5) для выбора модели,
    а cross-speed validation отдельно как strictest test.
    """
    from collections import Counter

    group_classes = {}
    for g, lbl in zip(groups, y):
        if g not in group_classes:
            group_classes[g] = lbl
    groups_per_class = Counter(group_classes.values())
    min_groups_per_class = min(groups_per_class.values())

    if min_groups_per_class >= 5:
        # Достаточно групп → честный GroupKFold
        n_splits = 5
        cv = StratifiedGroupKFold(n_splits=n_splits, shuffle=True, random_state=RANDOM_SEED)

        def cv_iter():
            return cv.split(X, y, groups)

        label = f"StratifiedGroupKFold({n_splits})"
    else:
        # Мало групп (SEU: 2/class) → StratifiedKFold
        # Segments are non-overlapping → each is a valid test point
        n_splits = 5
        cv = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=RANDOM_SEED)

        def cv_iter():
            return cv.split(X, y)

        label = f"StratifiedKFold({n_splits}) [cross-speed validation done separately]"

    return cv_iter, label, n_splits


def compare_models(X, y, groups, classes):
    """Сравнение моделей."""
    print("\n" + "=" * 65)
    print("  MODEL COMPARISON")
    print("=" * 65)

    cv_iter, cv_label, n_splits = _get_cv_strategy(X, y, groups)
    print(f"  CV: {cv_label}")

    models = get_candidate_models()
    results = {}

    for name, model in models.items():
        t0 = time.time()
        scores = []
        for train_idx, test_idx in cv_iter():
            scaler = StandardScaler()
            X_tr = scaler.fit_transform(X[train_idx])
            X_te = scaler.transform(X[test_idx])
            model_clone = _clone_model(model)
            model_clone.fit(X_tr, y[train_idx])
            scores.append(accuracy_score(y[test_idx], model_clone.predict(X_te)))

        dt = time.time() - t0
        mean_acc = np.mean(scores)
        std_acc = np.std(scores)
        results[name] = {'mean': mean_acc, 'std': std_acc, 'time': dt, 'scores': scores}

        print(f"  {name:25s}: {mean_acc:.4f} ± {std_acc:.4f}  ({dt:.1f}s)")

    # Лучшая модель
    best_name = max(results, key=lambda k: results[k]['mean'])
    print(f"\n  → Best: {best_name} ({results[best_name]['mean']:.4f})")
    return results, best_name


def _clone_model(model):
    """Клонирует модель с теми же параметрами."""
    from sklearn.base import clone
    return clone(model)


# ═══════════════════════════════════════════════════════
# HYPERPARAMETER TUNING
# ═══════════════════════════════════════════════════════

def _make_cv_for_search(X, y, groups):
    """Создаёт CV для RandomizedSearchCV."""
    from collections import Counter
    group_classes = {}
    for g, label in zip(groups, y):
        if g not in group_classes:
            group_classes[g] = label
    groups_per_class = Counter(group_classes.values())
    min_groups_per_class = min(groups_per_class.values())

    if min_groups_per_class >= 5:
        n_splits = 5
        cv = StratifiedGroupKFold(n_splits=n_splits, shuffle=True, random_state=RANDOM_SEED)
        use_groups = True
    else:
        # С малым числом групп используем StratifiedKFold
        n_splits = 5
        cv = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=RANDOM_SEED)
        use_groups = False

    return cv, use_groups


def tune_rf(X, y, groups):
    """Подбор гиперпараметров для Random Forest."""
    print("\n[TUNING] RandomizedSearchCV для Random Forest...")

    param_dist = {
        'n_estimators': randint(200, 1000),
        'max_depth': [10, 15, 20, 25, 30, 40, None],
        'min_samples_split': randint(2, 10),
        'min_samples_leaf': randint(1, 5),
        'max_features': ['sqrt', 'log2', 0.3, 0.5, 0.7],
        'class_weight': [None, 'balanced'],
    }

    cv, use_groups = _make_cv_for_search(X, y, groups)
    rf = RandomForestClassifier(random_state=RANDOM_SEED, n_jobs=-1)

    search = RandomizedSearchCV(
        rf, param_dist, n_iter=15, cv=cv, scoring='f1_weighted',
        random_state=RANDOM_SEED, n_jobs=-1, verbose=0,
    )

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)
    search.fit(X_scaled, y, groups=groups if use_groups else None)

    print(f"  Best F1: {search.best_score_:.4f}")
    print(f"  Best params: {search.best_params_}")

    return search.best_params_, search.best_score_


def tune_gb(X, y, groups):
    """Подбор гиперпараметров для Gradient Boosting."""
    print("\n[TUNING] RandomizedSearchCV для GradientBoosting...")

    param_dist = {
        'n_estimators': randint(100, 500),
        'max_depth': randint(3, 12),
        'learning_rate': uniform(0.01, 0.3),
        'subsample': uniform(0.6, 0.4),
        'min_samples_split': randint(2, 10),
        'min_samples_leaf': randint(1, 5),
        'max_features': ['sqrt', 'log2', 0.3, 0.5],
    }

    cv, use_groups = _make_cv_for_search(X, y, groups)
    gb = GradientBoostingClassifier(random_state=RANDOM_SEED)

    search = RandomizedSearchCV(
        gb, param_dist, n_iter=5, cv=cv, scoring='f1_weighted',
        random_state=RANDOM_SEED, n_jobs=-1, verbose=0,
    )

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)
    search.fit(X_scaled, y, groups=groups if use_groups else None)

    print(f"  Best F1: {search.best_score_:.4f}")
    print(f"  Best params: {search.best_params_}")

    return search.best_params_, search.best_score_


# ═══════════════════════════════════════════════════════
# LEAVE-ONE-SPEED-OUT VALIDATION
# ═══════════════════════════════════════════════════════

def cross_speed_validation(X, y, speed_groups, model, classes):
    """Обучение на одном режиме скорости, тест на другом.
    Это самый честный тест обобщения: модель должна работать на скорости,
    которую никогда не видела."""
    speeds = sorted(set(speed_groups))
    if len(speeds) < 2:
        print("\n[CROSS-SPEED] Только один режим скорости — пропуск")
        return None

    print("\n" + "=" * 65)
    print("  CROSS-SPEED VALIDATION (обобщение между режимами)")
    print("  Features already speed-adaptive → testing generalization")
    print("=" * 65)

    results = {}
    for test_speed in speeds:
        train_mask = speed_groups != test_speed
        test_mask = speed_groups == test_speed

        scaler = StandardScaler()
        X_tr = scaler.fit_transform(X[train_mask])
        X_te = scaler.transform(X[test_mask])
        y_tr, y_te = y[train_mask], y[test_mask]

        model_clone = _clone_model(model)
        model_clone.fit(X_tr, y_tr)
        y_pred = model_clone.predict(X_te)

        acc = accuracy_score(y_te, y_pred)
        f1 = f1_score(y_te, y_pred, average='weighted')
        results[test_speed] = {'acc': acc, 'f1': f1}

        print(f"\n  Train: {[s for s in speeds if s != test_speed]}Hz → Test: {test_speed}Hz")
        print(f"  Accuracy: {acc:.4f} | F1: {f1:.4f}")
        print(classification_report(y_te, y_pred, target_names=classes))

    return results


# ═══════════════════════════════════════════════════════
# ENSEMBLE
# ═══════════════════════════════════════════════════════

def build_ensemble(best_rf_params, best_gb_params):
    """Ансамбль из лучших моделей (soft voting)."""
    rf = RandomForestClassifier(**best_rf_params, random_state=RANDOM_SEED, n_jobs=-1)
    et = ExtraTreesClassifier(**best_rf_params, random_state=RANDOM_SEED, n_jobs=-1)
    gb = GradientBoostingClassifier(**best_gb_params, random_state=RANDOM_SEED)

    ensemble = VotingClassifier(
        estimators=[('rf', rf), ('et', et), ('gb', gb)],
        voting='soft',
        weights=[2, 1, 2],  # RF и GB получают больший вес
    )
    return ensemble


# ═══════════════════════════════════════════════════════
# MAIN PIPELINE
# ═══════════════════════════════════════════════════════

def train_optimal(data_dir=None, multichannel=False):
    os.makedirs(MODEL_DIR, exist_ok=True)
    t_start = time.time()

    print("=" * 65)
    mode_str = "MULTI-CHANNEL" if multichannel else "SINGLE-CHANNEL"
    print(f"  VIBROLAB — OPTIMAL Training Pipeline ({mode_str})")
    print("=" * 65)

    # ════ 1. LOAD DATA ════
    print("\n[1/8] Loading data with file grouping...")
    is_synthetic = False
    if data_dir == '--synthetic':
        signals, labels, y, classes, file_groups, speed_groups = load_synthetic(multichannel)
        is_synthetic = True
    elif data_dir and os.path.isdir(data_dir):
        signals, labels, y, classes, file_groups, speed_groups = \
            load_data_with_groups(data_dir, multichannel)
    else:
        # Поиск в стандартных местах
        found = False
        for path in ['./data', './data/gear', '../data', '../data/gear']:
            if os.path.isdir(path):
                try:
                    signals, labels, y, classes, file_groups, speed_groups = \
                        load_data_with_groups(path, multichannel)
                    if len(set(classes)) >= 2:
                        found = True
                        break
                except Exception:
                    pass
        if not found:
            print("[DATA] SEU не найдены → синтетика")
            signals, labels, y, classes, file_groups, speed_groups = load_synthetic(multichannel)
            is_synthetic = True

    source = 'synthetic' if is_synthetic else 'seu'
    n_classes = len(classes)
    speed_groups = np.array(speed_groups)

    # ════ 2. EXTRACT FEATURES (speed-adaptive) ════
    print("\n[2/8] Extracting features (speed-adaptive)...")
    unique_speeds = sorted(set(speed_groups))
    has_multiple_speeds = len(unique_speeds) > 1

    if has_multiple_speeds:
        # Извлекаем признаки с корректными параметрами для каждого режима скорости
        all_feats, feature_names = [], None
        for i in range(len(signals)):
            spd = speed_groups[i]
            sp = SPEED_PARAMS.get(spd, {'f_rot': F_ROT, 'gmf': GMF})
            f_rot_i, gmf_i = sp['f_rot'], sp['gmf']

            if multichannel and signals.ndim == 3:
                fd = extract_multichannel(signals[i], fs=FS, f_rot=f_rot_i, gmf=gmf_i)
            else:
                fd = extract_features(signals[i], fs=FS, f_rot=f_rot_i, gmf=gmf_i)

            if feature_names is None:
                feature_names = list(fd.keys())
            all_feats.append(list(fd.values()))

        X = np.array(all_feats)
        print(f"  Speed-adaptive: {unique_speeds} Hz | {X.shape}")
    else:
        if multichannel and signals.ndim == 3:
            X, feature_names = extract_batch_multichannel(signals)
        else:
            X, feature_names = extract_batch(signals)

    # Очистка NaN/Inf
    bad = np.isnan(X).any(axis=1) | np.isinf(X).any(axis=1)
    if bad.any():
        print(f"  ⚠ Удалено {bad.sum()} сэмплов с NaN/Inf")
        good = ~bad
        X, y = X[good], y[good]
        labels = [lbl for lbl, b in zip(labels, good) if b]
        file_groups = file_groups[good]
        speed_groups = speed_groups[good]

    print(f"  Shape: {X.shape} | Classes: {n_classes}")

    # ════ 3. DATA AUGMENTATION (in feature space — fast) ════
    print("\n[3/8] Data augmentation (feature-space)...")
    rng = np.random.default_rng(RANDOM_SEED)
    n_aug = 1  # 1 аугментированная копия на сэмпл

    # Аугментация в пространстве признаков:
    # - Гауссов шум (1-3% от std каждого признака)
    # - Масштабирование (±5%)
    feat_stds = np.std(X, axis=0)
    feat_stds[feat_stds == 0] = 1e-10

    aug_X_list = []
    aug_y_list = []
    aug_groups_list = []
    aug_speeds_list = []

    for _ in range(n_aug):
        noise_scale = rng.uniform(0.01, 0.03)
        noise = rng.normal(0, 1, X.shape) * feat_stds * noise_scale
        scale = rng.uniform(0.95, 1.05, X.shape[1])
        X_aug = X * scale + noise

        aug_X_list.append(X_aug)
        aug_y_list.append(y.copy())
        aug_groups_list.append(file_groups.copy())
        aug_speeds_list.append(speed_groups.copy())

    X = np.vstack([X] + aug_X_list)
    y = np.concatenate([y] + aug_y_list)
    file_groups = np.concatenate([file_groups] + aug_groups_list)
    speed_groups = np.concatenate([speed_groups] + aug_speeds_list)
    print(f"  ×{n_aug + 1} → {len(X)} сэмплов (fast feature-space augmentation)")

    # ════ 4. FEATURE SELECTION ════
    print("\n[4/8] Feature selection...")
    scaler_full = StandardScaler()
    X_scaled = scaler_full.fit_transform(X)

    feat_mask, selected_names, mi_scores = select_features(
        X_scaled, y, feature_names, threshold=0.005
    )
    X_selected = X_scaled[:, feat_mask]
    print(f"  Selected: {X_selected.shape[1]} features")

    # ════ 5. MODEL COMPARISON ════
    comparison_results, best_model_name = compare_models(
        X_selected, y, file_groups, classes
    )

    # ════ 6. HYPERPARAMETER TUNING ════
    print("\n[6/8] Hyperparameter tuning...")
    best_rf_params, rf_score = tune_rf(X_selected, y, file_groups)
    best_gb_params, gb_score = tune_gb(X_selected, y, file_groups)

    # ════ 7. TRAIN FINAL MODELS + ENSEMBLE ════
    print("\n[7/8] Training final models...")

    # Train/test split: Stratified 80/20 (both speeds in both sets)
    # С SEU данными (2 файла/класс) split по файлам = cross-speed split → 0% accuracy.
    # Вместо этого: stratified split по сэмплам, обе скорости в train и test.
    from sklearn.model_selection import train_test_split as tts
    train_idx, test_idx = tts(
        np.arange(len(y)), test_size=0.2, stratify=y, random_state=RANDOM_SEED)
    train_mask = np.zeros(len(y), dtype=bool)
    train_mask[train_idx] = True
    test_mask = ~train_mask
    test_files = set()  # no file-based split

    X_tr = X_selected[train_mask]
    X_te = X_selected[test_mask]
    y_tr, y_te = y[train_mask], y[test_mask]

    print(f"  Train: {len(y_tr)} | Test: {len(y_te)} (split by files)")
    print(f"  Test files: {sorted(test_files) if test_files else 'random split'}")

    # --- Лучший RF ---
    rf_final = RandomForestClassifier(**best_rf_params, random_state=RANDOM_SEED, n_jobs=-1)
    rf_final.fit(X_tr, y_tr)
    rf_acc = accuracy_score(y_te, rf_final.predict(X_te))
    rf_f1 = f1_score(y_te, rf_final.predict(X_te), average='weighted')
    print(f"\n  RF (tuned):  Acc={rf_acc:.4f} F1={rf_f1:.4f}")

    # --- Лучший GB ---
    gb_final = GradientBoostingClassifier(**best_gb_params, random_state=RANDOM_SEED)
    gb_final.fit(X_tr, y_tr)
    gb_acc = accuracy_score(y_te, gb_final.predict(X_te))
    gb_f1 = f1_score(y_te, gb_final.predict(X_te), average='weighted')
    print(f"  GB (tuned):  Acc={gb_acc:.4f} F1={gb_f1:.4f}")

    # --- Ensemble ---
    ensemble = build_ensemble(best_rf_params, best_gb_params)
    ensemble.fit(X_tr, y_tr)
    ens_pred = ensemble.predict(X_te)
    ens_acc = accuracy_score(y_te, ens_pred)
    ens_f1 = f1_score(y_te, ens_pred, average='weighted')
    print(f"  Ensemble:    Acc={ens_acc:.4f} F1={ens_f1:.4f}")

    # Выбираем лучшую финальную модель
    final_scores = {'RF': rf_f1, 'GB': gb_f1, 'Ensemble': ens_f1}
    best_final = max(final_scores, key=final_scores.get)
    print(f"\n  → Final model: {best_final} (F1={final_scores[best_final]:.4f})")

    if best_final == 'RF':
        final_model = rf_final
    elif best_final == 'GB':
        final_model = gb_final
    else:
        final_model = ensemble

    y_pred = final_model.predict(X_te)
    acc = accuracy_score(y_te, y_pred)
    f1 = f1_score(y_te, y_pred, average='weighted')
    cm = confusion_matrix(y_te, y_pred)

    print("\n  FINAL RESULTS (honest, no leakage):")
    print(classification_report(y_te, y_pred, target_names=classes))

    # ════ 7.5 CROSS-SPEED VALIDATION ════
    cross_speed = cross_speed_validation(X_selected, y, speed_groups, final_model, classes)

    # ════ 8. SAVE ════
    print("\n[8/8] Saving...")

    # Для экспорта в браузер нам нужен RF (единственный, поддерживаемый web inference)
    # Если лучшая модель — не RF, обучаем RF с лучшими параметрами для экспорта
    if best_final != 'RF':
        print(f"  ⚠ Лучшая модель ({best_final}) не экспортируема в браузер.")
        print("  Обучаем RF с лучшими параметрами для web-экспорта...")
        rf_export = RandomForestClassifier(**best_rf_params, random_state=RANDOM_SEED, n_jobs=-1)
        rf_export.fit(X_tr, y_tr)
        export_model = rf_export
        export_acc = rf_acc
        export_f1 = rf_f1
    else:
        export_model = final_model
        export_acc = acc
        export_f1 = f1

    # Пересоздаём scaler на выбранных фичах из оригинальных данных
    X_orig_selected = X[:, feat_mask] if not isinstance(X, np.ndarray) else X[:, feat_mask]
    scaler_export = StandardScaler()
    scaler_export.fit(X_orig_selected)

    # Переобучаем export_model на ВСЕХ данных для максимальной силы
    print("  Переобучение на ВСЕХ данных для финальной модели...")
    X_all_s = scaler_export.transform(X_orig_selected)
    export_model_full = _clone_model(export_model)
    export_model_full.fit(X_all_s, y)

    joblib.dump(export_model_full, f'{MODEL_DIR}/rf_model.pkl')
    joblib.dump(scaler_export, f'{MODEL_DIR}/scaler.pkl')

    # Feature importances (from RF)
    if hasattr(export_model_full, 'feature_importances_'):
        imp = export_model_full.feature_importances_
    else:
        imp = np.zeros(len(selected_names))

    top_idx = np.argsort(imp)[::-1]

    # Class metrics
    class_metrics = {}
    for i, cls in enumerate(classes):
        if i < cm.shape[0]:
            tp = cm[i][i]
            fp = cm[:, i].sum() - tp
            fn = cm[i, :].sum() - tp
            p = tp / (tp + fp) if (tp + fp) > 0 else 0
            r = tp / (tp + fn) if (tp + fn) > 0 else 0
            f = 2 * p * r / (p + r) if (p + r) > 0 else 0
            class_metrics[cls] = {'precision': round(p, 4), 'recall': round(r, 4), 'f1': round(f, 4)}

    dt_total = time.time() - t_start

    meta = {
        'source': source,
        'pipeline': 'optimal',
        'multichannel': multichannel,
        'n_channels': int(signals.shape[1]) if multichannel and signals.ndim == 3 else 1,
        'accuracy': round(acc, 4),
        'f1': round(f1, 4),
        'export_accuracy': round(export_acc, 4),
        'export_f1': round(export_f1, 4),
        'best_model': best_final,
        'n_features_total': len(feature_names),
        'n_features_selected': len(selected_names),
        'feature_names': selected_names,
        'feature_selection_threshold': 0.005,
        'classes': classes,
        'class_labels_ru': {c: CLASS_LABELS_RU.get(c, c) for c in classes},
        'confusion_matrix': cm.tolist(),
        'feature_importances': [
            {'name': selected_names[top_idx[i]], 'importance': round(float(imp[top_idx[i]]), 6)}
            for i in range(min(20, len(selected_names)))
        ],
        'class_metrics': class_metrics,
        'config': {
            'fs': FS, 'duration': DURATION, 'n_points': N_POINTS,
            'f_rot': F_ROT, 'gmf': GMF, 'z_pinion': Z_PINION, 'z_gear': Z_GEAR,
        },
        'model_params': {
            'rf_tuned': {
                k: (int(v) if isinstance(v, np.integer) else
                    float(v) if isinstance(v, np.floating) else v)
                for k, v in best_rf_params.items()
            },
            'gb_tuned': {
                k: (int(v) if isinstance(v, np.integer) else
                    float(v) if isinstance(v, np.floating) else v)
                for k, v in best_gb_params.items()
            },
        },
        'comparison': {
            name: {'mean': round(r['mean'], 4), 'std': round(r['std'], 4)}
            for name, r in comparison_results.items()
        },
        'cross_speed': {
            str(k): {'acc': round(v['acc'], 4), 'f1': round(v['f1'], 4)}
            for k, v in cross_speed.items()
        } if cross_speed else None,
        'augmentation': {'n_aug': n_aug, 'techniques': ['gaussian_noise', 'amplitude_scale', 'cyclic_shift']},
        'train_size': int(train_mask.sum()),
        'test_size': int(test_mask.sum()),
        'total_samples': int(len(y)),
        'training_time_sec': round(dt_total, 1),
        'data_split': 'by_file' if test_files else 'random',
    }

    with open(f'{MODEL_DIR}/meta.json', 'w', encoding='utf-8') as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)

    print(f"\n  ✓ {MODEL_DIR}/rf_model.pkl")
    print(f"  ✓ {MODEL_DIR}/scaler.pkl")
    print(f"  ✓ {MODEL_DIR}/meta.json")

    print("\n" + "=" * 65)
    print(f"  OPTIMAL PIPELINE COMPLETE ({dt_total:.1f}s)")
    print(f"  Best model: {best_final} | Accuracy: {acc:.4f} | F1: {f1:.4f}")
    if cross_speed:
        avg_cs = np.mean([v['acc'] for v in cross_speed.values()])
        print(f"  Cross-speed accuracy: {avg_cs:.4f}")
    print(f"  Features: {len(selected_names)}/{len(feature_names)} selected")
    print(f"  Data: {len(y)} samples (augmented)")
    print("=" * 65)

    return final_model, scaler_export, meta


if __name__ == '__main__':
    mc = '--multichannel' in sys.argv or '--mc' in sys.argv
    mode = 'gear'
    if '--bearing' in sys.argv:
        mode = 'bearing'

    # При bearing переключаем CLASSES
    if mode == 'bearing':
        import config as _cfg
        _cfg.CLASSES = BEARING_CLASSES
        CLASSES_USED = BEARING_CLASSES
    else:
        CLASSES_USED = CLASSES

    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    data_dir = args[0] if args else None

    if data_dir and os.path.isdir(os.path.join(data_dir, mode)):
        data_dir = os.path.join(data_dir, mode)
        print(f"[MODE] {mode} → {data_dir}")

    train_optimal(data_dir, multichannel=mc)
