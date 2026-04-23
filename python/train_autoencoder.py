"""
VibroLab — Обучение автоэнкодера для детекции аномалий.

Обучается ТОЛЬКО на "normal" данных. Высокая ошибка реконструкции = аномалия.
Работает на 53 извлечённых признаках (не сырой сигнал).

Использование:
  python train_autoencoder.py <data_dir>
  python train_autoencoder.py --synthetic
"""

import os
import sys
import json
import hashlib
from datetime import datetime, timezone

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split

from config import (
    CLASSES, CLASS_LABELS_RU, FS, DURATION, N_POINTS, F_ROT, GMF,
    TEST_SIZE, RANDOM_SEED, AE_PARAMS, MODEL_DIR,
)
from models_nn import (
    Autoencoder, FeatureDataset, EarlyStopping,
    seed_everything, get_device,
)
from features import extract_batch, N_FEATURES
from train import load_data

import joblib


def train_autoencoder(data_dir=None):
    seed_everything()
    device = get_device()
    os.makedirs(MODEL_DIR, exist_ok=True)

    print("=" * 65)
    print(f"  VIBROLAB — Autoencoder Anomaly Detection [{device}]")
    print("=" * 65)

    # 1. Data
    print("\n[1/6] Loading data...")
    signals, labels, y, classes, source = load_data(data_dir, multichannel=False)
    print(f"  Source: {source} | Total samples: {len(signals)}")

    # 2. Features
    print("\n[2/6] Extracting features...")
    X_all, feature_names = extract_batch(signals)

    # Убираем NaN/Inf
    bad = np.isnan(X_all).any(axis=1) | np.isinf(X_all).any(axis=1)
    if bad.any():
        print(f"  ⚠ Удалено {bad.sum()} сэмплов с NaN/Inf")
        X_all = X_all[~bad]
        y = y[~bad]
        labels = [lbl for lbl, b in zip(labels, ~bad) if b]

    # 3. Разделяем normal / fault
    normal_mask = np.array([l == 'normal' for l in labels])
    X_normal = X_all[normal_mask]
    X_fault = X_all[~normal_mask]
    y_fault = y[~normal_mask]
    fault_labels = [l for l, m in zip(labels, ~normal_mask) if m]

    print(f"\n[3/6] Data split:")
    print(f"  Normal samples: {len(X_normal)}")
    print(f"  Fault samples:  {len(X_fault)}")

    # Scaler на ВСЕХ данных (чтобы fault тоже корректно масштабировался)
    scaler = StandardScaler()
    scaler.fit(X_all)
    X_normal_s = scaler.transform(X_normal)
    X_fault_s = scaler.transform(X_fault)

    # Split normal на train/val
    X_n_tr, X_n_val = train_test_split(
        X_normal_s, test_size=0.2, random_state=RANDOM_SEED)
    print(f"  Normal train: {len(X_n_tr)} | Normal val: {len(X_n_val)}")

    batch_size = AE_PARAMS['batch_size']
    train_ds = FeatureDataset(X_n_tr)
    val_ds = FeatureDataset(X_n_val)
    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True, drop_last=True)
    val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False)

    # 4. Model
    n_features = X_normal_s.shape[1]
    print(f"\n[4/6] Building Autoencoder (features={n_features}, "
          f"latent={AE_PARAMS['latent_dim']})...")
    model = Autoencoder(
        n_features=n_features,
        latent_dim=AE_PARAMS['latent_dim'],
        hidden_dims=AE_PARAMS['hidden_dims'],
    ).to(device)
    n_params = sum(p.numel() for p in model.parameters())
    print(f"  Parameters: {n_params:,}")

    optimizer = torch.optim.Adam(model.parameters(), lr=AE_PARAMS['lr'])
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, patience=10, factor=0.5, min_lr=1e-6)
    criterion = nn.MSELoss()
    early_stop = EarlyStopping(patience=15)

    # 5. Train
    print(f"\n[5/6] Training ({AE_PARAMS['epochs']} epochs)...")
    best_loss = float('inf')
    best_state = None

    for epoch in range(AE_PARAMS['epochs']):
        model.train()
        train_loss = 0
        n_batches = 0
        for X_batch in train_loader:
            X_batch = X_batch.to(device)
            optimizer.zero_grad()
            X_hat = model(X_batch)
            loss = criterion(X_hat, X_batch)
            loss.backward()
            optimizer.step()
            train_loss += loss.item()
            n_batches += 1

        train_loss /= n_batches

        # Validation
        model.eval()
        val_loss = 0
        n_val = 0
        with torch.no_grad():
            for X_batch in val_loader:
                X_batch = X_batch.to(device)
                X_hat = model(X_batch)
                val_loss += criterion(X_hat, X_batch).item()
                n_val += 1
        val_loss /= max(n_val, 1)
        scheduler.step(val_loss)

        if (epoch + 1) % 10 == 0 or epoch == 0:
            print(f"  Epoch {epoch + 1:3d} | train_loss={train_loss:.6f} "
                  f"| val_loss={val_loss:.6f}")

        if val_loss < best_loss:
            best_loss = val_loss
            best_state = {k: v.cpu().clone() for k, v in model.state_dict().items()}

        if early_stop(val_loss):
            print(f"  Early stopping at epoch {epoch + 1}")
            break

    if best_state:
        model.load_state_dict(best_state)
        model.to(device)

    # 6. Compute thresholds
    print("\n[6/6] Computing anomaly thresholds...")
    model.eval()

    # Ошибка на normal данных
    X_normal_t = torch.FloatTensor(X_normal_s).to(device)
    normal_errors = model.reconstruction_error(X_normal_t).cpu().numpy()

    threshold_mean = float(np.mean(normal_errors))
    threshold_std = float(np.std(normal_errors))
    threshold = threshold_mean + AE_PARAMS['threshold_sigma'] * threshold_std

    print(f"  Normal MSE: {threshold_mean:.6f} ± {threshold_std:.6f}")
    print(f"  Threshold (mean + {AE_PARAMS['threshold_sigma']}σ): {threshold:.6f}")

    # Ошибка на fault данных
    if len(X_fault_s) > 0:
        X_fault_t = torch.FloatTensor(X_fault_s).to(device)
        fault_errors = model.reconstruction_error(X_fault_t).cpu().numpy()

        # Per-class analysis
        fault_stats = {}
        for cls in set(fault_labels):
            cls_mask = np.array([l == cls for l in fault_labels])
            cls_errors = fault_errors[cls_mask]
            fault_stats[cls] = {
                'mean': round(float(np.mean(cls_errors)), 6),
                'std': round(float(np.std(cls_errors)), 6),
                'detection_rate': round(float(np.mean(cls_errors > threshold)), 4),
            }
            print(f"  {cls:15s}: MSE={fault_stats[cls]['mean']:.6f} "
                  f"| detection={fault_stats[cls]['detection_rate'] * 100:.1f}%")

        overall_detection = float(np.mean(fault_errors > threshold))
        print(f"\n  Overall anomaly detection rate: {overall_detection * 100:.1f}%")
    else:
        fault_stats = {}
        overall_detection = 0

    # Save
    model_path = f'{MODEL_DIR}/autoencoder.pt'
    scaler_path = f'{MODEL_DIR}/scaler_ae.pkl'
    model.cpu()
    torch.save({
        'state_dict': model.state_dict(),
        'n_features': n_features,
        'latent_dim': AE_PARAMS['latent_dim'],
        'hidden_dims': AE_PARAMS['hidden_dims'],
    }, model_path)
    joblib.dump(scaler, scaler_path)

    model_hash = hashlib.sha256(open(model_path, 'rb').read()).hexdigest()[:12]
    meta = {
        'model_type': 'autoencoder',
        'version': f"1.0.0-ae-{model_hash}",
        'trained_at': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'model_hash': model_hash,
        'source': source,
        'n_features': n_features,
        'feature_names': feature_names,
        'n_params': n_params,
        'latent_dim': AE_PARAMS['latent_dim'],
        'threshold': round(threshold, 8),
        'threshold_mean': round(threshold_mean, 8),
        'threshold_std': round(threshold_std, 8),
        'threshold_sigma': AE_PARAMS['threshold_sigma'],
        'normal_samples': int(len(X_normal)),
        'fault_detection': fault_stats,
        'overall_detection_rate': round(overall_detection, 4),
        'config': {'fs': FS, 'duration': DURATION, 'n_points': N_POINTS},
    }

    meta_path = f'{MODEL_DIR}/meta_ae.json'
    with open(meta_path, 'w', encoding='utf-8') as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)

    print(f"\n  ✓ {model_path}")
    print(f"  ✓ {scaler_path}")
    print(f"  ✓ {meta_path}")
    print("=" * 65)
    print(f"  AUTOENCODER | Threshold: {threshold:.6f} | Detection: {overall_detection * 100:.1f}%")
    print("=" * 65)

    return model, scaler, meta


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    data_dir = args[0] if args else None
    train_autoencoder(data_dir)
