"""
VibroLab — Загрузчик SEU Gearbox Dataset.

SEU формат: tab-separated, 8 каналов, заголовок с параметрами DAQ.
Также поддерживает простые CSV (a1,a2,a3,a4).

Использование:
  python load_seu.py <data_dir>
"""

import os
import glob
import re
import csv
import numpy as np
from config import (
    FS, N_POINTS, RANDOM_SEED, SEGMENT_OVERLAP, MAX_SEGMENTS_PER_FILE,
    SEU_GEAR_CHANNEL, FILENAME_PATTERNS, FILENAME_SHORT, CLASS_LABELS_RU,
)


def parse_seu_file(filepath):
    """Парсит SEU tab-separated файл → dict с data, title, settings."""
    data_rows = []
    title = ''
    settings = {}

    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        for line in f:
            line = line.rstrip('\n\r')
            if not line.strip():
                continue

            parts = re.split(r'\t+', line.strip())
            # Пробуем распарсить как числовую строку
            nums = []
            all_numeric = True
            for p in parts:
                p = p.strip()
                if not p:
                    continue
                try:
                    nums.append(float(p))
                except ValueError:
                    all_numeric = False
                    break

            if all_numeric and len(nums) >= 2:
                data_rows.append(nums)
            else:
                # Заголовочная информация
                joined = line.lower()
                if 'title' in joined:
                    title = parts[1].strip() if len(parts) > 1 else ''
                elif 'frequency' in joined and 'limit' in joined:
                    try:
                        settings['freq_limit'] = int(re.findall(r'\d+', line)[-1])
                    except (ValueError, IndexError):
                        pass
                elif 'total' in joined and 'data' in joined and 'rows' in joined:
                    try:
                        settings['total_rows'] = int(re.findall(r'\d+', line)[-1])
                    except (ValueError, IndexError):
                        pass

    if not data_rows:
        raise ValueError(f"Нет данных в {filepath}")

    max_cols = max(len(r) for r in data_rows)
    data = np.zeros((len(data_rows), max_cols))
    for i, row in enumerate(data_rows):
        data[i, :len(row)] = row

    return {'title': title, 'settings': settings, 'data': data, 'n_channels': max_cols}


def parse_csv_file(filepath):
    """Парсит простой CSV (с запятыми)."""
    with open(filepath, 'r', errors='replace') as f:
        reader = csv.reader(f)
        # Try to skip header
        first_row = next(reader, None)
        rows = []
        # Check if first row is numeric
        if first_row:
            try:
                nums = [float(v) for v in first_row if v.strip()]
                if nums:
                    rows.append(nums)
            except ValueError:
                pass  # it was a header, skip
        for row in reader:
            try:
                nums = [float(v) for v in row if v.strip()]
                if nums:
                    rows.append(nums)
            except ValueError:
                continue

    if not rows:
        raise ValueError(f"Нет данных в {filepath}")

    # Handle inhomogeneous rows (different column counts)
    max_cols = max(len(r) for r in rows)
    data = np.zeros((len(rows), max_cols))
    for i, row in enumerate(rows):
        data[i, :len(row)] = row

    return {'title': os.path.basename(filepath), 'settings': {}, 'data': data, 'n_channels': max_cols}


def load_file(filepath):
    """Авто-определение формата и загрузка."""
    with open(filepath, 'r', errors='replace') as f:
        first = f.readline()
    if ',' in first and '\t' not in first:
        return parse_csv_file(filepath)
    return parse_seu_file(filepath)


def detect_class(filename):
    """Определяет класс дефекта по имени файла."""
    name = os.path.basename(filename).lower()
    for pattern, cls in FILENAME_PATTERNS.items():
        if pattern in name:
            return cls
    m = re.match(r'^([hcmrs])\d+', name)
    if m:
        return FILENAME_SHORT.get(m.group(1))
    return None


def detect_speed(filename):
    """Определяет режим скорости (20 или 30 Гц)."""
    name = os.path.basename(filename).lower()
    if '20' in name:
        return 20
    if '30' in name:
        return 30
    return None


def segment_signal(signal, seg_len=N_POINTS, overlap=SEGMENT_OVERLAP, max_segs=MAX_SEGMENTS_PER_FILE):
    """Нарезает сигнал на перекрывающиеся сегменты."""
    step = int(seg_len * (1 - overlap))
    if step < 1:
        step = 1
    segs = []
    pos = 0
    while pos + seg_len <= len(signal):
        segs.append(signal[pos:pos + seg_len])
        pos += step
        if max_segs and len(segs) >= max_segs:
            break
    return np.array(segs) if segs else np.empty((0, seg_len))


def segment_multichannel(data, seg_len=N_POINTS, overlap=SEGMENT_OVERLAP, max_segs=MAX_SEGMENTS_PER_FILE):
    """Нарезает многоканальные данные → (n_segments, n_channels, seg_len).

    Args:
        data: np.array (n_samples, n_channels)
    Returns:
        np.array (n_segments, n_channels, seg_len)
    """
    n_samples, n_channels = data.shape
    step = int(seg_len * (1 - overlap))
    if step < 1:
        step = 1
    segs = []
    pos = 0
    while pos + seg_len <= n_samples:
        segs.append(data[pos:pos + seg_len, :].T)  # → (n_channels, seg_len)
        pos += step
        if max_segs and len(segs) >= max_segs:
            break
    return np.array(segs) if segs else np.empty((0, n_channels, seg_len))


def load_dataset(data_dir, channel=SEU_GEAR_CHANNEL, speed_filter=None, multichannel=False):
    """
    Загружает SEU Gearbox Dataset.

    Args:
        data_dir: папка с файлами
        channel: индекс канала для single-channel режима (default: 5 = parallel X)
        speed_filter: 20 или 30 — фильтр по режиму (None = все)
        multichannel: если True → возвращает все каналы (N, n_ch, seg_len)

    Returns:
        signals, labels, label_indices, classes_found, metadata
    """
    np.random.seed(RANDOM_SEED)

    # Ищем файлы
    files = []
    for ext in ('*.txt', '*.csv', '*.dat'):
        files.extend(glob.glob(os.path.join(data_dir, ext)))
        files.extend(glob.glob(os.path.join(data_dir, '**', ext), recursive=True))
    files = sorted(set(files))

    if not files:
        raise FileNotFoundError(f"Нет файлов в {data_dir}")

    mode_str = "MULTI-CHANNEL" if multichannel else "SINGLE-CHANNEL"
    print(f"[SEU] {len(files)} файлов в {data_dir} ({mode_str})")

    all_signals, all_labels = [], []
    class_counts = {}
    skipped = []
    detected_channels = 0

    for fp in files:
        fname = os.path.basename(fp)
        cls = detect_class(fname)
        if cls is None:
            skipped.append(fname)
            continue

        speed = detect_speed(fname)
        if speed_filter and speed and speed != speed_filter:
            continue

        try:
            parsed = load_file(fp)
            data = parsed['data']
            detected_channels = max(detected_channels, data.shape[1])

            if multichannel:
                segs = segment_multichannel(data)
            else:
                ch = channel if data.shape[1] > channel else 0
                signal = data[:, ch]
                segs = segment_signal(signal)

            if len(segs) == 0:
                print(f"  ⚠ {fname}: слишком короткий ({data.shape[0]} pts)")
                continue

            all_signals.append(segs)
            all_labels.extend([cls] * len(segs))
            class_counts[cls] = class_counts.get(cls, 0) + len(segs)

            spd = f" [{speed}Hz]" if speed else ""
            ch_str = f"{data.shape[1]}ch" if multichannel else f"ch={channel}"
            print(f"  ✓ {fname}: {cls}{spd} → {len(segs)} seg ({ch_str}, {data.shape[0]} pts)")

        except Exception as e:
            print(f"  ✗ {fname}: {e}")
            skipped.append(fname)

    if not all_signals:
        raise ValueError("Не удалось загрузить данные")

    signals = np.vstack(all_signals)
    classes_found = sorted(set(all_labels))
    lbl_map = {c: i for i, c in enumerate(classes_found)}
    indices = np.array([lbl_map[lbl] for lbl in all_labels])

    # Балансировка: downsample до размера наименьшего класса
    min_n = min(class_counts.values())
    mask = np.zeros(len(signals), dtype=bool)
    for cls in classes_found:
        cls_idx = np.where(np.array(all_labels) == cls)[0]
        np.random.shuffle(cls_idx)
        mask[cls_idx[:min_n]] = True

    signals = signals[mask]
    all_labels = [lbl for lbl, m in zip(all_labels, mask) if m]
    indices = np.array([lbl_map[lbl] for lbl in all_labels])

    print(f"\n[SEU] Итого: {len(classes_found)} классов, {len(signals)} сэмплов ({min_n}/class)")
    for c in classes_found:
        n = sum(1 for lbl in all_labels if lbl == c)
        print(f"  {CLASS_LABELS_RU.get(c, c):20s}: {n}")
    if multichannel:
        print(f"  Каналов: {signals.shape[1]} | Shape: {signals.shape}")

    meta = {
        'source': 'seu',
        'classes': classes_found,
        'labels_ru': {c: CLASS_LABELS_RU.get(c, c) for c in classes_found},
        'per_class': min_n,
        'total': len(signals),
        'channel': 'all' if multichannel else channel,
        'n_channels': detected_channels if multichannel else 1,
        'multichannel': multichannel,
        'seg_length': N_POINTS,
        'fs': FS,
    }
    return signals, all_labels, indices, classes_found, meta


if __name__ == '__main__':
    import sys
    if len(sys.argv) < 2:
        print("python load_seu.py <data_dir>")
        sys.exit(1)
    signals, labels, indices, classes, meta = load_dataset(sys.argv[1])
    print(f"\nShape: {signals.shape}")
