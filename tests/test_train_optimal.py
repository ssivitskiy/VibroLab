"""Tests for train_optimal.py — augmentation, feature selection, model comparison, CV strategies."""

import numpy as np
from config import N_POINTS, CLASSES


# ═══ Augmentation ═══

def test_augment_signal_count():
    from train_optimal import augment_signal
    sig = np.random.randn(N_POINTS)
    augmented = augment_signal(sig, n_aug=5)
    assert len(augmented) == 5


def test_augment_signal_shape():
    from train_optimal import augment_signal
    sig = np.random.randn(N_POINTS)
    augmented = augment_signal(sig, n_aug=3)
    for a in augmented:
        assert a.shape == sig.shape


def test_augment_signal_differs_from_original():
    from train_optimal import augment_signal
    sig = np.sin(np.linspace(0, 10, N_POINTS))
    augmented = augment_signal(sig, n_aug=1)
    # Augmented signal should differ from original (noise + scale + shift)
    assert not np.allclose(augmented[0], sig, atol=1e-6)


def test_augment_signal_no_nan():
    from train_optimal import augment_signal
    sig = np.random.randn(N_POINTS)
    augmented = augment_signal(sig, n_aug=3)
    for a in augmented:
        assert not np.isnan(a).any()
        assert not np.isinf(a).any()


def test_augment_signal_zero_aug():
    from train_optimal import augment_signal
    sig = np.random.randn(N_POINTS)
    augmented = augment_signal(sig, n_aug=0)
    assert len(augmented) == 0


def test_augment_multichannel_shape():
    from train_optimal import augment_multichannel
    seg = np.random.randn(8, N_POINTS)
    augmented = augment_multichannel(seg, n_aug=3)
    assert len(augmented) == 3
    for a in augmented:
        assert a.shape == (8, N_POINTS)


def test_augment_multichannel_no_nan():
    from train_optimal import augment_multichannel
    seg = np.random.randn(4, N_POINTS)
    augmented = augment_multichannel(seg, n_aug=2)
    for a in augmented:
        assert not np.isnan(a).any()


# ═══ Feature Selection ═══

def test_select_features_returns_mask():
    from train_optimal import select_features
    np.random.seed(42)
    n_samples, n_features = 200, 20
    X = np.random.randn(n_samples, n_features)
    # Make first 5 features informative
    y = np.array([0, 1, 2, 3, 4] * 40)
    for i in range(5):
        X[y == i, i] += 3.0
    selected, names, mi = select_features(X, y, [f"f{i}" for i in range(n_features)])
    assert selected.dtype == bool
    assert len(selected) == n_features
    assert selected.sum() > 0  # at least some features selected
    assert len(names) == selected.sum()
    assert len(mi) == n_features


def test_select_features_informative_selected():
    from train_optimal import select_features
    np.random.seed(42)
    n_samples = 300
    X = np.random.randn(n_samples, 10)
    y = np.array([0, 1, 2] * 100)
    # Make features 0,1,2 very informative
    for i in range(3):
        X[y == i, i] += 5.0
    selected, names, mi = select_features(
        X, y, [f"f{i}" for i in range(10)], threshold=0.01)
    # Informative features should be selected
    assert selected[0]
    assert selected[1]
    assert selected[2]


# ═══ CV Strategy ═══

def test_cv_strategy_few_groups():
    from train_optimal import _get_cv_strategy
    X = np.random.randn(100, 10)
    y = np.array([0, 1] * 50)
    groups = np.array([0, 1] * 50)  # only 2 groups → StratifiedKFold
    cv_iter, label, n_splits = _get_cv_strategy(X, y, groups)
    assert n_splits == 5
    assert "StratifiedKFold" in label
    # cv_iter should be callable and return splits
    splits = list(cv_iter())
    assert len(splits) == 5


def test_cv_strategy_many_groups():
    from train_optimal import _get_cv_strategy
    X = np.random.randn(200, 10)
    y = np.array([0, 1] * 100)
    groups = np.repeat(np.arange(20), 10)  # 20 groups → GroupKFold
    cv_iter, label, n_splits = _get_cv_strategy(X, y, groups)
    assert n_splits == 5
    assert "GroupKFold" in label
    splits = list(cv_iter())
    assert len(splits) == 5


# ═══ Candidate Models ═══

def test_get_candidate_models():
    from train_optimal import get_candidate_models
    models = get_candidate_models()
    assert 'RandomForest' in models
    assert 'ExtraTrees' in models
    assert 'SVM_RBF' in models
    assert len(models) == 3


# ═══ Ensemble ═══

def test_build_ensemble():
    from train_optimal import build_ensemble
    rf_params = {'n_estimators': 100, 'max_depth': 10, 'min_samples_split': 2,
                 'min_samples_leaf': 1, 'max_features': 'sqrt'}
    gb_params = {'n_estimators': 50, 'max_depth': 5, 'learning_rate': 0.1,
                 'subsample': 0.8, 'min_samples_split': 2, 'min_samples_leaf': 1,
                 'max_features': 'sqrt'}
    ensemble = build_ensemble(rf_params, gb_params)
    assert hasattr(ensemble, 'fit')
    assert hasattr(ensemble, 'predict')
    assert ensemble.voting == 'soft'
    assert len(ensemble.estimators) == 3


# ═══ Cross-Speed Validation ═══

def test_cross_speed_validation_single_speed():
    from train_optimal import cross_speed_validation
    from sklearn.ensemble import RandomForestClassifier
    X = np.random.randn(100, 10)
    y = np.array([0, 1] * 50)
    speeds = np.array([20] * 100)  # single speed
    model = RandomForestClassifier(n_estimators=10, random_state=42)
    result = cross_speed_validation(X, y, speeds, model, ['cls0', 'cls1'])
    assert result is None


def test_cross_speed_validation_two_speeds():
    from train_optimal import cross_speed_validation
    from sklearn.ensemble import RandomForestClassifier
    np.random.seed(42)
    n = 200
    X = np.random.randn(n, 10)
    y = np.array([0, 1] * (n // 2))
    # Make features informative
    for i in range(2):
        X[y == i, i] += 3.0
    speeds = np.array([20] * (n // 2) + [30] * (n // 2))
    model = RandomForestClassifier(n_estimators=50, random_state=42)
    result = cross_speed_validation(X, y, speeds, model, ['cls0', 'cls1'])
    assert result is not None
    assert 20 in result
    assert 30 in result
    assert 'acc' in result[20]
    assert 'f1' in result[20]


# ═══ Synthetic Data Loading ═══

def test_load_synthetic():
    from train_optimal import load_synthetic
    signals, labels, indices, classes, file_groups, speed_groups = load_synthetic()
    assert len(signals) == len(labels)
    assert len(file_groups) == len(labels)
    assert len(speed_groups) == len(labels)
    assert set(classes) == set(CLASSES)
    assert len(set(labels)) == len(CLASSES)


def test_load_synthetic_multichannel():
    from train_optimal import load_synthetic
    signals, labels, indices, classes, file_groups, speed_groups = load_synthetic(multichannel=True)
    assert signals.ndim == 3
    assert signals.shape[1] == 8  # 8 channels
    assert signals.shape[2] == N_POINTS


# ═══ Model Compare (small synthetic) ═══

def test_compare_models_returns_results():
    from train_optimal import compare_models
    np.random.seed(42)
    n = 100
    X = np.random.randn(n, 20)
    y = np.array([0, 1, 2, 3, 4] * 20)
    # Make features informative
    for i in range(5):
        X[y == i, i] += 4.0
    groups = np.repeat(np.arange(10), 10)  # 10 groups, enough for GroupKFold
    results, best_name = compare_models(X, y, groups, CLASSES)
    assert isinstance(results, dict)
    assert len(results) >= 2  # at least RF and ExtraTrees
    assert best_name in results
    for name, r in results.items():
        assert 'mean' in r
        assert 'std' in r
        assert 0 <= r['mean'] <= 1


# ═══ Model Versioning in meta.json ═══

def test_model_versioning():
    """Test that train.py produces version, timestamp, and hash in meta.json."""
    import json
    import tempfile
    import os
    from train import train

    with tempfile.TemporaryDirectory() as tmpdir:
        import config as _cfg
        orig_model = _cfg.MODEL_PATH
        orig_scaler = _cfg.SCALER_PATH
        orig_meta = _cfg.META_PATH
        try:
            _cfg.MODEL_PATH = os.path.join(tmpdir, 'rf.pkl')
            _cfg.SCALER_PATH = os.path.join(tmpdir, 'scaler.pkl')
            _cfg.META_PATH = os.path.join(tmpdir, 'meta.json')
            os.makedirs(os.path.join(tmpdir), exist_ok=True)

            model, scaler, meta = train('--synthetic')

            assert 'version' in meta
            assert 'trained_at' in meta
            assert 'model_hash' in meta
            assert len(meta['model_hash']) == 12
            assert meta['version'].startswith('1.0.0-')
            assert 'T' in meta['trained_at']  # ISO format

            # Verify meta.json file also has versioning
            with open(_cfg.META_PATH) as f:
                saved = json.load(f)
            assert saved['version'] == meta['version']
            assert saved['model_hash'] == meta['model_hash']
        finally:
            _cfg.MODEL_PATH = orig_model
            _cfg.SCALER_PATH = orig_scaler
            _cfg.META_PATH = orig_meta
