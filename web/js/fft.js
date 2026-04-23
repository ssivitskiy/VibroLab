/**
 * VibroLab — FFT (быстрое преобразование Фурье)
 * Radix-2 Cooley-Tukey FFT для спектрального анализа.
 */

const FFT = (() => {
  function fft(re, im) {
    const N = re.length;
    if (N <= 1) return;

    // Bit-reversal permutation
    for (let i = 1, j = 0; i < N; i++) {
      let bit = N >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
    }

    // FFT butterfly
    for (let len = 2; len <= N; len <<= 1) {
      const ang = -2 * Math.PI / len;
      const wRe = Math.cos(ang), wIm = Math.sin(ang);
      for (let i = 0; i < N; i += len) {
        let curRe = 1, curIm = 0;
        for (let j = 0; j < len / 2; j++) {
          const a = i + j, b = i + j + len / 2;
          const tRe = curRe * re[b] - curIm * im[b];
          const tIm = curRe * im[b] + curIm * re[b];
          re[b] = re[a] - tRe;
          im[b] = im[a] - tIm;
          re[a] += tRe;
          im[a] += tIm;
          const newRe = curRe * wRe - curIm * wIm;
          curIm = curRe * wIm + curIm * wRe;
          curRe = newRe;
        }
      }
    }
  }

  /**
   * Вычисляет амплитудный спектр сигнала.
   * @param {Float64Array} signal — входной сигнал
   * @param {number} fs — частота дискретизации
   * @returns {{freqs: Float64Array, spectrum: Float64Array}}
   */
  function computeSpectrum(signal, fs = VM.FS) {
    // Pad to next power of 2
    const N0 = signal.length;
    let N = 1;
    while (N < N0) N <<= 1;

    const re = new Float64Array(N);
    const im = new Float64Array(N);
    for (let i = 0; i < N0; i++) re[i] = signal[i];

    fft(re, im);

    const half = N / 2 + 1;
    const freqs = new Float64Array(half);
    const spectrum = new Float64Array(half);

    // NOTE: Amplitude normalization uses the ORIGINAL signal length (N0),
    // not the zero-padded length (N). This matches scipy.fft.rfft behavior:
    // for a sinusoid of amplitude A, the peak magnitude should be A regardless
    // of zero-padding. Dividing by N (padded) would underestimate amplitudes
    // by a factor of N0/N.
    for (let k = 0; k < half; k++) {
      freqs[k] = k * fs / N;
      spectrum[k] = 2 * Math.sqrt(re[k] * re[k] + im[k] * im[k]) / N0;
    }
    spectrum[0] /= 2; // DC component

    return { freqs, spectrum, N };
  }

  return { computeSpectrum };
})();
