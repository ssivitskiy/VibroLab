/**
 * VibroLab — Config (SEU full dataset aware)
 */

const CLASS_LIBRARY = {
  normal: {
    label: 'Норма',
    color: '#00e5ff',
    icon: '✓',
    descriptions: {
      sig: 'Стабильный периодический сигнал с чистыми гармониками и умеренным шумом.',
      spec: 'Выраженные рабочие гармоники без аномальных боковых полос и ударных компонентов.',
      diag: 'Сигнал соответствует исправному состоянию. Явных признаков дефекта не обнаружено.',
    },
  },
  tooth_chip: {
    label: 'Скол зуба',
    color: '#fb923c',
    icon: '⚡',
    descriptions: {
      sig: 'Импульсные удары с частотой вращения. Повышенный куртозис.',
      spec: 'Боковые полосы GMF ± k·f_rot, широкополосные компоненты.',
      diag: 'Обнаружен скол зуба. Рекомендуется контроль при ближайшем ТО. Критичность: средняя.',
    },
  },
  tooth_miss: {
    label: 'Отсутствие зуба',
    color: '#f87171',
    icon: '✕',
    descriptions: {
      sig: 'Сильные импульсы, выраженная модуляция. Очень высокий куртозис.',
      spec: 'Интенсивные боковые полосы, высокочастотный шум, потеря GMF-структуры.',
      diag: 'Отсутствие зуба — критический дефект. Рекомендуется немедленная остановка и замена.',
    },
  },
  root_crack: {
    label: 'Трещина корня',
    color: '#a78bfa',
    icon: '⚠',
    descriptions: {
      sig: 'Амплитудная модуляция на частоте вращения. Нестабильность амплитуды.',
      spec: 'Модулированные GMF-пики и характерный рисунок боковых полос.',
      diag: 'Выявлена трещина у основания зуба. Высокий риск развития разрушения.',
    },
  },
  surface_wear: {
    label: 'Износ поверхности',
    color: '#fbbf24',
    icon: '◎',
    descriptions: {
      sig: 'Широкополосный шум поверх основного сигнала. Микропиттинг.',
      spec: 'Повышенный шумовой пол, субгармоники и рост высокочастотной энергии.',
      diag: 'Обнаружен износ поверхности. Проверьте смазку, зацепление и динамику нагрузки.',
    },
  },
  ball_fault: {
    label: 'Дефект шарика',
    color: '#34d399',
    icon: '●',
    descriptions: {
      sig: 'Периодические ударные события на частоте качения элемента. Локальные всплески амплитуды.',
      spec: 'Повышенная энергия в зоне BSF и её гармоник, модуляция огибающей.',
      diag: 'Есть признаки повреждения тела качения. Нужен контроль вибрации и плановая замена.',
    },
  },
  inner_race: {
    label: 'Внутренняя обойма',
    color: '#38bdf8',
    icon: '◌',
    descriptions: {
      sig: 'Частые импульсы с выраженной модуляцией и нестабильной амплитудой.',
      spec: 'Рост энергии около BPFI, множественные гармоники и огибающая.',
      diag: 'Обнаружен дефект внутренней обоймы. Рекомендуется сократить интервал обслуживания.',
    },
  },
  outer_race: {
    label: 'Наружная обойма',
    color: '#f472b6',
    icon: '◉',
    descriptions: {
      sig: 'Стационарные повторяющиеся удары, более стабильные по амплитуде.',
      spec: 'Рост энергии около BPFO и устойчивые повторяющиеся импульсные компоненты.',
      diag: 'Обнаружен дефект наружной обоймы. Требуется осмотр подшипника и оценка ресурса.',
    },
  },
  combination: {
    label: 'Комбинированный',
    color: '#c084fc',
    icon: '◆',
    descriptions: {
      sig: 'Сложный составной сигнал с несколькими типами ударных событий.',
      spec: 'Суперпозиция нескольких характерных частот и широкий спектральный фон.',
      diag: 'Выявлены признаки комбинированного дефекта. Вероятно одновременное развитие нескольких повреждений.',
    },
  },
};

const DEFAULT_CLASSES = ['normal', 'tooth_chip', 'tooth_miss', 'root_crack', 'surface_wear'];
const FALLBACK_COLORS = ['#00e5ff', '#fb923c', '#f87171', '#a78bfa', '#fbbf24', '#34d399', '#38bdf8', '#f472b6', '#c084fc'];
const GENERIC_DESCRIPTION = {
  sig: 'Сигнал загружен и готов к анализу.',
  spec: 'Спектр рассчитан. Используется описание из экспортированной модели.',
  diag: 'Предсказание выполнено. Уточняйте интерпретацию по метрикам модели и истории оборудования.',
};

const VM = {
  FS: 5120,
  DURATION: 0.5,
  N_POINTS: 2560,
  F_ROT: 20.0,
  Z_PINION: 20,
  Z_GEAR: 40,
  GMF: 400.0,

  CLASSES: [],
  RU: {},
  COLORS: {},
  ICONS: {},
  DESCRIPTIONS: {},

  MODEL_TYPES: {
    rf: { name: 'Random Forest', file: 'rf_model.json', type: 'classifier' },
    cnn: { name: '1D-CNN', file: 'cnn_model.onnx', type: 'classifier' },
    lstm: { name: 'Bi-GRU', file: 'lstm_model.onnx', type: 'classifier' },
    ae: { name: 'Autoencoder', file: 'autoencoder.onnx', type: 'anomaly' },
    rul: { name: 'RUL Estimator', file: 'rul_model.onnx', type: 'regression' },
  },

  HEALTH: {
    good: { label: 'Исправен', color: '#00e5ff', icon: '✓' },
    warning: { label: 'Внимание', color: '#fbbf24', icon: '⚠' },
    critical: { label: 'Критично', color: '#f87171', icon: '✕' },
  },
};

VM.syncMeta = function syncMeta(meta = null) {
  const classes = Array.isArray(meta?.classes) && meta.classes.length
    ? meta.classes.slice()
    : DEFAULT_CLASSES.slice();
  const classLabels = meta?.class_labels_ru || {};

  this.CLASSES = classes;
  this.RU = {};
  this.COLORS = {};
  this.ICONS = {};
  this.DESCRIPTIONS = {};

  classes.forEach((cls, idx) => {
    const lib = CLASS_LIBRARY[cls] || {};
    this.RU[cls] = classLabels[cls] || lib.label || cls;
    this.COLORS[cls] = lib.color || FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
    this.ICONS[cls] = lib.icon || '•';
    this.DESCRIPTIONS[cls] = lib.descriptions || GENERIC_DESCRIPTION;
  });
};

VM.sourceLabel = function sourceLabel(meta) {
  if (!meta) return '—';
  if (meta.source === 'synthetic') return 'Синтетика';
  if (meta.dataset_scope === 'combined') return 'SEU Full Dataset';
  if (meta.dataset_scope === 'bearing') return 'SEU Bearing';
  if (meta.dataset_scope === 'gear') return 'SEU Gear';
  return 'SEU Dataset';
};

VM.syncMeta();
