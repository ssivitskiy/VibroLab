"""
VibroLab — Обучение 1D-CNN на сырых вибросигналах.

Использование:
  python train_cnn.py <data_dir>        # SEU данные
  python train_cnn.py --synthetic       # синтетика
  python train_cnn.py                   # авто-поиск данных
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
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score, f1_score

from config import (
    CLASSES, CLASS_LABELS_RU, FS, DURATION, N_POINTS, F_ROT, GMF,
    Z_PINION, Z_GEAR, TEST_SIZE, RANDOM_SEED, CNN_PARAMS, MODEL_DIR,
)
from models_nn import (
    CNN1D, VibrationDataset, EarlyStopping,
    seed_everything, get_device,
)
from train import load_data


def train_cnn(data_dir=None, multichannel=False):
    seed_everything()
    device = get_device()
    os.makedirs(MODEL_DIR, exist_ok=True)

    print("=" * 65)
    mode = "MULTI-CHANNEL" if multichannel else "SINGLE-CHANNEL"
    print(f"  VIBROLAB — 1D-CNN Training ({mode}) [{device}]")
    print("=" * 65)

    # 1. Data
    print("\n[1/5] Loading data...")
    signals, labels, y, classes, source = load_data(data_dir, multichannel=multichannel)
    n_classes = len(classes)
    print(f"  Source: {source} | Classes: {n_classes} | Samples: {len(signals)}")

    # Определяем число входных каналов
    if multichannel and signals.ndim == 3:
        in_channels = signals.shape[1]
        # signals уже (N, n_ch, seg_len)
    else:
        in_channels = 1
        signals = signals[:, np.newaxis, :]  # (N, 1, seg_len)

    # 2. Split
    print("\n[2/5] Train/test split...")
    X_tr, X_te, y_tr, y_te = train_test_split(
        signals, y, test_size=TEST_SIZE, random_state=RANDOM_SEED, stratify=y)
    print(f"  Train: {len(y_tr)} | Test: {len(y_te)}")

    # DataLoaders
    batch_size = CNN_PARAMS['batch_size']
    train_ds = VibrationDataset(X_tr, y_tr)
    test_ds = VibrationDataset(X_te, y_te)
    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True, drop_last=True)
    test_loader = DataLoader(test_ds, batch_size=batch_size, shuffle=False)

    # 3. Model
    print(f"\n[3/5] Building CNN1D (in_channels={in_channels}, classes={n_classes})...")
    model = CNN1D(n_classes=n_classes, in_channels=in_channels).to(device)
    n_params = sum(p.numel() for p in model.parameters())
    print(f"  Parameters: {n_params:,}")

    optimizer = torch.optim.AdamW(model.parameters(), lr=CNN_PARAMS['lr'], weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.OneCycleLR(
        optimizer, max_lr=CNN_PARAMS['lr'],
        steps_per_epoch=len(train_loader), epochs=CNN_PARAMS['epochs'])
    criterion = nn.CrossEntropyLoss()
    early_stop = EarlyStopping(patience=10)

    # 4. Train
    print(f"\n[4/5] Training ({CNN_PARAMS['epochs']} epochs)...")
    best_acc = 0
    best_state = None

    for epoch in range(CNN_PARAMS['epochs']):
        model.train()
        train_loss = 0
        correct = 0
        total = 0

        for X_batch, y_batch in train_loader:
            X_batch, y_batch = X_batch.to(device), y_batch.to(device)
            optimizer.zero_grad()
            logits = model(X_batch)
            loss = criterion(logits, y_batch)
            loss.backward()
            optimizer.step()
            scheduler.step()

            train_loss += loss.item() * X_batch.size(0)
            correct += (logits.argmax(1) == y_batch).sum().item()
            total += X_batch.size(0)

        train_loss /= total
        train_acc = correct / total

        # Validation
        model.eval()
        val_correct = 0
        val_total = 0
        val_loss = 0
        with torch.no_grad():
            for X_batch, y_batch in test_loader:
                X_batch, y_batch = X_batch.to(device), y_batch.to(device)
                logits = model(X_batch)
                loss = criterion(logits, y_batch)
                val_loss += loss.item() * X_batch.size(0)
                val_correct += (logits.argmax(1) == y_batch).sum().item()
                val_total += X_batch.size(0)

        val_loss /= val_total
        val_acc = val_correct / val_total

        if (epoch + 1) % 5 == 0 or epoch == 0:
            lr = optimizer.param_groups[0]['lr']
            print(f"  Epoch {epoch + 1:3d} | loss={train_loss:.4f} acc={train_acc:.4f} "
                  f"| val_loss={val_loss:.4f} val_acc={val_acc:.4f} | lr={lr:.6f}")

        if val_acc > best_acc:
            best_acc = val_acc
            best_state = {k: v.cpu().clone() for k, v in model.state_dict().items()}

        if early_stop(val_loss):
            print(f"  Early stopping at epoch {epoch + 1}")
            break

    # Restore best
    if best_state:
        model.load_state_dict(best_state)
        model.to(device)

    # 5. Evaluate
    print("\n[5/5] Evaluating...")
    model.eval()
    all_preds, all_true = [], []
    with torch.no_grad():
        for X_batch, y_batch in test_loader:
            X_batch = X_batch.to(device)
            logits = model(X_batch)
            all_preds.extend(logits.argmax(1).cpu().numpy())
            all_true.extend(y_batch.numpy())

    all_preds = np.array(all_preds)
    all_true = np.array(all_true)
    acc = accuracy_score(all_true, all_preds)
    f1 = f1_score(all_true, all_preds, average='weighted')
    cm = confusion_matrix(all_true, all_preds)

    print(f"  Accuracy: {acc:.4f} | F1: {f1:.4f}")
    print(classification_report(all_true, all_preds, target_names=classes))

    # Save
    model_path = f'{MODEL_DIR}/cnn_model.pt'
    model.cpu()
    torch.save({
        'state_dict': model.state_dict(),
        'n_classes': n_classes,
        'in_channels': in_channels,
        'filters': CNN_PARAMS['filters'],
        'kernel_sizes': CNN_PARAMS['kernel_sizes'],
        'strides': CNN_PARAMS['strides'],
    }, model_path)

    # Class metrics
    class_metrics = {}
    for i, cls in enumerate(classes):
        tp = cm[i][i]
        fp = cm[:, i].sum() - tp
        fn = cm[i, :].sum() - tp
        p = tp / (tp + fp) if (tp + fp) > 0 else 0
        r = tp / (tp + fn) if (tp + fn) > 0 else 0
        f = 2 * p * r / (p + r) if (p + r) > 0 else 0
        class_metrics[cls] = {'precision': round(p, 4), 'recall': round(r, 4), 'f1': round(f, 4)}

    model_hash = hashlib.sha256(open(model_path, 'rb').read()).hexdigest()[:12]
    meta = {
        'model_type': 'cnn1d',
        'version': f"1.0.0-cnn-{model_hash}",
        'trained_at': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'model_hash': model_hash,
        'source': source,
        'multichannel': multichannel,
        'in_channels': in_channels,
        'accuracy': round(acc, 4),
        'f1': round(f1, 4),
        'n_params': n_params,
        'classes': classes,
        'class_labels_ru': {c: CLASS_LABELS_RU.get(c, c) for c in classes},
        'confusion_matrix': cm.tolist(),
        'class_metrics': class_metrics,
        'config': {
            'fs': FS, 'duration': DURATION, 'n_points': N_POINTS,
            'f_rot': F_ROT, 'gmf': GMF, 'z_pinion': Z_PINION, 'z_gear': Z_GEAR,
        },
        'cnn_params': CNN_PARAMS,
        'train_size': int(len(y_tr)),
        'test_size': int(len(y_te)),
    }

    meta_path = f'{MODEL_DIR}/meta_cnn.json'
    with open(meta_path, 'w', encoding='utf-8') as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)

    print(f"\n  ✓ {model_path}")
    print(f"  ✓ {meta_path}")
    print("=" * 65)
    print(f"  CNN1D ACCURACY: {acc:.4f} | F1: {f1:.4f} | PARAMS: {n_params:,}")
    print("=" * 65)

    return model, meta


if __name__ == '__main__':
    mc = '--multichannel' in sys.argv or '--mc' in sys.argv
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    data_dir = args[0] if args else None
    if data_dir == '--synthetic':
        data_dir = '--synthetic'
    elif not args:
        data_dir = None
    train_cnn(data_dir, multichannel=mc)
