"""
VibroLab — Генератор синтетических траекторий деградации для RUL.

Создаёт траектории перехода normal → fault с плавной деградацией.
Каждая траектория = последовательность сигналов с убывающим RUL.

Подход:
  1. Берём "normal" и "fault" генераторы из generate_data.py
  2. Интерполируем: sig(t) = (1-α)·normal + α·fault
  3. α меняется по экспоненциальной/полиномиальной кривой деградации
  4. RUL = 1 - α (от 1.0=здоров до 0.0=отказ)
"""

import numpy as np
from config import (
    FS, DURATION, N_POINTS, CLASSES, RANDOM_SEED, RUL_PARAMS,
)
from generate_data import GENERATORS


def degradation_curve(n_steps, curve_type='exponential', rng=None):
    """Генерирует кривую деградации α: 0→1.

    curve_type: 'exponential', 'polynomial', 'linear', 'sigmoid'
    """
    if rng is None:
        rng = np.random.default_rng()

    t = np.linspace(0, 1, n_steps)

    if curve_type == 'exponential':
        rate = rng.uniform(2.0, 5.0)
        alpha = (np.exp(rate * t) - 1) / (np.exp(rate) - 1)
    elif curve_type == 'polynomial':
        power = rng.uniform(1.5, 4.0)
        alpha = t ** power
    elif curve_type == 'sigmoid':
        center = rng.uniform(0.4, 0.7)
        steepness = rng.uniform(8, 15)
        alpha = 1 / (1 + np.exp(-steepness * (t - center)))
        alpha = (alpha - alpha[0]) / (alpha[-1] - alpha[0])
    else:  # linear
        alpha = t

    return np.clip(alpha, 0, 1)


def generate_rul_trajectories(
        n_trajectories_per_class=None,
        n_steps=None,
        seed=RANDOM_SEED):
    """Генерирует траектории деградации.

    Returns:
        trajectories: list of (n_steps, seg_len) arrays — сигналы
        rul_labels: list of (n_steps,) arrays — RUL значения [1→0]
        fault_types: list of str — тип дефекта для каждой траектории
    """
    n_traj = n_trajectories_per_class or RUL_PARAMS['n_trajectories_per_class']
    n_steps = n_steps or RUL_PARAMS['n_trajectory_steps']
    rng = np.random.default_rng(seed)

    t = np.linspace(0, DURATION, N_POINTS, endpoint=False)
    fault_classes = [c for c in CLASSES if c != 'normal']
    curve_types = ['exponential', 'polynomial', 'sigmoid', 'linear']

    trajectories = []
    rul_labels = []
    fault_types = []

    for fault_cls in fault_classes:
        gen_fault = GENERATORS[fault_cls]
        gen_normal = GENERATORS['normal']

        for i in range(n_traj):
            curve = degradation_curve(
                n_steps,
                curve_type=rng.choice(curve_types),
                rng=rng,
            )

            # Генерируем базовые сигналы
            normal_sig = gen_normal(t)
            fault_sig = gen_fault(t)

            # Интерполяция вдоль траектории
            traj = np.zeros((n_steps, N_POINTS))
            for step in range(n_steps):
                alpha = curve[step]
                # Добавляем вариативность: каждый шаг — немного другой сигнал
                n_base = gen_normal(t)
                f_base = gen_fault(t)
                traj[step] = (1 - alpha) * n_base + alpha * f_base
                # Добавляем небольшой шум для реалистичности
                traj[step] += rng.normal(0, 0.02, N_POINTS)

            rul = 1.0 - curve  # RUL: 1.0 (healthy) → 0.0 (failed)

            trajectories.append(traj)
            rul_labels.append(rul)
            fault_types.append(fault_cls)

    total = len(trajectories)
    print(f"[RUL-DATA] {total} trajectories × {n_steps} steps "
          f"| {len(fault_classes)} fault types | {N_POINTS} samples/step")

    return trajectories, rul_labels, fault_types


def trajectories_to_features(trajectories, rul_labels):
    """Конвертирует траектории сигналов в признаки для обучения RUL.

    Returns:
        X: (N_total, n_features) — все шаги всех траекторий
        y_rul: (N_total,) — RUL для каждого шага
        groups: (N_total,) — индекс траектории (для GroupKFold)
    """
    from features import extract_features

    all_features = []
    all_rul = []
    all_groups = []

    for traj_idx, (traj, rul) in enumerate(zip(trajectories, rul_labels)):
        for step_idx in range(len(traj)):
            feats = extract_features(traj[step_idx])
            all_features.append(list(feats.values()))
            all_rul.append(rul[step_idx])
            all_groups.append(traj_idx)

    X = np.array(all_features)
    y_rul = np.array(all_rul)
    groups = np.array(all_groups)

    # Убираем NaN/Inf
    bad = np.isnan(X).any(axis=1) | np.isinf(X).any(axis=1)
    if bad.any():
        print(f"  ⚠ Удалено {bad.sum()} шагов с NaN/Inf")
        X = X[~bad]
        y_rul = y_rul[~bad]
        groups = groups[~bad]

    print(f"[RUL-FEATS] {X.shape[0]} samples × {X.shape[1]} features")
    return X, y_rul, groups


if __name__ == '__main__':
    trajectories, rul_labels, fault_types = generate_rul_trajectories()
    X, y_rul, groups = trajectories_to_features(trajectories, rul_labels)
    print(f"\nRUL distribution: min={y_rul.min():.3f} max={y_rul.max():.3f} "
          f"mean={y_rul.mean():.3f}")
