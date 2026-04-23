"""Tests for training pipeline and model export."""

import os
import json
import importlib


def _configure_artifact_paths(tmp_path):
    import config as _cfg

    model_dir = tmp_path / 'models'
    export_dir = tmp_path / 'web_model'
    model_dir.mkdir(parents=True, exist_ok=True)
    export_dir.mkdir(parents=True, exist_ok=True)

    original = {
        'MODEL_DIR': _cfg.MODEL_DIR,
        'MODEL_PATH': _cfg.MODEL_PATH,
        'SCALER_PATH': _cfg.SCALER_PATH,
        'META_PATH': _cfg.META_PATH,
        'EXPORT_PATH': _cfg.EXPORT_PATH,
    }

    _cfg.MODEL_DIR = str(model_dir)
    _cfg.MODEL_PATH = str(model_dir / 'rf_model.pkl')
    _cfg.SCALER_PATH = str(model_dir / 'scaler.pkl')
    _cfg.META_PATH = str(model_dir / 'meta.json')
    _cfg.EXPORT_PATH = str(export_dir / 'rf_model.json')

    return _cfg, original


def _restore_artifact_paths(cfg, original):
    for key, value in original.items():
        setattr(cfg, key, value)


def test_synthetic_generation():
    from generate_data import generate_dataset
    from config import CLASSES, N_POINTS
    _, signals, labels, _indices = generate_dataset(samples_per_class=10, seed=42)
    assert signals.shape == (50, N_POINTS)  # 5 classes × 10
    assert len(labels) == 50
    assert set(labels) == set(CLASSES)


def test_train_synthetic(tmp_path, monkeypatch):
    """Full training pipeline on synthetic data."""
    cfg, original = _configure_artifact_paths(tmp_path)
    from train import train
    monkeypatch.chdir(os.path.join(os.path.dirname(__file__), '..', 'python'))
    try:
        _model, _scaler, meta = train('--synthetic')
        assert meta['accuracy'] > 0.8
        assert meta['n_features'] == 53
        assert len(meta['classes']) == 5
        assert os.path.exists(cfg.MODEL_PATH)
        assert os.path.exists(cfg.SCALER_PATH)
        assert os.path.exists(cfg.META_PATH)
    finally:
        _restore_artifact_paths(cfg, original)


def test_train_synthetic_multichannel(tmp_path, monkeypatch):
    """Multichannel training pipeline on synthetic data."""
    cfg, original = _configure_artifact_paths(tmp_path)
    from train import train
    monkeypatch.chdir(os.path.join(os.path.dirname(__file__), '..', 'python'))
    try:
        _model, _scaler, meta = train('--synthetic', multichannel=True)
        assert meta['accuracy'] > 0.8
        assert meta['n_features'] == 402
        assert meta['multichannel'] is True
        assert meta['n_channels'] == 8
        assert len(meta['classes']) == 5
    finally:
        _restore_artifact_paths(cfg, original)


def test_model_export(tmp_path, monkeypatch):
    """Export trained model to JSON."""
    cfg, original = _configure_artifact_paths(tmp_path)
    monkeypatch.chdir(os.path.join(os.path.dirname(__file__), '..', 'python'))
    from train import train
    try:
        train('--synthetic')

        export_model = importlib.import_module('export_model')
        export_model = importlib.reload(export_model)
        export_model.export()

        assert os.path.exists(cfg.EXPORT_PATH)

        with open(cfg.EXPORT_PATH) as f:
            data = json.load(f)
        assert 't' in data  # trees
        assert 'm' in data  # scaler mean
        assert 's' in data  # scaler scale
        assert len(data['m']) == 53
        assert len(data['t']) > 0
    finally:
        _restore_artifact_paths(cfg, original)


def test_meta_json_structure(tmp_path, monkeypatch):
    """Verify meta.json has all required fields."""
    cfg, original = _configure_artifact_paths(tmp_path)
    monkeypatch.chdir(os.path.join(os.path.dirname(__file__), '..', 'python'))
    try:
        from train import train
        train('--synthetic')

        with open(cfg.META_PATH) as f:
            meta = json.load(f)

        required = ['accuracy', 'f1', 'classes', 'confusion_matrix',
                    'feature_importances', 'class_metrics', 'config']
        for key in required:
            assert key in meta, f"Missing key: {key}"

        assert meta['config']['fs'] == 5120
        assert meta['config']['gmf'] == 400
    finally:
        _restore_artifact_paths(cfg, original)
