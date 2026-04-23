"""Tests for advanced ML pipeline: CNN, LSTM, Autoencoder, RUL, Calibration."""

import os
import json
import numpy as np
import pytest


def _require_torch():
    pytest.importorskip("torch")


# ═══ RUL Data Generation ═══

def test_degradation_curve():
    from generate_rul_data import degradation_curve
    for curve_type in ['exponential', 'polynomial', 'sigmoid', 'linear']:
        alpha = degradation_curve(100, curve_type)
        assert len(alpha) == 100
        assert alpha[0] >= 0
        assert alpha[-1] <= 1
        # Should be monotonically non-decreasing
        assert np.all(np.diff(alpha) >= -1e-10)


def test_generate_rul_trajectories():
    from generate_rul_data import generate_rul_trajectories
    trajectories, rul_labels, fault_types = generate_rul_trajectories(
        n_trajectories_per_class=2, n_steps=10, seed=42)

    # 4 fault classes × 2 trajectories each
    assert len(trajectories) == 8
    assert len(rul_labels) == 8
    assert len(fault_types) == 8

    # Each trajectory shape
    assert trajectories[0].shape == (10, 2560)
    assert rul_labels[0].shape == (10,)

    # RUL should start high, end low
    for rul in rul_labels:
        assert rul[0] > rul[-1]


def test_trajectories_to_features():
    from generate_rul_data import generate_rul_trajectories, trajectories_to_features
    trajectories, rul_labels, _ = generate_rul_trajectories(
        n_trajectories_per_class=2, n_steps=5, seed=42)
    X, y_rul, groups = trajectories_to_features(trajectories, rul_labels)

    assert X.shape[0] == 8 * 5  # 8 trajectories × 5 steps (minus any NaN)
    assert X.shape[1] == 53
    assert len(y_rul) == len(X)
    assert len(groups) == len(X)
    assert y_rul.min() >= 0
    assert y_rul.max() <= 1


# ═══ Calibration ═══

def test_mahalanobis_params():
    from calibration import compute_mahalanobis_params
    np.random.seed(42)

    n_features = 10
    n_samples = 100
    classes = ['a', 'b']

    X = np.random.randn(n_samples, n_features)
    y = np.array([0] * 50 + [1] * 50)

    class_means, precision, threshold, distances = compute_mahalanobis_params(
        X, y, classes)

    assert len(class_means) == 2
    assert class_means['a'].shape == (n_features,)
    assert precision.shape == (n_features, n_features)
    assert threshold > 0
    assert len(distances) == n_samples
    assert all(d >= 0 for d in distances)


# ═══ LSTM Reshape ═══

def test_lstm_reshape_to_frames():
    _require_torch()
    from train_lstm import reshape_to_frames
    signals = np.random.randn(10, 2560)
    frames = reshape_to_frames(signals, n_steps=32)
    assert frames.shape == (10, 32, 80)


def test_lstm_reshape_multichannel():
    _require_torch()
    from train_lstm import reshape_to_frames
    signals = np.random.randn(10, 8, 2560)
    frames = reshape_to_frames(signals, n_steps=32)
    assert frames.shape == (10, 32, 80)  # uses channel 0


# ═══ Config ═══

def test_dl_config_exists():
    from config import CNN_PARAMS, LSTM_PARAMS, AE_PARAMS, RUL_PARAMS, CALIBRATION_PARAMS

    assert CNN_PARAMS['epochs'] > 0
    assert CNN_PARAMS['batch_size'] > 0
    assert LSTM_PARAMS['hidden_size'] > 0
    assert LSTM_PARAMS['n_steps'] > 0
    assert AE_PARAMS['latent_dim'] > 0
    assert AE_PARAMS['threshold_sigma'] > 0
    assert RUL_PARAMS['n_trajectory_steps'] > 0
    assert CALIBRATION_PARAMS['cal_fraction'] > 0
    assert CALIBRATION_PARAMS['cal_fraction'] < 1


def test_onnx_export_dir():
    from config import ONNX_EXPORT_DIR
    assert ONNX_EXPORT_DIR.endswith('/')


# ═══ Integration: Train CNN on synthetic (smoke test) ═══

def test_cnn_smoke():
    """Minimal CNN training smoke test (1 epoch)."""
    _require_torch()
    import torch
    from models_nn import CNN1D, VibrationDataset, seed_everything
    from torch.utils.data import DataLoader

    seed_everything(42)

    # Tiny dataset
    X = np.random.randn(20, 1, 2560).astype(np.float32)
    y = np.array([0, 1, 2, 3, 4] * 4)

    ds = VibrationDataset(X, y)
    loader = DataLoader(ds, batch_size=10, shuffle=True)

    model = CNN1D(n_classes=5, in_channels=1)
    optimizer = torch.optim.Adam(model.parameters(), lr=0.001)
    criterion = torch.nn.CrossEntropyLoss()

    model.train()
    for X_batch, y_batch in loader:
        optimizer.zero_grad()
        logits = model(X_batch)
        loss = criterion(logits, y_batch)
        loss.backward()
        optimizer.step()
        assert logits.shape[1] == 5
        break  # one step is enough


def test_autoencoder_smoke():
    """Minimal autoencoder training smoke test."""
    _require_torch()
    import torch
    from models_nn import Autoencoder, FeatureDataset, seed_everything
    from torch.utils.data import DataLoader

    seed_everything(42)

    X = np.random.randn(20, 53).astype(np.float32)
    ds = FeatureDataset(X)
    loader = DataLoader(ds, batch_size=10, shuffle=True)

    model = Autoencoder(n_features=53)
    optimizer = torch.optim.Adam(model.parameters(), lr=0.001)
    criterion = torch.nn.MSELoss()

    model.train()
    for X_batch in loader:
        optimizer.zero_grad()
        X_hat = model(X_batch)
        loss = criterion(X_hat, X_batch)
        loss.backward()
        optimizer.step()
        assert X_hat.shape == X_batch.shape
        break


def test_rul_smoke():
    """Minimal RUL training smoke test."""
    _require_torch()
    import torch
    from models_nn import RULNet, seed_everything

    seed_everything(42)

    model = RULNet(n_features=53)
    x = torch.randn(4, 53)
    out = model(x)
    assert out.shape == (4,)
    assert (out >= 0).all()
    assert (out <= 1).all()

    # Backward pass
    loss = out.sum()
    loss.backward()
