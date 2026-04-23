"""
VibroLab — Загрузчики публичных датасетов вибродиагностики.

Поддерживаемые датасеты:
  1. CWRU Bearing Dataset (Case Western Reserve University)
  2. MFPT Bearing Dataset (Machinery Failure Prevention Technology)
  3. Paderborn University Bearing Dataset

Каждый загрузчик:
  - Автоматически определяет формат файлов (.mat, .csv, .txt)
  - Нарезает на сегменты с перекрытием
  - Возвращает единый формат: (signals, labels, indices, classes, meta)

Использование:
  python datasets.py cwru <data_dir>
  python datasets.py mfpt <data_dir>
  python datasets.py paderborn <data_dir>
"""

import os
import re
import glob
import numpy as np

from config import (
    N_POINTS, RANDOM_SEED, SEGMENT_OVERLAP, MAX_SEGMENTS_PER_FILE,
    CLASS_LABELS_RU,
)
from load_seu import segment_signal


# ═══════════════════════════════════════════════════════
# ФОРМАТЫ ФАЙЛОВ
# ═══════════════════════════════════════════════════════

def read_mat_file(filepath, key=None):
    """Читает .mat файл (MATLAB) → dict.

    Поддерживает:
      - v5/v7 формат (scipy.io.loadmat)
      - v7.3 HDF5 формат (h5py)
    """
    try:
        import scipy.io as sio
        mat = sio.loadmat(filepath)
        # Убираем служебные ключи
        data = {k: v for k, v in mat.items() if not k.startswith('__')}
        if key and key in data:
            return data[key].flatten().astype(np.float64)
        # Ищем самый большой числовой массив (обычно это сигнал)
        best_key, best_size = None, 0
        for k, v in data.items():
            if isinstance(v, np.ndarray) and v.dtype.kind in ('f', 'i'):
                if v.size > best_size:
                    best_key, best_size = k, v.size
        if best_key:
            return data[best_key].flatten().astype(np.float64)
        raise ValueError(f"Нет числовых массивов в {filepath}")
    except NotImplementedError:
        # v7.3 HDF5 format
        try:
            import h5py
            with h5py.File(filepath, 'r') as f:
                if key and key in f:
                    return np.array(f[key]).flatten().astype(np.float64)
                # Ищем самый большой dataset
                best_key, best_size = None, 0
                for k in f.keys():
                    if isinstance(f[k], h5py.Dataset):
                        if f[k].size > best_size:
                            best_key, best_size = k, f[k].size
                if best_key:
                    return np.array(f[best_key]).flatten().astype(np.float64)
            raise ValueError(f"Нет данных в HDF5 файле {filepath}")
        except ImportError:
            raise ImportError("Для HDF5 .mat файлов установите h5py: pip install h5py")


def read_tdms_file(filepath, group=None, channel=None):
    """Читает .tdms файл (NI LabVIEW) → np.array.

    Requires: pip install npTDMS
    """
    try:
        from nptdms import TdmsFile
    except ImportError:
        raise ImportError("Для TDMS установите npTDMS: pip install npTDMS")

    tdms = TdmsFile.read(filepath)

    if group and channel:
        return tdms[group][channel][:].astype(np.float64)

    # Ищем первый канал с данными
    for grp in tdms.groups():
        for ch in grp.channels():
            data = ch[:]
            if len(data) > 100:
                return data.astype(np.float64)

    raise ValueError(f"Нет данных в TDMS файле {filepath}")


def read_uff_file(filepath, dataset_num=None):
    """Читает .uff/.unv файл (Universal File Format) → np.array.

    UFF тип 58: Function at Nodal DOF (time history).
    """
    data_points = []
    in_data = False
    current_type = None

    with open(filepath, 'r', errors='replace') as f:
        for line in f:
            line = line.strip()

            # Начало блока данных
            if line == '-1':
                if in_data:
                    in_data = False
                    if data_points:
                        break  # берём первый блок
                else:
                    in_data = True
                    continue

            if in_data:
                # Record 1 of dataset (тип)
                if current_type is None:
                    try:
                        current_type = int(line.strip())
                    except ValueError:
                        pass
                    continue

                # Тип 58 — временной ряд
                if current_type == 58:
                    # Пропускаем заголовки (записи 1-11)
                    # Данные начинаются после строки с числом точек
                    parts = line.split()
                    for p in parts:
                        try:
                            data_points.append(float(p))
                        except ValueError:
                            pass

    if not data_points:
        raise ValueError(f"Нет данных в UFF файле {filepath}")

    return np.array(data_points, dtype=np.float64)


def read_any_format(filepath, key=None):
    """Универсальный читатель — определяет формат по расширению."""
    ext = os.path.splitext(filepath)[1].lower()

    if ext == '.mat':
        return read_mat_file(filepath, key)
    elif ext == '.tdms':
        return read_tdms_file(filepath)
    elif ext in ('.uff', '.unv'):
        return read_uff_file(filepath)
    elif ext == '.wav':
        from converter import read_wav
        sr, data = read_wav(filepath)
        return data
    elif ext in ('.csv', '.txt', '.dat', '.tsv'):
        # Сначала пробуем через converter (поддерживает 1-колоночные CSV)
        try:
            from converter import read_csv
            sr, data = read_csv(filepath)
            if len(data) > 0:
                return data
        except Exception:
            pass
        # Fallback к SEU-парсеру (мультиканальные файлы)
        from load_seu import load_file
        parsed = load_file(filepath)
        data = parsed['data']
        if data.ndim == 2:
            return data[:, 0]
        return data.flatten()
    elif ext in ('.npy',):
        return np.load(filepath).flatten().astype(np.float64)
    elif ext in ('.npz',):
        npz = np.load(filepath)
        key = key or list(npz.keys())[0]
        return npz[key].flatten().astype(np.float64)
    else:
        raise ValueError(f"Неподдерживаемый формат: {ext}")


# ═══════════════════════════════════════════════════════
# CWRU BEARING DATASET
# Case Western Reserve University
# http://csegroups.case.edu/bearingdatacenter/
# ═══════════════════════════════════════════════════════

# CWRU использует .mat файлы с ключами вида: X097_DE_time, X097_FE_time
# DE = Drive End accelerometer, FE = Fan End accelerometer
CWRU_CONFIG = {
    'fs': 12000,  # 12 kHz (некоторые файлы 48 kHz)
    'classes': ['normal', 'ball_fault', 'inner_race', 'outer_race'],
    'fault_sizes': [0.007, 0.014, 0.021],  # дюймы
    'loads': [0, 1, 2, 3],  # HP
    'bearing_freqs': {
        # Для подшипника SKF 6205-2RS (стандарт CWRU)
        'BPFO': 3.5848,  # Ball Pass Freq Outer (× shaft speed)
        'BPFI': 5.4152,  # Ball Pass Freq Inner
        'BSF': 2.3570,   # Ball Spin Freq
        'FTF': 0.3983,   # Cage/Train Freq
    },
}

# Паттерны имён файлов CWRU
CWRU_PATTERNS = {
    'normal': ['normal', 'baseline', 'healthy'],
    'ball_fault': ['ball'],
    'inner_race': ['inner'],
    'outer_race': ['outer'],
}

# Prefix-based detection (case-sensitive, start of filename)
CWRU_PREFIX_MAP = {
    'N': 'normal', 'B': 'ball_fault', 'BA': 'ball_fault',
    'IR': 'inner_race', 'OR': 'outer_race',
}


def detect_cwru_class(filename):
    """Определяет класс дефекта CWRU по имени файла."""
    name = os.path.basename(filename)
    name_lower = name.lower()

    # Словесные паттерны (в нижнем регистре)
    for cls, patterns in CWRU_PATTERNS.items():
        for pat in patterns:
            if pat in name_lower:
                return cls

    # Префиксы (case-sensitive) — типичные CWRU имена: IR007_0.mat, B007_0.mat
    stem = os.path.splitext(name)[0]
    for prefix, cls in sorted(CWRU_PREFIX_MAP.items(), key=lambda x: -len(x[0])):
        if stem.startswith(prefix) and (len(stem) == len(prefix) or not stem[len(prefix)].isalpha()):
            return cls

    return None


def detect_cwru_mat_key(mat_data, prefer='DE'):
    """Находит ключ с вибросигналом в CWRU .mat файле."""
    # Ищем ключ вида *_DE_time или *_FE_time
    keys = [k for k in mat_data.keys() if not k.startswith('__')]

    for key in keys:
        if prefer.lower() in key.lower() and 'time' in key.lower():
            return key

    # Fallback: ищем любой *_time ключ
    for key in keys:
        if 'time' in key.lower():
            return key

    # Fallback: самый большой массив
    best_key, best_size = None, 0
    for k in keys:
        v = mat_data[k]
        if isinstance(v, np.ndarray) and v.size > best_size:
            best_key, best_size = k, v.size
    return best_key


def load_cwru(data_dir, channel='DE', seg_len=N_POINTS,
              overlap=SEGMENT_OVERLAP, max_segs=MAX_SEGMENTS_PER_FILE):
    """Загружает CWRU Bearing Dataset.

    Args:
        data_dir: путь к папке с .mat файлами
        channel: 'DE' (Drive End) или 'FE' (Fan End)

    Returns:
        signals, labels, indices, classes, meta
    """
    try:
        import scipy.io as sio
    except ImportError:
        raise ImportError("Для CWRU нужен scipy: pip install scipy")

    np.random.seed(RANDOM_SEED)
    files = sorted(glob.glob(os.path.join(data_dir, '**', '*.mat'), recursive=True))
    if not files:
        raise FileNotFoundError(f"Нет .mat файлов в {data_dir}")

    print(f"[CWRU] {len(files)} файлов в {data_dir}")
    print(f"  Channel: {channel} | fs: {CWRU_CONFIG['fs']} Hz")

    all_signals, all_labels = [], []
    class_counts = {}

    for fp in files:
        fname = os.path.basename(fp)
        cls = detect_cwru_class(fname)
        if cls is None:
            print(f"  ⚠ {fname}: класс не определён, пропущен")
            continue

        try:
            mat = sio.loadmat(fp)
            key = detect_cwru_mat_key(mat, prefer=channel)
            if key is None:
                print(f"  ⚠ {fname}: нет подходящего ключа")
                continue

            signal = mat[key].flatten().astype(np.float64)
            # CWRU может быть 12k или 48k
            fs = 48000 if '48' in fname else CWRU_CONFIG['fs']

            # Ресэмплинг к стандартному N_POINTS при нужде
            segs = segment_signal(signal, seg_len=seg_len,
                                  overlap=overlap, max_segs=max_segs)

            if len(segs) == 0:
                continue

            all_signals.append(segs)
            all_labels.extend([cls] * len(segs))
            class_counts[cls] = class_counts.get(cls, 0) + len(segs)
            print(f"  ✓ {fname}: {cls} → {len(segs)} seg ({len(signal)} pts, {fs}Hz, key={key})")

        except Exception as e:
            print(f"  ✗ {fname}: {e}")

    return _finalize_dataset(all_signals, all_labels, class_counts, 'cwru',
                             {'fs': CWRU_CONFIG['fs'], 'channel': channel,
                              'bearing_freqs': CWRU_CONFIG['bearing_freqs']})


# ═══════════════════════════════════════════════════════
# MFPT BEARING DATASET
# Machinery Failure Prevention Technology Society
# https://www.mfpt.org/fault-data-sets/
# ═══════════════════════════════════════════════════════

MFPT_CONFIG = {
    'fs': 97656,  # baseline: ~97.7 kHz
    'fs_fault': 48828,  # fault data: ~48.8 kHz
    'classes': ['normal', 'inner_race', 'outer_race'],
}

MFPT_PATTERNS = {
    'normal': ['baseline', 'normal', 'healthy', 'good'],
    'inner_race': ['inner', 'IR'],
    'outer_race': ['outer', 'OR'],
}


def detect_mfpt_class(filename):
    name = os.path.basename(filename).lower()
    for cls, patterns in MFPT_PATTERNS.items():
        for pat in patterns:
            if pat.lower() in name:
                return cls
    return None


def load_mfpt(data_dir, seg_len=N_POINTS,
              overlap=SEGMENT_OVERLAP, max_segs=MAX_SEGMENTS_PER_FILE):
    """Загружает MFPT Bearing Dataset.

    MFPT использует .mat файлы с полями: bearing, sr, gs, load, rate.
    """
    try:
        import scipy.io as sio
    except ImportError:
        raise ImportError("Для MFPT нужен scipy: pip install scipy")

    np.random.seed(RANDOM_SEED)
    files = sorted(glob.glob(os.path.join(data_dir, '**', '*.mat'), recursive=True))
    if not files:
        # MFPT также может быть в .csv
        files = sorted(glob.glob(os.path.join(data_dir, '**', '*.csv'), recursive=True))

    if not files:
        raise FileNotFoundError(f"Нет файлов в {data_dir}")

    print(f"[MFPT] {len(files)} файлов в {data_dir}")

    all_signals, all_labels = [], []
    class_counts = {}

    for fp in files:
        fname = os.path.basename(fp)
        cls = detect_mfpt_class(fname)
        if cls is None:
            print(f"  ⚠ {fname}: класс не определён")
            continue

        try:
            ext = os.path.splitext(fp)[1].lower()
            if ext == '.mat':
                mat = sio.loadmat(fp)
                # MFPT .mat: ищем 'bearing' или наибольший массив
                if 'bearing' in mat:
                    signal = mat['bearing'].flatten().astype(np.float64)
                else:
                    signal = read_mat_file(fp)

                # Определяем fs из файла
                fs = int(mat.get('sr', [[MFPT_CONFIG['fs']]])[0][0]) if 'sr' in mat else MFPT_CONFIG['fs']
            else:
                signal = read_any_format(fp)
                fs = MFPT_CONFIG['fs']

            segs = segment_signal(signal, seg_len=seg_len,
                                  overlap=overlap, max_segs=max_segs)

            if len(segs) == 0:
                continue

            all_signals.append(segs)
            all_labels.extend([cls] * len(segs))
            class_counts[cls] = class_counts.get(cls, 0) + len(segs)
            print(f"  ✓ {fname}: {cls} → {len(segs)} seg ({len(signal)} pts, {fs}Hz)")

        except Exception as e:
            print(f"  ✗ {fname}: {e}")

    return _finalize_dataset(all_signals, all_labels, class_counts, 'mfpt',
                             {'fs': MFPT_CONFIG['fs']})


# ═══════════════════════════════════════════════════════
# PADERBORN UNIVERSITY BEARING DATASET
# https://mb.uni-paderborn.de/kat/forschung/datacenter
# ═══════════════════════════════════════════════════════

PADERBORN_CONFIG = {
    'fs': 64000,  # 64 kHz
    'classes': ['normal', 'inner_race', 'outer_race'],
}

# Paderborn naming convention: K001-K006 = healthy, KA01-KA22 = OR, KI01-KI18 = IR
PADERBORN_PREFIXES = {
    'K0': 'normal',      # K001, K002, etc.
    'KA': 'outer_race',  # KA01, KA04, etc.
    'KI': 'inner_race',  # KI01, KI04, etc.
}


def detect_paderborn_class(filename):
    name = os.path.basename(filename).upper()
    for prefix, cls in PADERBORN_PREFIXES.items():
        if prefix in name:
            return cls
    # Fallback к общим паттернам
    name_lower = name.lower()
    if 'healthy' in name_lower or 'normal' in name_lower:
        return 'normal'
    if 'inner' in name_lower:
        return 'inner_race'
    if 'outer' in name_lower:
        return 'outer_race'
    return None


def load_paderborn(data_dir, channel='vibration_1', seg_len=N_POINTS,
                   overlap=SEGMENT_OVERLAP, max_segs=MAX_SEGMENTS_PER_FILE):
    """Загружает Paderborn University Bearing Dataset.

    Paderborn хранит данные в .mat файлах (v7.3 HDF5).
    Каналы: vibration_1, vibration_2, current_1, current_2, temp_2, force, speed.
    """
    np.random.seed(RANDOM_SEED)

    # Ищем .mat файлы
    files = sorted(glob.glob(os.path.join(data_dir, '**', '*.mat'), recursive=True))
    if not files:
        raise FileNotFoundError(f"Нет .mat файлов в {data_dir}")

    print(f"[PADERBORN] {len(files)} файлов в {data_dir}")
    print(f"  Channel: {channel} | fs: {PADERBORN_CONFIG['fs']} Hz")

    all_signals, all_labels = [], []
    class_counts = {}

    for fp in files:
        fname = os.path.basename(fp)
        cls = detect_paderborn_class(fname)
        if cls is None:
            print(f"  ⚠ {fname}: класс не определён")
            continue

        try:
            signal = read_mat_file(fp, key=channel)
            segs = segment_signal(signal, seg_len=seg_len,
                                  overlap=overlap, max_segs=max_segs)

            if len(segs) == 0:
                continue

            all_signals.append(segs)
            all_labels.extend([cls] * len(segs))
            class_counts[cls] = class_counts.get(cls, 0) + len(segs)
            print(f"  ✓ {fname}: {cls} → {len(segs)} seg ({len(signal)} pts)")

        except Exception as e:
            print(f"  ✗ {fname}: {e}")

    return _finalize_dataset(all_signals, all_labels, class_counts, 'paderborn',
                             {'fs': PADERBORN_CONFIG['fs'], 'channel': channel})


# ═══════════════════════════════════════════════════════
# УНИВЕРСАЛЬНЫЙ ЗАГРУЗЧИК
# ═══════════════════════════════════════════════════════

DATASET_LOADERS = {
    'cwru': load_cwru,
    'mfpt': load_mfpt,
    'paderborn': load_paderborn,
}


def load_dataset_auto(data_dir, dataset_type=None, **kwargs):
    """Авто-определяет тип датасета и загружает.

    Args:
        data_dir: путь к данным
        dataset_type: 'cwru', 'mfpt', 'paderborn', 'seu' или None (авто)
    """
    if dataset_type and dataset_type in DATASET_LOADERS:
        return DATASET_LOADERS[dataset_type](data_dir, **kwargs)

    if dataset_type == 'seu':
        from load_seu import load_dataset
        return load_dataset(data_dir, **kwargs)

    # Авто-определение по содержимому
    dir_name = os.path.basename(data_dir).lower()
    parent_name = os.path.basename(os.path.dirname(data_dir)).lower()

    for name in (dir_name, parent_name):
        if 'cwru' in name or 'case western' in name:
            return load_cwru(data_dir, **kwargs)
        if 'mfpt' in name:
            return load_mfpt(data_dir, **kwargs)
        if 'paderborn' in name or 'kat' in name:
            return load_paderborn(data_dir, **kwargs)

    # Проверяем по расширениям файлов
    mat_files = glob.glob(os.path.join(data_dir, '**', '*.mat'), recursive=True)
    txt_files = glob.glob(os.path.join(data_dir, '**', '*.txt'), recursive=True)

    if mat_files and not txt_files:
        # Скорее всего CWRU или MFPT (они хранят данные в .mat)
        # Пытаемся определить по именам файлов
        sample_names = [os.path.basename(f).lower() for f in mat_files[:10]]
        for name in sample_names:
            if any(p in name for p in ('k0', 'ka', 'ki')):
                return load_paderborn(data_dir, **kwargs)
            if any(p in name for p in ('baseline', 'inner', 'outer', 'ball')):
                return load_cwru(data_dir, **kwargs)

        # Дефолт для .mat → CWRU (наиболее распространённый)
        print("[AUTO] Определён как CWRU (по наличию .mat файлов)")
        return load_cwru(data_dir, **kwargs)

    if txt_files:
        # SEU формат
        print("[AUTO] Определён как SEU (по наличию .txt файлов)")
        from load_seu import load_dataset
        return load_dataset(data_dir, **kwargs)

    raise FileNotFoundError(f"Не удалось определить тип датасета в {data_dir}")


# ═══════════════════════════════════════════════════════
# УТИЛИТЫ
# ═══════════════════════════════════════════════════════

def _finalize_dataset(all_signals, all_labels, class_counts, source, extra_meta=None):
    """Финализирует загрузку: балансировка, индексация, метаданные."""
    if not all_signals:
        raise ValueError("Не удалось загрузить данные")

    signals = np.vstack(all_signals)
    classes_found = sorted(set(all_labels))
    lbl_map = {c: i for i, c in enumerate(classes_found)}
    indices = np.array([lbl_map[lbl] for lbl in all_labels])

    # Балансировка
    min_n = min(class_counts.values())
    mask = np.zeros(len(signals), dtype=bool)
    for cls in classes_found:
        cls_idx = np.where(np.array(all_labels) == cls)[0]
        np.random.shuffle(cls_idx)
        mask[cls_idx[:min_n]] = True

    signals = signals[mask]
    all_labels = [lbl for lbl, m in zip(all_labels, mask) if m]
    indices = np.array([lbl_map[lbl] for lbl in all_labels])

    print(f"\n[{source.upper()}] Итого: {len(classes_found)} классов, "
          f"{len(signals)} сэмплов ({min_n}/class)")
    for c in classes_found:
        n = sum(1 for lbl in all_labels if lbl == c)
        ru = CLASS_LABELS_RU.get(c, c)
        print(f"  {ru:20s}: {n}")

    meta = {
        'source': source,
        'classes': classes_found,
        'per_class': min_n,
        'total': len(signals),
        'seg_length': signals.shape[1] if signals.ndim == 2 else N_POINTS,
    }
    if extra_meta:
        meta.update(extra_meta)

    return signals, all_labels, indices, classes_found, meta


def list_supported_formats():
    """Возвращает список поддерживаемых форматов."""
    formats = {
        '.mat': 'MATLAB (v5/v7/v7.3 HDF5) — CWRU, MFPT, Paderborn',
        '.csv': 'Comma-Separated Values',
        '.tsv': 'Tab-Separated Values',
        '.txt': 'Text (SEU tab-separated)',
        '.dat': 'Binary/text data',
        '.wav': 'WAV audio (16/24/32-bit PCM)',
        '.tdms': 'NI LabVIEW TDMS (requires npTDMS)',
        '.uff': 'Universal File Format (тип 58)',
        '.unv': 'Universal File Format (alias)',
        '.npy': 'NumPy binary array',
        '.npz': 'NumPy compressed archive',
    }
    return formats


if __name__ == '__main__':
    import sys
    if len(sys.argv) < 3:
        print("Использование: python datasets.py <type> <data_dir>")
        print("  type: cwru | mfpt | paderborn | auto")
        print("\nПоддерживаемые форматы:")
        for ext, desc in list_supported_formats().items():
            print(f"  {ext:8s} {desc}")
        sys.exit(1)

    ds_type = sys.argv[1]
    data_dir = sys.argv[2]

    if ds_type == 'auto':
        signals, labels, indices, classes, meta = load_dataset_auto(data_dir)
    elif ds_type in DATASET_LOADERS:
        signals, labels, indices, classes, meta = DATASET_LOADERS[ds_type](data_dir)
    else:
        print(f"Неизвестный тип: {ds_type}")
        sys.exit(1)

    print(f"\nShape: {signals.shape}")
