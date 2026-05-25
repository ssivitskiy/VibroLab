"""
Leave-One-Speed-Out (LOSO) validation.

Train on one speed (20 Hz), test on another (30 Hz) and vice versa.
"""

import os
import sys
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import accuracy_score, f1_score, classification_report

THIS = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, THIS)

from config import RF_PARAMS, RANDOM_SEED  # type: ignore
from features import extract_batch  # type: ignore
from train_optimal import load_data_with_groups  # type: ignore


def loso_eval(X, y_idx, speed_groups, classes_):
    speeds = sorted(set(int(s) for s in speed_groups))
    print(f'\n[LOSO] Speeds detected: {speeds}')
    if len(speeds) < 2:
        print('[!] Need ≥2 speeds for LOSO')
        return

    sg = np.asarray(speed_groups, dtype=int)
    yy = np.asarray(y_idx, dtype=int)

    results = {}
    for test_speed in speeds:
        train_mask = sg != test_speed
        test_mask = sg == test_speed
        n_train, n_test = int(train_mask.sum()), int(test_mask.sum())

        print('\n' + '=' * 70)
        print(f'  TRAIN: {[s for s in speeds if s != test_speed]} Hz ({n_train} samples)')
        print(f'  TEST : {test_speed} Hz ({n_test} samples)')
        print('=' * 70)

        scaler = StandardScaler()
        X_tr = scaler.fit_transform(X[train_mask])
        X_te = scaler.transform(X[test_mask])
        y_tr, y_te = yy[train_mask], yy[test_mask]

        rf_params = {**RF_PARAMS}
        rf_params.setdefault('random_state', RANDOM_SEED)
        rf_params.setdefault('n_jobs', -1)
        rf = RandomForestClassifier(**rf_params)
        rf.fit(X_tr, y_tr)
        y_pred = rf.predict(X_te)

        acc = accuracy_score(y_te, y_pred)
        f1 = f1_score(y_te, y_pred, average='weighted')
        results[test_speed] = {'acc': acc, 'f1': f1}

        print(f'\n  Accuracy: {acc:.4f}  |  F1 (weighted): {f1:.4f}')

        labels_present = sorted(set(y_te) | set(y_pred))
        names = [classes_[i] if i < len(classes_) else str(i) for i in labels_present]
        try:
            print('\n  Classification report:')
            for line in classification_report(y_te, y_pred, labels=labels_present,
                                               target_names=names, zero_division=0).split('\n'):
                print('  ' + line)
        except Exception as e:
            print(f'  [report failed: {e}]')

    print('\n' + '=' * 70)
    print('  LOSO SUMMARY')
    print('=' * 70)
    for spd, r in results.items():
        print(f'  Test on {spd} Hz: acc={r["acc"]:.4f}  f1={r["f1"]:.4f}')
    if results:
        mean_acc = np.mean([r['acc'] for r in results.values()])
        mean_f1  = np.mean([r['f1']  for r in results.values()])
        print(f'\n  Mean across speeds:  acc={mean_acc:.4f}  f1={mean_f1:.4f}')
    print('=' * 70)
    return results


def main():
    data_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(THIS, 'data', 'gear')
    print(f'[LOSO] Loading raw signals from: {data_dir}')

    # Returns: signals, labels(str), label_indices(int), classes, file_groups, speed_groups
    signals, labels, label_idx, classes_, file_groups, speed_groups = load_data_with_groups(
        data_dir, multichannel=False)
    print(f'[LOSO] {len(signals)} raw signals × {len(signals[0])} samples each, '
          f'{len(classes_)} classes')

    print('[LOSO] Extracting 53 features per segment...')
    X, names = extract_batch(signals)
    print(f'[LOSO] Feature matrix: {X.shape[0]} × {X.shape[1]}')

    loso_eval(X, label_idx, speed_groups, classes_)


if __name__ == '__main__':
    main()
