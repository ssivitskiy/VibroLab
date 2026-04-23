"""Tests for PyTorch model architectures."""

import numpy as np
import pytest


torch = pytest.importorskip("torch")


def test_cnn1d_forward():
    from models_nn import CNN1D
    model = CNN1D(n_classes=5, in_channels=1)
    x = torch.randn(4, 1, 2560)
    out = model(x)
    assert out.shape == (4, 5)


def test_cnn1d_multichannel():
    from models_nn import CNN1D
    model = CNN1D(n_classes=5, in_channels=8)
    x = torch.randn(4, 8, 2560)
    out = model(x)
    assert out.shape == (4, 5)


def test_cnn1d_extract_features():
    from models_nn import CNN1D
    model = CNN1D(n_classes=5, in_channels=1)
    x = torch.randn(2, 1, 2560)
    feats = model.extract_features(x)
    assert feats.shape[0] == 2
    assert feats.shape[1] == 128  # last filter size


def test_gru_classifier_forward():
    from models_nn import GRUClassifier
    model = GRUClassifier(n_classes=5, input_size=80)
    x = torch.randn(4, 32, 80)
    out = model(x)
    assert out.shape == (4, 5)


def test_autoencoder_forward():
    from models_nn import Autoencoder
    model = Autoencoder(n_features=53)
    x = torch.randn(4, 53)
    out = model(x)
    assert out.shape == (4, 53)


def test_autoencoder_encode():
    from models_nn import Autoencoder
    model = Autoencoder(n_features=53, latent_dim=8)
    x = torch.randn(4, 53)
    z = model.encode(x)
    assert z.shape == (4, 8)


def test_autoencoder_reconstruction_error():
    from models_nn import Autoencoder
    model = Autoencoder(n_features=53)
    x = torch.randn(4, 53)
    errors = model.reconstruction_error(x)
    assert errors.shape == (4,)
    assert (errors >= 0).all()


def test_rulnet_forward():
    from models_nn import RULNet
    model = RULNet(n_features=53)
    x = torch.randn(4, 53)
    out = model(x)
    assert out.shape == (4,)
    assert (out >= 0).all()
    assert (out <= 1).all()


def test_early_stopping():
    from models_nn import EarlyStopping
    es = EarlyStopping(patience=3, min_delta=0.01)

    assert not es(1.0)   # new best
    assert not es(0.95)  # improvement
    assert not es(0.95)  # no improvement, counter=1
    assert not es(0.95)  # counter=2
    assert es(0.95)      # counter=3 → stop


def test_vibration_dataset():
    from models_nn import VibrationDataset
    signals = np.random.randn(10, 2560).astype(np.float32)
    labels = np.array([0, 1, 2, 3, 4] * 2)
    ds = VibrationDataset(signals, labels)
    assert len(ds) == 10
    x, y = ds[0]
    assert x.shape == (2560,)
    assert isinstance(y.item(), int)


def test_feature_dataset():
    from models_nn import FeatureDataset
    features = np.random.randn(10, 53).astype(np.float32)
    labels = np.array([0, 1, 2, 3, 4] * 2)
    ds = FeatureDataset(features, labels)
    assert len(ds) == 10
    x, y = ds[0]
    assert x.shape == (53,)


def test_seed_everything():
    from models_nn import seed_everything
    seed_everything(42)
    a = torch.randn(5)
    seed_everything(42)
    b = torch.randn(5)
    assert torch.equal(a, b)


def test_get_device():
    from models_nn import get_device
    device = get_device()
    assert device.type in ('cpu', 'cuda', 'mps')
