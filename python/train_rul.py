"""
VibroLab — Обучение модели RUL (Remaining Useful Life).

Предсказывает остаточный ресурс оборудования по признакам вибросигнала.
Обучается на синтетических траекториях деградации.

Использование:
  python train_rul.py              # Генерация траекторий + обучение
  python train_rul.py --fast       # Быстрый режим (меньше траекторий)
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
from sklearn.model_selection import GroupShuffleSplit
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score

from config import (
    FS, DURATION, N_POINTS, RANDOM_SEED, RUL_PARAMS, MODEL_DIR,
)
from models_nn import (
    RULNet, FeatureDataset, EarlyStopping,
    seed_everything, get_device,
)
from generate_rul_data import generate_rul_trajectories, trajectories_to_features

import joblib


def train_rul(fast=False):
    seed_everything()
    device = get_device()
    os.makedirs(MODEL_DIR, exist_ok=True)

    print("=" * 65)
    print(f"  VIBROLAB — RUL Estimation Training [{device}]")
    print("=" * 65)

    # 1. Generate data
    n_traj = RUL_PARAMS['n_trajectories_per_class']
    n_steps = RUL_PARAMS['n_trajectory_steps']
    if fast:
        n_traj = max(10, n_traj // 5)
        n_steps = max(20, n_steps // 2)

    print(f"\n[1/5] Generating degradation trajectories...")
    print(f"  Trajectories per class: {n_traj} | Steps: {n_steps}")
    trajectories, rul_labels, fault_types = generate_rul_trajectories(
        n_trajectories_per_class=n_traj, n_steps=n_steps)

    # 2. Features
    print("\n[2/5] Extracting features from trajectories...")
    X, y_rul, groups = trajectories_to_features(trajectories, rul_labels)

    # 3. Split (по траекториям, не по шагам)
    print("\n[3/5] Group train/test split...")
    gss = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=RANDOM_SEED)
    tr_idx, te_idx = next(gss.split(X, y_rul, groups))
    X_tr, X_te = X[tr_idx], X[te_idx]
    y_tr, y_te = y_rul[tr_idx], y_rul[te_idx]

    scaler = StandardScaler()
    X_tr_s = scaler.fit_transform(X_tr)
    X_te_s = scaler.transform(X_te)
    print(f"  Train: {len(y_tr)} | Test: {len(y_te)}")

    batch_size = RUL_PARAMS['batch_size']
    train_ds = FeatureDataset(X_tr_s, y_tr.astype(np.float32))
    test_ds = FeatureDataset(X_te_s, y_te.astype(np.float32))
    # Override labels to float for regression
    train_ds.labels = torch.FloatTensor(y_tr)
    test_ds.labels = torch.FloatTensor(y_te)
    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True, drop_last=True)
    test_loader = DataLoader(test_ds, batch_size=batch_size, shuffle=False)

    # 4. Model
    n_features = X_tr_s.shape[1]
    print(f"\n[4/5] Building RULNet (features={n_features})...")
    model = RULNet(n_features=n_features, hidden_dims=RUL_PARAMS['hidden_dims']).to(device)
    n_params = sum(p.numel() for p in model.parameters())
    print(f"  Parameters: {n_params:,}")

    optimizer = torch.optim.Adam(model.parameters(), lr=RUL_PARAMS['lr'])
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, patience=10, factor=0.5, min_lr=1e-6)
    criterion = nn.MSELoss()
    early_stop = EarlyStopping(patience=15)

    # 5. Train
    print(f"\n[5/5] Training ({RUL_PARAMS['epochs']} epochs)...")
    best_loss = float('inf')
    best_state = None

    for epoch in range(RUL_PARAMS['epochs']):
        model.train()
        train_loss = 0
        n_batches = 0

        for X_batch, y_batch in train_loader:
            X_batch, y_batch = X_batch.to(device), y_batch.to(device)
            optimizer.zero_grad()
            pred = model(X_batch)
            loss = criterion(pred, y_batch)
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
            for X_batch, y_batch in test_loader:
                X_batch, y_batch = X_batch.to(device), y_batch.to(device)
                pred = model(X_batch)
                val_loss += criterion(pred, y_batch).item()
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

    # Evaluate
    print("\n  Evaluating...")
    model.eval()
    all_preds, all_true = [], []
    with torch.no_grad():
        for X_batch, y_batch in test_loader:
            X_batch = X_batch.to(device)
            pred = model(X_batch)
            all_preds.extend(pred.cpu().numpy())
            all_true.extend(y_batch.numpy())

    all_preds = np.array(all_preds)
    all_true = np.array(all_true)

    rmse = float(np.sqrt(mean_squared_error(all_true, all_preds)))
    mae = float(mean_absolute_error(all_true, all_preds))
    r2 = float(r2_score(all_true, all_preds))

    print(f"  RMSE: {rmse:.4f} | MAE: {mae:.4f} | R²: {r2:.4f}")

    # Save
    model_path = f'{MODEL_DIR}/rul_model.pt'
    scaler_path = f'{MODEL_DIR}/scaler_rul.pkl'
    model.cpu()
    torch.save({
        'state_dict': model.state_dict(),
        'n_features': n_features,
        'hidden_dims': RUL_PARAMS['hidden_dims'],
    }, model_path)
    joblib.dump(scaler, scaler_path)

    model_hash = hashlib.sha256(open(model_path, 'rb').read()).hexdigest()[:12]
    meta = {
        'model_type': 'rul',
        'version': f"1.0.0-rul-{model_hash}",
        'trained_at': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'model_hash': model_hash,
        'n_features': n_features,
        'n_params': n_params,
        'rmse': round(rmse, 6),
        'mae': round(mae, 6),
        'r2': round(r2, 6),
        'n_trajectories': len(trajectories),
        'n_steps': n_steps,
        'total_samples': len(X),
        'train_size': int(len(y_tr)),
        'test_size': int(len(y_te)),
        'config': {'fs': FS, 'duration': DURATION, 'n_points': N_POINTS},
        'rul_params': RUL_PARAMS,
    }

    meta_path = f'{MODEL_DIR}/meta_rul.json'
    with open(meta_path, 'w', encoding='utf-8') as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)

    print(f"\n  ✓ {model_path}")
    print(f"  ✓ {scaler_path}")
    print(f"  ✓ {meta_path}")
    print("=" * 65)
    print(f"  RUL | RMSE: {rmse:.4f} | MAE: {mae:.4f} | R²: {r2:.4f}")
    print("=" * 65)

    return model, scaler, meta


if __name__ == '__main__':
    fast = '--fast' in sys.argv
    train_rul(fast=fast)
