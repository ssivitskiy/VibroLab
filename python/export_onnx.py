"""
VibroLab — Экспорт PyTorch моделей в ONNX для браузерного инференса.

Экспортирует CNN, LSTM, Autoencoder, RUL в ONNX формат.
Браузер использует ONNX Runtime Web (ort.js) для инференса.

Использование:
  python export_onnx.py            # Экспорт всех найденных моделей
  python export_onnx.py --cnn      # Только CNN
  python export_onnx.py --lstm     # Только LSTM
  python export_onnx.py --ae       # Только Autoencoder
  python export_onnx.py --rul      # Только RUL
"""

import os
import sys
import json
import shutil

import numpy as np
import torch

from config import MODEL_DIR, ONNX_EXPORT_DIR, N_POINTS, LSTM_PARAMS, AE_PARAMS
from models_nn import CNN1D, GRUClassifier, Autoencoder, RULNet
from features import N_FEATURES


def export_cnn():
    """Экспорт 1D-CNN в ONNX."""
    model_path = f'{MODEL_DIR}/cnn_model.pt'
    if not os.path.exists(model_path):
        print(f"[SKIP] CNN model not found: {model_path}")
        return False

    print("[EXPORT] CNN1D → ONNX...")
    ckpt = torch.load(model_path, map_location='cpu', weights_only=False)

    model = CNN1D(
        n_classes=ckpt['n_classes'],
        in_channels=ckpt['in_channels'],
        filters=ckpt['filters'],
        kernel_sizes=ckpt['kernel_sizes'],
        strides=ckpt['strides'],
    )
    model.load_state_dict(ckpt['state_dict'])
    model.eval()

    dummy = torch.randn(1, ckpt['in_channels'], N_POINTS)
    onnx_path = f'{ONNX_EXPORT_DIR}/cnn_model.onnx'

    torch.onnx.export(
        model, dummy, onnx_path,
        input_names=['signal'],
        output_names=['logits'],
        dynamic_axes={'signal': {0: 'batch'}, 'logits': {0: 'batch'}},
        opset_version=13,
    )

    size = os.path.getsize(onnx_path)
    print(f"  ✓ {onnx_path} ({size / 1024:.1f} KB)")

    # Copy meta
    meta_src = f'{MODEL_DIR}/meta_cnn.json'
    if os.path.exists(meta_src):
        shutil.copy2(meta_src, f'{ONNX_EXPORT_DIR}/meta_cnn.json')

    return True


def export_lstm():
    """Экспорт GRU в ONNX."""
    model_path = f'{MODEL_DIR}/lstm_model.pt'
    if not os.path.exists(model_path):
        print(f"[SKIP] LSTM model not found: {model_path}")
        return False

    print("[EXPORT] GRU → ONNX...")
    ckpt = torch.load(model_path, map_location='cpu', weights_only=False)

    model = GRUClassifier(
        n_classes=ckpt['n_classes'],
        input_size=ckpt['input_size'],
        hidden_size=ckpt['hidden_size'],
        n_layers=ckpt['n_layers'],
        dropout=0,  # inference mode
    )
    model.load_state_dict(ckpt['state_dict'], strict=False)
    model.eval()

    n_steps = ckpt['n_steps']
    step_size = ckpt['input_size']
    dummy = torch.randn(1, n_steps, step_size)
    onnx_path = f'{ONNX_EXPORT_DIR}/lstm_model.onnx'

    torch.onnx.export(
        model, dummy, onnx_path,
        input_names=['frames'],
        output_names=['logits'],
        dynamic_axes={'frames': {0: 'batch'}, 'logits': {0: 'batch'}},
        opset_version=13,
    )

    size = os.path.getsize(onnx_path)
    print(f"  ✓ {onnx_path} ({size / 1024:.1f} KB)")

    meta_src = f'{MODEL_DIR}/meta_lstm.json'
    if os.path.exists(meta_src):
        shutil.copy2(meta_src, f'{ONNX_EXPORT_DIR}/meta_lstm.json')

    return True


def export_autoencoder():
    """Экспорт Autoencoder в ONNX."""
    model_path = f'{MODEL_DIR}/autoencoder.pt'
    if not os.path.exists(model_path):
        print(f"[SKIP] Autoencoder not found: {model_path}")
        return False

    print("[EXPORT] Autoencoder → ONNX...")
    ckpt = torch.load(model_path, map_location='cpu', weights_only=False)

    model = Autoencoder(
        n_features=ckpt['n_features'],
        latent_dim=ckpt['latent_dim'],
        hidden_dims=ckpt['hidden_dims'],
    )
    model.load_state_dict(ckpt['state_dict'])
    model.eval()

    dummy = torch.randn(1, ckpt['n_features'])
    onnx_path = f'{ONNX_EXPORT_DIR}/autoencoder.onnx'

    torch.onnx.export(
        model, dummy, onnx_path,
        input_names=['features'],
        output_names=['reconstructed'],
        dynamic_axes={'features': {0: 'batch'}, 'reconstructed': {0: 'batch'}},
        opset_version=13,
    )

    size = os.path.getsize(onnx_path)
    print(f"  ✓ {onnx_path} ({size / 1024:.1f} KB)")

    # Copy meta + scaler
    for fname in ['meta_ae.json']:
        src = f'{MODEL_DIR}/{fname}'
        if os.path.exists(src):
            shutil.copy2(src, f'{ONNX_EXPORT_DIR}/{fname}')

    # Export scaler params as JSON for browser
    import joblib
    scaler_path = f'{MODEL_DIR}/scaler_ae.pkl'
    if os.path.exists(scaler_path):
        scaler = joblib.load(scaler_path)
        scaler_json = {
            'mean': scaler.mean_.tolist(),
            'scale': scaler.scale_.tolist(),
        }
        with open(f'{ONNX_EXPORT_DIR}/scaler_ae.json', 'w') as f:
            json.dump(scaler_json, f, separators=(',', ':'))

    return True


def export_rul():
    """Экспорт RUL в ONNX."""
    model_path = f'{MODEL_DIR}/rul_model.pt'
    if not os.path.exists(model_path):
        print(f"[SKIP] RUL model not found: {model_path}")
        return False

    print("[EXPORT] RULNet → ONNX...")
    ckpt = torch.load(model_path, map_location='cpu', weights_only=False)

    model = RULNet(
        n_features=ckpt['n_features'],
        hidden_dims=ckpt['hidden_dims'],
    )
    model.load_state_dict(ckpt['state_dict'])
    model.eval()

    dummy = torch.randn(1, ckpt['n_features'])
    onnx_path = f'{ONNX_EXPORT_DIR}/rul_model.onnx'

    torch.onnx.export(
        model, dummy, onnx_path,
        input_names=['features'],
        output_names=['rul'],
        dynamic_axes={'features': {0: 'batch'}, 'rul': {0: 'batch'}},
        opset_version=13,
    )

    size = os.path.getsize(onnx_path)
    print(f"  ✓ {onnx_path} ({size / 1024:.1f} KB)")

    # Copy meta + scaler
    for fname in ['meta_rul.json']:
        src = f'{MODEL_DIR}/{fname}'
        if os.path.exists(src):
            shutil.copy2(src, f'{ONNX_EXPORT_DIR}/{fname}')

    # Export scaler params
    import joblib
    scaler_path = f'{MODEL_DIR}/scaler_rul.pkl'
    if os.path.exists(scaler_path):
        scaler = joblib.load(scaler_path)
        scaler_json = {
            'mean': scaler.mean_.tolist(),
            'scale': scaler.scale_.tolist(),
        }
        with open(f'{ONNX_EXPORT_DIR}/scaler_rul.json', 'w') as f:
            json.dump(scaler_json, f, separators=(',', ':'))

    return True


def export_all():
    os.makedirs(ONNX_EXPORT_DIR, exist_ok=True)

    print("=" * 65)
    print("  VIBROLAB — ONNX Export")
    print("=" * 65)

    results = {
        'cnn': export_cnn(),
        'lstm': export_lstm(),
        'autoencoder': export_autoencoder(),
        'rul': export_rul(),
    }

    exported = [k for k, v in results.items() if v]
    skipped = [k for k, v in results.items() if not v]

    print("\n" + "=" * 65)
    print(f"  Exported: {', '.join(exported) or 'none'}")
    if skipped:
        print(f"  Skipped:  {', '.join(skipped)}")
    print("=" * 65)

    return results


if __name__ == '__main__':
    args = set(sys.argv[1:])
    os.makedirs(ONNX_EXPORT_DIR, exist_ok=True)

    if '--cnn' in args:
        export_cnn()
    elif '--lstm' in args:
        export_lstm()
    elif '--ae' in args:
        export_autoencoder()
    elif '--rul' in args:
        export_rul()
    else:
        export_all()
