"""Shared fixtures for VibroLab tests."""

import sys
import os
import numpy as np
import pytest

# Add python/ to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'python'))


@pytest.fixture
def sample_signal():
    """Clean 0.5s sine signal at 400 Hz (GMF)."""
    from config import N_POINTS, GMF
    t = np.linspace(0, 0.5, N_POINTS, endpoint=False)
    return np.sin(2 * np.pi * GMF * t) + 0.3 * np.sin(2 * np.pi * 20 * t)


@pytest.fixture
def noise_signal():
    """Random noise signal."""
    from config import N_POINTS
    np.random.seed(42)
    return np.random.randn(N_POINTS) * 0.1


@pytest.fixture
def seu_file_content():
    """Sample SEU tab-separated file content."""
    lines = [
        "Title:\tHealth_20_0_1-10",
        "Parameters:",
        "",
        "DAQ\tSettings:",
        "Frequency\tLimit\t2000",
        "Spectral\tLines\t1600",
        "Number\tof\tBlocks\t1024",
        "Total\tData\tRows\t4194304",
        "Channels:",
        "Legend\tChannel1\tChannel2\tChannel3\tChannel4\tChannel5\tChannel6\tChannel7\tChannel8",
        "",
        "On/Off\tON\tON\tON\tON\tON\tON\tON\tON",
        "",
        "Volts/Unit\t1\t1\t1\t1\t1\t1\t1\t1",
        "",
        "Data",
    ]
    np.random.seed(42)
    for _ in range(3000):
        row = "\t".join(f"{np.random.randn() * 0.1:.6f}" for _ in range(8))
        lines.append(row)
    return "\n".join(lines)


@pytest.fixture
def csv_file_content():
    """Sample simple CSV file content."""
    np.random.seed(42)
    lines = ["a1,a2,a3,a4"]
    for _ in range(3000):
        lines.append(",".join(f"{np.random.randn() * 5:.6f}" for _ in range(4)))
    return "\n".join(lines)
