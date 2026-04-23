"""Tests for WAV ↔ CSV converter."""

import os
import tempfile
import numpy as np


def test_wav_roundtrip():
    """Write WAV → read WAV → compare."""
    from converter import write_wav, read_wav
    from config import FS

    np.random.seed(42)
    original = np.random.randn(5120) * 0.5

    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
        path = f.name

    try:
        write_wav(path, original, FS)
        sr, data = read_wav(path)
        assert sr == FS
        assert len(data) == len(original)
        # 16-bit quantization error should be small
        assert np.max(np.abs(data - original / np.max(np.abs(original)) * 0.95)) < 0.001
    finally:
        os.unlink(path)


def test_csv_roundtrip():
    """Write CSV → read CSV → compare."""
    from converter import write_csv, read_csv
    from config import FS

    np.random.seed(42)
    original = np.random.randn(2560)

    with tempfile.NamedTemporaryFile(suffix='.csv', delete=False, mode='w') as f:
        path = f.name

    try:
        write_csv(path, original, FS)
        sr, data = read_csv(path)
        assert len(data) == len(original)
        np.testing.assert_allclose(data, original, atol=1e-6)
    finally:
        os.unlink(path)


def test_wav2csv2wav():
    """WAV → CSV → WAV roundtrip."""
    from converter import write_wav, read_wav, write_csv, read_csv
    from config import FS

    np.random.seed(42)
    original = np.random.randn(2560) * 0.3

    wav1 = tempfile.mktemp(suffix='.wav')
    csv_path = tempfile.mktemp(suffix='.csv')
    wav2 = tempfile.mktemp(suffix='.wav')

    try:
        write_wav(wav1, original, FS)
        sr1, data1 = read_wav(wav1)
        write_csv(csv_path, data1, sr1)
        sr2, data2 = read_csv(csv_path)
        assert len(data2) == len(data1)
    finally:
        for p in [wav1, csv_path, wav2]:
            if os.path.exists(p):
                os.unlink(p)
