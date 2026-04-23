"""Tests for datasets module: format readers, dataset loaders, converter extensions."""

import os
import json
import struct
import tempfile
import numpy as np
import pytest


# ═══ FORMAT READERS ═══

def test_read_any_format_csv(tmp_path):
    """read_any_format should handle CSV files."""
    from datasets import read_any_format

    csv_file = tmp_path / "test.csv"
    data = np.sin(np.linspace(0, 10, 1000))
    lines = ["amplitude"]
    for v in data:
        lines.append(f"{v:.8f}")
    csv_file.write_text("\n".join(lines))

    result = read_any_format(str(csv_file))
    assert len(result) > 0
    assert isinstance(result, np.ndarray)


def test_read_any_format_wav(tmp_path):
    """read_any_format should handle WAV files."""
    from datasets import read_any_format
    from converter import write_wav

    wav_file = tmp_path / "test.wav"
    data = np.sin(np.linspace(0, 10, 2560))
    write_wav(str(wav_file), data, sample_rate=5120)

    result = read_any_format(str(wav_file))
    assert len(result) == 2560
    assert isinstance(result, np.ndarray)


def test_read_any_format_npy(tmp_path):
    """read_any_format should handle .npy files."""
    from datasets import read_any_format

    npy_file = tmp_path / "test.npy"
    data = np.random.randn(5000).astype(np.float64)
    np.save(str(npy_file), data)

    result = read_any_format(str(npy_file))
    assert len(result) == 5000
    np.testing.assert_allclose(result, data, rtol=1e-10)


def test_read_any_format_npz(tmp_path):
    """read_any_format should handle .npz files."""
    from datasets import read_any_format

    npz_file = tmp_path / "test.npz"
    data = np.random.randn(3000).astype(np.float64)
    np.savez(str(npz_file), signal=data)

    result = read_any_format(str(npz_file), key='signal')
    assert len(result) == 3000
    np.testing.assert_allclose(result, data, rtol=1e-10)


def test_read_any_format_unsupported(tmp_path):
    """read_any_format should raise for unsupported formats."""
    from datasets import read_any_format

    bad_file = tmp_path / "test.xyz"
    bad_file.write_text("hello")

    with pytest.raises(ValueError, match="Неподдерживаемый формат"):
        read_any_format(str(bad_file))


# ═══ MAT FILE READER ═══

def test_read_mat_file_with_scipy(tmp_path):
    """Test reading .mat v5 files."""
    try:
        import scipy.io as sio
    except ImportError:
        pytest.skip("scipy not available")

    from datasets import read_mat_file

    mat_file = tmp_path / "test.mat"
    data = np.random.randn(10000).astype(np.float64)
    sio.savemat(str(mat_file), {'vibration_signal': data})

    result = read_mat_file(str(mat_file))
    assert len(result) == 10000
    np.testing.assert_allclose(result, data, rtol=1e-10)


def test_read_mat_file_with_key(tmp_path):
    """Test reading .mat with specific key."""
    try:
        import scipy.io as sio
    except ImportError:
        pytest.skip("scipy not available")

    from datasets import read_mat_file

    mat_file = tmp_path / "test.mat"
    sig1 = np.random.randn(5000).astype(np.float64)
    sig2 = np.random.randn(3000).astype(np.float64)
    sio.savemat(str(mat_file), {'DE_time': sig1, 'FE_time': sig2})

    result = read_mat_file(str(mat_file), key='FE_time')
    assert len(result) == 3000
    np.testing.assert_allclose(result, sig2, rtol=1e-10)


# ═══ UFF FILE READER ═══

def test_read_uff_file(tmp_path):
    """Test basic UFF type 58 reading."""
    from datasets import read_uff_file

    uff_file = tmp_path / "test.uff"
    # Minimal UFF type 58 format
    lines = [
        "    -1",
        "    58",
        "Some header info",
        "More header",
        "1.0 2.0 3.0 4.0 5.0",
        "6.0 7.0 8.0 9.0 10.0",
        "    -1",
    ]
    uff_file.write_text("\n".join(lines))

    result = read_uff_file(str(uff_file))
    assert len(result) == 10
    np.testing.assert_allclose(result, np.arange(1, 11, dtype=np.float64))


# ═══ CWRU DETECTION ═══

def test_detect_cwru_class():
    from datasets import detect_cwru_class

    assert detect_cwru_class("normal_0.mat") == 'normal'
    assert detect_cwru_class("baseline_1.mat") == 'normal'
    assert detect_cwru_class("IR007_0.mat") == 'inner_race'
    assert detect_cwru_class("OR014_6_0.mat") == 'outer_race'
    assert detect_cwru_class("B007_0.mat") == 'ball_fault'
    assert detect_cwru_class("random_file.mat") is None


def test_detect_cwru_mat_key():
    from datasets import detect_cwru_mat_key

    mock_data = {
        '__header__': b'',
        'X097_DE_time': np.zeros(10),
        'X097_FE_time': np.zeros(5),
    }
    assert detect_cwru_mat_key(mock_data, prefer='DE') == 'X097_DE_time'
    assert detect_cwru_mat_key(mock_data, prefer='FE') == 'X097_FE_time'


# ═══ PADERBORN DETECTION ═══

def test_detect_paderborn_class():
    from datasets import detect_paderborn_class

    assert detect_paderborn_class("K001_1.mat") == 'normal'
    assert detect_paderborn_class("K002_2.mat") == 'normal'
    assert detect_paderborn_class("KA01_1.mat") == 'outer_race'
    assert detect_paderborn_class("KA22_1.mat") == 'outer_race'
    assert detect_paderborn_class("KI01_1.mat") == 'inner_race'
    assert detect_paderborn_class("unknown.mat") is None


# ═══ MFPT DETECTION ═══

def test_detect_mfpt_class():
    from datasets import detect_mfpt_class

    assert detect_mfpt_class("baseline_1.mat") == 'normal'
    assert detect_mfpt_class("InnerRaceFault.mat") == 'inner_race'
    assert detect_mfpt_class("OuterRaceFault_1.mat") == 'outer_race'
    assert detect_mfpt_class("random.mat") is None


# ═══ DATASET AUTO-DETECTION ═══

def test_list_supported_formats():
    from datasets import list_supported_formats

    formats = list_supported_formats()
    assert '.mat' in formats
    assert '.csv' in formats
    assert '.wav' in formats
    assert '.tdms' in formats
    assert '.uff' in formats
    assert '.npy' in formats


# ═══ FINALIZE DATASET ═══

def test_finalize_dataset():
    from datasets import _finalize_dataset

    signals_a = np.random.randn(20, 2560)
    signals_b = np.random.randn(30, 2560)

    all_signals = [signals_a, signals_b]
    all_labels = ['normal'] * 20 + ['fault'] * 30
    class_counts = {'normal': 20, 'fault': 30}

    signals, labels, indices, classes, meta = _finalize_dataset(
        all_signals, all_labels, class_counts, 'test')

    # Balanced to min class (20)
    assert len(signals) == 40
    assert len(labels) == 40
    assert set(classes) == {'fault', 'normal'}
    assert meta['source'] == 'test'
    assert meta['per_class'] == 20


# ═══ CONVERTER EXTENSIONS ═══

def test_converter_info_csv(tmp_path):
    """Test info command on CSV file."""
    from converter import info

    csv_file = tmp_path / "test.csv"
    lines = ["amplitude"]
    for v in np.sin(np.linspace(0, 10, 500)):
        lines.append(f"{v:.8f}")
    csv_file.write_text("\n".join(lines))

    # Should not raise
    info(str(csv_file))


def test_converter_any_to_csv_wav(tmp_path):
    """Test any2csv with WAV input."""
    from converter import write_wav, any_to_csv

    wav_file = tmp_path / "input.wav"
    csv_file = tmp_path / "output.csv"
    data = np.sin(np.linspace(0, 10, 1000))
    write_wav(str(wav_file), data, 5120)

    any_to_csv(str(wav_file), str(csv_file))
    assert csv_file.exists()


def test_converter_any_to_wav_npy(tmp_path):
    """Test any2wav with NPY input."""
    from converter import any_to_wav, read_wav

    npy_file = tmp_path / "input.npy"
    wav_file = tmp_path / "output.wav"
    data = np.random.randn(2560)
    np.save(str(npy_file), data)

    any_to_wav(str(npy_file), str(wav_file), sample_rate=5120)
    assert wav_file.exists()

    sr, read_data = read_wav(str(wav_file))
    assert sr == 5120
    assert len(read_data) == 2560


# ═══ CONFIG ═══

def test_dataset_configs_exist():
    from config import DATASET_CONFIGS, SUPPORTED_FORMATS

    assert 'seu' in DATASET_CONFIGS
    assert 'cwru' in DATASET_CONFIGS
    assert 'mfpt' in DATASET_CONFIGS
    assert 'paderborn' in DATASET_CONFIGS

    assert DATASET_CONFIGS['cwru']['fs'] == 12000
    assert DATASET_CONFIGS['paderborn']['fs'] == 64000

    assert '.mat' in SUPPORTED_FORMATS
    assert '.tdms' in SUPPORTED_FORMATS
    assert '.uff' in SUPPORTED_FORMATS
