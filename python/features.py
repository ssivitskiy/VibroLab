"""
VibroLab — Извлечение 53 признаков из вибросигналов.
39 базовых + 6 normalized + 8 envelope = 53.
"""

import numpy as np
from scipy import stats
from scipy.fft import rfft, rfftfreq
from scipy.signal import hilbert, coherence as sp_coherence
from config import FS, F_ROT, GMF, SEU_CHANNELS, CROSS_CHANNEL_PAIRS


def compute_fft(signal, fs=FS):
    N = len(signal)
    freqs = rfftfreq(N, d=1 / fs)
    spectrum = np.abs(rfft(signal)) * 2 / N
    return freqs, spectrum


def _peak_at(freqs, spec, target, bw=None):
    if bw is None:
        bw = max(5.0, target * 0.02)
    mask = (freqs >= target - bw) & (freqs <= target + bw)
    return np.max(spec[mask]) if np.any(mask) else 0.0


def _band_energy(freqs, spec, lo, hi):
    mask = (freqs >= lo) & (freqs <= hi)
    return np.sum(spec[mask]**2) if np.any(mask) else 0.0


def extract_features(signal, fs=FS, f_rot=F_ROT, gmf=GMF):
    """Извлекает 53 признака → dict."""
    f = {}

    # ══════════════════════════════════
    # Time-domain (10)
    # ══════════════════════════════════
    f['rms'] = np.sqrt(np.mean(signal**2))
    f['peak'] = np.max(np.abs(signal))
    f['peak_to_peak'] = np.max(signal) - np.min(signal)
    f['crest_factor'] = f['peak'] / f['rms'] if f['rms'] > 0 else 0
    _std = np.std(signal)
    f['kurtosis'] = float(stats.kurtosis(signal, fisher=True)) if _std > 0 else 0.0
    f['skewness'] = float(stats.skew(signal)) if _std > 0 else 0.0
    f['std'] = _std
    f['mean_abs'] = np.mean(np.abs(signal))
    f['shape_factor'] = f['rms'] / f['mean_abs'] if f['mean_abs'] > 0 else 0
    f['impulse_factor'] = f['peak'] / f['mean_abs'] if f['mean_abs'] > 0 else 0

    # ══════════════════════════════════
    # Frequency-domain (29)
    # ══════════════════════════════════
    freqs, spec = compute_fft(signal, fs)
    nyq = fs / 2

    for k in range(1, 6):
        freq = gmf * k
        f[f'gmf_{k}x'] = _peak_at(freqs, spec, freq) if freq < nyq else 0.0

    for k in range(1, 5):
        fp = gmf + k * f_rot
        fm = gmf - k * f_rot
        f[f'sb_plus_{k}'] = _peak_at(freqs, spec, fp) if fp < nyq else 0.0
        f[f'sb_minus_{k}'] = _peak_at(freqs, spec, fm) if fm > 0 else 0.0

    for k in range(1, 5):
        f[f'frot_{k}x'] = _peak_at(freqs, spec, f_rot * k)

    f['sub_gmf_2'] = _peak_at(freqs, spec, gmf / 2)
    f['sub_gmf_3'] = _peak_at(freqs, spec, gmf / 3)

    f['energy_low'] = _band_energy(freqs, spec, 0, min(100, nyq))
    f['energy_rot'] = _band_energy(freqs, spec, max(0, f_rot - 10), min(f_rot * 5 + 10, nyq))
    f['energy_gmf'] = _band_energy(freqs, spec, max(0, gmf - 100), min(gmf + 100, nyq))
    f['energy_gmf2'] = _band_energy(freqs, spec, max(0, gmf * 2 - 100), min(gmf * 2 + 100, nyq))
    f['energy_high'] = _band_energy(freqs, spec, min(gmf * 3, nyq * 0.6), nyq)
    f['energy_total'] = _band_energy(freqs, spec, 0, nyq)

    et = f['energy_total']
    f['ratio_gmf_total'] = f['energy_gmf'] / et if et > 0 else 0
    f['ratio_rot_total'] = f['energy_rot'] / et if et > 0 else 0
    f['ratio_high_total'] = f['energy_high'] / et if et > 0 else 0

    gmf_amp = f['gmf_1x']
    sb_sum = sum(f[f'sb_plus_{k}'] + f[f'sb_minus_{k}'] for k in range(1, 5))
    f['sideband_ratio'] = sb_sum / gmf_amp if gmf_amp > 0 else 0

    # ══════════════════════════════════
    # Normalized features (speed-invariant, 6)
    # Для обобщения между режимами скорости
    # ══════════════════════════════════
    # GMF harmonics normalized by GMF_1x
    if gmf_amp > 0:
        f['gmf_2x_norm'] = f.get('gmf_2x', 0) / gmf_amp
        f['gmf_3x_norm'] = f.get('gmf_3x', 0) / gmf_amp
    else:
        f['gmf_2x_norm'] = 0
        f['gmf_3x_norm'] = 0

    # Sideband symmetry: |sb_plus - sb_minus| / (sb_plus + sb_minus)
    for k in range(1, 3):
        sp = f.get(f'sb_plus_{k}', 0)
        sm = f.get(f'sb_minus_{k}', 0)
        f[f'sb_asym_{k}'] = abs(sp - sm) / (sp + sm) if (sp + sm) > 0 else 0

    # Energy distribution ratios
    f['ratio_low_total'] = f['energy_low'] / et if et > 0 else 0
    f['ratio_gmf2_gmf'] = f['energy_gmf2'] / f['energy_gmf'] if f['energy_gmf'] > 0 else 0

    # ══════════════════════════════════
    # Envelope (огибающая) features (8)
    # Hilbert transform → amplitude modulation
    # Ключ для различия root_crack vs tooth_miss:
    #   root_crack → плавная модуляция на f_rot (envelope peak at f_rot)
    #   tooth_miss → импульсная модуляция (высокий envelope kurtosis)
    # ══════════════════════════════════
    try:
        analytic = hilbert(signal)
        envelope = np.abs(analytic)
        envelope = envelope - np.mean(envelope)  # убрать DC

        # Envelope time-domain
        f['env_rms'] = np.sqrt(np.mean(envelope**2))
        f['env_peak'] = np.max(np.abs(envelope))
        f['env_kurtosis'] = float(stats.kurtosis(envelope, fisher=True)) if f['env_rms'] > 0 else 0.0
        f['env_crest'] = f['env_peak'] / f['env_rms'] if f['env_rms'] > 0 else 0

        # Envelope spectrum → ищем модуляцию на f_rot
        env_freqs, env_spec = compute_fft(envelope, fs)
        f['env_frot_1x'] = _peak_at(env_freqs, env_spec, f_rot)
        f['env_frot_2x'] = _peak_at(env_freqs, env_spec, f_rot * 2)
        f['env_frot_3x'] = _peak_at(env_freqs, env_spec, f_rot * 3)

        # Отношение энергии огибающей на f_rot к общей
        env_e_rot = _band_energy(env_freqs, env_spec, f_rot - 5, f_rot * 4 + 5)
        env_e_total = _band_energy(env_freqs, env_spec, 0, nyq)
        f['env_mod_index'] = env_e_rot / env_e_total if env_e_total > 0 else 0

    except (ValueError, np.linalg.LinAlgError):
        # Fallback если Hilbert не сработал (нулевой или слишком короткий сигнал)
        f['env_rms'] = 0
        f['env_peak'] = 0
        f['env_kurtosis'] = 0
        f['env_crest'] = 0
        f['env_frot_1x'] = 0
        f['env_frot_2x'] = 0
        f['env_frot_3x'] = 0
        f['env_mod_index'] = 0

    return f


def extract_batch(signals, fs=FS, f_rot=F_ROT, gmf=GMF):
    """Single-channel batch extraction. signals: (N, seg_len)."""
    all_feats, names = [], None
    for sig in signals:
        fd = extract_features(sig, fs, f_rot, gmf)
        if names is None:
            names = list(fd.keys())
        all_feats.append(list(fd.values()))
    X = np.array(all_feats)
    print(f"[FEATURES] {X.shape[0]} × {X.shape[1]} признаков | fs={fs} Hz, f_rot={f_rot} Hz, GMF={gmf} Hz")
    return X, names


# ══════════════════════════════════════════════════════════
# MULTI-CHANNEL FEATURE EXTRACTION
# ══════════════════════════════════════════════════════════

def _time_features(signal):
    """Базовые time-domain признаки (10 штук)."""
    rms = np.sqrt(np.mean(signal**2))
    peak = np.max(np.abs(signal))
    mean_abs = np.mean(np.abs(signal))
    std = np.std(signal)
    return {
        'rms': rms,
        'peak': peak,
        'p2p': np.max(signal) - np.min(signal),
        'crest': peak / rms if rms > 0 else 0,
        'kurtosis': float(stats.kurtosis(signal, fisher=True)) if std > 0 else 0.0,
        'skewness': float(stats.skew(signal)) if std > 0 else 0.0,
        'std': std,
        'mean_abs': mean_abs,
        'shape_f': rms / mean_abs if mean_abs > 0 else 0,
        'impulse_f': peak / mean_abs if mean_abs > 0 else 0,
    }


def _torque_features(signal, fs=FS, f_rot=F_ROT):
    """Признаки канала крутящего момента (7 штук)."""
    f = _time_features(signal)
    # Пульсация момента на частоте вращения
    freqs, spec = compute_fft(signal, fs)
    f['pulsation_frot'] = _peak_at(freqs, spec, f_rot)
    # Убираем лишние для компактности, оставляем 7 ключевых
    return {
        'rms': f['rms'],
        'peak': f['peak'],
        'kurtosis': f['kurtosis'],
        'skewness': f['skewness'],
        'std': f['std'],
        'mean_abs': f['mean_abs'],
        'pulsation_frot': f['pulsation_frot'],
    }


def _cross_channel_features(ch_a, ch_b, fs=FS, gmf=GMF):
    """Кросс-канальные признаки для пары каналов (3 штуки)."""
    f = {}
    # Корреляция Пирсона
    if np.std(ch_a) > 0 and np.std(ch_b) > 0:
        f['corr'] = float(np.corrcoef(ch_a, ch_b)[0, 1])
    else:
        f['corr'] = 0.0

    # Отношение RMS
    rms_a = np.sqrt(np.mean(ch_a**2))
    rms_b = np.sqrt(np.mean(ch_b**2))
    f['rms_ratio'] = rms_a / rms_b if rms_b > 0 else 0.0

    # Когерентность на GMF
    try:
        freqs_c, coh = sp_coherence(ch_a, ch_b, fs=fs, nperseg=min(256, len(ch_a) // 4))
        bw = max(10, gmf * 0.05)
        mask = (freqs_c >= gmf - bw) & (freqs_c <= gmf + bw)
        f['coh_gmf'] = float(np.max(coh[mask])) if np.any(mask) else 0.0
    except Exception:
        f['coh_gmf'] = 0.0

    return f


def extract_multichannel(segment, fs=FS, f_rot=F_ROT, gmf=GMF):
    """Извлекает признаки из мультиканального сегмента.

    Args:
        segment: np.array (n_channels, seg_len)

    Returns:
        dict с именованными признаками
    """
    n_ch = segment.shape[0]
    features = {}

    # ════ Per-channel features ════
    for ch_idx in range(n_ch):
        sig = segment[ch_idx]

        if ch_idx < len(SEU_CHANNELS):
            ch_info = SEU_CHANNELS[ch_idx]
            prefix = ch_info['name']
            ch_type = ch_info['type']
        else:
            prefix = f'ch{ch_idx}'
            ch_type = 'vibration'

        if ch_type == 'torque':
            # Торк — специальные признаки (7)
            tf = _torque_features(sig, fs, f_rot)
            for k, v in tf.items():
                features[f'{prefix}_{k}'] = v
        elif ch_type == 'vibration':
            # Полные 53 вибрационных признака
            vf = extract_features(sig, fs, f_rot, gmf)
            for k, v in vf.items():
                features[f'{prefix}_{k}'] = v

    # ════ Cross-channel features ════
    for ch_a, ch_b in CROSS_CHANNEL_PAIRS:
        if ch_a >= n_ch or ch_b >= n_ch:
            continue
        a_name = SEU_CHANNELS[ch_a]['name'] if ch_a < len(SEU_CHANNELS) else f'ch{ch_a}'
        b_name = SEU_CHANNELS[ch_b]['name'] if ch_b < len(SEU_CHANNELS) else f'ch{ch_b}'
        pair_prefix = f'x_{a_name}_{b_name}'
        cf = _cross_channel_features(segment[ch_a], segment[ch_b], fs, gmf)
        for k, v in cf.items():
            features[f'{pair_prefix}_{k}'] = v

    return features


def extract_batch_multichannel(segments, fs=FS, f_rot=F_ROT, gmf=GMF):
    """Мультиканальное извлечение. segments: (N, n_channels, seg_len)."""
    all_feats, names = [], None
    for seg in segments:
        fd = extract_multichannel(seg, fs, f_rot, gmf)
        if names is None:
            names = list(fd.keys())
        all_feats.append(list(fd.values()))
    X = np.array(all_feats)
    n_ch = segments.shape[1] if segments.ndim == 3 else 1
    print(f"[FEATURES-MC] {X.shape[0]} × {X.shape[1]} признаков | "
          f"{n_ch} каналов | fs={fs} Hz, f_rot={f_rot} Hz, GMF={gmf} Hz")
    return X, names


FEATURE_ORDER = list(extract_features(np.zeros(2560)).keys())
N_FEATURES = len(FEATURE_ORDER)  # 53 (was 47)
FEATURE_ORDER_MC = None  # определяется при первом вызове extract_multichannel
