"""Tests for config module."""

from config import (
    FS, DURATION, N_POINTS, F_ROT, GMF, Z_PINION, Z_GEAR,
    CLASSES, CLASS_LABELS_RU, FILENAME_PATTERNS,
)


def test_sampling_params():
    assert FS == 5120
    assert N_POINTS == int(FS * DURATION)
    assert DURATION == 0.5


def test_gearbox_params():
    assert GMF == F_ROT * Z_PINION
    assert F_ROT == 20.0
    assert Z_PINION == 20
    assert Z_GEAR == 40


def test_classes():
    assert len(CLASSES) == 5
    assert 'normal' in CLASSES
    assert 'tooth_chip' in CLASSES
    assert 'tooth_miss' in CLASSES
    assert 'root_crack' in CLASSES
    assert 'surface_wear' in CLASSES


def test_class_labels():
    for cls in CLASSES:
        assert cls in CLASS_LABELS_RU
        assert len(CLASS_LABELS_RU[cls]) > 0


def test_filename_patterns():
    assert FILENAME_PATTERNS['health'] == 'normal'
    assert FILENAME_PATTERNS['chipped'] == 'tooth_chip'
    assert FILENAME_PATTERNS['miss'] == 'tooth_miss'
    assert FILENAME_PATTERNS['root'] == 'root_crack'
    assert FILENAME_PATTERNS['surface'] == 'surface_wear'
