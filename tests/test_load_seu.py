"""Tests for SEU data loader."""

import os
import tempfile
import numpy as np


def test_parse_seu_format(seu_file_content):
    from load_seu import parse_seu_file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
        f.write(seu_file_content)
        path = f.name
    try:
        result = parse_seu_file(path)
        assert result['data'].shape[1] == 8
        assert result['data'].shape[0] == 3000
        assert result['n_channels'] == 8
        assert 'Health' in result['title']
    finally:
        os.unlink(path)


def test_parse_csv_format(csv_file_content):
    from load_seu import parse_csv_file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
        f.write(csv_file_content)
        path = f.name
    try:
        result = parse_csv_file(path)
        assert result['data'].shape[1] == 4
        assert result['data'].shape[0] == 3000
    finally:
        os.unlink(path)


def test_auto_detect_format(seu_file_content, csv_file_content):
    from load_seu import load_file
    # SEU format (tab-separated)
    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
        f.write(seu_file_content)
        seu_path = f.name
    # CSV format
    with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
        f.write(csv_file_content)
        csv_path = f.name
    try:
        r1 = load_file(seu_path)
        assert r1['n_channels'] == 8
        r2 = load_file(csv_path)
        assert r2['n_channels'] == 4
    finally:
        os.unlink(seu_path)
        os.unlink(csv_path)


def test_detect_class():
    from load_seu import detect_class
    assert detect_class('Health_20_0.csv') == 'normal'
    assert detect_class('Chipped_30_2.csv') == 'tooth_chip'
    assert detect_class('Miss_20_0.csv') == 'tooth_miss'
    assert detect_class('Root_30_2.csv') == 'root_crack'
    assert detect_class('Surface_20_0.csv') == 'surface_wear'
    assert detect_class('h30hz0.csv') == 'normal'
    assert detect_class('random_file.csv') is None


def test_detect_speed():
    from load_seu import detect_speed
    assert detect_speed('Health_20_0.csv') == 20
    assert detect_speed('Chipped_30_2.csv') == 30
    assert detect_speed('h30hz0.csv') == 30


def test_segment_signal():
    from load_seu import segment_signal
    from config import N_POINTS
    signal = np.random.randn(10000)
    segs = segment_signal(signal, seg_len=N_POINTS, overlap=0.5, max_segs=10)
    assert segs.shape[1] == N_POINTS
    assert segs.shape[0] <= 10
    assert segs.shape[0] > 0


def test_segment_short_signal():
    from load_seu import segment_signal
    signal = np.random.randn(100)
    segs = segment_signal(signal, seg_len=2560)
    assert segs.shape[0] == 0


def test_load_dataset_from_directory(seu_file_content):
    """Test full dataset loading from a directory with multiple files."""
    from load_seu import load_dataset
    with tempfile.TemporaryDirectory() as tmpdir:
        # Create fake SEU files for 3 classes
        for name in ['Health_20_0.csv', 'Chipped_20_0.csv', 'Root_20_0.csv']:
            content = seu_file_content.replace('Health_20_0_1-10', name.replace('.csv', ''))
            with open(os.path.join(tmpdir, name), 'w') as f:
                f.write(content)

        signals, labels, indices, classes, meta = load_dataset(tmpdir, channel=0)
        assert len(classes) == 3
        assert signals.shape[1] == 2560
        assert len(labels) == len(signals)
        assert meta['total'] == len(signals)
