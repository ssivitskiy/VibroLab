"""Tests for feature extraction."""

import numpy as np


def test_extract_returns_53_features(sample_signal):
    from features import extract_features
    f = extract_features(sample_signal)
    assert len(f) == 53


def test_feature_names_match_count():
    from features import FEATURE_ORDER
    assert len(FEATURE_ORDER) == 53


def test_rms_positive(sample_signal):
    from features import extract_features
    f = extract_features(sample_signal)
    assert f['rms'] > 0


def test_peak_gte_rms(sample_signal):
    from features import extract_features
    f = extract_features(sample_signal)
    assert f['peak'] >= f['rms']


def test_crest_factor_gte_one(sample_signal):
    from features import extract_features
    f = extract_features(sample_signal)
    assert f['crest_factor'] >= 1.0


def test_no_nan_features(sample_signal):
    from features import extract_features
    f = extract_features(sample_signal)
    for name, val in f.items():
        assert not np.isnan(val), f"NaN in feature {name}"
        assert not np.isinf(val), f"Inf in feature {name}"


def test_zero_signal():
    from features import extract_features
    from config import N_POINTS
    f = extract_features(np.zeros(N_POINTS))
    assert f['rms'] == 0
    assert f['peak'] == 0
    for name, val in f.items():
        assert not np.isnan(val), f"NaN on zero signal: {name}"


def test_gmf_peak_detected(sample_signal):
    """Signal at 400 Hz should have strong GMF 1x."""
    from features import extract_features
    f = extract_features(sample_signal)
    assert f['gmf_1x'] > 0.1


def test_batch_extraction():
    from features import extract_batch
    from config import N_POINTS
    np.random.seed(42)
    signals = np.random.randn(10, N_POINTS)
    X, names = extract_batch(signals)
    assert X.shape == (10, 53)
    assert len(names) == 53
    assert not np.isnan(X).any()


def test_different_sample_rates():
    """Features should work with any sample rate."""
    from features import extract_features
    sig = np.random.randn(4096)
    f1 = extract_features(sig, fs=5120, f_rot=20, gmf=400)
    f2 = extract_features(sig, fs=12800, f_rot=30, gmf=600)
    assert len(f1) == 53
    assert len(f2) == 53


def test_multichannel_8ch():
    """8-channel extraction produces 402 features."""
    from features import extract_multichannel
    np.random.seed(42)
    seg = np.random.randn(8, 2560) * 0.1
    f = extract_multichannel(seg)
    assert len(f) == 402
    for name, val in f.items():
        assert not np.isnan(val), f"NaN in MC feature {name}"
        assert not np.isinf(val), f"Inf in MC feature {name}"


def test_multichannel_4ch():
    """4-channel data should work with fewer features."""
    from features import extract_multichannel
    np.random.seed(42)
    seg = np.random.randn(4, 2560) * 0.1
    f = extract_multichannel(seg)
    assert len(f) > 53  # more than single channel
    assert len(f) < 402  # less than 8 channel


def test_multichannel_batch():
    """Batch multichannel extraction."""
    from features import extract_batch_multichannel
    np.random.seed(42)
    segs = np.random.randn(5, 8, 2560) * 0.1
    X, names = extract_batch_multichannel(segs)
    assert X.shape == (5, 402)
    assert len(names) == 402
    assert not np.isnan(X).any()


def test_multichannel_has_cross_features():
    """Cross-channel features should be present."""
    from features import extract_multichannel
    np.random.seed(42)
    seg = np.random.randn(8, 2560) * 0.1
    f = extract_multichannel(seg)
    cross_features = [k for k in f.keys() if k.startswith('x_')]
    assert len(cross_features) > 0
    assert any('corr' in k for k in cross_features)
    assert any('rms_ratio' in k for k in cross_features)
    assert any('coh_gmf' in k for k in cross_features)
