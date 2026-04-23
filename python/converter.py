"""
VibroLab — Универсальный конвертер вибросигналов.

Поддерживаемые форматы:
  WAV, CSV, TSV, MAT (MATLAB), TDMS (NI LabVIEW), UFF/UNV, NPY/NPZ

Использование:
  python converter.py wav2csv input.wav output.csv
  python converter.py csv2wav input.csv output.wav [--sr 5120]
  python converter.py mat2csv input.mat output.csv [--key signal] [--sr 12000]
  python converter.py tdms2csv input.tdms output.csv
  python converter.py any2wav input.mat output.wav [--sr 5120]
  python converter.py any2csv input.tdms output.csv
  python converter.py info input.wav
  python converter.py info input.mat
"""

import argparse
import csv
import struct
import os
import numpy as np


def read_wav(path):
    """Читает WAV → (sample_rate, data as float64 array)."""
    with open(path, 'rb') as f:
        # RIFF header
        riff = f.read(4)
        if riff != b'RIFF':
            raise ValueError(f"Not a WAV file: {path}")
        f.read(4)  # file size
        wave = f.read(4)
        if wave != b'WAVE':
            raise ValueError("Invalid WAV format")

        fmt_found = False
        data_found = False
        sample_rate = 0
        bits_per_sample = 16
        num_channels = 1
        audio_data = None

        while True:
            chunk_id = f.read(4)
            if len(chunk_id) < 4:
                break
            chunk_size = struct.unpack('<I', f.read(4))[0]

            if chunk_id == b'fmt ':
                fmt_data = f.read(chunk_size)
                struct.unpack('<H', fmt_data[0:2])  # audio_format (unused)
                num_channels = struct.unpack('<H', fmt_data[2:4])[0]
                sample_rate = struct.unpack('<I', fmt_data[4:8])[0]
                bits_per_sample = struct.unpack('<H', fmt_data[14:16])[0]
                fmt_found = True

            elif chunk_id == b'data':
                raw = f.read(chunk_size)
                if bits_per_sample == 16:
                    samples = np.frombuffer(raw, dtype=np.int16).astype(np.float64) / 32768.0
                elif bits_per_sample == 24:
                    n = len(raw) // 3
                    samples = np.zeros(n, dtype=np.float64)
                    for i in range(n):
                        b = raw[i * 3:(i + 1) * 3]
                        val = struct.unpack('<i', b + (b'\xff' if b[2] & 0x80 else b'\x00'))[0]
                        samples[i] = val / 8388608.0
                elif bits_per_sample == 32:
                    samples = np.frombuffer(raw, dtype=np.float32).astype(np.float64)
                else:
                    raise ValueError(f"Unsupported bit depth: {bits_per_sample}")

                if num_channels > 1:
                    samples = samples.reshape(-1, num_channels)[:, 0]  # mono: first channel
                audio_data = samples
                data_found = True
            else:
                f.read(chunk_size)

        if not fmt_found or not data_found:
            raise ValueError("Incomplete WAV file")

    return sample_rate, audio_data


def write_wav(path, data, sample_rate=5120, bits=16):
    """Записывает float64 array → WAV (16-bit PCM mono)."""
    data = np.asarray(data, dtype=np.float64)
    # Normalize to [-1, 1]
    peak = np.max(np.abs(data))
    if peak > 0:
        data = data / peak * 0.95

    if bits == 16:
        pcm = (data * 32767).astype(np.int16)
        raw = pcm.tobytes()
    else:
        raise ValueError("Only 16-bit supported for export")

    num_channels = 1
    byte_rate = sample_rate * num_channels * (bits // 8)
    block_align = num_channels * (bits // 8)
    data_size = len(raw)

    with open(path, 'wb') as f:
        # RIFF header
        f.write(b'RIFF')
        f.write(struct.pack('<I', 36 + data_size))
        f.write(b'WAVE')
        # fmt chunk
        f.write(b'fmt ')
        f.write(struct.pack('<I', 16))         # chunk size
        f.write(struct.pack('<H', 1))          # PCM
        f.write(struct.pack('<H', num_channels))
        f.write(struct.pack('<I', sample_rate))
        f.write(struct.pack('<I', byte_rate))
        f.write(struct.pack('<H', block_align))
        f.write(struct.pack('<H', bits))
        # data chunk
        f.write(b'data')
        f.write(struct.pack('<I', data_size))
        f.write(raw)


def wav_to_csv(wav_path, csv_path):
    """WAV → CSV (one column: amplitude)."""
    sr, data = read_wav(wav_path)
    write_csv(csv_path, data, sr)
    print(f"[WAV→CSV] {wav_path} → {csv_path}")
    print(f"  Sample rate: {sr} Hz | Samples: {len(data)} | Duration: {len(data) / sr:.3f}s")


def write_csv(csv_path, data, sample_rate=5120):
    """Write amplitude data to CSV."""
    with open(csv_path, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['sample_index', 'time_s', 'amplitude'])
        for i, val in enumerate(data):
            writer.writerow([i, round(i / sample_rate, 8), round(float(val), 8)])


def read_csv(csv_path):
    """Read CSV → (sample_rate, data). Returns (5120, np.array) by default."""
    data = []
    sample_rate = 5120
    with open(csv_path, 'r') as f:
        reader = csv.reader(f)
        header = next(reader, None)
        amp_col = None
        if header:
            for i, h in enumerate(header):
                if h.strip().lower() in ('amplitude', 'amp', 'value', 'signal', 'vibration'):
                    amp_col = i
                    break
            if amp_col is None:
                try:
                    float(header[-1])
                    data.append(float(header[-1]))
                    amp_col = len(header) - 1
                except ValueError:
                    amp_col = len(header) - 1
            # Try to detect sample rate from time column
            time_col = None
            for i, h in enumerate(header):
                if h.strip().lower() in ('time_s', 'time', 't'):
                    time_col = i
                    break

        rows_for_sr = []
        for row in reader:
            if row and amp_col is not None and amp_col < len(row):
                try:
                    data.append(float(row[amp_col]))
                    if time_col is not None and len(rows_for_sr) < 2:
                        rows_for_sr.append(float(row[time_col]))
                except ValueError:
                    continue

        if len(rows_for_sr) == 2 and rows_for_sr[1] > rows_for_sr[0]:
            sample_rate = int(round(1.0 / (rows_for_sr[1] - rows_for_sr[0])))

    return sample_rate, np.array(data)


def csv_to_wav(csv_path, wav_path, sample_rate=5120):
    """CSV → WAV."""
    sr, data = read_csv(csv_path)
    if sample_rate:
        sr = sample_rate
    write_wav(wav_path, data, sr)
    print(f"[CSV→WAV] {csv_path} → {wav_path}")
    print(f"  Sample rate: {sample_rate} Hz | Samples: {len(data)} | Duration: {len(data) / sample_rate:.3f}s")


def mat_to_csv(mat_path, csv_path, key=None, sample_rate=None):
    """MAT → CSV. Извлекает сигнал из MATLAB файла."""
    from datasets import read_mat_file
    data = read_mat_file(mat_path, key=key)
    sr = sample_rate or 5120
    write_csv(csv_path, data, sr)
    print(f"[MAT→CSV] {mat_path} → {csv_path}")
    print(f"  Key: {key or 'auto'} | Samples: {len(data)} | Duration: {len(data) / sr:.3f}s")


def tdms_to_csv(tdms_path, csv_path, sample_rate=None):
    """TDMS → CSV."""
    from datasets import read_tdms_file
    data = read_tdms_file(tdms_path)
    sr = sample_rate or 5120
    write_csv(csv_path, data, sr)
    print(f"[TDMS→CSV] {tdms_path} → {csv_path}")
    print(f"  Samples: {len(data)} | Duration: {len(data) / sr:.3f}s")


def any_to_wav(input_path, wav_path, sample_rate=5120):
    """Любой формат → WAV."""
    from datasets import read_any_format
    data = read_any_format(input_path)
    write_wav(wav_path, data, sample_rate)
    print(f"[→WAV] {input_path} → {wav_path}")
    print(f"  Samples: {len(data)} | Duration: {len(data) / sample_rate:.3f}s")


def any_to_csv(input_path, csv_path, sample_rate=5120):
    """Любой формат → CSV."""
    from datasets import read_any_format
    data = read_any_format(input_path)
    write_csv(csv_path, data, sample_rate)
    print(f"[→CSV] {input_path} → {csv_path}")
    print(f"  Samples: {len(data)} | Duration: {len(data) / sample_rate:.3f}s")


def info(path):
    """Показывает информацию о файле (WAV, MAT, CSV, TDMS)."""
    ext = os.path.splitext(path)[1].lower()

    if ext == '.wav':
        sr, data = read_wav(path)
        print(f"[INFO] {path} (WAV)")
        print(f"  Sample rate:  {sr} Hz")
    elif ext == '.mat':
        from datasets import read_mat_file
        data = read_mat_file(path)
        sr = 5120  # default, unknown without metadata
        print(f"[INFO] {path} (MATLAB)")
        print(f"  Sample rate:  unknown (assuming {sr} Hz)")
    elif ext == '.tdms':
        from datasets import read_tdms_file
        data = read_tdms_file(path)
        sr = 5120
        print(f"[INFO] {path} (TDMS)")
        print(f"  Sample rate:  unknown (assuming {sr} Hz)")
    elif ext in ('.uff', '.unv'):
        from datasets import read_uff_file
        data = read_uff_file(path)
        sr = 5120
        print(f"[INFO] {path} (UFF)")
        print(f"  Sample rate:  unknown (assuming {sr} Hz)")
    else:
        sr, data = read_csv(path)
        print(f"[INFO] {path} (CSV/Text)")
        print(f"  Sample rate:  {sr} Hz")

    print(f"  Samples:      {len(data)}")
    print(f"  Duration:     {len(data) / sr:.3f} s")
    print(f"  Min:          {data.min():.6f}")
    print(f"  Max:          {data.max():.6f}")
    print(f"  RMS:          {np.sqrt(np.mean(data**2)):.6f}")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='VibroLab Universal Converter')
    parser.add_argument('command', choices=[
        'wav2csv', 'csv2wav', 'mat2csv', 'tdms2csv',
        'any2wav', 'any2csv', 'info',
    ])
    parser.add_argument('input', help='Input file path')
    parser.add_argument('output', nargs='?', help='Output file path')
    parser.add_argument('--sr', type=int, default=5120, help='Sample rate (default: 5120)')
    parser.add_argument('--key', type=str, default=None, help='MAT variable name')
    args = parser.parse_args()

    out = args.output or os.path.splitext(args.input)[0]

    if args.command == 'wav2csv':
        wav_to_csv(args.input, out + '.csv' if not args.output else args.output)
    elif args.command == 'csv2wav':
        csv_to_wav(args.input, out + '.wav' if not args.output else args.output, args.sr)
    elif args.command == 'mat2csv':
        mat_to_csv(args.input, out + '.csv' if not args.output else args.output,
                   key=args.key, sample_rate=args.sr)
    elif args.command == 'tdms2csv':
        tdms_to_csv(args.input, out + '.csv' if not args.output else args.output,
                    sample_rate=args.sr)
    elif args.command == 'any2wav':
        any_to_wav(args.input, out + '.wav' if not args.output else args.output, args.sr)
    elif args.command == 'any2csv':
        any_to_csv(args.input, out + '.csv' if not args.output else args.output, args.sr)
    elif args.command == 'info':
        info(args.input)
