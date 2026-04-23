"""
VibroLab — PyTorch архитектуры нейросетей.

Модели:
  - CNN1D: 1D свёрточная сеть для классификации сырого сигнала
  - GRUClassifier: GRU для временных паттернов
  - Autoencoder: детектор аномалий (обучается на "normal")
  - RULNet: регрессор остаточного ресурса
"""

import torch
import torch.nn as nn
import numpy as np

from config import (
    CNN_PARAMS, LSTM_PARAMS, AE_PARAMS, RUL_PARAMS,
    N_POINTS, RANDOM_SEED,
)


def seed_everything(seed=RANDOM_SEED):
    """Фиксирует seed для воспроизводимости."""
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def get_device():
    """Выбирает устройство: CUDA > MPS > CPU."""
    if torch.cuda.is_available():
        return torch.device('cuda')
    if hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
        return torch.device('mps')
    return torch.device('cpu')


# ═══════════════════════════════════════════════════════
# 1D-CNN для классификации сырого вибросигнала
# ═══════════════════════════════════════════════════════

class CNN1D(nn.Module):
    """1D Convolutional Network для вибросигналов.

    Вход: (batch, in_channels, N_POINTS)
    Выход: (batch, n_classes)
    """

    def __init__(self, n_classes, in_channels=1,
                 filters=None, kernel_sizes=None, strides=None):
        super().__init__()
        filters = filters or CNN_PARAMS['filters']
        kernel_sizes = kernel_sizes or CNN_PARAMS['kernel_sizes']
        strides = strides or CNN_PARAMS['strides']

        layers = []
        ch_in = in_channels
        for ch_out, ks, st in zip(filters, kernel_sizes, strides):
            layers.extend([
                nn.Conv1d(ch_in, ch_out, kernel_size=ks, stride=st, padding=ks // 2),
                nn.BatchNorm1d(ch_out),
                nn.ReLU(inplace=True),
            ])
            ch_in = ch_out

        self.features = nn.Sequential(*layers)
        self.pool = nn.AdaptiveAvgPool1d(1)
        self.classifier = nn.Sequential(
            nn.Dropout(0.3),
            nn.Linear(filters[-1], n_classes),
        )

    def forward(self, x):
        x = self.features(x)
        x = self.pool(x).squeeze(-1)
        return self.classifier(x)

    def extract_features(self, x):
        """Возвращает feature map перед классификатором."""
        x = self.features(x)
        return self.pool(x).squeeze(-1)


# ═══════════════════════════════════════════════════════
# Bidirectional GRU для временных паттернов
# ═══════════════════════════════════════════════════════

class GRUClassifier(nn.Module):
    """Bidirectional GRU для последовательной классификации.

    Вход: (batch, n_steps, step_size) — сигнал разбит на фреймы
    Выход: (batch, n_classes)
    """

    def __init__(self, n_classes, input_size=None, hidden_size=None,
                 n_layers=None, dropout=None):
        super().__init__()
        n_steps = LSTM_PARAMS['n_steps']
        input_size = input_size or (N_POINTS // n_steps)
        hidden_size = hidden_size or LSTM_PARAMS['hidden_size']
        n_layers = n_layers or LSTM_PARAMS['n_layers']
        dropout = dropout if dropout is not None else LSTM_PARAMS['dropout']

        self.gru = nn.GRU(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=n_layers,
            batch_first=True,
            bidirectional=True,
            dropout=dropout if n_layers > 1 else 0,
        )
        self.classifier = nn.Sequential(
            nn.Linear(hidden_size * 2, 64),  # *2 для bidirectional
            nn.ReLU(inplace=True),
            nn.Dropout(dropout),
            nn.Linear(64, n_classes),
        )

    def forward(self, x):
        # x: (batch, n_steps, step_size)
        out, _ = self.gru(x)
        # Берём последний шаг (оба направления уже конкатенированы)
        last = out[:, -1, :]
        return self.classifier(last)


# ═══════════════════════════════════════════════════════
# Autoencoder для детекции аномалий
# ═══════════════════════════════════════════════════════

class Autoencoder(nn.Module):
    """Autoencoder на 53 признаках. Обучается на "normal" данных.

    Ошибка реконструкции > порога → аномалия.
    Вход/Выход: (batch, n_features)
    """

    def __init__(self, n_features, latent_dim=None, hidden_dims=None):
        super().__init__()
        latent_dim = latent_dim or AE_PARAMS['latent_dim']
        hidden_dims = hidden_dims or AE_PARAMS['hidden_dims']

        # Encoder
        enc_layers = []
        dim_in = n_features
        for dim in hidden_dims:
            enc_layers.extend([nn.Linear(dim_in, dim), nn.ReLU(inplace=True)])
            dim_in = dim
        enc_layers.append(nn.Linear(dim_in, latent_dim))
        self.encoder = nn.Sequential(*enc_layers)

        # Decoder (симметричный)
        dec_layers = []
        dim_in = latent_dim
        for dim in reversed(hidden_dims):
            dec_layers.extend([nn.Linear(dim_in, dim), nn.ReLU(inplace=True)])
            dim_in = dim
        dec_layers.append(nn.Linear(dim_in, n_features))
        self.decoder = nn.Sequential(*dec_layers)

    def forward(self, x):
        z = self.encoder(x)
        return self.decoder(z)

    def encode(self, x):
        return self.encoder(x)

    def reconstruction_error(self, x):
        """MSE ошибка реконструкции для каждого сэмпла."""
        with torch.no_grad():
            x_hat = self.forward(x)
            return torch.mean((x - x_hat) ** 2, dim=1)


# ═══════════════════════════════════════════════════════
# RUL — Remaining Useful Life (остаточный ресурс)
# ═══════════════════════════════════════════════════════

class RULNet(nn.Module):
    """Регрессор остаточного ресурса.

    Вход: (batch, n_features) — 53 признака
    Выход: (batch, 1) — нормализованный RUL [0, 1]
    """

    def __init__(self, n_features, hidden_dims=None):
        super().__init__()
        hidden_dims = hidden_dims or RUL_PARAMS['hidden_dims']

        layers = []
        dim_in = n_features
        for dim in hidden_dims:
            layers.extend([
                nn.Linear(dim_in, dim),
                nn.ReLU(inplace=True),
                nn.Dropout(0.2),
            ])
            dim_in = dim
        layers.append(nn.Linear(dim_in, 1))
        layers.append(nn.Sigmoid())  # выход [0, 1]

        self.net = nn.Sequential(*layers)

    def forward(self, x):
        return self.net(x).squeeze(-1)


# ═══════════════════════════════════════════════════════
# Утилиты обучения
# ═══════════════════════════════════════════════════════

class EarlyStopping:
    """Останавливает обучение при отсутствии улучшения."""

    def __init__(self, patience=10, min_delta=1e-4):
        self.patience = patience
        self.min_delta = min_delta
        self.counter = 0
        self.best_loss = None
        self.should_stop = False

    def __call__(self, val_loss):
        if self.best_loss is None:
            self.best_loss = val_loss
        elif val_loss > self.best_loss - self.min_delta:
            self.counter += 1
            if self.counter >= self.patience:
                self.should_stop = True
        else:
            self.best_loss = val_loss
            self.counter = 0
        return self.should_stop


class VibrationDataset(torch.utils.data.Dataset):
    """Dataset для вибросигналов."""

    def __init__(self, signals, labels=None, transform=None):
        self.signals = torch.FloatTensor(signals)
        self.labels = torch.LongTensor(labels) if labels is not None else None
        self.transform = transform

    def __len__(self):
        return len(self.signals)

    def __getitem__(self, idx):
        x = self.signals[idx]
        if self.transform:
            x = self.transform(x)
        if self.labels is not None:
            return x, self.labels[idx]
        return x


class FeatureDataset(torch.utils.data.Dataset):
    """Dataset для извлечённых признаков."""

    def __init__(self, features, labels=None):
        self.features = torch.FloatTensor(features)
        self.labels = torch.LongTensor(labels) if labels is not None else None

    def __len__(self):
        return len(self.features)

    def __getitem__(self, idx):
        if self.labels is not None:
            return self.features[idx], self.labels[idx]
        return self.features[idx]
