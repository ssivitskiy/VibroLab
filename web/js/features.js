/**
 * VibroLab — 53 Features (mirrors python/features.py)
 * 10 time-domain + 29 frequency-domain + 6 normalized + 8 envelope (Hilbert)
 */
const Features = (() => {
  const { FS, F_ROT, GMF } = VM;

  function peakAt(freqs, spec, target, bw) {
    if (!bw) bw = Math.max(5, target * 0.02);
    let mx = 0;
    for (let i = 0; i < freqs.length; i++)
      if (freqs[i] >= target-bw && freqs[i] <= target+bw && spec[i] > mx) mx = spec[i];
    return mx;
  }

  function bandE(freqs, spec, lo, hi) {
    let e = 0;
    for (let i = 0; i < freqs.length; i++)
      if (freqs[i] >= lo && freqs[i] <= hi) e += spec[i]*spec[i];
    return e;
  }

  function mean(a) { let s=0; for (let i=0;i<a.length;i++) s+=a[i]; return s/a.length; }

  function kurtosis(a) {
    const m=mean(a); let m2=0,m4=0;
    for (let i=0;i<a.length;i++){const d=a[i]-m;m2+=d*d;m4+=d*d*d*d;}
    m2/=a.length; m4/=a.length;
    return m2>0?(m4/(m2*m2))-3:0;
  }

  function skewness(a) {
    const m=mean(a); let m2=0,m3=0;
    for (let i=0;i<a.length;i++){const d=a[i]-m;m2+=d*d;m3+=d*d*d;}
    m2/=a.length; m3/=a.length; const s=Math.sqrt(m2);
    return s>0?m3/(s*s*s):0;
  }

  /**
   * Hilbert transform envelope via FFT.
   * FFT → zero negative freqs → double positive → IFFT → abs
   */
  function envelope(signal) {
    const N = signal.length;
    // Pad to power of 2 for FFT
    let M = 1; while (M < N) M <<= 1;
    const padded = new Float64Array(M);
    for (let i = 0; i < N; i++) padded[i] = signal[i];

    // FFT (reuse existing FFT module internals)
    const re = new Float64Array(M), im = new Float64Array(M);
    for (let i = 0; i < M; i++) re[i] = padded[i];
    fftInPlace(re, im, false);

    // Build analytic signal: zero negative freqs, double positive
    // DC and Nyquist stay as-is, positive doubled, negative zeroed
    for (let i = 1; i < M/2; i++) { re[i] *= 2; im[i] *= 2; }
    for (let i = M/2+1; i < M; i++) { re[i] = 0; im[i] = 0; }

    // IFFT
    fftInPlace(re, im, true);

    // Envelope = |analytic|, remove DC
    const env = new Float64Array(N);
    let envMean = 0;
    for (let i = 0; i < N; i++) {
      env[i] = Math.sqrt(re[i]*re[i] + im[i]*im[i]);
      envMean += env[i];
    }
    envMean /= N;
    for (let i = 0; i < N; i++) env[i] -= envMean;
    return env;
  }

  /** In-place radix-2 FFT. inverse=true for IFFT. */
  function fftInPlace(re, im, inverse) {
    const N = re.length;
    // Bit reversal
    for (let i = 1, j = 0; i < N; i++) {
      let bit = N >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    const sign = inverse ? 1 : -1;
    for (let len = 2; len <= N; len <<= 1) {
      const ang = sign * 2 * Math.PI / len;
      const wRe = Math.cos(ang), wIm = Math.sin(ang);
      for (let i = 0; i < N; i += len) {
        let curRe = 1, curIm = 0;
        for (let j = 0; j < len/2; j++) {
          const uRe = re[i+j], uIm = im[i+j];
          const vRe = re[i+j+len/2]*curRe - im[i+j+len/2]*curIm;
          const vIm = re[i+j+len/2]*curIm + im[i+j+len/2]*curRe;
          re[i+j] = uRe + vRe; im[i+j] = uIm + vIm;
          re[i+j+len/2] = uRe - vRe; im[i+j+len/2] = uIm - vIm;
          const t = curRe*wRe - curIm*wIm;
          curIm = curRe*wIm + curIm*wRe;
          curRe = t;
        }
      }
    }
    if (inverse) {
      for (let i = 0; i < N; i++) { re[i] /= N; im[i] /= N; }
    }
  }

  function extract(signal, fs = FS) {
    const N = signal.length;
    let sumSq=0,maxAbs=0,sumV=0,sumAbs=0,minV=Infinity,maxV=-Infinity;
    for (let i=0;i<N;i++){
      const v=signal[i],a=Math.abs(v);
      sumSq+=v*v; sumV+=v; sumAbs+=a;
      if(a>maxAbs)maxAbs=a; if(v<minV)minV=v; if(v>maxV)maxV=v;
    }
    const rms=Math.sqrt(sumSq/N), peak=maxAbs, p2p=maxV-minV;
    const meanV=sumV/N;
    let vr=0; for(let i=0;i<N;i++){const d=signal[i]-meanV;vr+=d*d;}
    const std=Math.sqrt(vr/N), mabs=sumAbs/N;
    const cf=rms>0?peak/rms:0;
    const kurt=std>0?kurtosis(signal):0;
    const skew=std>0?skewness(signal):0;
    const sf=mabs>0?rms/mabs:0, impf=mabs>0?peak/mabs:0;

    const{freqs,spectrum}=FFT.computeSpectrum(signal,fs);
    const nyq=fs/2;

    // GMF harmonics 1x..5x
    const gmf=[]; for(let k=1;k<=5;k++) gmf.push(GMF*k<nyq?peakAt(freqs,spectrum,GMF*k):0);
    // Sidebands ±1..±4
    const sb=[]; for(let k=1;k<=4;k++){
      sb.push(GMF+k*F_ROT<nyq?peakAt(freqs,spectrum,GMF+k*F_ROT):0);
      sb.push(GMF-k*F_ROT>0?peakAt(freqs,spectrum,GMF-k*F_ROT):0);
    }
    // Rotation harmonics 1x..4x
    const frot=[]; for(let k=1;k<=4;k++) frot.push(peakAt(freqs,spectrum,F_ROT*k));
    // Subharmonics
    const sg2=peakAt(freqs,spectrum,GMF/2), sg3=peakAt(freqs,spectrum,GMF/3);
    // Band energies
    const eLow=bandE(freqs,spectrum,0,Math.min(100,nyq));
    const eRot=bandE(freqs,spectrum,Math.max(0,F_ROT-10),Math.min(F_ROT*5+10,nyq));
    const eGmf=bandE(freqs,spectrum,Math.max(0,GMF-100),Math.min(GMF+100,nyq));
    const eGmf2=bandE(freqs,spectrum,Math.max(0,GMF*2-100),Math.min(GMF*2+100,nyq));
    const eHigh=bandE(freqs,spectrum,Math.min(GMF*3,nyq*0.6),nyq);
    const eTotal=bandE(freqs,spectrum,0,nyq);
    const rG=eTotal>0?eGmf/eTotal:0, rR=eTotal>0?eRot/eTotal:0, rH=eTotal>0?eHigh/eTotal:0;
    let sbSum=0; for(let i=0;i<sb.length;i++) sbSum+=sb[i];
    const sbR=gmf[0]>0?sbSum/gmf[0]:0;

    // ── Normalized features (speed-invariant, 6) ──
    const gmf2Norm=gmf[0]>0?gmf[1]/gmf[0]:0;
    const gmf3Norm=gmf[0]>0?gmf[2]/gmf[0]:0;
    const sbAsym1=(sb[0]+sb[1])>0?Math.abs(sb[0]-sb[1])/(sb[0]+sb[1]):0;
    const sbAsym2=(sb[2]+sb[3])>0?Math.abs(sb[2]-sb[3])/(sb[2]+sb[3]):0;
    const rL=eTotal>0?eLow/eTotal:0;
    const rGmf2Gmf=eGmf>0?eGmf2/eGmf:0;

    // ── Envelope features (Hilbert) ──
    let envRms=0,envPeak=0,envKurt=0,envCrest=0;
    let envF1=0,envF2=0,envF3=0,envMod=0;
    try {
      const env = envelope(signal);
      let eSq=0,eMax=0;
      for(let i=0;i<env.length;i++){eSq+=env[i]*env[i];const a=Math.abs(env[i]);if(a>eMax)eMax=a;}
      envRms=Math.sqrt(eSq/env.length);
      envPeak=eMax;
      envKurt=envRms>0?kurtosis(env):0;
      envCrest=envRms>0?envPeak/envRms:0;
      // Envelope spectrum
      const envSpec=FFT.computeSpectrum(env,fs);
      envF1=peakAt(envSpec.freqs,envSpec.spectrum,F_ROT);
      envF2=peakAt(envSpec.freqs,envSpec.spectrum,F_ROT*2);
      envF3=peakAt(envSpec.freqs,envSpec.spectrum,F_ROT*3);
      const envERot=bandE(envSpec.freqs,envSpec.spectrum,F_ROT-5,F_ROT*4+5);
      const envETotal=bandE(envSpec.freqs,envSpec.spectrum,0,nyq);
      envMod=envETotal>0?envERot/envETotal:0;
    } catch(e) {}

    return [rms,peak,p2p,cf,kurt,skew,std,mabs,sf,impf,
            ...gmf,...sb,...frot,sg2,sg3,
            eLow,eRot,eGmf,eGmf2,eHigh,eTotal,rG,rR,rH,sbR,
            gmf2Norm,gmf3Norm,sbAsym1,sbAsym2,rL,rGmf2Gmf,
            envRms,envPeak,envKurt,envCrest,envF1,envF2,envF3,envMod];
  }

  const NAMES = [
    'rms','peak','peak_to_peak','crest_factor','kurtosis','skewness','std','mean_abs','shape_factor','impulse_factor',
    'gmf_1x','gmf_2x','gmf_3x','gmf_4x','gmf_5x',
    'sb_plus_1','sb_minus_1','sb_plus_2','sb_minus_2','sb_plus_3','sb_minus_3','sb_plus_4','sb_minus_4',
    'frot_1x','frot_2x','frot_3x','frot_4x','sub_gmf_2','sub_gmf_3',
    'energy_low','energy_rot','energy_gmf','energy_gmf2','energy_high','energy_total',
    'ratio_gmf_total','ratio_rot_total','ratio_high_total','sideband_ratio',
    'gmf_2x_norm','gmf_3x_norm','sb_asym_1','sb_asym_2','ratio_low_total','ratio_gmf2_gmf',
    'env_rms','env_peak','env_kurtosis','env_crest','env_frot_1x','env_frot_2x','env_frot_3x','env_mod_index'
  ];

  return { extract, NAMES };
})();
