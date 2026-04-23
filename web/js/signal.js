/**
 * VibroLab — Signal Generator (gear + bearing demos)
 */
const SignalGen = (() => {
  const { FS, DURATION, N_POINTS, F_ROT, GMF } = VM;
  const TWO_PI = 2 * Math.PI;
  const BPFO = F_ROT * 3.58;
  const BPFI = F_ROT * 5.42;
  const BSF = F_ROT * 2.36;
  function randPh() { return Math.random() * TWO_PI; }
  function randn() { return Math.sqrt(-2*Math.log(Math.random())) * Math.cos(TWO_PI*Math.random()); }

  function makeTime() {
    const t = new Float64Array(N_POINTS);
    for (let i = 0; i < N_POINTS; i++) t[i] = i * DURATION / N_POINTS;
    return t;
  }

  function base(t, noise = 0.05) {
    const s = new Float64Array(t.length);
    for (let k = 1; k <= 4; k++) {
      const a = 1/Math.pow(k,1.2), p = randPh();
      for (let i = 0; i < t.length; i++) s[i] += a*Math.sin(TWO_PI*GMF*k*t[i]+p);
    }
    for (let k = 1; k <= 3; k++) {
      const a = 0.1/k, p = randPh();
      for (let i = 0; i < t.length; i++) s[i] += a*Math.sin(TWO_PI*F_ROT*k*t[i]+p);
    }
    for (let i = 0; i < t.length; i++) s[i] += noise*randn();
    return s;
  }

  function addImpulses(signal, t, freq, carrier, amp, width, jitter = 0.0004) {
    const nHits = Math.max(1, Math.floor(DURATION * freq));
    for (let j = 0; j <= nHits; j++) {
      const ti = j / freq + (Math.random() - 0.5) * jitter;
      for (let i = 0; i < t.length; i++) {
        const d = t[i] - ti;
        signal[i] += amp * Math.exp(-(d * d) / (2 * width * width)) * Math.sin(TWO_PI * carrier * d);
      }
    }
  }

  const GENS = {
    normal(t) { return base(t, 0.03+Math.random()*0.05); },

    tooth_chip(t) {
      const s = base(t,0.05), sev = 0.5+Math.random()*2;
      for (let j = 0; j <= DURATION*F_ROT; j++) {
        const ti = j/F_ROT+(Math.random()-0.5)*0.002;
        for (let i = 0; i < t.length; i++) {
          const d = t[i]-ti;
          s[i] += sev*Math.exp(-(d*d)/(2*0.0005*0.0005))*Math.sin(TWO_PI*2000*d);
        }
      }
      for (let k=1;k<=5;k++) for (const sg of [-1,1]) {
        const a=sev*0.15/k, p=randPh(), f=GMF+sg*k*F_ROT;
        for (let i=0;i<t.length;i++) s[i]+=a*Math.sin(TWO_PI*f*t[i]+p);
      }
      return s;
    },

    tooth_miss(t) {
      const s = base(t,0.05), sev = 2+Math.random()*3;
      for (let j = 0; j <= DURATION*F_ROT; j++) {
        const ti = j/F_ROT;
        for (let i=0;i<t.length;i++) {
          const d=t[i]-ti;
          s[i]+=sev*Math.exp(-(d*d)/(2*0.001*0.001))*Math.sin(TWO_PI*2500*d);
        }
      }
      for (let k=1;k<=7;k++) for (const sg of [-1,1]) {
        const a=sev*0.2/k,p=randPh(),f=GMF+sg*k*F_ROT;
        for (let i=0;i<t.length;i++) s[i]+=a*Math.sin(TWO_PI*f*t[i]+p);
      }
      return s;
    },

    root_crack(t) {
      const s = base(t,0.05), sev = 0.3+Math.random()*1.2;
      for (let i=0;i<t.length;i++) s[i]*=(1+sev*0.4*Math.sin(TWO_PI*F_ROT*t[i]));
      for (let k=1;k<=4;k++) for (const sg of [-1,1]) {
        const a=sev*0.12/k,p=randPh(),f=GMF+sg*k*F_ROT;
        for (let i=0;i<t.length;i++) s[i]+=a*Math.sin(TWO_PI*f*t[i]+p);
      }
      for (let i=0;i<t.length;i++) s[i]+=sev*0.1*randn();
      return s;
    },

    surface_wear(t) {
      const s = base(t,0.05), sev = 0.3+Math.random()*1.2;
      for (let i=0;i<t.length;i++) s[i]+=sev*0.5*randn()*Math.abs(Math.sin(TWO_PI*GMF*t[i]));
      for (const d of [2,3]) {
        const a=sev*0.3/d,p=randPh();
        for (let i=0;i<t.length;i++) s[i]+=a*Math.sin(TWO_PI*(GMF/d)*t[i]+p);
      }
      for (let i=0;i<t.length;i++) s[i]+=sev*0.15*randn();
      return s;
    },

    ball_fault(t) {
      const s = base(t, 0.04), sev = 0.4 + Math.random() * 1.0;
      addImpulses(s, t, BSF, 1800, sev * 1.2, 0.00055, 0.0008);
      for (let i = 0; i < t.length; i++) s[i] += sev * 0.12 * randn();
      return s;
    },

    inner_race(t) {
      const s = base(t, 0.04), sev = 0.6 + Math.random() * 1.2;
      addImpulses(s, t, BPFI, 2200, sev * 1.4, 0.00045, 0.0006);
      for (let i = 0; i < t.length; i++) s[i] *= (1 + sev * 0.12 * Math.sin(TWO_PI * F_ROT * t[i]));
      return s;
    },

    outer_race(t) {
      const s = base(t, 0.04), sev = 0.5 + Math.random() * 1.1;
      addImpulses(s, t, BPFO, 2000, sev * 1.3, 0.0005, 0.0003);
      for (let i = 0; i < t.length; i++) s[i] += sev * 0.08 * Math.sin(TWO_PI * BPFO * t[i]);
      return s;
    },

    combination(t) {
      const s = base(t, 0.05), sev = 0.7 + Math.random() * 1.4;
      addImpulses(s, t, BSF, 1700, sev * 0.9, 0.0006, 0.0008);
      addImpulses(s, t, BPFO, 2000, sev * 1.0, 0.00055, 0.0004);
      addImpulses(s, t, BPFI, 2300, sev * 1.1, 0.00045, 0.0005);
      for (let i = 0; i < t.length; i++) s[i] += sev * 0.16 * randn();
      return s;
    },
  };

  return {
    makeTime,
    generate(cls) {
      const generator = GENS[cls] || GENS.normal;
      return generator(makeTime());
    },
  };
})();

const DemoCases = (() => {
  let registry = {};
  let ready = false;
  const CACHE_OPTS = { cache: 'no-store' };

  async function load(url = 'model/demo_cases.json') {
    try {
      const resp = await fetch(url, CACHE_OPTS);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const payload = await resp.json();
      registry = payload?.cases || {};
      ready = Object.keys(registry).length > 0;
      if (ready) {
        console.log('[DEMO] Reference SEU demo cases loaded:', Object.keys(registry).length);
      }
      return ready;
    } catch (e) {
      registry = {};
      ready = false;
      console.warn('[DEMO] demo_cases.json not available, fallback to synthetic generator');
      return false;
    }
  }

  function get(cls) {
    return registry[cls] || null;
  }

  return {
    load,
    get,
    isReady: () => ready,
  };
})();
