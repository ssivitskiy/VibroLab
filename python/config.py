"""
VibroLab — Конфигурация (SEU Gearbox Dataset).
"""

# ═══ ПАРАМЕТРЫ ДИСКРЕТИЗАЦИИ ═══
# SEU DAQ: Frequency Limit=2000 Hz → fs = 2.56 × 2000 = 5120 Hz
FS = 5120
DURATION = 0.5
N_POINTS = int(FS * DURATION)  # 2560

# ═══ ПАРАМЕТРЫ РЕДУКТОРА ═══
# SEU DDS параллельный редуктор
F_ROT = 20.0         # 20 Hz motor speed (основной режим)
Z_PINION = 20
Z_GEAR = 40
GMF = F_ROT * Z_PINION  # 400 Hz

# Параметры по режимам скорости
SPEED_PARAMS = {
    20: {'f_rot': 20.0, 'gmf': 20.0 * Z_PINION},   # 400 Hz
    30: {'f_rot': 30.0, 'gmf': 30.0 * Z_PINION},   # 600 Hz
}

# ═══ SEU КАНАЛЫ ═══
# Ch1: motor vib | Ch2-4: planetary (x,y,z) | Ch5: torque | Ch6-8: parallel gearbox (x,y,z)
SEU_GEAR_CHANNEL = 5  # Channel 6 = parallel gearbox X-axis (legacy single-channel)

# Мультиканальная конфигурация
SEU_CHANNELS = {
    0: {'name': 'motor_vib', 'group': 'motor', 'type': 'vibration'},
    1: {'name': 'planetary_x', 'group': 'planetary', 'type': 'vibration'},
    2: {'name': 'planetary_y', 'group': 'planetary', 'type': 'vibration'},
    3: {'name': 'planetary_z', 'group': 'planetary', 'type': 'vibration'},
    4: {'name': 'torque', 'group': 'torque', 'type': 'torque'},
    5: {'name': 'parallel_x', 'group': 'parallel', 'type': 'vibration'},
    6: {'name': 'parallel_y', 'group': 'parallel', 'type': 'vibration'},
    7: {'name': 'parallel_z', 'group': 'parallel', 'type': 'vibration'},
}

# Группы каналов для мультиканального режима
CHANNEL_GROUPS = {
    'parallel': [5, 6, 7],   # Параллельный редуктор (x,y,z) — основной
    'planetary': [1, 2, 3],  # Планетарный редуктор (x,y,z) — вторичный
    'motor': [0],            # Вибрация двигателя
    'torque': [4],           # Крутящий момент
}

# Кросс-канальные пары для корреляций
CROSS_CHANNEL_PAIRS = [
    (5, 6), (5, 7), (6, 7),  # внутри параллельного
    (1, 2), (1, 3), (2, 3),  # внутри планетарного
    (5, 1),                    # параллельный ↔ планетарный
    (5, 0),                    # параллельный ↔ мотор
]

# ═══ КЛАССЫ SEU ═══
# Gear fault classes
GEAR_CLASSES = ['normal', 'tooth_chip', 'tooth_miss', 'root_crack', 'surface_wear']
# Bearing fault classes
BEARING_CLASSES = ['normal', 'ball_fault', 'inner_race', 'outer_race', 'combination']
# All classes (for combined model)
CLASSES = GEAR_CLASSES  # default: gear mode

CLASS_LABELS_RU = {
    'normal': 'Норма',
    'tooth_chip': 'Скол зуба',
    'tooth_miss': 'Отсутствие зуба',
    'root_crack': 'Трещина корня',
    'surface_wear': 'Износ поверхности',
    'ball_fault': 'Дефект шарика',
    'inner_race': 'Дефект внутренней обоймы',
    'outer_race': 'Дефект наружной обоймы',
    'combination': 'Комбинированный дефект',
}

FILENAME_PATTERNS = {
    # Gear
    'health': 'normal', 'chipped': 'tooth_chip', 'chip': 'tooth_chip',
    'miss': 'tooth_miss', 'root': 'root_crack', 'surface': 'surface_wear', 'surf': 'surface_wear',
    # Bearing
    'ball': 'ball_fault', 'inner': 'inner_race', 'outer': 'outer_race',
    'comb': 'combination',
}
FILENAME_SHORT = {
    'h': 'normal', 'c': 'tooth_chip', 'm': 'tooth_miss',
    'r': 'root_crack', 's': 'surface_wear',
    'b': 'ball_fault', 'i': 'inner_race', 'o': 'outer_race',
}

# ═══ ОБУЧЕНИЕ ═══
TEST_SIZE = 0.2
RANDOM_SEED = 42
SEGMENT_OVERLAP = 0.5
MAX_SEGMENTS_PER_FILE = 400  # было 100 → больше данных для обучения

RF_PARAMS = {
    'n_estimators': 500, 'max_depth': 30,
    'min_samples_split': 4, 'min_samples_leaf': 2,
    'random_state': RANDOM_SEED, 'n_jobs': -1,
}

# ═══ DEEP LEARNING ═══
CNN_PARAMS = {
    'lr': 1e-3, 'epochs': 50, 'batch_size': 64,
    'filters': [32, 64, 128], 'kernel_sizes': [64, 32, 16], 'strides': [4, 2, 2],
}

LSTM_PARAMS = {
    'lr': 1e-3, 'epochs': 50, 'batch_size': 64,
    'hidden_size': 128, 'n_layers': 2, 'dropout': 0.3,
    'n_steps': 32,  # кол-во временных шагов (2560 / 32 = 80 сэмплов на шаг)
}

AE_PARAMS = {
    'lr': 1e-3, 'epochs': 100, 'batch_size': 64,
    'latent_dim': 8, 'hidden_dims': [32, 16],
    'threshold_sigma': 3.0,  # порог = mean + 3*std ошибки реконструкции
}

RUL_PARAMS = {
    'lr': 1e-3, 'epochs': 100, 'batch_size': 32,
    'hidden_dims': [64, 32],
    'n_trajectory_steps': 100,  # шагов в синтетической траектории деградации
    'n_trajectories_per_class': 50,  # траекторий на класс дефекта
}

CALIBRATION_PARAMS = {
    'method': 'sigmoid',  # Platt scaling
    'cal_fraction': 0.15,  # доля данных для калибровки
    'ood_percentile': 99.7,  # порог OOD по Махаланобису
}

# ═══ ДАТАСЕТЫ ═══
DATASET_CONFIGS = {
    'seu': {
        'fs': 5120, 'f_rot': 20.0, 'gmf': 400.0,
        'type': 'gearbox',
        'description': 'Southeast University Gearbox Dataset',
    },
    'cwru': {
        'fs': 12000, 'f_rot': 29.95,  # ~1797 RPM
        'type': 'bearing',
        'description': 'Case Western Reserve University Bearing Dataset',
        'bearing_freqs': {
            'BPFO': 3.5848, 'BPFI': 5.4152,
            'BSF': 2.3570, 'FTF': 0.3983,
        },
    },
    'mfpt': {
        'fs': 97656, 'f_rot': 25.0,  # 1500 RPM
        'type': 'bearing',
        'description': 'MFPT Bearing Fault Dataset',
    },
    'paderborn': {
        'fs': 64000, 'f_rot': 25.0,  # 1500 RPM
        'type': 'bearing',
        'description': 'Paderborn University Bearing Dataset',
    },
}

SUPPORTED_FORMATS = [
    '.mat', '.csv', '.tsv', '.txt', '.dat',
    '.wav', '.tdms', '.uff', '.unv', '.npy', '.npz',
]

# ═══ ПУТИ ═══
MODEL_DIR = 'models'
MODEL_PATH = f'{MODEL_DIR}/rf_model.pkl'
SCALER_PATH = f'{MODEL_DIR}/scaler.pkl'
EXPORT_PATH = '../web/model/rf_model.json'
META_PATH = f'{MODEL_DIR}/meta.json'
ONNX_EXPORT_DIR = '../web/model/'
