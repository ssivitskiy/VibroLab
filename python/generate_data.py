"""
VibroLab — Генератор синтетических данных (fallback если нет SEU).
5 классов SEU: normal, tooth_chip, tooth_miss, root_crack, surface_wear.
"""

import numpy as np
from config import FS, DURATION, N_POINTS, F_ROT, GMF, CLASSES, RANDOM_SEED

TWO_PI = 2 * np.pi


def _base(t, noise=0.05):
    sig = np.zeros_like(t)
    for k in range(1, 5):
        sig += (1.0 / k ** 1.2) * np.sin(TWO_PI * GMF * k * t + np.random.uniform(0, TWO_PI))
    for k in range(1, 4):
        sig += (0.1 / k) * np.sin(TWO_PI * F_ROT * k * t + np.random.uniform(0, TWO_PI))
    sig += noise * np.random.randn(len(t))
    return sig


def gen_normal(t):
    return _base(t, np.random.uniform(0.03, 0.08))


def gen_tooth_chip(t):
    sig = _base(t, 0.05)
    sev = np.random.uniform(0.5, 2.5)
    for i in range(int(DURATION * F_ROT) + 1):
        t_imp = i / F_ROT + np.random.uniform(-0.001, 0.001)
        dt = t - t_imp
        sig += sev * np.exp(-(dt ** 2) / (2 * 0.0005 ** 2)) * np.sin(TWO_PI * 2000 * dt)
    for k in range(1, 6):
        for s in [-1, 1]:
            sig += (sev * 0.15 / k) * np.sin(TWO_PI * (GMF + s * k * F_ROT) * t + np.random.uniform(0, TWO_PI))
    return sig


def gen_tooth_miss(t):
    sig = _base(t, 0.05)
    sev = np.random.uniform(2.0, 5.0)
    for i in range(int(DURATION * F_ROT) + 1):
        t_imp = i / F_ROT
        dt = t - t_imp
        sig += sev * np.exp(-(dt ** 2) / (2 * 0.001 ** 2)) * np.sin(TWO_PI * 2500 * dt)
    for k in range(1, 8):
        for s in [-1, 1]:
            sig += (sev * 0.2 / k) * np.sin(TWO_PI * (GMF + s * k * F_ROT) * t + np.random.uniform(0, TWO_PI))
    return sig


def gen_root_crack(t):
    sig = _base(t, 0.05)
    sev = np.random.uniform(0.3, 1.5)
    mod = 1 + sev * 0.4 * np.sin(TWO_PI * F_ROT * t)
    sig *= mod
    for k in range(1, 5):
        for s in [-1, 1]:
            sig += (sev * 0.12 / k) * np.sin(TWO_PI * (GMF + s * k * F_ROT) * t + np.random.uniform(0, TWO_PI))
    sig += sev * 0.1 * np.random.randn(len(t))
    return sig


def gen_surface_wear(t):
    sig = _base(t, 0.05)
    sev = np.random.uniform(0.3, 1.5)
    carrier = np.sin(TWO_PI * GMF * t)
    sig += sev * 0.5 * np.random.randn(len(t)) * np.abs(carrier)
    for div in [2, 3]:
        sig += (sev * 0.3 / div) * np.sin(TWO_PI * (GMF / div) * t + np.random.uniform(0, TWO_PI))
    sig += sev * 0.15 * np.random.randn(len(t))
    return sig


GENERATORS = {
    'normal': gen_normal, 'tooth_chip': gen_tooth_chip, 'tooth_miss': gen_tooth_miss,
    'root_crack': gen_root_crack, 'surface_wear': gen_surface_wear,
}


def generate_dataset(samples_per_class=200, seed=RANDOM_SEED, multichannel=False):
    np.random.seed(seed)
    t = np.linspace(0, DURATION, N_POINTS, endpoint=False)
    signals, labels, indices = [], [], []
    for idx, cls in enumerate(CLASSES):
        for _ in range(samples_per_class):
            primary = GENERATORS[cls](t)  # ch6: parallel_x
            if multichannel:
                # Генерируем 8 каналов с разными характеристиками
                ch0_motor = primary * 0.3 + np.random.randn(N_POINTS) * 0.02
                ch1_plan_x = primary * 0.5 + np.random.randn(N_POINTS) * 0.03
                ch2_plan_y = primary * 0.4 + np.random.randn(N_POINTS) * 0.03
                ch3_plan_z = primary * 0.35 + np.random.randn(N_POINTS) * 0.04
                ch4_torque = np.random.randn(N_POINTS) * 0.01 + 0.5 * np.sin(
                    TWO_PI * F_ROT * t) * (0.1 if cls == 'normal' else 0.3)
                ch5_par_x = primary
                ch6_par_y = primary * 0.9 + np.random.randn(N_POINTS) * 0.02
                ch7_par_z = primary * 0.8 + np.random.randn(N_POINTS) * 0.03
                seg = np.stack([ch0_motor, ch1_plan_x, ch2_plan_y, ch3_plan_z,
                                ch4_torque, ch5_par_x, ch6_par_y, ch7_par_z])
                signals.append(seg)
            else:
                signals.append(primary)
            labels.append(cls)
            indices.append(idx)
    signals = np.array(signals)
    indices = np.array(indices)
    shape_str = f"{signals.shape}" if multichannel else f"{signals.shape[0]} × {signals.shape[1]}"
    print(f"[SYNTH] {shape_str} | {len(CLASSES)} classes | fs={FS} | mc={multichannel}")
    return t, signals, labels, indices
