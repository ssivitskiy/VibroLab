/**
 * VibroLab — Main App
 * Loads model/meta.json for dynamic UI: confusion matrix, metrics, importances.
 */

const App = (() => {
  let currentStop = null, diagLocked = false, currentSignalData = null;
  let meta = null; // loaded from meta.json
  let currentInputContext = { type: 'demo', label: 'Demo signal' };
  let currentDiagnosis = null;
  let currentSourceFile = null;
  let authState = null;
  let sessionHistory = [];
  let assetRegistry = [];
  let measurementRegistry = [];
  let reportRegistry = [];
  let alertRegistry = [];
  let alertEventRegistry = {};
  let selectedAlertId = null;
  let alertStatusFilter = 'all';
  let alertSortMode = 'priority';
  let analysisGuideMode = 'first_time';
  let activeStudyLabId = 'intro_baseline';
  let studyLabState = null;
  let journeyOnboardingState = null;
  let journeyDraftState = null;
  let autosaveTimer = 0;
  let autosavePaused = false;
  let autosaveMeta = { savedAt: null, restoredAt: null };
  let apiReady = false;
  let dashboardSummary = null;
  let selectedAssetId = null;
  let compareBaselineId = null;
  let compareTargetId = null;
  let analysisCompareAssetId = null;
  let analysisCompareMode = 'baseline_current';
  let analysisCompareReferenceId = null;
  let analysisCompareTargetId = '__current';
  let selectedReportInspectionId = null;
  let assetSearchQuery = '';
  let assetStatusFilter = 'all';
  let assetRiskFilter = 'all';
  let assetSortMode = 'priority';
  let initialRouteApplied = false;
  const ASSET_VERSION = '20260417-product-copy-18';
  const initialRoute = (() => {
    const params = new URLSearchParams(window.location.search);
    return {
      page: params.get('page') || null,
      section: params.get('section') || null,
      demo: params.get('demo') || null,
      guide: params.get('guide') || null,
      lab: params.get('lab') || null,
    };
  })();
  const STORAGE_KEYS = {
    legacyAuth: 'vm_local_auth_v1',
    legacySessions: 'vm_local_sessions_v1',
    legacyImportDone: 'vm_server_import_done_v1',
    studyLabs: 'vm_guided_labs_v1',
    journeyOnboarding: 'vm_journey_onboarding_v1',
    journeyDraft: 'vm_journey_draft_v1',
  };
  const runtime = window.VIBROLAB_RUNTIME || {};
  const API_BASE = runtime.apiBase || '/api';
  const STORAGE_LIMITS = {
    sessions: 24,
    signalSamples: 4096,
  };
  const STATE_ALIASES = {
    baseline: 'healthy',
    healthy: 'healthy',
    monitor: 'warning',
    inspect: 'warning',
    warning: 'warning',
    critical: 'warning',
    service: 'service',
    after_maintenance: 'after_maintenance',
  };
  const SESSION_STATES = {
    healthy: { label: 'Healthy', tone: 'good', note: 'Эталонное или восстановленное состояние узла.' },
    warning: { label: 'Warning', tone: 'warning', note: 'Есть признаки деградации, нужен контроль и сравнение в динамике.' },
    service: { label: 'Service', tone: 'warning', note: 'Узел находится в сервисном цикле или требует ремонта.' },
    after_maintenance: { label: 'After maintenance', tone: 'good', note: 'Состояние после обслуживания или замены, используется для проверки эффекта ремонта.' },
  };
  const WORK_STATUSES = {
    observe: { label: 'Наблюдать', tone: 'good', note: 'Продолжить мониторинг и повторный замер по графику.' },
    inspect: { label: 'Проверить', tone: 'warning', note: 'Нужен дополнительный осмотр или повторная диагностика.' },
    repair: { label: 'Ремонт', tone: 'warning', note: 'Оборудование отправлено в обслуживание или ремонт.' },
    replaced: { label: 'Заменено', tone: 'good', note: 'Дефектный узел заменён или восстановлен.' },
  };
  const RISK_LEVELS = {
    low: { key: 'low', label: 'Low risk', tone: 'good', note: 'Базовое или восстановленное состояние узла.' },
    medium: { key: 'medium', label: 'Medium risk', tone: 'warning', note: 'Есть признаки деградации, но ситуация ещё контролируема.' },
    high: { key: 'high', label: 'High risk', tone: 'warning', note: 'Нужен ремонт или сокращение интервала эксплуатации.' },
    critical: { key: 'critical', label: 'Critical risk', tone: 'critical', note: 'Требуется немедленное вмешательство и жёсткий контроль.' },
  };
  const ALERT_STATUSES = {
    new: { label: 'New', tone: 'critical', note: 'Новый alert пока не подтверждён инженером.' },
    acknowledged: { label: 'Acknowledged', tone: 'warning', note: 'Alert подтверждён и ожидает инженерного действия.' },
    in_progress: { label: 'In progress', tone: 'info', note: 'По alert-у уже идёт работа или ремонтный цикл.' },
    resolved: { label: 'Resolved', tone: 'good', note: 'Alert закрыт после выполненного действия или контрольной записи.' },
  };
  const ALERT_SEVERITY_ORDER = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  };
  const ALERT_STATUS_ORDER = {
    resolved: 1,
    in_progress: 2,
    acknowledged: 3,
    new: 4,
  };
  const PLAYBOOK = {
    normal: {
      tone: 'good',
      badge: 'БАЗОВЫЙ СИГНАЛ',
      severity: 'Низкий риск',
      action: 'Оборудование можно оставить в работе и использовать сигнал как эталон для будущих сравнений.',
      reason: 'Сигнал чистый, без аномальных ударов и выраженных боковых полос вокруг рабочих гармоник.',
      short: 'Использовать как baseline для сравнения с дефектными кейсами.',
      priority: 'Продолжить мониторинг по графику',
      plainLanguage: 'Оборудование работает штатно. В спектре нет лишних всплесков на характерных частотах — значит, вибрация вызвана только нормальной работой механизма.',
      nextStep: 'Сохранить замер как эталон и вернуться через запланированный интервал.',
    },
    tooth_chip: {
      tone: 'warning',
      badge: 'РАННИЙ ДЕФЕКТ',
      severity: 'Средний риск',
      action: 'Запланировать инспекцию зубчатой пары на ближайшее окно ТО и проверить динамику нагрузки.',
      reason: 'Есть ударные события и боковые полосы вокруг GMF, характерные для локального повреждения зуба.',
      short: 'Хороший кейс для демонстрации раннего обнаружения gear fault.',
      priority: 'Осмотр в ближайший сервисный интервал',
      plainLanguage: 'Похоже на скол или выкрашивание на одном зубе шестерни. При каждом обороте этот зуб даёт короткий удар — в спектре это выглядит как боковые полосы вокруг частоты зацепления.',
      nextStep: 'Запланировать осмотр зубчатой пары на ближайшем ТО, следить за динамикой.',
    },
    tooth_miss: {
      tone: 'critical',
      badge: 'КРИТИЧЕСКИЙ ДЕФЕКТ',
      severity: 'Критический риск',
      action: 'Остановить оборудование, проверить зубчатую пару и не возвращать узел в работу без осмотра.',
      reason: 'Наблюдаются сильные импульсы, разлом структуры GMF и высокий риск быстрого разрушения зацепления.',
      short: 'Максимальный вау-эффект: критический кейс с очевидным action item.',
      priority: 'Немедленное вмешательство',
      plainLanguage: 'Зуб выкрошился или отсутствует — узел работает на грани отказа. Сильные периодические удары буквально ломают структуру спектра зацепления.',
      nextStep: 'Остановить оборудование и не запускать до ручного осмотра зацепления.',
    },
    root_crack: {
      tone: 'critical',
      badge: 'ВЫСОКИЙ РИСК',
      severity: 'Высокий риск',
      action: 'Сократить интервал эксплуатации до инспекции и проверить корень зуба на развитие трещины.',
      reason: 'Модуляция амплитуды и характерная бокополосная структура указывают на развивающееся разрушение.',
      short: 'Показывает, как модель ловит дефект до катастрофического отказа.',
      priority: 'Инспекция в кратчайший срок',
      plainLanguage: 'В корне зуба развивается трещина. Жёсткость зацепления «плавает» под нагрузкой, поэтому сигнал модулируется и возникают характерные боковые полосы.',
      nextStep: 'Сократить интервал до осмотра и проверить корень зуба методом NDT.',
    },
    surface_wear: {
      tone: 'warning',
      badge: 'ТРЕБУЕТ КОНТРОЛЯ',
      severity: 'Повышенный риск',
      action: 'Проверить смазку, нагрузочный профиль и износ контактной поверхности до следующего цикла работы.',
      reason: 'Растёт широкополосный шум и высокочастотная энергия, что характерно для износа поверхности.',
      short: 'Подходит для демонстрации сценария профилактического обслуживания, а не аварийной остановки.',
      priority: 'Плановое обслуживание',
      plainLanguage: 'Поверхность зубьев постепенно изнашивается — рабочий профиль «плывёт». В спектре это видно как равномерный рост шума и высокочастотной энергии, без одиночных сильных ударов.',
      nextStep: 'Проверить смазку и нагрузку, отметить в журнале для планового ТО.',
    },
    ball_fault: {
      tone: 'warning',
      badge: 'ПОДШИПНИК',
      severity: 'Повышенный риск',
      action: 'Проверить состояние подшипника и динамику роста defect frequency на следующем замере.',
      reason: 'Есть периодические ударные события и рост энергии в зоне BSF.',
      short: 'Подчёркивает, что продукт умеет отличать bearing issues от gear fault.',
      priority: 'Повторный замер и осмотр',
      plainLanguage: 'Повреждён один из шариков подшипника — при каждом обороте он даёт аккуратный периодический удар. Частота этих ударов (BSF) подсказывает модели, что дело именно в шарике, а не в обойме.',
      nextStep: 'Сделать повторный замер через неделю и осмотреть подшипник на ТО.',
    },
    inner_race: {
      tone: 'critical',
      badge: 'ВЫСОКИЙ РИСК',
      severity: 'Высокий риск',
      action: 'Сократить время до обслуживания и проверить внутреннюю обойму подшипника под нагрузкой.',
      reason: 'Частые импульсы и энергия вокруг BPFI указывают на развивающийся дефект внутренней обоймы.',
      short: 'Показывает, что система различает дефекты подшипников и зубчатых передач.',
      priority: 'Ускоренное обслуживание',
      plainLanguage: 'Дефект на внутренней обойме подшипника, которая крутится вместе с валом. Из-за этого удары идут часто и под нагрузкой — это самая «болезненная» зона подшипника.',
      nextStep: 'Сократить время до обслуживания и проверить подшипник под нагрузкой.',
    },
    outer_race: {
      tone: 'warning',
      badge: 'ТРЕБУЕТ ОСМОТРА',
      severity: 'Средний риск',
      action: 'Осмотреть подшипник и повторить измерение, чтобы оценить скорость деградации наружной обоймы.',
      reason: 'Спектр показывает устойчивые импульсные компоненты и рост энергии около BPFO.',
      short: 'Показывает уверенный bearing diagnosis с понятной локализацией.',
      priority: 'Осмотр в ближайшее время',
      plainLanguage: 'Дефект на наружной (неподвижной) обойме подшипника. Удары стабильно повторяются с частотой BPFO — сигнал получается характерный и легко узнаваемый.',
      nextStep: 'Осмотреть подшипник в ближайшее ТО и зафиксировать скорость роста дефекта.',
    },
    combination: {
      tone: 'critical',
      badge: 'СЛОЖНЫЙ СЛУЧАЙ',
      severity: 'Комплексный риск',
      action: 'Эскалировать кейс инженеру-диагносту: вероятно развивается несколько повреждений одновременно.',
      reason: 'В сигнале и спектре наложены несколько характерных паттернов, что увеличивает неопределённость и риск.',
      short: 'Показывает сложный случай, где в сигнале одновременно проявляются несколько механизмов деградации.',
      priority: 'Расширенная диагностика узла',
      plainLanguage: 'В одном узле одновременно развивается несколько дефектов — их паттерны накладываются друг на друга. Модель видит смесь признаков и не берёт на себя однозначный вердикт.',
      nextStep: 'Передать кейс инженеру-диагносту для расширенного анализа.',
    },
  };
  const STUDY_LABS = {
    intro_baseline: {
      id: 'intro_baseline',
      badge: 'LAB 01',
      track: 'BASELINE',
      title: 'Норма как точка отсчёта',
      lead: 'Стартовая лаборатория для знакомства с интерфейсом, baseline-сигналом и мягкой деградацией. Сначала формируем ощущение нормы, а потом проверяем себя на скрытом кейсе.',
      objective: 'Научиться отличать чистый baseline от раннего поверхностного износа.',
      checkpoints: [
        {
          id: 'open_normal',
          label: 'Открыть эталонный кейс «Норма»',
          note: 'Посмотрите временной сигнал, FFT и прочитайте объяснение без риска ошибиться.',
          trigger: { type: 'demo', value: 'normal' },
        },
        {
          id: 'open_baseline_lab',
          label: 'Открыть 3D baseline lab',
          note: 'Свяжите механику, сигнал и спектр, чтобы baseline стал точкой отсчёта.',
          trigger: { type: 'sim_lab', value: 'intro_baseline' },
        },
        {
          id: 'baseline_mystery_complete',
          label: 'Разобрать скрытый кейс «Мягкая деградация»',
          note: 'Сделайте гипотезу по сигналу и только потом откройте правильный ответ.',
          trigger: { type: 'hidden_case', value: 'baseline_mystery' },
        },
      ],
      actions: [
        { kind: 'run-demo', value: 'normal', label: 'ЗАПУСТИТЬ BASELINE', tone: 'primary' },
        { kind: 'open-lab', value: 'intro_baseline', label: 'ОТКРЫТЬ 3D LAB' },
        { kind: 'run-hidden', value: 'baseline_mystery', label: 'СКРЫТЫЙ КЕЙС' },
      ],
      hiddenCase: {
        id: 'baseline_mystery',
        caseId: 'surface_wear',
        title: 'Скрытый кейс: мягкая деградация',
        note: 'Сигнал близок к healthy-сценарию, но поверхность уже начинает деградировать.',
        hints: [
          'Ищите рост широкополосной энергии и более шероховатый верхний диапазон.',
          'Сравнивайте с baseline не по одному пику, а по общей текстуре спектра.',
        ],
      },
    },
    gear_fault_path: {
      id: 'gear_fault_path',
      badge: 'LAB 02',
      track: 'GEAR',
      title: 'Скол, трещина и отсутствие зуба',
      lead: 'Контрастная лаборатория по gear faults: сначала изучаем тяжёлый ударный сценарий, затем ранний дефект и в конце проверяем себя на скрытом кейсе.',
      objective: 'Понять разницу между локальным повреждением зуба и развивающимся разрушением.',
      checkpoints: [
        {
          id: 'open_tooth_miss',
          label: 'Прогнать кейс «Отсутствие зуба»',
          note: 'Это самый жёсткий gear fault: увидите сильные удары и разрушение структуры GMF.',
          trigger: { type: 'demo', value: 'tooth_miss' },
        },
        {
          id: 'open_tooth_chip',
          label: 'Сравнить со «Сколом зуба»',
          note: 'Скол даёт более ранний и мягкий паттерн, чем полный missing-tooth сценарий.',
          trigger: { type: 'demo', value: 'tooth_chip' },
        },
        {
          id: 'gear_mystery_complete',
          label: 'Решить скрытый gear-case',
          note: 'Сделайте гипотезу без подсказки модели и проверьте, узнаёте ли вы модуляцию.',
          trigger: { type: 'hidden_case', value: 'gear_mystery' },
        },
      ],
      actions: [
        { kind: 'run-demo', value: 'tooth_miss', label: 'КРИТИЧЕСКИЙ GEAR FAULT', tone: 'primary' },
        { kind: 'run-demo', value: 'tooth_chip', label: 'РАННИЙ СКОЛ' },
        { kind: 'open-lab', value: 'gear_fault_path', label: 'ОТКРЫТЬ GEAR LAB' },
        { kind: 'run-hidden', value: 'gear_mystery', label: 'СКРЫТЫЙ КЕЙС' },
      ],
      hiddenCase: {
        id: 'gear_mystery',
        caseId: 'root_crack',
        title: 'Скрытый кейс: развивающаяся трещина',
        note: 'Здесь нет такого грубого удара, как при missing tooth, но модуляция уже выдаёт проблему.',
        hints: [
          'Смотрите не только на амплитуду ударов, но и на боковые полосы вокруг зацепления.',
          'Подумайте, какой дефект изменяет жёсткость, а не просто выбивает один зуб.',
        ],
      },
    },
    bearing_fault_path: {
      id: 'bearing_fault_path',
      badge: 'LAB 03',
      track: 'BEARING',
      title: 'Подшипники и модуляция',
      lead: 'Учебная ветка по bearing faults: сравниваем внутреннюю и наружную обойму, а затем решаем скрытый кейс по телу качения.',
      objective: 'Научиться отделять bearing signature от зубчатых ударов и различать типы подшипниковых дефектов.',
      checkpoints: [
        {
          id: 'open_inner_race',
          label: 'Открыть кейс «Внутренняя обойма»',
          note: 'Это хороший пример частых импульсов под нагрузкой и выраженной модуляции.',
          trigger: { type: 'demo', value: 'inner_race' },
        },
        {
          id: 'open_outer_race',
          label: 'Сравнить с «Наружной обоймой»',
          note: 'Стабильная повторяемость импульсов помогает увидеть разницу между BPFI и BPFO-паттернами.',
          trigger: { type: 'demo', value: 'outer_race' },
        },
        {
          id: 'bearing_mystery_complete',
          label: 'Разобрать скрытый bearing-case',
          note: 'Поймайте более мягкий дефект тела качения без раскрытия правильного класса.',
          trigger: { type: 'hidden_case', value: 'bearing_mystery' },
        },
      ],
      actions: [
        { kind: 'run-demo', value: 'inner_race', label: 'ОТКРЫТЬ BPFI-КЕЙС', tone: 'primary' },
        { kind: 'run-demo', value: 'outer_race', label: 'ОТКРЫТЬ BPFO-КЕЙС' },
        { kind: 'open-lab', value: 'bearing_fault_path', label: 'ОТКРЫТЬ BEARING LAB' },
        { kind: 'run-hidden', value: 'bearing_mystery', label: 'СКРЫТЫЙ КЕЙС' },
      ],
      hiddenCase: {
        id: 'bearing_mystery',
        caseId: 'ball_fault',
        title: 'Скрытый кейс: дефект шарика',
        note: 'Этот сценарий мягче обойм и проверяет, умеете ли вы видеть BSF-подпись без подсказки.',
        hints: [
          'Ищите более деликатный импульсный рисунок, чем у inner/outer race.',
          'Спросите себя, какой bearing defect не сидит на фиксированной обойме.',
        ],
      },
    },
  };
  authState = normalizeAuth(null);
  sessionHistory = [];

  function getPlaybook(cls) {
    return PLAYBOOK[cls] || {
      tone: 'warning',
      badge: 'REVIEW',
      severity: 'Требуется проверка',
      action: 'Сохранить кейс и передать инженеру на дополнительный анализ.',
      reason: 'Система обнаружила отклонение, но для точной интерпретации нужен дополнительный контекст.',
      short: 'Требуется инженерная верификация результата.',
      priority: 'Ручной review',
      plainLanguage: 'Система увидела что-то необычное, но уверенности недостаточно для однозначного диагноза. Такой кейс лучше передать на ручной review.',
      nextStep: 'Сохранить кейс и показать его инженеру-диагносту.',
    };
  }

  function trimText(value) {
    return String(value || '').trim();
  }

  function readStorage(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.warn('[APP] Storage read failed:', key, e);
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('[APP] Storage write failed:', key, e);
      return false;
    }
  }

  function removeStorage(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (e) {
      console.warn('[APP] Storage remove failed:', key, e);
      return false;
    }
  }

  function formatClock(value) {
    if (!value) return 'только что';
    try {
      return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
    } catch (e) {
      return 'только что';
    }
  }

  function getAnalysisGuideLabel(mode = analysisGuideMode) {
    const labels = {
      first_time: 'FIRST RUN',
      guided_labs: 'GUIDED LAB',
      hidden_cases: 'SELF-CHECK',
      own_file: 'OWN FILE',
      compare_faults: 'COMPARE',
      virtual_lab: '3D FIRST',
    };
    return labels[mode] || 'GUIDED';
  }

  function createDefaultJourneyOnboardingState() {
    return {
      seen: false,
      dismissedAt: null,
      lastOpenedAt: null,
      lastCompletedRoute: null,
    };
  }

  function normalizeJourneyOnboardingState(raw) {
    const next = createDefaultJourneyOnboardingState();
    const payload = raw && typeof raw === 'object' ? raw : {};
    next.seen = payload.seen === true;
    next.dismissedAt = payload.dismissedAt || null;
    next.lastOpenedAt = payload.lastOpenedAt || null;
    next.lastCompletedRoute = trimText(payload.lastCompletedRoute) || null;
    return next;
  }

  function loadJourneyOnboardingState() {
    journeyOnboardingState = normalizeJourneyOnboardingState(
      readStorage(STORAGE_KEYS.journeyOnboarding, createDefaultJourneyOnboardingState())
    );
    return journeyOnboardingState;
  }

  function saveJourneyOnboardingState() {
    if (!journeyOnboardingState) journeyOnboardingState = createDefaultJourneyOnboardingState();
    writeStorage(STORAGE_KEYS.journeyOnboarding, journeyOnboardingState);
  }

  function markJourneyOnboardingSeen(meta = {}) {
    if (!journeyOnboardingState) loadJourneyOnboardingState();
    journeyOnboardingState = {
      ...journeyOnboardingState,
      seen: true,
      dismissedAt: meta.dismissedAt || journeyOnboardingState.dismissedAt || null,
      lastOpenedAt: meta.lastOpenedAt || journeyOnboardingState.lastOpenedAt || null,
      lastCompletedRoute: meta.lastCompletedRoute || journeyOnboardingState.lastCompletedRoute || null,
    };
    saveJourneyOnboardingState();
  }

  function sanitizeInputContext(input) {
    const payload = input && typeof input === 'object' ? input : {};
    return {
      type: trimText(payload.type),
      label: trimText(payload.label),
      scenario: trimText(payload.scenario),
      sourceFile: trimText(payload.sourceFile),
      name: trimText(payload.name),
      format: trimText(payload.format),
      channel: trimText(payload.channel),
      sourceTitle: trimText(payload.sourceTitle),
      titleHint: trimText(payload.titleHint),
      measurementId: trimText(payload.measurementId),
      hiddenCaseId: trimText(payload.hiddenCaseId),
      hiddenLabId: trimText(payload.hiddenLabId),
      sessionId: trimText(payload.sessionId),
      segmentSummary: payload.segmentSummary && typeof payload.segmentSummary === 'object'
        ? {
            analyzedWindows: Number(payload.segmentSummary.analyzedWindows) || 0,
            totalWindows: Number(payload.segmentSummary.totalWindows) || 0,
            representativeWindow: Number(payload.segmentSummary.representativeWindow) || 0,
            representativeStart: Number(payload.segmentSummary.representativeStart) || 0,
            representativeClass: trimText(payload.segmentSummary.representativeClass),
            representativeMean: Number(payload.segmentSummary.representativeMean) || 0,
            representativePeak: Number(payload.segmentSummary.representativePeak) || 0,
            selectedClassHint: trimText(payload.segmentSummary.selectedClassHint),
          }
        : null,
    };
  }

  function compactFeaturePayload(features) {
    if (!Array.isArray(features)) return null;
    return features.slice(0, 128).map((value) => Number(Number(value).toFixed(6)));
  }

  function normalizeFeaturePayload(features) {
    if (!Array.isArray(features)) return null;
    return features
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
  }

  function normalizeSignalPayload(raw) {
    const payload = raw && typeof raw === 'object' ? raw : {};
    const source = Array.isArray(payload.data)
      ? payload.data
      : Array.isArray(payload.signalData)
        ? payload.signalData
        : [];
    const data = source
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
    if (!data.length) return null;
    return {
      data,
      sampleRate: Number(payload.sampleRate) || VM.FS,
    };
  }

  function getActivePipelineStep() {
    for (let index = 5; index >= 1; index -= 1) {
      if (el(`ps${index}`)?.classList.contains('lit')) return index;
    }
    return 0;
  }

  function buildJourneyDraftSnapshot() {
    const hasSignal = currentSignalData?.data?.length;
    const hasDiagnosis = !!currentDiagnosis;
    const page = document.body.dataset.page || 'home';
    if (!hasSignal && !hasDiagnosis && page === 'home' && analysisGuideMode === 'first_time') {
      return {
        savedAt: new Date().toISOString(),
        page,
        analysisGuideMode,
        activeStudyLabId,
        currentInputContext: sanitizeInputContext(currentInputContext),
        currentDiagnosis: null,
        currentSignalData: null,
        journalDraft: {
          assetName: trimText(el('assetNameInput')?.value),
          sessionState: trimText(el('sessionStateInput')?.value),
          workStatus: trimText(el('workStatusInput')?.value),
          note: trimText(el('sessionNoteInput')?.value),
          engineerReason: trimText(el('engineerReasonInput')?.value),
          actionTaken: trimText(el('actionTakenInput')?.value),
        },
        ui: {
          sigStatus: trimText(el('sigStatus')?.textContent),
          sigStatusColor: trimText(el('sigStatus')?.style.color),
          specStatus: trimText(el('specStatus')?.textContent),
          specStatusColor: trimText(el('specStatus')?.style.color),
          sigBaseText: trimText(el('sigDesc')?.dataset.baseText || el('sigDesc')?.textContent),
          specBaseText: trimText(el('specDesc')?.dataset.baseText || el('specDesc')?.textContent),
          pipelineStep: getActivePipelineStep(),
        },
      };
    }

    return {
      savedAt: new Date().toISOString(),
      page,
      analysisGuideMode,
      activeStudyLabId,
      currentInputContext: sanitizeInputContext(currentDiagnosis?.input || currentInputContext),
      currentDiagnosis: currentDiagnosis
        ? {
            cls: currentDiagnosis.cls,
            confidence: Number(currentDiagnosis.confidence || 0),
            probabilities: { ...(currentDiagnosis.probabilities || {}) },
            sourceLabel: trimText(currentDiagnosis.sourceLabel),
            input: sanitizeInputContext(currentDiagnosis.input),
            playbook: currentDiagnosis.playbook || {},
            signalData: compactSignal(currentDiagnosis.signalData || currentSignalData?.data || []),
            sampleRate: Number(currentDiagnosis.sampleRate || currentSignalData?.sampleRate || VM.FS),
            features: compactFeaturePayload(currentDiagnosis.features),
          }
        : null,
      currentSignalData: hasSignal
        ? {
            data: compactSignal(currentSignalData.data),
            sampleRate: Number(currentSignalData.sampleRate || VM.FS),
          }
        : null,
      journalDraft: {
        assetName: trimText(el('assetNameInput')?.value),
        sessionState: trimText(el('sessionStateInput')?.value),
        workStatus: trimText(el('workStatusInput')?.value),
        note: trimText(el('sessionNoteInput')?.value),
        engineerReason: trimText(el('engineerReasonInput')?.value),
        actionTaken: trimText(el('actionTakenInput')?.value),
      },
      ui: {
        sigStatus: trimText(el('sigStatus')?.textContent),
        sigStatusColor: trimText(el('sigStatus')?.style.color),
        specStatus: trimText(el('specStatus')?.textContent),
        specStatusColor: trimText(el('specStatus')?.style.color),
        sigBaseText: trimText(el('sigDesc')?.dataset.baseText || el('sigDesc')?.textContent),
        specBaseText: trimText(el('specDesc')?.dataset.baseText || el('specDesc')?.textContent),
        pipelineStep: getActivePipelineStep(),
      },
    };
  }

  function loadJourneyDraftState() {
    journeyDraftState = readStorage(STORAGE_KEYS.journeyDraft, null);
    autosaveMeta.savedAt = journeyDraftState?.savedAt || null;
    return journeyDraftState;
  }

  function saveJourneyDraftSnapshot(reason = 'auto') {
    if (autosavePaused) return false;
    const snapshot = buildJourneyDraftSnapshot();
    if (!snapshot) return false;
    snapshot.reason = reason;
    journeyDraftState = snapshot;
    autosaveMeta.savedAt = snapshot.savedAt;
    writeStorage(STORAGE_KEYS.journeyDraft, snapshot);
    renderJourneyOnboarding();
    renderAnalysisStickyProgress();
    return true;
  }

  function scheduleJourneyDraftSave(reason = 'auto') {
    if (autosavePaused) return;
    window.clearTimeout(autosaveTimer);
    autosaveTimer = window.setTimeout(() => {
      saveJourneyDraftSnapshot(reason);
    }, 180);
  }

  function clearJourneyDraft(options = {}) {
    removeStorage(STORAGE_KEYS.journeyDraft);
    journeyDraftState = null;
    autosaveMeta.savedAt = null;
    autosaveMeta.restoredAt = null;
    if (options.announce) {
      toast('Черновик очищен', 'Автосохранённый прогресс удалён. Можно начинать с чистого сценария.', 'info');
    }
    renderJourneyOnboarding();
    renderAnalysisStickyProgress();
  }

  function shouldAutoRestoreJourneyDraft(snapshot) {
    if (!snapshot) return false;
    if (initialRoute.page || initialRoute.section || initialRoute.demo || initialRoute.guide || initialRoute.lab) return false;
    return snapshot.page === 'diag' && !!snapshot.currentDiagnosis;
  }

  function applyJourneyDraftFields(draft) {
    const payload = draft && typeof draft === 'object' ? draft : {};
    if (el('assetNameInput')) el('assetNameInput').value = payload.assetName || el('assetNameInput').value || '';
    if (el('sessionStateInput')) el('sessionStateInput').value = payload.sessionState || el('sessionStateInput').value || 'warning';
    if (el('workStatusInput')) el('workStatusInput').value = payload.workStatus || el('workStatusInput').value || 'observe';
    if (el('sessionNoteInput')) el('sessionNoteInput').value = payload.note || '';
    if (el('engineerReasonInput')) el('engineerReasonInput').value = payload.engineerReason || '';
    if (el('actionTakenInput')) el('actionTakenInput').value = payload.actionTaken || '';
    syncWorkStatusFromState();
    renderCaptureSummary();
  }

  function restoreSignalVisualsFromDraft(snapshot) {
    const signalPayload = normalizeSignalPayload(snapshot.currentSignalData || snapshot.currentDiagnosis);
    if (!signalPayload) return [];
    const restoredColor = snapshot.currentDiagnosis?.cls ? (VM.COLORS[snapshot.currentDiagnosis.cls] || '#00e5ff') : '#00e5ff';
    currentSignalData = signalPayload;
    if (currentStop) currentStop();
    currentStop = Viz.drawSignal('sigCanvas', signalPayload.data, restoredColor, true);
    Viz.addCrosshair(el('sigCanvas'), {
      type: 'signal',
      data: signalPayload.data,
      sampleRate: signalPayload.sampleRate || VM.FS,
      color: restoredColor,
    });
    const { freqs, spectrum } = FFT.computeSpectrum(signalPayload.data, signalPayload.sampleRate || VM.FS);
    Viz.drawSpectrum('specCanvas', freqs, spectrum, restoredColor);
    Viz.addCrosshair(el('specCanvas'), { type: 'spectrum', data: spectrum, freqs, color: restoredColor });
    litPipeline(snapshot.ui?.pipelineStep || 5);
    if (el('sigStatus')) {
      el('sigStatus').textContent = snapshot.ui?.sigStatus || '● RESUMED';
      el('sigStatus').style.color = snapshot.ui?.sigStatusColor || restoredColor;
    }
    if (el('specStatus')) {
      el('specStatus').textContent = snapshot.ui?.specStatus || 'READY';
      el('specStatus').style.color = snapshot.ui?.specStatusColor || restoredColor;
    }
    if (el('sigDesc')) {
      const text = snapshot.ui?.sigBaseText || currentInputContext?.label || 'Восстановленный сигнал';
      el('sigDesc').textContent = text;
      el('sigDesc').dataset.baseText = text;
    }
    if (el('specDesc')) {
      const text = snapshot.ui?.specBaseText || `Спектр: макс ${Math.round((signalPayload.sampleRate || VM.FS) / 2)} Гц`;
      el('specDesc').textContent = text;
      el('specDesc').dataset.baseText = text;
    }
    return signalPayload.data;
  }

  async function restoreJourneyDraft(options = {}) {
    const snapshot = options.snapshot || journeyDraftState || loadJourneyDraftState();
    if (!snapshot) return false;

    autosavePaused = true;
    currentSourceFile = null;
    closeJourneyOnboarding({ persist: false });

    if (snapshot.analysisGuideMode) analysisGuideMode = snapshot.analysisGuideMode;
    if (snapshot.activeStudyLabId && STUDY_LABS[snapshot.activeStudyLabId]) {
      activeStudyLabId = snapshot.activeStudyLabId;
      if (studyLabState) saveStudyLabState();
    }

    currentInputContext = sanitizeInputContext(snapshot.currentInputContext || snapshot.currentDiagnosis?.input || currentInputContext);
    applyJourneyDraftFields(snapshot.journalDraft);

    if (snapshot.currentDiagnosis) {
      goPage('diag');
    } else if (snapshot.page) {
      goPage(snapshot.page);
    }

    renderStudyLabShell();
    renderAnalysisCoach();
    renderAnalysisWizard();

    const restoredSignal = restoreSignalVisualsFromDraft(snapshot);
    const restoredDiagnosis = snapshot.currentDiagnosis;
    if (restoredDiagnosis) {
      activateScenarioCards(restoredDiagnosis.input?.scenario || currentInputContext?.scenario || null);
      showDiagnosis(
        restoredDiagnosis.cls,
        restoredDiagnosis.probabilities || { [restoredDiagnosis.cls]: restoredDiagnosis.confidence || 1 },
        VM.COLORS[restoredDiagnosis.cls],
        restoredSignal,
        normalizeFeaturePayload(restoredDiagnosis.features)
      );
      if (!isHiddenCasePending()) {
        await showAdvancedDiagnosis(restoredSignal, normalizeFeaturePayload(restoredDiagnosis.features), {
          ...restoredDiagnosis,
          cls: restoredDiagnosis.cls,
          confidence: restoredDiagnosis.confidence || restoredDiagnosis.probabilities?.[restoredDiagnosis.cls] || 0,
          features: normalizeFeaturePayload(restoredDiagnosis.features),
        });
      }
    }

    autosaveMeta.restoredAt = new Date().toISOString();
    autosavePaused = false;
    renderJourneyOnboarding();
    renderAnalysisStickyProgress();
    if (options.announce !== false) {
      toast('Черновик восстановлен', 'VibroLab вернул вас к последнему шагу анализа и сохранил маршрут обучения.', 'success');
    }
    return true;
  }

  function buildStudyActionMarkup(action, className = 'student-lab-action') {
    const toneClass = action.tone === 'primary' ? ` ${className}--primary` : '';
    const attrs = [
      `class="${className}${toneClass}"`,
      'type="button"',
      `data-study-action="${escapeHtml(action.kind)}"`,
    ];
    if (action.value != null) attrs.push(`data-study-value="${escapeHtml(action.value)}"`);
    if (action.labId != null) attrs.push(`data-study-lab="${escapeHtml(action.labId)}"`);
    return `<button ${attrs.join(' ')}>${escapeHtml(action.label)}</button>`;
  }

  function createDefaultStudyLabState() {
    const checkpoints = {};
    Object.keys(STUDY_LABS).forEach((labId) => {
      checkpoints[labId] = {};
    });
    return {
      activeLabId: 'intro_baseline',
      checkpoints,
      hiddenCases: {},
    };
  }

  function normalizeStudyLabState(raw) {
    const next = createDefaultStudyLabState();
    const payload = raw && typeof raw === 'object' ? raw : {};
    if (STUDY_LABS[payload.activeLabId]) next.activeLabId = payload.activeLabId;

    Object.entries(payload.checkpoints || {}).forEach(([labId, records]) => {
      if (!next.checkpoints[labId] || !records || typeof records !== 'object') return;
      Object.entries(records).forEach(([checkpointId, value]) => {
        if (!value) return;
        next.checkpoints[labId][checkpointId] = typeof value === 'object'
          ? value
          : { doneAt: new Date().toISOString() };
      });
    });

    Object.entries(payload.hiddenCases || {}).forEach(([challengeId, value]) => {
      if (!value || typeof value !== 'object') return;
      const owner = Object.values(STUDY_LABS).find((lab) => lab.hiddenCase?.id === challengeId);
      if (!owner) return;
      next.hiddenCases[challengeId] = {
        startedAt: value.startedAt || null,
        selectedAnswer: value.selectedAnswer || null,
        submittedAnswer: value.submittedAnswer || null,
        revealed: value.revealed === true,
        correct: typeof value.correct === 'boolean' ? value.correct : null,
        revealedAt: value.revealedAt || null,
        actualClass: value.actualClass || owner.hiddenCase.caseId,
      };
    });

    return next;
  }

  function loadStudyLabState() {
    studyLabState = normalizeStudyLabState(readStorage(STORAGE_KEYS.studyLabs, createDefaultStudyLabState()));
    activeStudyLabId = initialRoute.lab && STUDY_LABS[initialRoute.lab]
      ? initialRoute.lab
      : (studyLabState.activeLabId || 'intro_baseline');
    studyLabState.activeLabId = activeStudyLabId;
  }

  function saveStudyLabState() {
    if (!studyLabState) studyLabState = createDefaultStudyLabState();
    studyLabState.activeLabId = activeStudyLabId;
    writeStorage(STORAGE_KEYS.studyLabs, studyLabState);
    scheduleJourneyDraftSave('study-lab');
  }

  function getStudyLab(labId = activeStudyLabId) {
    return STUDY_LABS[labId] || STUDY_LABS.intro_baseline;
  }

  function getStudyLabList() {
    return Object.values(STUDY_LABS);
  }

  function findLabByHiddenCaseId(challengeId) {
    return getStudyLabList().find((lab) => lab.hiddenCase?.id === challengeId) || null;
  }

  function getHiddenCaseState(challengeId) {
    return studyLabState?.hiddenCases?.[challengeId] || null;
  }

  function getCurrentHiddenCaseContext() {
    const challengeId = currentDiagnosis?.input?.hiddenCaseId || currentInputContext?.hiddenCaseId;
    if (!challengeId) return null;
    const lab = findLabByHiddenCaseId(challengeId);
    if (!lab) return null;
    return {
      lab,
      challenge: lab.hiddenCase,
      state: getHiddenCaseState(challengeId),
    };
  }

  function isHiddenCasePending() {
    const context = getCurrentHiddenCaseContext();
    return !!(context && !context.state?.revealed);
  }

  function getStudyLabCheckpointEntry(labId, checkpointId) {
    return studyLabState?.checkpoints?.[labId]?.[checkpointId] || null;
  }

  function isStudyLabCheckpointDone(labId, checkpointId) {
    return !!getStudyLabCheckpointEntry(labId, checkpointId);
  }

  function getStudyLabProgress(labId) {
    const lab = getStudyLab(labId);
    const total = lab.checkpoints.length;
    const completed = lab.checkpoints.filter((checkpoint) => isStudyLabCheckpointDone(lab.id, checkpoint.id)).length;
    return {
      total,
      completed,
      percent: total ? Math.round((completed / total) * 100) : 0,
      isComplete: total > 0 && completed === total,
    };
  }

  function getNextStudyLabCheckpoint(labId) {
    const lab = getStudyLab(labId);
    return lab.checkpoints.find((checkpoint) => !isStudyLabCheckpointDone(lab.id, checkpoint.id)) || null;
  }

  function countSolvedHiddenCases() {
    return getStudyLabList().filter((lab) => !!getHiddenCaseState(lab.hiddenCase.id)?.revealed).length;
  }

  function countCorrectHiddenCases() {
    return getStudyLabList().filter((lab) => getHiddenCaseState(lab.hiddenCase.id)?.correct === true).length;
  }

  function setActiveStudyLab(labId, options = {}) {
    if (!STUDY_LABS[labId]) return;
    activeStudyLabId = labId;
    if (!studyLabState) studyLabState = createDefaultStudyLabState();
    saveStudyLabState();
    if (!options.keepGuideMode) analysisGuideMode = 'guided_labs';
    renderStudyLabShell();
    renderAnalysisCoach();
    if (options.scroll) {
      window.setTimeout(() => el('studentLabShell')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    }
  }

  function markStudyLabCheckpoint(labId, checkpointId, meta = {}) {
    const lab = getStudyLab(labId);
    const checkpoint = lab.checkpoints.find((item) => item.id === checkpointId);
    if (!checkpoint) return;
    if (!studyLabState) studyLabState = createDefaultStudyLabState();
    const wasDone = isStudyLabCheckpointDone(labId, checkpointId);
    const wasLabComplete = getStudyLabProgress(labId).isComplete;
    studyLabState.checkpoints[labId][checkpointId] = {
      ...(getStudyLabCheckpointEntry(labId, checkpointId) || {}),
      doneAt: getStudyLabCheckpointEntry(labId, checkpointId)?.doneAt || new Date().toISOString(),
      ...meta,
    };
    saveStudyLabState();
    if (!wasDone) {
      toast('Чекпоинт закрыт', `${lab.badge} · ${checkpoint.label}`, 'success');
    }
    if (!wasLabComplete && getStudyLabProgress(labId).isComplete) {
      toast('Лаборатория завершена', `${lab.title} полностью закрыта. Можно переходить к следующему треку.`, 'success');
    }
    renderStudyLabShell();
    renderAnalysisCoach();
  }

  function markStudyLabCheckpointsByTrigger(type, value, meta = {}) {
    getStudyLabList().forEach((lab) => {
      lab.checkpoints.forEach((checkpoint) => {
        if (checkpoint.trigger?.type === type && checkpoint.trigger?.value === value) {
          markStudyLabCheckpoint(lab.id, checkpoint.id, meta);
        }
      });
    });
  }

  function renderStudyLabShell() {
    const summaryNode = el('studentLabSummary');
    const catalogNode = el('studentLabCatalog');
    const detailNode = el('studentLabDetail');
    if (!summaryNode || !catalogNode || !detailNode) return;

    if (!studyLabState) loadStudyLabState();

    const labs = getStudyLabList();
    const totalCheckpoints = labs.reduce((sum, lab) => sum + lab.checkpoints.length, 0);
    const completedCheckpoints = labs.reduce((sum, lab) => sum + getStudyLabProgress(lab.id).completed, 0);
    const completedLabs = labs.filter((lab) => getStudyLabProgress(lab.id).isComplete).length;

    summaryNode.innerHTML = `
      <div class="student-lab-summary-card">
        <span>GUIDED LABS</span>
        <strong>${completedLabs}/${labs.length}</strong>
        <small>закрыто полностью</small>
      </div>
      <div class="student-lab-summary-card student-lab-summary-card--accent">
        <span>CHECKPOINTS</span>
        <strong>${completedCheckpoints}/${totalCheckpoints}</strong>
        <small>пройдено шагов</small>
      </div>
      <div class="student-lab-summary-card">
        <span>СКРЫТЫЕ КЕЙСЫ</span>
        <strong>${countSolvedHiddenCases()}/${labs.length}</strong>
        <small>${countCorrectHiddenCases()} с верной гипотезой</small>
      </div>
    `;

    catalogNode.innerHTML = labs.map((lab) => {
      const progress = getStudyLabProgress(lab.id);
      const nextCheckpoint = getNextStudyLabCheckpoint(lab.id);
      return `
        <button class="student-lab-card ${lab.id === activeStudyLabId ? 'is-active' : ''}" type="button" data-study-lab-select="${escapeHtml(lab.id)}">
          <div class="student-lab-card-top">
            <span class="student-lab-card-badge">${escapeHtml(lab.badge)}</span>
            <span class="student-lab-card-track">${escapeHtml(lab.track)}</span>
          </div>
          <strong>${escapeHtml(lab.title)}</strong>
          <p>${escapeHtml(lab.objective)}</p>
          <div class="student-lab-card-progress">
            <span style="width:${progress.percent}%"></span>
          </div>
          <div class="student-lab-card-meta">
            <span>${progress.completed}/${progress.total} шагов</span>
            <span>${escapeHtml(progress.isComplete ? 'ГОТОВО' : (nextCheckpoint ? nextCheckpoint.label : 'В ПРОЦЕССЕ'))}</span>
          </div>
        </button>
      `;
    }).join('');

    const lab = getStudyLab(activeStudyLabId);
    const progress = getStudyLabProgress(lab.id);
    const nextCheckpoint = getNextStudyLabCheckpoint(lab.id);
    const hiddenState = getHiddenCaseState(lab.hiddenCase.id);
    const hiddenStatus = hiddenState?.revealed
      ? (hiddenState.correct === true ? 'ГИПОТЕЗА ВЕРНА' : hiddenState.correct === false ? 'ОТВЕТ ОТКРЫТ' : 'ОТВЕТ ПОКАЗАН')
      : hiddenState?.startedAt
        ? 'КЕЙС В ПРОЦЕССЕ'
        : 'НЕ НАЧАТ';
    const hiddenTone = hiddenState?.correct === true ? 'good' : hiddenState?.revealed ? 'warning' : 'info';
    const selectedAnswerLabel = hiddenState?.selectedAnswer ? (VM.RU[hiddenState.selectedAnswer] || hiddenState.selectedAnswer) : '—';
    const actualAnswerLabel = hiddenState?.revealed ? (VM.RU[lab.hiddenCase.caseId] || lab.hiddenCase.caseId) : 'скрыт';

    detailNode.innerHTML = `
      <div class="student-lab-detail-head">
        <div>
          <div class="student-lab-detail-kicker">${escapeHtml(lab.badge)} · ${escapeHtml(lab.track)}</div>
          <h3 class="student-lab-detail-title">${escapeHtml(lab.title)}</h3>
        </div>
        <span class="student-lab-detail-state">${progress.percent}%</span>
      </div>
      <p class="student-lab-detail-lead">${escapeHtml(lab.lead)}</p>
      <div class="student-lab-detail-goal">
        <span>ЗАДАЧА ЛАБЫ</span>
        <strong>${escapeHtml(lab.objective)}</strong>
      </div>
      <div class="student-lab-progressbar"><span style="width:${progress.percent}%"></span></div>
      <div class="student-lab-checkpoints">
        ${lab.checkpoints.map((checkpoint, index) => {
          const entry = getStudyLabCheckpointEntry(lab.id, checkpoint.id);
          return `
            <article class="student-lab-checkpoint ${entry ? 'is-complete' : ''}">
              <span class="student-lab-checkpoint-index">${entry ? '✓' : String(index + 1).padStart(2, '0')}</span>
              <div class="student-lab-checkpoint-copy">
                <strong>${escapeHtml(checkpoint.label)}</strong>
                <p>${escapeHtml(checkpoint.note)}</p>
              </div>
            </article>
          `;
        }).join('')}
      </div>
      <div class="student-lab-actions">
        ${lab.actions.map((action) => buildStudyActionMarkup({ ...action, labId: lab.id })).join('')}
      </div>
      <div class="student-lab-hidden student-lab-hidden--${hiddenTone}">
        <div class="student-lab-hidden-head">
          <div>
            <div class="student-lab-hidden-kicker">СКРЫТЫЙ КЕЙС</div>
            <strong>${escapeHtml(lab.hiddenCase.title)}</strong>
          </div>
          <span class="student-lab-hidden-state">${escapeHtml(hiddenStatus)}</span>
        </div>
        <p class="student-lab-hidden-note">${escapeHtml(lab.hiddenCase.note)}</p>
        <div class="student-lab-hidden-hints">
          ${lab.hiddenCase.hints.map((hint) => `<span class="student-lab-hidden-hint">${escapeHtml(hint)}</span>`).join('')}
        </div>
        <div class="student-lab-hidden-meta">
          <span>Ваша гипотеза: <strong>${escapeHtml(selectedAnswerLabel)}</strong></span>
          <span>Правильный ответ: <strong>${escapeHtml(actualAnswerLabel)}</strong></span>
        </div>
        <div class="student-lab-hidden-actions">
          ${buildStudyActionMarkup({ kind: 'run-hidden', value: lab.hiddenCase.id, labId: lab.id, label: hiddenState?.startedAt ? 'ПЕРЕЗАПУСТИТЬ КЕЙС' : 'СТАРТОВАТЬ КЕЙС', tone: 'primary' })}
        </div>
      </div>
      <div class="student-lab-next-step">
        <span>СЛЕДУЮЩИЙ ШАГ</span>
        <strong>${escapeHtml(nextCheckpoint ? nextCheckpoint.label : 'Лаба закрыта. Можно переходить к следующему маршруту.')}</strong>
      </div>
    `;
  }

  function startHiddenCase(challengeId, options = {}) {
    const owner = findLabByHiddenCaseId(challengeId) || getStudyLab(activeStudyLabId);
    const challenge = owner?.hiddenCase;
    if (!owner || !challenge || challenge.id !== challengeId) return;
    if (!studyLabState) studyLabState = createDefaultStudyLabState();
    activeStudyLabId = owner.id;
    studyLabState.hiddenCases[challengeId] = {
      startedAt: new Date().toISOString(),
      selectedAnswer: null,
      submittedAnswer: null,
      revealed: false,
      correct: null,
      revealedAt: null,
      actualClass: challenge.caseId,
    };
    saveStudyLabState();
    analysisGuideMode = 'hidden_cases';
    renderStudyLabShell();
    renderAnalysisCoach();
    goPage('diag');
    window.setTimeout(() => runDemo(challenge.caseId, {
      hiddenCase: {
        challengeId,
        labId: owner.id,
        title: challenge.title,
      },
      reset: options.reset === true,
    }), 220);
  }

  function selectHiddenCaseAnswer(answer) {
    const context = getCurrentHiddenCaseContext();
    if (!context || context.state?.revealed) return;
    if (!studyLabState) studyLabState = createDefaultStudyLabState();
    studyLabState.hiddenCases[context.challenge.id] = {
      ...(context.state || {}),
      startedAt: context.state?.startedAt || new Date().toISOString(),
      selectedAnswer: answer,
      actualClass: context.challenge.caseId,
      revealed: false,
    };
    saveStudyLabState();
    renderStudyLabShell();
    rerenderCurrentDiagnosis();
  }

  function revealHiddenCaseAnswer(challengeId) {
    const owner = findLabByHiddenCaseId(challengeId);
    const challenge = owner?.hiddenCase;
    if (!challenge) return;
    if (!studyLabState) studyLabState = createDefaultStudyLabState();
    const previous = getHiddenCaseState(challengeId) || {};
    studyLabState.hiddenCases[challengeId] = {
      ...previous,
      startedAt: previous.startedAt || new Date().toISOString(),
      revealed: true,
      correct: previous.selectedAnswer ? previous.selectedAnswer === challenge.caseId : null,
      revealedAt: new Date().toISOString(),
      actualClass: challenge.caseId,
    };
    saveStudyLabState();
    renderStudyLabShell();
    rerenderCurrentDiagnosis({ includeAdvanced: true });
    renderAnalysisCoach();
  }

  function submitHiddenCaseAnswer(challengeId) {
    const owner = findLabByHiddenCaseId(challengeId);
    const challenge = owner?.hiddenCase;
    const state = getHiddenCaseState(challengeId);
    if (!challenge || !state?.selectedAnswer) {
      toast('Нужна гипотеза', 'Сначала выберите класс, который считаете наиболее вероятным.', 'warning');
      return;
    }
    if (!studyLabState) studyLabState = createDefaultStudyLabState();
    const correct = state.selectedAnswer === challenge.caseId;
    studyLabState.hiddenCases[challengeId] = {
      ...state,
      submittedAnswer: state.selectedAnswer,
      revealed: true,
      correct,
      revealedAt: new Date().toISOString(),
      actualClass: challenge.caseId,
    };
    saveStudyLabState();
    markStudyLabCheckpointsByTrigger('hidden_case', challengeId, {
      correct,
      submittedAnswer: state.selectedAnswer,
    });
    toast(
      correct ? 'Гипотеза подтверждена' : 'Гипотеза проверена',
      correct
        ? `Скрытый кейс решён верно: ${VM.RU[challenge.caseId] || challenge.caseId}.`
        : `Правильный ответ: ${VM.RU[challenge.caseId] || challenge.caseId}. Теперь сравните ваш ход мысли с объяснением модели.`,
      correct ? 'success' : 'info'
    );
    renderStudyLabShell();
    rerenderCurrentDiagnosis({ includeAdvanced: true });
    renderAnalysisCoach();
  }

  function buildHiddenCaseDiagnosisMarkup(cls) {
    const context = getCurrentHiddenCaseContext();
    if (!context) return '';
    const selectedAnswer = context.state?.selectedAnswer || null;
    return `
      <div class="hidden-case-shell">
        <div class="hidden-case-head">
          <div>
            <div class="hidden-case-kicker">${escapeHtml(context.lab.badge)} · СКРЫТЫЙ КЕЙС</div>
            <h3 class="hidden-case-title">${escapeHtml(context.challenge.title)}</h3>
          </div>
          <span class="hidden-case-state">MYSTERY</span>
        </div>
        <p class="hidden-case-lead">${escapeHtml(context.challenge.note)}</p>
        <div class="hidden-case-hints">
          ${context.challenge.hints.map((hint) => `<span class="hidden-case-hint">${escapeHtml(hint)}</span>`).join('')}
        </div>
        <div class="hidden-case-lock">
          Диагноз, вероятности и объяснение модели скрыты до проверки гипотезы. Опирайтесь на временной сигнал и FFT выше.
        </div>
        <div class="hidden-guess-shell">
          <div class="label" style="margin-bottom:10px">ВАША ГИПОТЕЗА</div>
          <div class="hidden-guess-grid">
            ${VM.CLASSES.map((candidate) => `
              <button
                class="hidden-guess-btn ${selectedAnswer === candidate ? 'is-active' : ''}"
                type="button"
                data-hidden-guess="${escapeHtml(candidate)}"
              >
                <span class="dot" style="background:${VM.COLORS[candidate]}"></span>
                ${escapeHtml(VM.RU[candidate] || candidate)}
              </button>
            `).join('')}
          </div>
          <div class="hidden-guess-actions">
            <button class="btn btn-primary" type="button" data-study-action="submit-hidden" data-study-value="${escapeHtml(context.challenge.id)}">ПРОВЕРИТЬ ГИПОТЕЗУ</button>
            <button class="btn" type="button" data-study-action="reveal-hidden" data-study-value="${escapeHtml(context.challenge.id)}">ПОКАЗАТЬ ОТВЕТ</button>
          </div>
          <div class="hidden-guess-note">
            ${selectedAnswer
              ? `Вы выбрали: ${escapeHtml(VM.RU[selectedAnswer] || selectedAnswer)}.`
              : 'Сначала выберите один класс и зафиксируйте свою гипотезу.'}
          </div>
        </div>
      </div>
    `;
  }

  function buildHiddenCaseResultBanner() {
    const context = getCurrentHiddenCaseContext();
    if (!context || !context.state?.revealed) return '';
    const selected = context.state.submittedAnswer || context.state.selectedAnswer;
    const actual = context.challenge.caseId;
    const tone = context.state.correct === true ? 'good' : 'warning';
    let copy = `Правильный ответ: ${VM.RU[actual] || actual}.`;
    if (selected) {
      copy = context.state.correct === true
        ? `Гипотеза подтверждена: ${VM.RU[selected] || selected}.`
        : `Вы выбрали ${VM.RU[selected] || selected}, а правильный ответ — ${VM.RU[actual] || actual}.`;
    }
    return `
      <div class="hidden-case-result hidden-case-result--${tone}">
        <div>
          <div class="hidden-case-result-kicker">${escapeHtml(context.lab.badge)} · РАЗБОР СКРЫТОГО КЕЙСА</div>
          <strong>${escapeHtml(copy)}</strong>
        </div>
        <button class="student-lab-action" type="button" data-study-action="run-hidden" data-study-value="${escapeHtml(context.challenge.id)}" data-study-lab="${escapeHtml(context.lab.id)}">ПОВТОРИТЬ КЕЙС</button>
      </div>
    `;
  }

  function rerenderCurrentDiagnosis(options = {}) {
    if (!currentDiagnosis) return;
    const signal = currentSignalData?.data || currentDiagnosis.signalData || [];
    showDiagnosis(
      currentDiagnosis.cls,
      currentDiagnosis.probabilities || { [currentDiagnosis.cls]: currentDiagnosis.confidence || 1 },
      VM.COLORS[currentDiagnosis.cls],
      signal,
      currentDiagnosis.features || null
    );
    if (options.includeAdvanced && !isHiddenCasePending()) {
      showAdvancedDiagnosis(signal, currentDiagnosis.features || null, currentDiagnosis);
    }
  }

  function runStudyAction(kind, dataset = {}) {
    const labId = dataset.studyLab || activeStudyLabId;
    if (labId && STUDY_LABS[labId]) activeStudyLabId = labId;
    switch (kind) {
      case 'run-demo':
        setActiveStudyLab(activeStudyLabId, { keepGuideMode: false });
        runScenario(dataset.studyValue || 'normal');
        break;
      case 'open-lab':
        setActiveStudyLab(activeStudyLabId, { keepGuideMode: false });
        markStudyLabCheckpointsByTrigger('sim_lab', dataset.studyValue || activeStudyLabId);
        openLabScenario(dataset.studyValue || activeStudyLabId);
        break;
      case 'run-hidden':
        setActiveStudyLab(activeStudyLabId, { keepGuideMode: true });
        startHiddenCase(dataset.studyValue);
        break;
      case 'submit-hidden':
        submitHiddenCaseAnswer(dataset.studyValue);
        break;
      case 'reveal-hidden':
        revealHiddenCaseAnswer(dataset.studyValue);
        break;
      default:
        break;
    }
  }

  function normalizeAuth(auth) {
    const next = auth && typeof auth === 'object' ? auth : {};
    return {
      id: trimText(next.id),
      email: trimText(next.email),
      name: trimText(next.name || next.display_name),
      role: trimText(next.role),
      signedInAt: next.signedInAt || next.created_at || null,
      sessionId: trimText(next.sessionId || next.session_id),
      sessionExpiresAt: next.sessionExpiresAt || next.session_expires_at || null,
    };
  }

  function normalizeStateKey(key) {
    return STATE_ALIASES[trimText(key)] || 'warning';
  }

  function inferWorkStatus(item, stateKey) {
    const explicit = trimText(item.workStatus || item.work_status);
    if (explicit && WORK_STATUSES[explicit]) return explicit;
    if (stateKey === 'service') return 'repair';
    if (stateKey === 'after_maintenance') return 'replaced';
    if (stateKey === 'warning') return 'inspect';
    return 'observe';
  }

  function normalizeAssets(list) {
    if (!Array.isArray(list)) return [];
    return list
      .filter(item => item && item.id)
      .map((item) => ({
        ...item,
        currentStatus: normalizeStateKey(item.currentStatus || item.current_status),
        location: trimText(item.location),
        description: trimText(item.description),
      }));
  }

  function normalizeReports(list) {
    if (!Array.isArray(list)) return [];
    return list
      .filter(item => item && item.id)
      .map((item) => ({
        ...item,
        inspectionId: item.inspectionId || item.inspection_id,
        shareUrl: item.shareUrl || item.share_url || null,
        shareToken: item.shareToken || item.share_token || null,
        payload: item.payload || {},
      }));
  }

  function normalizeAlerts(list) {
    if (!Array.isArray(list)) return [];
    return list
      .filter((item) => item && item.id)
      .map((item) => ({
        ...item,
        assetId: item.assetId || item.asset_id || null,
        assetName: item.assetName || item.asset_name || 'Не указан объект',
        inspectionId: item.inspectionId || item.inspection_id || null,
        measurementId: item.measurementId || item.measurement_id || null,
        alertType: item.alertType || item.alert_type || 'diagnostic',
        currentClass: item.currentClass || item.current_class || null,
        currentConfidence: item.currentConfidence || item.current_confidence || 0,
        eventsCount: item.eventsCount || item.events_count || 0,
        lastEventAt: item.lastEventAt || item.last_event_at || item.updated_at || item.updatedAt || null,
        createdAt: item.createdAt || item.created_at || null,
        updatedAt: item.updatedAt || item.updated_at || null,
      }))
      .sort((a, b) => new Date(b.lastEventAt || b.updatedAt || 0).getTime() - new Date(a.lastEventAt || a.updatedAt || 0).getTime());
  }

  function normalizeAlertEvents(list) {
    if (!Array.isArray(list)) return [];
    return list
      .filter((item) => item && item.id)
      .map((item) => ({
        ...item,
        alertId: item.alertId || item.alert_id || null,
        inspectionId: item.inspectionId || item.inspection_id || null,
        fromStatus: item.fromStatus || item.from_status || null,
        toStatus: item.toStatus || item.to_status || null,
        authorName: item.authorName || item.author_name || 'Unknown user',
        createdAt: item.createdAt || item.created_at || null,
      }))
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }

  function normalizeMeasurements(list) {
    if (!Array.isArray(list)) return [];
    return list
      .filter(item => item && item.id)
      .map((item) => ({
        ...item,
        assetId: item.assetId || item.asset_id || null,
        assetName: item.assetName || item.asset_name || 'Не указан объект',
        inspectionId: item.inspectionId || item.inspection_id || null,
        sourceKind: item.sourceKind || item.source_kind || 'uploaded_file',
        sourceLabel: item.sourceLabel || item.source_label || 'Real monitoring',
        inputLabel: item.inputLabel || item.input_label || item.original_name || 'Measurement',
        originalName: item.originalName || item.original_name || 'signal.dat',
        fileExt: item.fileExt || item.file_ext || '',
        mimeType: item.mimeType || item.mime_type || '',
        storageSize: item.storageSize || item.storage_size || 0,
        sampleRate: item.sampleRate || item.sample_rate || VM.FS,
        sampleCount: item.sampleCount || item.sample_count || 0,
        durationSeconds: item.durationSeconds || item.duration_seconds || 0,
        predictedClass: item.predictedClass || item.predicted_class || null,
        confidence: item.confidence || 0,
        probabilities: item.probabilities || {},
        inputContext: item.inputContext || item.input_context || {},
        previewSignal: item.previewSignal || item.preview_signal || [],
        note: item.note || '',
        downloadUrl: item.downloadUrl || item.download_url || null,
        createdAt: item.createdAt || item.created_at || null,
        updatedAt: item.updatedAt || item.updated_at || null,
      }))
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }

  function normalizeHistory(list) {
    if (!Array.isArray(list)) return [];
    return list
      .filter(item => item && item.id)
      .map((item) => {
        const stateKey = normalizeStateKey(item.stateKey || item.state_key);
        const workStatus = inferWorkStatus(item, stateKey);
        const input = {
          ...(item.input || item.input_context || {}),
          label: item.input?.label || item.input_label || item.input_context?.label || 'Сохранённый сеанс',
          type: item.input?.type || item.input_type || item.input_context?.type || 'saved',
        };
        return {
          ...item,
          assetId: item.assetId || item.asset_id || null,
          measurementId: item.measurementId || item.measurement_id || input.measurementId || item.input_context?.measurementId || null,
          assetName: item.assetName || item.asset_name || 'Не указан объект',
          cls: item.cls || item.predicted_class,
          savedAt: item.savedAt || item.created_at,
          input,
          playbook: item.playbook || {},
          signalData: item.signalData || item.signal_data || [],
          sampleRate: item.sampleRate || item.sample_rate || VM.FS,
          stateKey,
          stateLabel: item.stateLabel || item.state_label || SESSION_STATES[stateKey]?.label || '',
          workStatus,
          workStatusLabel: item.workStatusLabel || item.work_status_label || WORK_STATUSES[workStatus]?.label || '',
          isBaseline: item.isBaseline === true || item.is_baseline === true,
          engineerReason: item.engineerReason || item.engineer_reason || '',
          actionTaken: item.actionTaken || item.action_taken || '',
        };
      })
      .slice(0, STORAGE_LIMITS.sessions);
  }

  function hasLegacySessions() {
    return normalizeHistory(readStorage(STORAGE_KEYS.legacySessions, [])).length > 0;
  }

  function isLegacyImportDone() {
    return readStorage(STORAGE_KEYS.legacyImportDone, false) === true;
  }

  function markLegacyImportDone() {
    return writeStorage(STORAGE_KEYS.legacyImportDone, true);
  }

  async function apiRequest(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (!headers.has('Content-Type') && options.body) headers.set('Content-Type', 'application/json');
    const requestUrl = typeof runtime.resolveApiPath === 'function'
      ? runtime.resolveApiPath(path)
      : `${API_BASE}${path}`;
    const response = await fetch(requestUrl, {
      credentials: 'include',
      ...options,
      headers,
    });
    const text = await response.text();
    const payload = text ? (() => {
      try { return JSON.parse(text); } catch (e) { return text; }
    })() : null;
    if (!response.ok) {
      const detail = typeof payload === 'object' && payload ? payload.detail || payload.message : payload;
      throw new Error(detail || `API request failed: ${response.status}`);
    }
    return payload;
  }

  async function loadAuthState() {
    try {
      const payload = await apiRequest('/auth/me');
      authState = normalizeAuth({
        ...payload.user,
        session_id: payload.session?.id,
        session_expires_at: payload.session?.expires_at,
      });
      return authState;
    } catch (e) {
      authState = normalizeAuth(null);
      return null;
    }
  }

  async function loadHistory() {
    if (!authState?.id) {
      sessionHistory = [];
      assetRegistry = [];
      measurementRegistry = [];
      reportRegistry = [];
      alertRegistry = [];
      alertEventRegistry = {};
      selectedAlertId = null;
      dashboardSummary = null;
      syncWorkspaceSelection();
      renderWorkspace();
      return [];
    }
    const [history, summary, assets, reports, measurements, alerts] = await Promise.all([
      apiRequest('/inspections'),
      apiRequest('/dashboard/summary'),
      apiRequest('/assets'),
      apiRequest('/reports'),
      apiRequest('/measurements'),
      apiRequest('/alerts'),
    ]);
    sessionHistory = normalizeHistory(history);
    assetRegistry = normalizeAssets(assets);
    measurementRegistry = normalizeMeasurements(measurements);
    reportRegistry = normalizeReports(reports);
    alertRegistry = normalizeAlerts(alerts);
    selectedAlertId = alertRegistry[0]?.id || null;
    alertEventRegistry = {};
    if (selectedAlertId) {
      try {
        await loadAlertEvents(selectedAlertId, { force: true });
      } catch (e) {
        console.warn('[APP] alert events preload failed:', e);
      }
    }
    dashboardSummary = summary;
    syncWorkspaceSelection();
    renderAuthSummary();
    renderWorkspace();
    return sessionHistory;
  }

  function legacySessionToApiItem(item) {
    const stateKey = normalizeStateKey(item.stateKey || 'warning');
    const stateMeta = getSessionStateMeta(stateKey);
    const workStatus = inferWorkStatus(item, stateKey);
    return {
      asset_name: item.assetName || 'Не указан объект',
      title: item.title || null,
      state_key: stateKey,
      state_label: stateMeta.label,
      work_status: workStatus,
      work_status_label: getWorkStatusMeta(workStatus).label,
      is_baseline: item.isBaseline === true || item.is_baseline === true,
      note: item.note || '',
      engineer_reason: item.engineerReason || '',
      action_taken: item.actionTaken || '',
      predicted_class: item.cls,
      confidence: item.confidence || 0,
      source_label: item.sourceLabel || 'Browser inference',
      input_type: item.input?.type || 'demo',
      input_label: item.input?.label || 'Legacy import',
      sample_rate: item.sampleRate || VM.FS,
      probabilities: item.probabilities || {},
      playbook: item.playbook || {},
      input_context: item.input || {},
      signal_data: Array.isArray(item.signalData) ? item.signalData : [],
      created_at: item.savedAt || null,
    };
  }

  async function importLegacySessions() {
    if (!authState?.id) {
      toast('Нужен вход', 'Сначала войдите в аккаунт, затем импортируйте локальный журнал.', 'warning');
      return;
    }
    const legacyItems = normalizeHistory(readStorage(STORAGE_KEYS.legacySessions, []));
    if (!legacyItems.length) {
      toast('Нечего переносить', 'В localStorage не найдено старых сохранённых сеансов.', 'info');
      return;
    }
    const payload = { items: legacyItems.map(legacySessionToApiItem) };
    const result = await apiRequest('/migrations/import-local-history', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    markLegacyImportDone();
    await loadHistory();
    toast('Импорт завершён', `Перенесено ${result.imported_count} сеансов и ${result.asset_count} связанных записей.`, 'success');
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatStamp(value) {
    try {
      return new Intl.DateTimeFormat('ru-RU', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value));
    } catch (e) {
      return value || '—';
    }
  }

  function getSessionStateMeta(key) {
    return SESSION_STATES[normalizeStateKey(key)] || SESSION_STATES.warning;
  }

  function getWorkStatusMeta(key) {
    return WORK_STATUSES[trimText(key)] || WORK_STATUSES.observe;
  }

  function getAlertStatusMeta(key) {
    return ALERT_STATUSES[trimText(key)] || ALERT_STATUSES.new;
  }

  function getAlertSeverityTone(severity) {
    const value = trimText(severity);
    if (value === 'critical') return 'critical';
    if (value === 'high' || value === 'medium') return 'warning';
    if (value === 'low') return 'good';
    return 'info';
  }

  function getAlertSeverityLabel(severity) {
    const value = trimText(severity);
    const labels = {
      low: 'Low severity',
      medium: 'Medium severity',
      high: 'High severity',
      critical: 'Critical severity',
    };
    return labels[value] || 'Severity';
  }

  function getAlertNextStatus(status) {
    const map = {
      new: 'acknowledged',
      acknowledged: 'in_progress',
      in_progress: 'resolved',
      resolved: 'acknowledged',
    };
    return map[trimText(status)] || 'acknowledged';
  }

  function getAlertStatusCounts(alerts) {
    const counts = {
      all: alerts.length,
      active: 0,
      new: 0,
      acknowledged: 0,
      in_progress: 0,
      resolved: 0,
    };
    alerts.forEach((alert) => {
      const status = trimText(alert.status);
      if (status !== 'resolved') counts.active += 1;
      if (Object.prototype.hasOwnProperty.call(counts, status)) {
        counts[status] += 1;
      }
    });
    return counts;
  }

  function matchesAlertFilter(alert, filterValue) {
    const status = trimText(alert.status);
    if (filterValue === 'all') return true;
    if (filterValue === 'active') return status !== 'resolved';
    return status === filterValue;
  }

  function getAlertFreshnessStamp(alert) {
    return new Date(alert.lastEventAt || alert.updatedAt || alert.createdAt || 0).getTime();
  }

  function buildAlertOverviewMap(overviews) {
    return new Map((overviews || []).map((item) => [item.asset.id, item]));
  }

  function compareAlertPriority(a, b, overviewMap) {
    const unresolvedA = trimText(a.status) === 'resolved' ? 0 : 1;
    const unresolvedB = trimText(b.status) === 'resolved' ? 0 : 1;
    if (unresolvedA !== unresolvedB) return unresolvedB - unresolvedA;
    const severityA = ALERT_SEVERITY_ORDER[trimText(a.severity)] || 0;
    const severityB = ALERT_SEVERITY_ORDER[trimText(b.severity)] || 0;
    if (severityA !== severityB) return severityB - severityA;
    const healthA = overviewMap.get(a.assetId)?.healthScore ?? 101;
    const healthB = overviewMap.get(b.assetId)?.healthScore ?? 101;
    if (healthA !== healthB) return healthA - healthB;
    return getAlertFreshnessStamp(b) - getAlertFreshnessStamp(a);
  }

  function sortAlertsForView(alerts, sortMode, overviews = []) {
    const overviewMap = buildAlertOverviewMap(overviews);
    return [...(alerts || [])].sort((a, b) => {
      if (sortMode === 'freshness') {
        const freshnessDiff = getAlertFreshnessStamp(b) - getAlertFreshnessStamp(a);
        if (freshnessDiff !== 0) return freshnessDiff;
        return compareAlertPriority(a, b, overviewMap);
      }
      if (sortMode === 'severity') {
        const severityDiff = (ALERT_SEVERITY_ORDER[trimText(b.severity)] || 0) - (ALERT_SEVERITY_ORDER[trimText(a.severity)] || 0);
        if (severityDiff !== 0) return severityDiff;
        return compareAlertPriority(a, b, overviewMap);
      }
      if (sortMode === 'status') {
        const statusDiff = (ALERT_STATUS_ORDER[trimText(b.status)] || 0) - (ALERT_STATUS_ORDER[trimText(a.status)] || 0);
        if (statusDiff !== 0) return statusDiff;
        return compareAlertPriority(a, b, overviewMap);
      }
      return compareAlertPriority(a, b, overviewMap);
    });
  }

  function getAlertById(alertId) {
    return alertRegistry.find((item) => item.id === alertId) || null;
  }

  async function loadAlertEvents(alertId, { force = false } = {}) {
    if (!apiReady || !authState?.id || !alertId) return [];
    if (!force && alertEventRegistry[alertId]) return alertEventRegistry[alertId];
    const events = await apiRequest(`/alerts/${alertId}/events`);
    const normalized = normalizeAlertEvents(events);
    alertEventRegistry = {
      ...alertEventRegistry,
      [alertId]: normalized,
    };
    return normalized;
  }

  function getRiskMeta(session, fallbackStateKey = 'warning') {
    const stateKey = normalizeStateKey(session?.stateKey || fallbackStateKey);
    const severity = trimText(session?.playbook?.severity).toLowerCase();
    const cls = trimText(session?.cls);

    if (stateKey === 'healthy' || stateKey === 'after_maintenance') return RISK_LEVELS.low;
    if (stateKey === 'service' || session?.workStatus === 'repair') return RISK_LEVELS.high;
    if (
      severity.includes('крит') ||
      ['tooth_miss', 'root_crack', 'combination'].includes(cls)
    ) return RISK_LEVELS.critical;
    if (
      severity.includes('высок') ||
      ['inner_race'].includes(cls)
    ) return RISK_LEVELS.high;
    if (stateKey === 'warning') return RISK_LEVELS.medium;
    return RISK_LEVELS.medium;
  }

  function clampNumber(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function getHealthTone(score) {
    if (score >= 86) return 'good';
    if (score >= 66) return 'info';
    if (score >= 46) return 'warning';
    return 'critical';
  }

  function scoreSessionHealth(session, fallbackStateKey = 'warning') {
    const stateKey = normalizeStateKey(session?.stateKey || fallbackStateKey);
    const cls = trimText(session?.cls || session?.predicted_class);
    const riskMeta = getRiskMeta(session, fallbackStateKey);
    let score = 100;

    score -= { low: 8, medium: 24, high: 42, critical: 62 }[riskMeta.key] || 20;
    score -= { healthy: 0, warning: 10, service: 18, after_maintenance: 4 }[stateKey] || 12;

    const classPenalty = {
      normal: 0,
      surface_wear: 10,
      ball_fault: 14,
      outer_race: 18,
      tooth_chip: 20,
      inner_race: 26,
      root_crack: 34,
      tooth_miss: 42,
      combination: 40,
    }[cls] || 16;
    score -= classPenalty;

    if (stateKey === 'healthy' && cls === 'normal') score += 8;
    if (stateKey === 'after_maintenance' && cls === 'normal') score += 12;
    if (session?.isBaseline) score += 10;
    if (session?.workStatus === 'repair') score -= 8;
    if (session?.workStatus === 'replaced') score += 6;

    const confidence = Number(session?.confidence || 0);
    score -= Math.max(0, confidence - 0.9) * 8;
    score += Math.max(0, 0.55 - confidence) * 10;
    return Math.round(clampNumber(score, 8, 99));
  }

  function buildHealthSeries(sessions, fallbackStateKey = 'warning') {
    if (!sessions.length) return [];
    return [...sessions]
      .reverse()
      .map((item) => ({
        id: item.id,
        score: scoreSessionHealth(item, fallbackStateKey),
        label: item.savedAt || item.createdAt || item.created_at || '',
        cls: item.cls,
        stateKey: normalizeStateKey(item.stateKey),
      }));
  }

  function getHealthTrendMeta(series) {
    if (!series.length) {
      return { label: 'Нет тренда', delta: 0, direction: 'stable', tone: 'info' };
    }
    const current = series[series.length - 1].score;
    const previous = series.length > 1 ? series[series.length - 2].score : current;
    const delta = current - previous;
    if (delta >= 6) return { label: 'Улучшение', delta, direction: 'up', tone: 'good' };
    if (delta <= -6) return { label: 'Деградация', delta, direction: 'down', tone: 'critical' };
    return { label: 'Стабильно', delta, direction: 'flat', tone: 'info' };
  }

  function buildHealthSparkline(series, stroke = '#6ee7f9', fill = 'rgba(110,231,249,0.12)') {
    if (!series.length) {
      return '<div class="fleet-sparkline-empty">Недостаточно данных</div>';
    }
    const width = 180;
    const height = 64;
    const points = series.map((item) => item.score);
    const min = Math.min(...points, 0);
    const max = Math.max(...points, 100);
    const spread = Math.max(1, max - min);
    const coords = points.map((score, index) => {
      const x = series.length === 1 ? width / 2 : (index / (series.length - 1)) * width;
      const y = height - ((score - min) / spread) * (height - 10) - 5;
      return [x, y];
    });
    const polyline = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const area = [`0,${height}`, ...coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`), `${width},${height}`].join(' ');
    const last = coords[coords.length - 1];
    return `
      <svg class="fleet-sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
        <polyline class="fleet-sparkline-area" points="${area}" style="fill:${fill}"></polyline>
        <polyline class="fleet-sparkline-line" points="${polyline}" style="stroke:${stroke}"></polyline>
        <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3.6" style="fill:${stroke}"></circle>
      </svg>
    `;
  }

  function getHealthLabel(score) {
    if (score >= 86) return 'Stable';
    if (score >= 66) return 'Controlled';
    if (score >= 46) return 'Needs attention';
    return 'Critical';
  }

  function formatSignedScore(value) {
    const rounded = Math.round(value || 0);
    return `${rounded > 0 ? '+' : ''}${rounded}`;
  }

  function getHealthPalette(tone) {
    const map = {
      good: { stroke: '#34d399', fill: 'rgba(52,211,153,0.14)' },
      info: { stroke: '#6ee7f9', fill: 'rgba(110,231,249,0.14)' },
      warning: { stroke: '#fbbf24', fill: 'rgba(251,191,36,0.14)' },
      critical: { stroke: '#f87171', fill: 'rgba(248,113,113,0.16)' },
    };
    return map[tone] || map.info;
  }

  function getLatestAssetSession(assetId) {
    return getAssetSessions(assetId)[0] || null;
  }

  function getAssetOverview(asset) {
    const sessions = getAssetSessions(asset.id);
    const measurements = getAssetMeasurements(asset.id);
    const latestMeasurement = measurements[0] || null;
    const latest = sessions[0] || null;
    const stateMeta = latest ? getSessionStateMeta(latest.stateKey) : getSessionStateMeta(asset.currentStatus);
    const workMeta = latest ? getWorkStatusMeta(latest.workStatus) : getWorkStatusMeta('observe');
    const riskMeta = getRiskMeta(latest, asset.currentStatus);
    const reportCount = sessions.filter((item) => getReportByInspection(item.id)).length;
    const baseline = getAssetBaselineSession(asset.id);
    const lastUpdated = latest?.savedAt || asset.updated_at || asset.updatedAt || asset.created_at || asset.createdAt || null;
    const healthSeries = sessions.length
      ? buildHealthSeries(sessions, asset.currentStatus)
      : [{ id: asset.id, score: scoreSessionHealth(null, asset.currentStatus), label: lastUpdated, cls: 'normal', stateKey: asset.currentStatus }];
    const healthScore = healthSeries[healthSeries.length - 1]?.score || scoreSessionHealth(null, asset.currentStatus);
    const healthTrend = getHealthTrendMeta(healthSeries);
    const healthTone = getHealthTone(healthScore);
    const stageTrail = [];
    [...sessions].reverse().forEach((item) => {
      const stage = normalizeStateKey(item.stateKey);
      if (!stageTrail.length || stageTrail[stageTrail.length - 1] !== stage) {
        stageTrail.push(stage);
      }
    });
    return {
      asset,
      sessions,
      measurements,
      latestMeasurement,
      latest,
      baseline,
      stateMeta,
      workMeta,
      riskMeta,
      reportCount,
      measurementCount: measurements.length,
      lastUpdated,
      healthScore,
      healthTone,
      healthSeries,
      healthTrend,
      stageTrail,
    };
  }

  function getFilteredAssetOverviews() {
    const query = trimText(assetSearchQuery).toLowerCase();
    return assetRegistry
      .map(getAssetOverview)
      .filter((overview) => {
        const matchesQuery = !query || overview.asset.name.toLowerCase().includes(query);
        const matchesStatus = assetStatusFilter === 'all' || normalizeStateKey(overview.latest?.stateKey || overview.asset.currentStatus) === assetStatusFilter;
        const matchesRisk = assetRiskFilter === 'all' || overview.riskMeta.key === assetRiskFilter;
        return matchesQuery && matchesStatus && matchesRisk;
      })
      .sort((a, b) => {
        if (assetSortMode === 'health_asc') {
          return a.healthScore - b.healthScore;
        }
        if (assetSortMode === 'health_desc') {
          return b.healthScore - a.healthScore;
        }
        if (assetSortMode === 'name') {
          return a.asset.name.localeCompare(b.asset.name, 'ru');
        }
        if (assetSortMode === 'recovery') {
          const recoveryScoreA = normalizeStateKey(a.latest?.stateKey || a.asset.currentStatus) === 'after_maintenance' ? -1 : 0;
          const recoveryScoreB = normalizeStateKey(b.latest?.stateKey || b.asset.currentStatus) === 'after_maintenance' ? -1 : 0;
          if (recoveryScoreA !== recoveryScoreB) return recoveryScoreA - recoveryScoreB;
        }
        const riskWeight = { critical: 4, high: 3, medium: 2, low: 1 };
        const riskA = riskWeight[a.riskMeta.key] || 0;
        const riskB = riskWeight[b.riskMeta.key] || 0;
        if (riskA !== riskB) return riskB - riskA;
        if (a.healthScore !== b.healthScore) return a.healthScore - b.healthScore;
        const timeA = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
        const timeB = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0;
        return timeB - timeA;
      });
  }

  function sortAssetOverviewsByPriority(overviews) {
    const riskWeight = { critical: 4, high: 3, medium: 2, low: 1 };
    return [...overviews].sort((a, b) => {
      const riskA = riskWeight[a.riskMeta.key] || 0;
      const riskB = riskWeight[b.riskMeta.key] || 0;
      if (riskA !== riskB) return riskB - riskA;
      if (a.healthScore !== b.healthScore) return a.healthScore - b.healthScore;
      const timeA = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
      const timeB = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0;
      return timeB - timeA;
    });
  }

  function getPriorityAssetOverviews() {
    return sortAssetOverviewsByPriority(assetRegistry.map(getAssetOverview));
  }

  function getBaselineCandidateSession(overview) {
    if (!overview) return null;
    return overview.sessions.find((item) => item.isBaseline)
      || [...overview.sessions].reverse().find((item) => item.cls === 'normal' && ['healthy', 'after_maintenance'].includes(item.stateKey))
      || [...overview.sessions].reverse().find((item) => ['healthy', 'after_maintenance'].includes(item.stateKey))
      || overview.sessions[overview.sessions.length - 1]
      || null;
  }

  function buildProfileAlert(overview) {
    if (!overview) return null;
    const latest = overview.latest;
    const latestMeasurement = overview.latestMeasurement;
    const unlinkedMeasurements = overview.measurements.filter((item) => !item.inspectionId).length;
    const diagnosis = latest ? (VM.RU[latest.cls] || latest.cls) : 'Нет сохранённой инспекции';
    const comparisonTarget = latest?.id || null;

    if (latest && (overview.riskMeta.key === 'critical' || overview.healthScore <= 40)) {
      return {
        assetId: overview.asset.id,
        inspectionId: comparisonTarget,
        tone: 'critical',
        priority: 100,
        badge: overview.riskMeta.label,
        title: `${overview.asset.name}: требуется немедленное внимание`,
        summary: `${diagnosis} · health ${overview.healthScore}/100 · ${overview.riskMeta.note}`,
        note: latest.actionTaken || latest.engineerReason || latest.note || 'Откройте историю и подтвердите следующий шаг по узлу.',
        primaryAction: latest.stateKey === 'service'
          ? { type: 'prepare-after', label: 'КОНТРОЛЬ ПОСЛЕ ТО' }
          : { type: 'prepare-repair', label: 'ПОДГОТОВИТЬ РЕМОНТ' },
        secondaryAction: { type: 'open-compare', label: 'СРАВНЕНИЕ' },
      };
    }

    if (latest && latest.stateKey === 'service') {
      return {
        assetId: overview.asset.id,
        inspectionId: comparisonTarget,
        tone: 'warning',
        priority: 92,
        badge: 'After maintenance',
        title: `${overview.asset.name}: нужен контроль после обслуживания`,
        summary: `${diagnosis} · узел находится в сервисном цикле и ждёт контрольную запись.`,
        note: latest.actionTaken || 'Подготовьте контрольный сеанс и переведите узел в after maintenance после повторной проверки.',
        primaryAction: { type: 'prepare-after', label: 'СДЕЛАТЬ AFTER' },
        secondaryAction: { type: 'open-journal', label: 'ОТКРЫТЬ ЖУРНАЛ' },
      };
    }

    if (latest && overview.healthTrend.direction === 'down' && overview.healthScore < 72) {
      return {
        assetId: overview.asset.id,
        inspectionId: comparisonTarget,
        tone: 'warning',
        priority: 84,
        badge: 'Деградация',
        title: `${overview.asset.name}: тренд уходит вниз`,
        summary: `${diagnosis} · ${overview.healthTrend.label.toLowerCase()} ${formatSignedScore(overview.healthTrend.delta)} · health ${overview.healthScore}/100`,
        note: latest.engineerReason || latest.note || 'Сравните последнюю запись с baseline и проверьте, не ускоряется ли деградация.',
        primaryAction: { type: 'open-compare', label: 'ОТКРЫТЬ СРАВНЕНИЕ' },
        secondaryAction: { type: 'open-journal', label: 'К ЖУРНАЛУ' },
      };
    }

    if (!overview.baseline && overview.sessions.length) {
      const candidate = getBaselineCandidateSession(overview);
      if (candidate) {
        return {
          assetId: overview.asset.id,
          inspectionId: candidate.id,
          tone: 'info',
          priority: 74,
          badge: 'Нет baseline',
          title: `${overview.asset.name}: назначьте эталонный сеанс`,
        summary: `${overview.sessions.length} сохранённых сеансов · baseline нужен для корректного compare и отчётов.`,
        note: 'Назначьте healthy- или after maintenance-сеанс эталоном, чтобы сравнения и отчёты стали стабильнее.',
        primaryAction: { type: 'set-baseline', label: 'СДЕЛАТЬ BASELINE' },
        secondaryAction: { type: 'open-compare', label: 'ОТКРЫТЬ СРАВНЕНИЕ' },
        };
      }
    }

    if (unlinkedMeasurements && latestMeasurement) {
      return {
        assetId: overview.asset.id,
        inspectionId: comparisonTarget,
        measurementId: latestMeasurement.id,
        tone: 'info',
        priority: 66,
        badge: 'Измерения',
        title: `${overview.asset.name}: есть новые измерения`,
        summary: `${unlinkedMeasurements} запис${unlinkedMeasurements === 1 ? 'ь' : 'и'} без связанного сеанса в истории.`,
        note: latestMeasurement.originalName || 'Откройте последнее измерение на странице анализа и при необходимости сохраните его как новый сеанс.',
        primaryAction: { type: 'open-measurement', label: 'ОТКРЫТЬ В АНАЛИЗЕ' },
        secondaryAction: { type: 'open-monitoring', label: 'К ИЗМЕРЕНИЯМ' },
      };
    }

    if (latest && latest.stateKey === 'warning' && latest.workStatus !== 'repair') {
      return {
        assetId: overview.asset.id,
        inspectionId: comparisonTarget,
        tone: 'warning',
        priority: 60,
        badge: overview.riskMeta.label,
        title: `${overview.asset.name}: нужен следующий шаг по warning-сценарию`,
        summary: `${diagnosis} · ${overview.riskMeta.note}`,
        note: latest.actionTaken || latest.engineerReason || 'Подготовьте запись для сервисного шага или сравните кейс с baseline.',
        primaryAction: { type: 'prepare-repair', label: 'ПОДГОТОВИТЬ РЕМОНТ' },
        secondaryAction: { type: 'open-compare', label: 'СРАВНЕНИЕ' },
      };
    }

    return null;
  }

  function syncWorkStatusFromState(force = false) {
    const stateNode = el('sessionStateInput');
    const workNode = el('workStatusInput');
    if (!stateNode || !workNode) return;
    const stateKey = normalizeStateKey(stateNode.value);
    const currentWork = trimText(workNode.value);
    const nextWork = stateKey === 'service'
      ? 'repair'
      : stateKey === 'after_maintenance'
        ? 'replaced'
        : stateKey === 'warning'
          ? 'inspect'
          : 'observe';
    if (force || !currentWork || currentWork === 'observe' || currentWork === 'inspect' || currentWork === 'repair' || currentWork === 'replaced') {
      workNode.value = nextWork;
    }
  }

  function getCurrentAssetName() {
    return trimText(el('assetNameInput')?.value) || 'Не указан объект';
  }

  function getCurrentSessionState() {
    return normalizeStateKey(el('sessionStateInput')?.value);
  }

  function getCurrentWorkStatus() {
    const key = trimText(el('workStatusInput')?.value);
    return WORK_STATUSES[key] ? key : 'observe';
  }

  function getCurrentSessionNote() {
    return trimText(el('sessionNoteInput')?.value);
  }

  function getCurrentEngineerReason() {
    return trimText(el('engineerReasonInput')?.value);
  }

  function getCurrentActionTaken() {
    return trimText(el('actionTakenInput')?.value);
  }

  function getSaveActionLabel() {
    if (!apiReady) return 'API НЕДОСТУПЕН';
    return authState?.id ? 'СОХРАНИТЬ В ПРОФИЛЬ' : 'ВОЙТИ В ПРОФИЛЬ';
  }

  function buildUxActionMarkup(action, className) {
    const toneClass = action.tone === 'primary' ? ` ${className}--primary` : '';
    const attrs = [
      `class="${className}${toneClass}"`,
      'type="button"',
      `data-ux-action="${escapeHtml(action.kind)}"`,
    ];
    if (action.value != null) attrs.push(`data-ux-value="${escapeHtml(action.value)}"`);
    if (action.page != null) attrs.push(`data-ux-page="${escapeHtml(action.page)}"`);
    if (action.section != null) attrs.push(`data-ux-section="${escapeHtml(action.section)}"`);
    if (action.guide != null) attrs.push(`data-ux-guide="${escapeHtml(action.guide)}"`);
    if (action.lab != null) attrs.push(`data-ux-lab="${escapeHtml(action.lab)}"`);
    if (action.target != null) attrs.push(`data-ux-target="${escapeHtml(action.target)}"`);
    return `<button ${attrs.join(' ')}>${escapeHtml(action.label)}</button>`;
  }

  function shouldShowJourneyOnboarding() {
    if (!journeyOnboardingState) loadJourneyOnboardingState();
    if (!journeyDraftState) loadJourneyDraftState();
    if (initialRoute.page || initialRoute.section || initialRoute.demo || initialRoute.guide || initialRoute.lab) return false;
    if (shouldAutoRestoreJourneyDraft(journeyDraftState)) return false;
    return journeyOnboardingState?.seen !== true;
  }

  function openJourneyOnboarding(options = {}) {
    const shellNode = el('journeyOnboard');
    if (!shellNode) return;
    if (!journeyOnboardingState) loadJourneyOnboardingState();
    journeyOnboardingState = {
      ...journeyOnboardingState,
      lastOpenedAt: new Date().toISOString(),
    };
    saveJourneyOnboardingState();
    renderJourneyOnboarding();
    shellNode.hidden = false;
    document.body.classList.add('onboarding-open');
    if (options.focus !== false) {
      window.setTimeout(() => el('journeyOnboardTitle')?.focus?.(), 30);
    }
  }

  function closeJourneyOnboarding(options = {}) {
    const shellNode = el('journeyOnboard');
    if (!shellNode) return;
    shellNode.hidden = true;
    document.body.classList.remove('onboarding-open');
    if (options.persist !== false) {
      markJourneyOnboardingSeen({ dismissedAt: new Date().toISOString() });
    }
  }

  function completeJourneyOnboarding(routeKey) {
    markJourneyOnboardingSeen({
      dismissedAt: new Date().toISOString(),
      lastCompletedRoute: routeKey || analysisGuideMode,
    });
    closeJourneyOnboarding({ persist: false });
  }

  function renderJourneyOnboarding() {
    const shellNode = el('journeyOnboard');
    const resumeNode = el('journeyOnboardResume');
    const clearButton = el('journeyOnboardClear');
    if (!shellNode || !resumeNode || !clearButton) return;

    if (!journeyDraftState) loadJourneyDraftState();
    const snapshot = journeyDraftState;
    const diagnosisLabel = snapshot?.currentDiagnosis?.cls ? (VM.RU[snapshot.currentDiagnosis.cls] || snapshot.currentDiagnosis.cls) : null;
    const restoreLabel = snapshot?.currentInputContext?.label || diagnosisLabel || 'последний шаг анализа';
    const canResume = !!(snapshot && (snapshot.currentDiagnosis || snapshot.page === 'diag'));

    resumeNode.hidden = !canResume;
    clearButton.hidden = !canResume;
    if (canResume) {
      resumeNode.innerHTML = `
        <div class="journey-onboard-resume-head">
          <div class="journey-onboard-resume-copy">
            <strong>Есть автосохранённый прогресс</strong>
            <p>Последний сохранённый шаг: ${escapeHtml(restoreLabel)}. Сохранено в ${escapeHtml(formatClock(snapshot.savedAt))}. Можно продолжить с этого места или начать заново.</p>
          </div>
          <div class="journey-onboard-resume-actions">
            ${buildUxActionMarkup({ kind: 'resume-draft', label: 'ПРОДОЛЖИТЬ', tone: 'primary' }, 'analysis-sticky-action')}
            ${buildUxActionMarkup({ kind: 'clear-draft', label: 'НАЧАТЬ С ЧИСТОГО ЛИСТА' }, 'analysis-sticky-action')}
          </div>
        </div>
      `;
    } else {
      resumeNode.innerHTML = '';
    }
  }

  function renderAnalysisStickyProgress(config = buildAnalysisWizardConfig()) {
    const shellNode = el('analysisStickyProgress');
    const kickerNode = el('analysisStickyKicker');
    const titleNode = el('analysisStickyTitle');
    const autosaveNode = el('analysisStickyAutosave');
    const stepsNode = el('analysisStickySteps');
    const actionsNode = el('analysisStickyActions');
    if (!shellNode || !kickerNode || !titleNode || !autosaveNode || !stepsNode || !actionsNode) return;

    const lab = getStudyLab(activeStudyLabId);
    const labProgress = getStudyLabProgress(lab.id);
    const routeLabel = (analysisGuideMode === 'guided_labs' || analysisGuideMode === 'hidden_cases')
      ? `${lab.badge} · ${labProgress.completed}/${labProgress.total}`
      : getAnalysisGuideLabel();
    const wizardLabel = trimText((config.kicker || '').replace(/^WIZARD\s*·\s*/i, '')) || 'FLOW';

    kickerNode.textContent = `${routeLabel} · ${wizardLabel}`;
    titleNode.textContent = config.title || 'Пошаговый маршрут анализа';
    autosaveNode.textContent = autosaveMeta.restoredAt
      ? `Черновик восстановлен · ${formatClock(autosaveMeta.restoredAt)}`
      : autosaveMeta.savedAt
        ? `Автосохранено · ${formatClock(autosaveMeta.savedAt)}`
        : 'Автосохранение включено';

    const stickyActions = [
      { kind: 'scroll', value: 'analysisWizard', label: 'РАЗВЕРНУТЬ WIZARD', tone: 'primary' },
      { kind: 'open-onboarding', label: 'ONBOARDING' },
    ];
    if (journeyDraftState?.currentDiagnosis || journeyDraftState?.page === 'diag') {
      stickyActions.push({ kind: 'clear-draft', label: 'СБРОСИТЬ ЧЕРНОВИК' });
    }
    actionsNode.innerHTML = stickyActions.map((action) => buildUxActionMarkup(action, 'analysis-sticky-action')).join('');

    stepsNode.innerHTML = (config.steps || []).map((step) => {
      const stateLabel = step.status === 'done' ? 'DONE' : step.status === 'current' ? 'NOW' : 'NEXT';
      return `
        <article class="analysis-sticky-step is-${escapeHtml(step.status || 'upcoming')}">
          <div class="analysis-sticky-step-top">
            <span class="analysis-sticky-step-num">${escapeHtml(step.num || '01')}</span>
            <span class="analysis-sticky-step-state">${escapeHtml(stateLabel)}</span>
          </div>
          <strong>${escapeHtml(step.title || '')}</strong>
          <p>${escapeHtml(step.note || '')}</p>
        </article>
      `;
    }).join('');
  }

  function runUxAction(kind, dataset = {}) {
    switch (kind) {
      case 'demo':
        completeJourneyOnboarding('demo');
        runScenario(dataset.uxValue || 'normal');
        break;
      case 'lab':
        completeJourneyOnboarding(dataset.uxValue || 'virtual_lab');
        openLabScenario(dataset.uxValue || 'intro_baseline');
        break;
      case 'hidden-case':
        startHiddenCase(dataset.uxValue || getStudyLab(activeStudyLabId).hiddenCase.id);
        break;
      case 'page':
        goPage(dataset.uxValue || 'home');
        break;
      case 'guided-route':
        completeJourneyOnboarding(dataset.uxGuide || dataset.uxLab || 'guided-route');
        if (dataset.uxGuide) analysisGuideMode = dataset.uxGuide;
        if (dataset.uxLab && STUDY_LABS[dataset.uxLab]) {
          setActiveStudyLab(dataset.uxLab, { keepGuideMode: true, scroll: false });
        } else {
          renderStudyLabShell();
          renderAnalysisCoach();
        }
        goPage(dataset.uxPage || dataset.uxValue || 'diag');
        if (dataset.uxTarget) {
          window.setTimeout(() => el(dataset.uxTarget)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 90);
        }
        break;
      case 'section':
        goHomeSection(dataset.uxValue || 'section-quickstart');
        break;
      case 'open-onboarding':
        openJourneyOnboarding();
        break;
      case 'resume-draft':
        restoreJourneyDraft().catch((e) => {
          toast('Не удалось восстановить черновик', e.message || 'Ошибка восстановления локального автосохранения.', 'warning');
        });
        break;
      case 'clear-draft':
        clearJourneyDraft({ announce: true });
        break;
      case 'page-section':
        goPageSection(dataset.uxPage || 'profile', dataset.uxSection || dataset.uxValue || 'authPanel');
        break;
      case 'save':
        saveCurrentSession();
        break;
      case 'journal':
        openJournal();
        break;
      case '3d':
        openSimulatorFromAnalysis();
        break;
      case 'scroll':
        el(dataset.uxValue || 'diagResult')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
      default:
        break;
    }
  }

  function buildAnalysisGuideConfig() {
    const activeLab = getStudyLab(activeStudyLabId);
    const activeLabProgress = getStudyLabProgress(activeLab.id);
    const activeHidden = getCurrentHiddenCaseContext();

    if (activeHidden && !activeHidden.state?.revealed) {
      return {
        kicker: 'СКРЫТЫЙ КЕЙС АКТИВЕН',
        state: 'MYSTERY',
        title: activeHidden.challenge.title,
        lead: 'Сейчас ответ модели намеренно скрыт. Посмотрите на временной сигнал и FFT, сформулируйте гипотезу и только потом открывайте правильный ответ.',
        steps: [
          { label: 'СИГНАЛ', title: 'Сначала изучите временную область', note: 'Ищите импульсы, модуляцию и общую «жёсткость» сигнала.' },
          { label: 'FFT', title: 'Проверьте спектр', note: 'Смотрите на GMF, боковые полосы, broad-band noise и bearing signatures.' },
          { label: 'ГИПОТЕЗА', title: 'Выберите класс ниже', note: 'После фиксации ответа VibroLab раскроет диагноз и объяснение модели.' },
        ],
        tip: `Лаба ${activeHidden.lab.badge}: чекпоинт закроется после проверки гипотезы, а не после простого открытия ответа.`,
        actions: [
          { kind: 'scroll', value: 'diagResult', label: 'ПЕРЕЙТИ К ОТВЕТУ', tone: 'primary' },
        ],
      };
    }

    if (currentDiagnosis) {
      const diagnosisName = VM.RU[currentDiagnosis.cls] || currentDiagnosis.cls;
      return {
        kicker: 'РЕЗУЛЬТАТ ГОТОВ',
        state: diagnosisName.toUpperCase(),
        title: `Диагноз готов: ${diagnosisName}`,
        lead: 'Система уже собрала вероятности, пояснение простыми словами и рекомендуемое действие. Лучший следующий шаг — не потерять контекст: сохранить сеанс и открыть его в профиле или 3D.',
        steps: [
          {
            label: 'ПОНЯТЬ',
            title: 'Прочитайте объяснение человеческим языком',
            note: 'Блок «Что это значит?» перевёл модельный вывод в понятное описание состояния узла.',
          },
          {
            label: 'СОХРАНИТЬ',
            title: authState?.id ? 'Сохраните сеанс в журнал состояний' : 'Войдите в профиль и затем сохраните сеанс',
            note: authState?.id
              ? 'После сохранения результат попадёт в профиль, compare mode и историю измерений.'
              : 'Без входа вы увидите диагноз, но серверный журнал и сравнение состояний не включатся.',
          },
          {
            label: 'ПРОВЕРИТЬ',
            title: 'Откройте профиль или 3D-симулятор',
            note: currentDiagnosis.playbook?.nextStep || currentDiagnosis.playbook?.priority || 'Так проще закрепить вывод и понять физическую природу дефекта.',
          },
        ],
        tip: currentDiagnosis.playbook?.action || currentDiagnosis.playbook?.nextStep || 'Сначала сохраните сеанс, затем вернитесь к сравнению с baseline.',
        actions: [
          { kind: 'save', label: getSaveActionLabel(), tone: 'primary' },
          { kind: 'page', value: 'profile', label: 'ОТКРЫТЬ ПРОФИЛЬ' },
          { kind: '3d', label: 'ОТКРЫТЬ В ЛАБЕ' },
        ],
      };
    }

    if (diagLocked) {
      return {
        kicker: 'ИДЁТ АНАЛИЗ',
        state: 'ANALYZING',
        title: 'Подождите пару секунд, система уже считает сигнал',
        lead: 'Сейчас последовательно строятся временная область, спектр, признаки и итоговый диагноз. Ниже автоматически появится готовый результат без ручного обновления страницы.',
        steps: [
          { label: '01', title: 'Читаем источник', note: 'Файл или демо-сигнал приводится к единому формату анализа.' },
          { label: '02', title: 'Строим спектр и признаки', note: 'FFT, огибающая и диагностические признаки считаются прямо в браузере.' },
          { label: '03', title: 'Готовим вывод', note: 'Как только расчёт завершится, появятся диагноз, вероятности и следующий шаг.' },
        ],
        tip: 'Обычно первый результат появляется быстро. После этого можно сразу сохранить сеанс или открыть 3D-объяснение.',
        actions: [
          { kind: 'scroll', value: 'diagResult', label: 'ЖДАТЬ РЕЗУЛЬТАТ', tone: 'primary' },
        ],
      };
    }

    const guides = {
      first_time: {
        kicker: 'РЕКОМЕНДОВАННЫЙ СТАРТ',
        state: 'GUIDED',
        title: 'Начните с готового кейса, чтобы понять интерфейс без риска ошибиться',
        lead: 'Если вы здесь впервые, не загружайте сразу свой файл. Сначала посмотрите один понятный демонстрационный сценарий, а потом повторите тот же путь уже на своих данных.',
        steps: [
          { label: 'ШАГ 1', title: 'Откройте готовый кейс справа', note: 'Лучший первый запуск — «Норма»: сразу станет понятна структура экрана и логика результата.' },
          { label: 'ШАГ 2', title: 'Посмотрите, как читается диагноз', note: 'Ниже появятся сигнал, спектр, объяснение и рекомендуемое действие.' },
          { label: 'ШАГ 3', title: 'После этого загружайте свой файл', note: 'Интерфейс уже будет знаком, поэтому шанс запутаться резко упадёт.' },
        ],
        tip: 'Хороший порядок для первого знакомства: Норма → Отсутствие зуба → свой файл.',
        actions: [
          { kind: 'demo', value: 'normal', label: 'ЗАПУСТИТЬ КЕЙС «НОРМА»', tone: 'primary' },
          { kind: 'demo', value: 'tooth_miss', label: 'ПОКАЗАТЬ КРИТИЧЕСКИЙ ДЕФЕКТ' },
        ],
      },
      guided_labs: {
        kicker: 'GUIDED LABS',
        state: `${activeLabProgress.completed}/${activeLabProgress.total}`,
        title: activeLab.title,
        lead: activeLab.lead,
        steps: activeLab.checkpoints.map((checkpoint) => ({
          label: isStudyLabCheckpointDone(activeLab.id, checkpoint.id) ? '✓ DONE' : 'STEP',
          title: checkpoint.label,
          note: checkpoint.note,
        })),
        tip: getNextStudyLabCheckpoint(activeLab.id)
          ? `Следующий шаг: ${getNextStudyLabCheckpoint(activeLab.id).label}.`
          : 'Все чекпоинты закрыты. Можно переходить к следующей лаборатории или повторить скрытый кейс.',
        actions: [
          {
            kind: activeLab.actions[0]?.kind === 'run-demo' ? 'demo' : 'lab',
            value: activeLab.actions[0]?.value || 'normal',
            label: activeLab.actions[0]?.label || 'СТАРТОВАТЬ ЛАБУ',
            tone: 'primary',
          },
          { kind: 'hidden-case', value: activeLab.hiddenCase.id, label: 'СКРЫТЫЙ КЕЙС' },
          { kind: 'scroll', value: 'studentLabShell', label: 'ОТКРЫТЬ ПРОГРЕСС' },
        ],
      },
      hidden_cases: {
        kicker: 'SELF-CHECK',
        state: `${countSolvedHiddenCases()}/${getStudyLabList().length}`,
        title: `Скрытые кейсы · ${activeLab.hiddenCase.title}`,
        lead: 'Это режим самопроверки: VibroLab сначала показывает вам только сигнал и спектр, а ответ модели раскрывает только после гипотезы.',
        steps: [
          { label: '01', title: 'Запустите mystery-case', note: 'Берите кейс из активной лаборатории, чтобы не прыгать между разными физическими механизмами.' },
          { label: '02', title: 'Зафиксируйте свою гипотезу', note: 'Это важная часть учебного цикла: сначала собственное объяснение, потом модель.' },
          { label: '03', title: 'Сравните ответ и объяснение', note: 'После reveal-а посмотрите, где именно модель и ваша логика совпали или разошлись.' },
        ],
        tip: 'Даже неверная гипотеза полезна: она помогает увидеть, какие паттерны вы пока путаете между собой.',
        actions: [
          { kind: 'hidden-case', value: activeLab.hiddenCase.id, label: 'СТАРТОВАТЬ СКРЫТЫЙ КЕЙС', tone: 'primary' },
          { kind: 'scroll', value: 'studentLabShell', label: 'К СПИСКУ ЛАБ' },
        ],
      },
      own_file: {
        kicker: 'РАБОТА СО СВОИМ ФАЙЛОМ',
        state: 'UPLOAD',
        title: 'Загрузите сигнал и сразу получите понятный вывод без ручной подготовки',
        lead: 'Файл можно просто перетащить в зону слева. После загрузки VibroLab сам покажет временной сигнал, FFT, вероятности классов и человеческое объяснение результата.',
        steps: [
          { label: 'ФАЙЛ', title: 'Перетащите запись в upload-зону', note: 'Поддерживаются SEU TXT, WAV, CSV, MAT, NPY и UFF.' },
          { label: 'ПРОВЕРКА', title: 'Дождитесь автоматического расчёта', note: 'Ничего дополнительно нажимать не нужно: расчёт стартует сразу.' },
          { label: 'РЕЗУЛЬТАТ', title: 'Сохраните удачный кейс в профиль', note: 'Так он не потеряется и появится в журнале состояний для будущего сравнения.' },
        ],
        tip: 'Если файл большой, система сама выберет репрезентативное окно для первого диагноза.',
        actions: [
          { kind: 'scroll', value: 'uploadZone', label: 'ПЕРЕЙТИ К ЗАГРУЗКЕ', tone: 'primary' },
          { kind: 'demo', value: 'normal', label: 'СНАЧАЛА ПОСМОТРЕТЬ ДЕМО' },
        ],
      },
      compare_faults: {
        kicker: 'УЧЕБНЫЙ РЕЖИМ',
        state: 'COMPARE',
        title: 'Сравните разные дефекты и почувствуйте, как меняется интерпретация',
        lead: 'Этот сценарий полезен, когда нужно быстро объяснить разницу между gear fault и bearing fault. Пара контрастных кейсов даёт куда больше понимания, чем статичный слайд.',
        steps: [
          { label: 'GEAR', title: 'Откройте тяжёлый дефект зубчатой пары', note: '«Отсутствие зуба» сразу показывает критический паттерн и жёсткое рекомендуемое действие.' },
          { label: 'BEARING', title: 'Затем переключитесь на подшипник', note: 'Например, внутренняя обойма: увидите другой характер модуляции и другую интерпретацию.' },
          { label: 'PROFILE', title: 'Сохраните оба результата и сравните их', note: 'В профиле легче объяснить разницу между состояниями и baseline.' },
        ],
        tip: 'Для наглядной демонстрации хорошо работает связка: Отсутствие зуба → Дефект внутренней обоймы.',
        actions: [
          { kind: 'demo', value: 'tooth_miss', label: 'ОТКРЫТЬ GEAR FAULT', tone: 'primary' },
          { kind: 'demo', value: 'inner_race', label: 'ОТКРЫТЬ BEARING FAULT' },
        ],
      },
      virtual_lab: {
        kicker: 'ВИРТУАЛЬНАЯ ЛАБОРАТОРИЯ',
        state: 'LAB',
        title: 'Сначала изучите физику дефекта, потом возвращайтесь к диагностике',
        lead: 'Этот режим связывает 3D-механику, временной сигнал и FFT в одну учебную цепочку. Хороший маршрут: открыть лабораторный сценарий, увидеть физический эффект и затем проверить, узнаёте ли вы тот же паттерн в анализе.',
        steps: [
          { label: 'LAB 1', title: 'Откройте baseline или gear scenario', note: 'В симуляторе вы сразу увидите, как дефект влияет на механику, сигнал и спектр.' },
          { label: 'LAB 2', title: 'Сравните норму и дефект', note: 'Лучший эффект даёт режим Compare: становится видно, что именно меняется и почему.' },
          { label: 'LAB 3', title: 'Вернитесь к анализу и проверьте себя', note: 'После 3D-разбора эталонный или собственный файл читается намного увереннее.' },
        ],
        tip: 'Для первого прохода хорошо работает цепочка: baseline → gear fault → bearing fault → свой файл.',
        actions: [
          { kind: 'lab', value: 'intro_baseline', label: 'ОТКРЫТЬ BASELINE LAB', tone: 'primary' },
          { kind: 'lab', value: 'gear_fault_path', label: 'ОТКРЫТЬ GEAR LAB' },
          { kind: 'lab', value: 'bearing_fault_path', label: 'ОТКРЫТЬ BEARING LAB' },
        ],
      },
    };

    return guides[analysisGuideMode] || guides.first_time;
  }

  function renderAnalysisCoach() {
    const titleNode = el('analysisCoachTitle');
    const leadNode = el('analysisCoachLead');
    const kickerNode = el('analysisCoachKicker');
    const stateNode = el('analysisCoachState');
    const stepsNode = el('analysisCoachSteps');
    const tipNode = el('analysisCoachTip');
    const actionsNode = el('analysisCoachActions');
    if (!titleNode || !leadNode || !stepsNode || !tipNode || !actionsNode) return;

    const config = buildAnalysisGuideConfig();
    kickerNode.textContent = config.kicker;
    stateNode.textContent = config.state;
    titleNode.textContent = config.title;
    leadNode.textContent = config.lead;
    stepsNode.innerHTML = (config.steps || []).map((step) => `
      <article class="analysis-coach-step">
        <span class="analysis-coach-step-label">${escapeHtml(step.label)}</span>
        <strong>${escapeHtml(step.title)}</strong>
        <p>${escapeHtml(step.note)}</p>
      </article>
    `).join('');
    tipNode.textContent = config.tip || '';
    actionsNode.innerHTML = (config.actions || []).map((action) => buildUxActionMarkup(action, 'analysis-coach-action')).join('');

    document.querySelectorAll('[data-guide-mode]').forEach((button) => {
      const disabled = !!currentDiagnosis || diagLocked;
      button.disabled = disabled;
      button.classList.toggle('is-active', !disabled && button.dataset.guideMode === analysisGuideMode);
    });
    renderAnalysisWizard();
  }

  function hasAnalysisSignalData() {
    const data = currentSignalData?.data;
    return !!(data && typeof data.length === 'number' && data.length > 0);
  }

  function buildAnalysisWizardConfig() {
    const activeLab = getStudyLab(activeStudyLabId);
    const sourceLabel = trimText(currentDiagnosis?.input?.label || currentInputContext?.label);
    const diagnosisName = currentDiagnosis ? (VM.RU[currentDiagnosis.cls] || currentDiagnosis.cls) : null;
    const hiddenPending = isHiddenCasePending();
    const hasSource = diagLocked || hasAnalysisSignalData() || !!currentDiagnosis;

    const steps = [
      {
        num: '01',
        title: 'Выберите источник',
        note: hasSource
          ? (sourceLabel ? `Источник выбран: ${sourceLabel}.` : 'Источник для анализа уже выбран.')
          : 'Запустите демо-кейс, guided lab или загрузите свой файл.',
        status: hasSource ? 'done' : 'current',
      },
      {
        num: '02',
        title: 'Посмотрите сигнал и FFT',
        note: hasSource
          ? (diagLocked ? 'Строим временной сигнал и спектр. Это занимает всего несколько секунд.' : 'Временная область и FFT уже готовы для интерпретации.')
          : 'После запуска здесь появятся временная область, FFT и диагностические подсказки.',
        status: diagLocked ? 'current' : hasSource ? 'done' : 'upcoming',
      },
      {
        num: '03',
        title: hiddenPending ? 'Сформулируйте гипотезу' : 'Прочитайте диагноз',
        note: hiddenPending
          ? 'Скрытый кейс активен: сначала выберите свой вариант, а уже потом открывайте ответ модели.'
          : currentDiagnosis
            ? `Диагноз готов: ${diagnosisName}. Сопоставьте результат с объяснением и вероятностями классов.`
            : 'После расчёта здесь появится итоговый класс, объяснение и рекомендуемое действие.',
        status: hiddenPending ? 'current' : currentDiagnosis ? 'done' : 'upcoming',
      },
      {
        num: '04',
        title: 'Закрепите результат',
        note: currentDiagnosis
          ? 'Откройте физический разбор в 3D, сохраните кейс в профиль или переходите к следующему маршруту.'
          : 'Финальный шаг откроется после появления результата анализа.',
        status: currentDiagnosis && !hiddenPending ? 'current' : 'upcoming',
      },
    ];

    if (diagLocked) {
      return {
        kicker: 'WIZARD · STEP 2/4',
        title: sourceLabel ? `Готовим разбор по источнику «${sourceLabel}»` : 'Строим сигнал и подготавливаем диагноз',
        lead: 'Сейчас VibroLab считает временную область, FFT и признаки. Ничего дополнительно нажимать не нужно: дождитесь результата ниже.',
        actions: [
          { kind: 'scroll', value: 'sigCanvas', label: 'СМОТРЕТЬ СИГНАЛ', tone: 'primary' },
          { kind: 'scroll', value: 'specCanvas', label: 'СМОТРЕТЬ FFT' },
        ],
        steps,
      };
    }

    if (hiddenPending) {
      return {
        kicker: 'WIZARD · STEP 3/4',
        title: 'Сначала ваша гипотеза, потом ответ модели',
        lead: 'Это учебный режим самопроверки. Смотрите на сигнал и FFT как инженер, не опираясь на готовую подсказку модели.',
        actions: [
          { kind: 'scroll', value: 'diagResult', label: 'ПЕРЕЙТИ К ГИПОТЕЗЕ', tone: 'primary' },
          { kind: 'lab', value: activeLab.id, label: 'ОТКРЫТЬ 3D ЛАБУ' },
        ],
        steps,
      };
    }

    if (currentDiagnosis) {
      const primaryActions = apiReady
        ? [
            { kind: 'save', label: getSaveActionLabel(), tone: 'primary' },
            { kind: '3d', label: 'ПОКАЗАТЬ В 3D' },
            { kind: 'page', value: 'profile', label: 'ОТКРЫТЬ ПРОФИЛЬ' },
          ]
        : [
            { kind: '3d', label: 'ПОКАЗАТЬ В 3D', tone: 'primary' },
            { kind: 'page', value: 'profile', label: 'ОТКРЫТЬ ПРОФИЛЬ' },
          ];
      return {
        kicker: 'WIZARD · STEP 4/4',
        title: `${diagnosisName} · результат готов`,
        lead: 'Теперь главное не потерять контекст: откройте физическую интерпретацию в 3D, сохраните кейс в профиль или переходите к следующему сценарию.',
        actions: primaryActions,
        steps,
      };
    }

    const presetsByMode = {
      guided_labs: {
        kicker: 'WIZARD · LAB ENTRY',
        title: `Стартуйте с лаборатории «${activeLab.title}»`,
        lead: 'Guided labs лучше всего подходят для обучения: система проведёт вас по шагам и не даст потерять контекст между сигналом, 3D и самопроверкой.',
        actions: [
          { kind: 'guided-route', page: 'diag', guide: 'guided_labs', lab: activeLab.id, target: 'studentLabShell', label: 'ОТКРЫТЬ GUIDED LAB', tone: 'primary' },
          { kind: 'demo', value: activeLab.actions.find((action) => action.kind === 'run-demo')?.value || 'normal', label: 'ЗАПУСТИТЬ ДЕМО-КЕЙС' },
        ],
      },
      hidden_cases: {
        kicker: 'WIZARD · SELF-CHECK',
        title: 'Скрытый кейс как режим самопроверки',
        lead: 'Если уже знакомы с паттернами дефектов, можно сразу проверить себя: VibroLab скроет ответ модели до вашей гипотезы.',
        actions: [
          { kind: 'hidden-case', value: activeLab.hiddenCase.id, label: 'СТАРТОВАТЬ СКРЫТЫЙ КЕЙС', tone: 'primary' },
          { kind: 'guided-route', page: 'diag', guide: 'guided_labs', lab: activeLab.id, target: 'studentLabShell', label: 'СНАЧАЛА ОТКРЫТЬ ЛАБУ' },
        ],
      },
      own_file: {
        kicker: 'WIZARD · FILE ROUTE',
        title: 'Сразу переходите к своему сигналу',
        lead: 'Upload-зона уже готова. После выбора файла VibroLab сам построит сигнал, FFT, признаки и понятное объяснение результата.',
        actions: [
          { kind: 'guided-route', page: 'diag', guide: 'own_file', target: 'uploadZone', label: 'ПЕРЕЙТИ К ЗАГРУЗКЕ', tone: 'primary' },
          { kind: 'demo', value: 'normal', label: 'СНАЧАЛА ПОСМОТРЕТЬ ЭТАЛОН' },
        ],
      },
      compare_faults: {
        kicker: 'WIZARD · COMPARE',
        title: 'Сравните контрастные дефекты',
        lead: 'Хороший учебный маршрут для объяснения разницы между gear fault и bearing fault: два контрастных кейса дают больше понимания, чем десяток слайдов.',
        actions: [
          { kind: 'demo', value: 'tooth_miss', label: 'ОТКРЫТЬ GEAR FAULT', tone: 'primary' },
          { kind: 'demo', value: 'inner_race', label: 'ОТКРЫТЬ BEARING FAULT' },
        ],
      },
      virtual_lab: {
        kicker: 'WIZARD · 3D FIRST',
        title: 'Сначала откройте экскурсию по физике дефекта',
        lead: 'Если хочется сначала понять механику, откройте 3D lab. Guided tour проведёт вас по узлам, а затем можно вернуться сюда уже с более уверенной оптикой.',
        actions: [
          { kind: 'lab', value: 'intro_baseline', label: 'ЗАПУСТИТЬ 3D TOUR', tone: 'primary' },
          { kind: 'guided-route', page: 'diag', guide: 'guided_labs', lab: 'intro_baseline', target: 'studentLabShell', label: 'ПОСЛЕ ЭТОГО К LABS' },
        ],
      },
      first_time: {
        kicker: 'WIZARD · FIRST RUN',
        title: 'Лучший первый запуск — готовый кейс без риска ошибиться',
        lead: 'Начните с эталонного сигнала, посмотрите, как читается диагноз, а потом переходите к своему файлу или лабораторному маршруту.',
        actions: [
          { kind: 'demo', value: 'normal', label: 'ЗАПУСТИТЬ КЕЙС «НОРМА»', tone: 'primary' },
          { kind: 'guided-route', page: 'diag', guide: 'own_file', target: 'uploadZone', label: 'ПОТОМ ЗАГРУЗИТЬ СВОЙ ФАЙЛ' },
        ],
      },
    };

    return {
      ...(presetsByMode[analysisGuideMode] || presetsByMode.first_time),
      steps,
    };
  }

  function renderAnalysisWizard() {
    const shellNode = el('analysisWizard');
    const kickerNode = el('analysisWizardKicker');
    const titleNode = el('analysisWizardTitle');
    const leadNode = el('analysisWizardLead');
    const stepsNode = el('analysisWizardSteps');
    const actionsNode = el('analysisWizardActions');
    if (!shellNode || !kickerNode || !titleNode || !leadNode || !stepsNode || !actionsNode) return;

    const config = buildAnalysisWizardConfig();
    kickerNode.textContent = config.kicker;
    titleNode.textContent = config.title;
    leadNode.textContent = config.lead;
    stepsNode.innerHTML = (config.steps || []).map((step) => {
      const stateLabel = step.status === 'done' ? 'DONE' : step.status === 'current' ? 'NOW' : 'NEXT';
      return `
        <article class="analysis-wizard-step is-${escapeHtml(step.status || 'upcoming')}">
          <div class="analysis-wizard-step-top">
            <span class="analysis-wizard-step-num">${escapeHtml(step.num || '01')}</span>
            <span class="analysis-wizard-step-state">${escapeHtml(stateLabel)}</span>
          </div>
          <strong>${escapeHtml(step.title || '')}</strong>
          <p>${escapeHtml(step.note || '')}</p>
        </article>
      `;
    }).join('');
    actionsNode.innerHTML = (config.actions || []).map((action) => buildUxActionMarkup(action, 'analysis-coach-action')).join('');
    renderAnalysisStickyProgress(config);
  }

  function buildProfileOnboardConfig() {
    const hasAuth = !!authState?.id;
    const hasSessions = sessionHistory.length > 0;
    const hasComparison = sessionHistory.length > 1;
    const hasCurrent = !!currentDiagnosis;

    let kicker = 'ПРОГРЕСС РАБОТЫ';
    let title = 'Войдите, сохраните первый анализ и включите нормальный рабочий цикл';
    let lead = 'После этого кабинет станет по-настоящему полезным: появятся история, baseline, сравнение состояний и журнал действий.';
    let actions = [
      { kind: 'page-section', page: 'profile', section: 'authPanel', label: 'ОТКРЫТЬ ВХОД', tone: 'primary' },
      { kind: 'page', value: 'diag', label: 'СНАЧАЛА ПОПРОБОВАТЬ АНАЛИЗ' },
    ];

    if (!apiReady) {
      kicker = 'ЛОКАЛЬНЫЙ РЕЖИМ';
      title = 'Backend сейчас недоступен, но анализ и демо-сценарии продолжают работать';
      lead = 'Можно спокойно изучать интерфейс, запускать кейсы и готовить сигналы. Когда серверный контур поднимется, кабинет снова начнёт сохранять историю и measurements.';
      actions = [
        { kind: 'page', value: 'diag', label: 'ПЕРЕЙТИ К АНАЛИЗУ', tone: 'primary' },
        { kind: '3d', label: 'ОТКРЫТЬ 3D' },
      ];
    } else if (hasAuth && !hasSessions && hasCurrent) {
      kicker = 'ПОЧТИ ГОТОВО';
      title = 'Текущий диагноз уже есть. Остался один шаг: сохранить его в профиль';
      lead = 'После сохранения журнал состояний перестанет быть пустым, а compare mode начнёт работать как полноценный рабочий инструмент.';
      actions = [
        { kind: 'save', label: 'СОХРАНИТЬ ТЕКУЩИЙ РЕЗУЛЬТАТ', tone: 'primary' },
        { kind: 'page-section', page: 'profile', section: 'journalPanel', label: 'ПЕРЕЙТИ К ЖУРНАЛУ' },
      ];
    } else if (hasAuth && !hasSessions) {
      kicker = 'СЛЕДУЮЩИЙ ШАГ';
      title = 'Аккаунт готов. Теперь нужен первый сохранённый анализ';
      lead = 'Запустите любой сценарий на странице анализа и вернитесь сюда. После первой записи профиль станет полезным не только как форма входа, но и как полноценный журнал состояний.';
      actions = [
        { kind: 'page', value: 'diag', label: 'К АНАЛИЗУ', tone: 'primary' },
        { kind: 'demo', value: 'normal', label: 'СНАЧАЛА ОТКРЫТЬ ДЕМО' },
      ];
    } else if (hasAuth && hasSessions && !hasComparison) {
      kicker = 'ЕЩЁ ОДИН ШАГ';
      title = 'Первый сеанс сохранён. Теперь добавьте вторую запись для сравнения';
      lead = 'После двух и более сеансов профиль превращается в удобный инструмент: можно сравнивать baseline, подтверждать деградацию и фиксировать эффект обслуживания.';
      actions = [
        { kind: 'page', value: 'diag', label: 'ДОБАВИТЬ ЕЩЁ ОДИН СЕАНС', tone: 'primary' },
        { kind: 'page-section', page: 'profile', section: 'analysisComparePanel', label: 'ОТКРЫТЬ COMPARE MODE' },
      ];
    } else if (hasAuth && hasComparison) {
      kicker = 'РАБОЧИЙ КОНТУР АКТИВЕН';
      title = 'Профиль уже работает как настоящий учебный журнал состояния оборудования';
      lead = 'У вас есть история, сравнение и мониторинг. Теперь можно двигаться по циклу «анализ → сохранение → сравнение → действие» без потери контекста.';
      actions = [
        { kind: 'page-section', page: 'profile', section: 'analysisComparePanel', label: 'СРАВНИТЬ СОСТОЯНИЯ', tone: 'primary' },
        { kind: 'page-section', page: 'profile', section: 'monitoringPanel', label: 'ОТКРЫТЬ ИЗМЕРЕНИЯ' },
      ];
    }

    const steps = [
      {
        num: '01',
        title: 'Аккаунт',
        note: hasAuth
          ? `Вошли как ${authState.name || authState.email || 'пользователь'}. Серверный кабинет доступен.`
          : 'Войдите, чтобы история и измерения сохранялись не только в текущем браузере.',
        state: hasAuth ? 'ГОТОВО' : apiReady ? 'СЕЙЧАС' : 'ПАУЗА',
        done: hasAuth,
        current: !hasAuth && apiReady,
      },
      {
        num: '02',
        title: 'Первый сохранённый анализ',
        note: hasSessions
          ? `Уже сохранено ${sessionHistory.length} ${sessionHistory.length === 1 ? 'сеанс' : sessionHistory.length < 5 ? 'сеанса' : 'сеансов'}.`
          : hasCurrent
            ? 'Текущий диагноз уже готов. Его можно сразу отправить в журнал состояний.'
            : 'Запустите анализ на странице «Анализ» и сохраните первый результат.',
        state: hasSessions ? 'ГОТОВО' : hasAuth ? 'СЕЙЧАС' : 'ДАЛЕЕ',
        done: hasSessions,
        current: hasAuth && !hasSessions,
      },
      {
        num: '03',
        title: 'Сравнение и monitoring',
        note: hasComparison
          ? 'Можно сравнивать baseline с дефектными кейсами и вести рабочий журнал действий.'
          : 'После двух и более записей compare mode и monitoring становятся по-настоящему полезными.',
        state: hasComparison ? 'ГОТОВО' : hasSessions ? 'СЛЕДУЮЩИЙ' : 'ПОТОМ',
        done: hasComparison,
        current: hasSessions && !hasComparison,
      },
    ];

    return { kicker, title, lead, actions, steps };
  }

  function renderProfileOnboard() {
    const titleNode = el('profileOnboardTitle');
    const leadNode = el('profileOnboardLead');
    const kickerNode = el('profileOnboardKicker');
    const stepsNode = el('profileOnboardSteps');
    const actionsNode = el('profileOnboardActions');
    if (!titleNode || !leadNode || !stepsNode || !actionsNode) return;

    const config = buildProfileOnboardConfig();
    kickerNode.textContent = config.kicker;
    titleNode.textContent = config.title;
    leadNode.textContent = config.lead;
    stepsNode.innerHTML = (config.steps || []).map((step) => `
      <article class="profile-onboard-step${step.done ? ' is-done' : ''}${step.current ? ' is-current' : ''}">
        <div class="profile-onboard-step-top">
          <span class="profile-onboard-step-num">${escapeHtml(step.num)}</span>
          <span class="profile-onboard-step-state">${escapeHtml(step.state)}</span>
        </div>
        <strong>${escapeHtml(step.title)}</strong>
        <p>${escapeHtml(step.note)}</p>
      </article>
    `).join('');
    actionsNode.innerHTML = (config.actions || []).map((action) => buildUxActionMarkup(action, 'profile-onboard-action')).join('');
  }

  function buildCaptureSummaryMarkup() {
    if (!currentDiagnosis) {
      return 'Запустите анализ, затем сохраните текущий результат в журнал состояний.';
    }
    const stateMeta = getSessionStateMeta(getCurrentSessionState());
    const workMeta = getWorkStatusMeta(getCurrentWorkStatus());
    const confidence = ((currentDiagnosis.confidence || 0) * 100).toFixed(1);
    return `<div class="workspace-summary-label">ТЕКУЩИЙ СЕАНС</div>
      <div class="workspace-summary-value">
        ${escapeHtml(currentDiagnosis.input?.label || currentDiagnosis.sourceLabel || 'Сигнал')} ·
        <span style="color:${VM.COLORS[currentDiagnosis.cls] || '#fff'}">${escapeHtml(VM.RU[currentDiagnosis.cls] || currentDiagnosis.cls)}</span>
        · CONF ${confidence}%
      </div>
      <div style="margin-top:8px;font-size:12px;color:#96a4b7;line-height:1.7">
        Объект: <strong style="color:#fff">${escapeHtml(getCurrentAssetName())}</strong><br>
        Состояние записи: <strong style="color:#fff">${escapeHtml(stateMeta.label)}</strong><br>
        Статус работ: <strong style="color:#fff">${escapeHtml(workMeta.label)}</strong><br>
        ${getCurrentEngineerReason() ? `Почему: <strong style="color:#fff">${escapeHtml(getCurrentEngineerReason())}</strong><br>` : ''}
        ${getCurrentActionTaken() ? `Что сделано: <strong style="color:#fff">${escapeHtml(getCurrentActionTaken())}</strong><br>` : ''}
        ${escapeHtml(currentDiagnosis.playbook.priority)}
      </div>`;
  }

  function renderCaptureSummary() {
    const node = el('captureSummary');
    if (node) {
      node.innerHTML = buildCaptureSummaryMarkup();
      document.querySelectorAll('[data-save-session]').forEach((button) => {
        button.textContent = getSaveActionLabel();
      });
    }
    renderAnalysisCoach();
    renderProfileOnboard();
  }

  function updateHeaderProfile() {
    const chip = el('headerProfileChip');
    if (!chip) return;
    if (!apiReady) {
      chip.textContent = 'СЕРВЕР НЕДОСТУПЕН';
      chip.classList.remove('profile-chip--active');
      return;
    }
    if (authState?.id) {
      chip.textContent = `${authState.name.toUpperCase()}${authState.role ? ' · ' + authState.role.toUpperCase() : ''}`;
      chip.classList.add('profile-chip--active');
    } else {
      chip.textContent = 'ВОЙТИ';
      chip.classList.remove('profile-chip--active');
    }
  }

  function renderAuthSummary() {
    const node = el('authSummary');
    if (!node) return;
    const importBtn = el('authImportBtn');
    const logoutBtn = el('authLogoutBtn');
    if (el('authNameInput')) el('authNameInput').value = authState?.name || '';
    if (el('authEmailInput')) el('authEmailInput').value = authState?.email || '';
    if (el('authPasswordInput')) el('authPasswordInput').value = '';
    if (logoutBtn) logoutBtn.style.display = authState?.id ? 'inline-flex' : 'none';
    if (importBtn) importBtn.style.display = authState?.id && hasLegacySessions() && !isLegacyImportDone() ? 'inline-flex' : 'none';

    if (!apiReady) {
      node.innerHTML = `<div class="workspace-state workspace-state--offline">
          <div class="workspace-state-icon" aria-hidden="true">📡</div>
          <div class="workspace-state-text">
            <strong>Серверные функции временно недоступны</strong>
            <p>Аккаунт, история и сохранение сеансов работают через backend API. Когда серверный контур восстановится, сюда снова вернутся вход, журнал и monitoring.</p>
            <p class="workspace-state-hint">Анализ сигналов и 3D-симулятор работают и без сервера.</p>
          </div>
        </div>`;
      return;
    }

    if (!authState?.id) {
      node.innerHTML = `<div class="workspace-state workspace-state--guest">
          <div class="workspace-state-icon" aria-hidden="true">👋</div>
          <div class="workspace-state-text">
            <strong>Добро пожаловать, гость</strong>
            <p>Зарегистрируйтесь или войдите по email — и сеансы анализа будут сохраняться в вашем журнале.</p>
            ${hasLegacySessions() && !isLegacyImportDone() ? `<p class="workspace-state-hint">В этом браузере нашлись старые записи — после входа их можно будет перенести.</p>` : ''}
          </div>
        </div>`;
      return;
    }

    node.innerHTML = `<div class="workspace-summary-label">АКТИВНЫЙ ПРОФИЛЬ</div>
      <div class="workspace-summary-value">${escapeHtml(authState.name)}</div>
      <div style="margin-top:8px;font-size:12px;color:#92a1b4;line-height:1.7">
        ${escapeHtml(authState.email)}<br>
        ${escapeHtml(authState.role || 'Роль не указана')} · активная сессия до ${escapeHtml(formatStamp(authState.sessionExpiresAt))}
      </div>
      <div class="workspace-summary-grid">
        <div class="workspace-summary-card">
          <div class="workspace-summary-label">СОХРАНЕННЫХ СЕАНСОВ</div>
          <div class="workspace-summary-value">${sessionHistory.length}</div>
        </div>
        <div class="workspace-summary-card">
          <div class="workspace-summary-label">УЗЛОВ</div>
          <div class="workspace-summary-value">${dashboardSummary?.assets ?? new Set(sessionHistory.map(item => item.assetName)).size}</div>
        </div>
        <div class="workspace-summary-card">
          <div class="workspace-summary-label">ИЗМЕРЕНИЙ</div>
          <div class="workspace-summary-value">${dashboardSummary?.measurements ?? measurementRegistry.length}</div>
        </div>
        <div class="workspace-summary-card">
          <div class="workspace-summary-label">АКТИВНЫХ ALERT-ОВ</div>
          <div class="workspace-summary-value">${dashboardSummary?.alerts_active ?? alertRegistry.filter(item => item.status !== 'resolved').length}</div>
        </div>
      </div>
      ${hasLegacySessions() && !isLegacyImportDone() ? `
        <div style="margin-top:12px;font-size:12px;color:#c6d1de;line-height:1.7">
          В браузере найден локальный журнал. Нажмите «Импорт из браузера», чтобы перенести старые записи в серверную базу.
        </div>` : ''}
    `;
  }

  function renderProfileHealthOverview() {
    const summaryNode = el('profileHealthSummary');
    const alertListNode = el('profileAlertList');
    const alertEmptyNode = el('profileAlertEmpty');
    const alertStatusNode = el('profileAlertStatusSummary');
    const alertFilterNode = el('profileAlertFilterRow');
    const alertSortFieldNode = el('profileAlertSortField');
    const alertSortInput = el('profileAlertSortInput');
    if (!summaryNode || !alertListNode || !alertEmptyNode || !alertStatusNode || !alertFilterNode || !alertSortFieldNode || !alertSortInput) return;

    if (!apiReady) {
      summaryNode.innerHTML = `<div class="workspace-empty-block"><strong>Серверные панели временно недоступны.</strong> Сводка по узлам, health score и alert-лента появятся сразу после восстановления backend API. Анализ сигналов и 3D-симулятор продолжают работать локально.</div>`;
      alertStatusNode.innerHTML = '';
      alertFilterNode.style.display = 'none';
      alertSortFieldNode.style.display = 'none';
      alertEmptyNode.style.display = 'block';
      alertEmptyNode.textContent = 'Alert-лента появится после запуска серверного контура.';
      alertListNode.innerHTML = '';
      return;
    }

    if (!authState?.id) {
      summaryNode.innerHTML = `<div class="workspace-empty-block">Войдите в аккаунт, чтобы видеть здоровье узлов, приоритетные alert-ы и сохранённую историю по оборудованию.</div>`;
      alertStatusNode.innerHTML = '';
      alertFilterNode.style.display = 'none';
      alertSortFieldNode.style.display = 'none';
      alertEmptyNode.style.display = 'block';
      alertEmptyNode.textContent = 'После входа здесь появятся узлы, требующие внимания, и рекомендации по следующему действию.';
      alertListNode.innerHTML = '';
      return;
    }

    const overviews = getPriorityAssetOverviews();
    if (!overviews.length) {
      summaryNode.innerHTML = `<div class="workspace-empty-block">Сохраните первый серверный сеанс, и профиль начнёт считать health score, отслеживать деградацию и выделять важные кейсы.</div>`;
      alertStatusNode.innerHTML = '';
      alertFilterNode.style.display = 'none';
      alertSortFieldNode.style.display = 'none';
      alertEmptyNode.style.display = 'block';
      alertEmptyNode.textContent = 'Alert-лента появится после первой сохранённой записи.';
      alertListNode.innerHTML = '';
      return;
    }

    const avgHealth = Math.round(overviews.reduce((acc, item) => acc + item.healthScore, 0) / overviews.length);
    const needsAttention = overviews.filter((item) => ['high', 'critical'].includes(item.riskMeta.key) || item.healthScore < 60).length;
    const recovering = overviews.filter((item) => normalizeStateKey(item.latest?.stateKey || item.asset.currentStatus) === 'after_maintenance').length;
    const withoutBaseline = overviews.filter((item) => !item.baseline).length;
    const rawWaiting = overviews.reduce((acc, item) => acc + item.measurements.filter((measurement) => !measurement.inspectionId).length, 0);
    const topPriority = overviews[0] || null;
    const topPalette = getHealthPalette(topPriority?.healthTone || 'info');
    const topDiagnosis = topPriority?.latest ? (VM.RU[topPriority.latest.cls] || topPriority.latest.cls) : 'Нет инспекций';

    summaryNode.innerHTML = `
      <div class="profile-health-grid">
        <div class="profile-health-card">
          <span>Активных узлов</span>
          <strong>${overviews.length}</strong>
          <small>${dashboardSummary?.inspections ?? sessionHistory.length} сохранённых сеансов</small>
        </div>
        <div class="profile-health-card profile-health-card--${getHealthTone(avgHealth)}">
          <span>Средний health</span>
          <strong>${avgHealth}/100</strong>
          <small>${escapeHtml(getHealthLabel(avgHealth))}</small>
        </div>
        <div class="profile-health-card profile-health-card--warning">
          <span>Требуют внимания</span>
          <strong>${needsAttention}</strong>
          <small>high / critical risk и просевшие health-score</small>
        </div>
        <div class="profile-health-card">
          <span>После обслуживания</span>
          <strong>${recovering}</strong>
          <small>узлы в стадии after maintenance</small>
        </div>
        <div class="profile-health-card">
          <span>Без baseline</span>
          <strong>${withoutBaseline}</strong>
          <small>сравнение и отчёт пока не опираются на эталон</small>
        </div>
        <div class="profile-health-card">
          <span>Новые raw-записи</span>
          <strong>${rawWaiting}</strong>
          <small>измерения без связанной inspection</small>
        </div>
      </div>
      <div class="profile-health-focus">
        <div class="profile-health-focus-copy">
          <div class="profile-health-focus-kicker">ПРИОРИТЕТНЫЙ УЗЕЛ</div>
          <div class="profile-health-focus-title">${escapeHtml(topPriority?.asset.name || 'Пока не определён')}</div>
          <div class="profile-health-focus-note">
            ${topPriority ? `${escapeHtml(topDiagnosis)} · ${escapeHtml(topPriority.riskMeta.label)} · ${topPriority.healthScore}/100` : 'Пока нет данных для приоритизации.'}
          </div>
          <div class="profile-health-focus-note">
            ${escapeHtml(topPriority?.latest?.actionTaken || topPriority?.latest?.engineerReason || topPriority?.riskMeta.note || 'После сохранения сеансов система начнёт выделять объекты с повышенным риском.')}
          </div>
        </div>
        <div class="profile-health-focus-chart">
          ${topPriority ? buildHealthSparkline(topPriority.healthSeries, topPalette.stroke, topPalette.fill) : '<div class="fleet-sparkline-empty">Нет тренда</div>'}
        </div>
      </div>
    `;

    const serverAlerts = sortAlertsForView(alertRegistry, alertSortMode, overviews);

    if (serverAlerts.length) {
      const counts = getAlertStatusCounts(serverAlerts);
      alertFilterNode.style.display = 'flex';
      alertSortFieldNode.style.display = 'flex';
      alertSortInput.disabled = false;
      alertSortInput.value = alertSortMode;
      alertStatusNode.innerHTML = `
        <span class="workspace-stat-pill">${counts.all} всего</span>
        <span class="workspace-stat-pill">${counts.active} активных</span>
        <span class="workspace-stat-pill">${counts.new} new</span>
        <span class="workspace-stat-pill">${counts.acknowledged} acknowledged</span>
        <span class="workspace-stat-pill">${counts.in_progress} in progress</span>
        <span class="workspace-stat-pill">${counts.resolved} resolved</span>
      `;
      alertFilterNode.querySelectorAll('[data-alert-filter]').forEach((button) => {
        button.classList.toggle('is-active', button.dataset.alertFilter === alertStatusFilter);
      });
      const filteredAlerts = serverAlerts.filter((alert) => matchesAlertFilter(alert, alertStatusFilter));
      if (!filteredAlerts.length) {
        selectedAlertId = null;
        alertEmptyNode.style.display = 'block';
        alertEmptyNode.textContent = `Для фильтра "${alertStatusFilter}" alert-ов сейчас нет.`;
        alertListNode.innerHTML = '';
        return;
      }
      if (!getAlertById(selectedAlertId)) selectedAlertId = serverAlerts[0].id;
      if (!filteredAlerts.some((item) => item.id === selectedAlertId)) {
        selectedAlertId = filteredAlerts[0].id;
      }
      alertEmptyNode.style.display = 'none';
      alertListNode.innerHTML = filteredAlerts.slice(0, 6).map((alert) => {
        const statusMeta = getAlertStatusMeta(alert.status);
        const severityTone = getAlertSeverityTone(alert.severity);
        const nextStatus = getAlertNextStatus(alert.status);
        const nextStatusMeta = getAlertStatusMeta(nextStatus);
        const diagnosis = alert.currentClass ? (VM.RU[alert.currentClass] || alert.currentClass) : 'Диагноз не привязан';
        const overview = overviews.find((item) => item.asset.id === alert.assetId) || null;
        const healthLine = overview ? `Health ${overview.healthScore}/100 · ${overview.healthTrend.label}` : 'Health trend ещё не рассчитан';
        return `
          <article class="profile-alert-item profile-alert-item--${severityTone} ${selectedAlertId === alert.id ? 'is-active' : ''}" data-alert-id="${escapeHtml(alert.id)}">
            <div class="profile-alert-head">
              <div>
                <div class="profile-alert-title">${escapeHtml(alert.title)}</div>
                <div class="profile-alert-copy">${escapeHtml(diagnosis)} · ${escapeHtml(alert.summary)}</div>
              </div>
              <div class="history-badge-stack">
                <span class="health-badge health-badge--${severityTone}"><span class="dot"></span>${escapeHtml(getAlertSeverityLabel(alert.severity))}</span>
                <span class="health-badge health-badge--${statusMeta.tone}"><span class="dot"></span>${escapeHtml(statusMeta.label)}</span>
              </div>
            </div>
            <div class="profile-alert-note">${escapeHtml(alert.recommended_action || healthLine)}</div>
            <div class="profile-alert-actions">
              <button class="history-btn" type="button" data-profile-alert-action="select-alert" data-alert-id="${escapeHtml(alert.id)}" data-asset-id="${escapeHtml(alert.assetId)}">ОТКРЫТЬ LOG</button>
              <button class="history-btn" type="button" data-profile-alert-action="advance-status" data-alert-id="${escapeHtml(alert.id)}" data-next-status="${escapeHtml(nextStatus)}" data-asset-id="${escapeHtml(alert.assetId)}">${escapeHtml(nextStatusMeta.label)}</button>
              <button class="history-btn" type="button" data-profile-alert-action="open-compare" data-alert-id="${escapeHtml(alert.id)}" data-asset-id="${escapeHtml(alert.assetId)}" ${alert.inspectionId ? `data-inspection-id="${escapeHtml(alert.inspectionId)}"` : ''}>СРАВНЕНИЕ</button>
              <button class="history-btn" type="button" data-profile-alert-action="open-journal" data-alert-id="${escapeHtml(alert.id)}" data-asset-id="${escapeHtml(alert.assetId)}" ${alert.inspectionId ? `data-inspection-id="${escapeHtml(alert.inspectionId)}"` : ''}>ЖУРНАЛ</button>
            </div>
          </article>
        `;
      }).join('');
      return;
    }

    alertStatusNode.innerHTML = '';
    alertFilterNode.style.display = 'none';
    alertSortFieldNode.style.display = 'none';
    alertSortInput.disabled = true;
    selectedAlertId = null;
    const alerts = overviews
      .map(buildProfileAlert)
      .filter(Boolean)
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 4);

    if (!alerts.length) {
      alertEmptyNode.style.display = 'block';
      alertEmptyNode.textContent = 'Критичных alert-ов сейчас нет. Система не видит срочных действий по сохранённым узлам.';
      alertListNode.innerHTML = '';
      return;
    }

    selectedAlertId = null;
    alertEmptyNode.style.display = 'none';
    alertListNode.innerHTML = alerts.map((alert) => `
      <article class="profile-alert-item profile-alert-item--${alert.tone}">
        <div class="profile-alert-head">
          <div>
            <div class="profile-alert-title">${escapeHtml(alert.title)}</div>
            <div class="profile-alert-copy">${escapeHtml(alert.summary)}</div>
          </div>
          <span class="health-badge health-badge--${alert.tone}"><span class="dot"></span>${escapeHtml(alert.badge)}</span>
        </div>
        <div class="profile-alert-note">${escapeHtml(alert.note)}</div>
        <div class="profile-alert-actions">
          ${alert.primaryAction ? `<button class="history-btn" type="button" data-profile-alert-action="${escapeHtml(alert.primaryAction.type)}" data-asset-id="${escapeHtml(alert.assetId)}" ${alert.inspectionId ? `data-inspection-id="${escapeHtml(alert.inspectionId)}"` : ''} ${alert.measurementId ? `data-measurement-id="${escapeHtml(alert.measurementId)}"` : ''}>${escapeHtml(alert.primaryAction.label)}</button>` : ''}
          ${alert.secondaryAction ? `<button class="history-btn" type="button" data-profile-alert-action="${escapeHtml(alert.secondaryAction.type)}" data-asset-id="${escapeHtml(alert.assetId)}" ${alert.inspectionId ? `data-inspection-id="${escapeHtml(alert.inspectionId)}"` : ''} ${alert.measurementId ? `data-measurement-id="${escapeHtml(alert.measurementId)}"` : ''}>${escapeHtml(alert.secondaryAction.label)}</button>` : ''}
        </div>
      </article>
    `).join('');
  }

  function renderAlertLifecyclePanel() {
    const summaryNode = el('profileAlertLogSummary');
    const listNode = el('profileAlertEventList');
    const emptyNode = el('profileAlertLogEmpty');
    const form = el('profileAlertEventForm');
    const submitBtn = el('alertEventSubmitBtn');
    const compareBtn = el('alertOpenCompareBtn');
    const journalBtn = el('alertOpenJournalBtn');
    if (!summaryNode || !listNode || !emptyNode || !form || !submitBtn || !compareBtn || !journalBtn) return;

    if (!apiReady || !authState?.id) {
      form.style.display = 'none';
      emptyNode.style.display = 'block';
      emptyNode.textContent = 'Войдите в аккаунт, чтобы управлять alert-ами и сохранять историю действий.';
      summaryNode.innerHTML = '';
      listNode.innerHTML = '';
      return;
    }

    const alert = getAlertById(selectedAlertId);
    if (!alert) {
      form.style.display = 'none';
      emptyNode.style.display = 'block';
      emptyNode.textContent = 'Выберите alert из списка выше, чтобы увидеть его текущий статус и историю действий.';
      summaryNode.innerHTML = '';
      listNode.innerHTML = '';
      return;
    }

    const statusMeta = getAlertStatusMeta(alert.status);
    const severityTone = getAlertSeverityTone(alert.severity);
    const diagnosis = alert.currentClass ? (VM.RU[alert.currentClass] || alert.currentClass) : 'Диагноз не привязан';
    const events = alertEventRegistry[alert.id] || [];
    form.style.display = 'block';
    emptyNode.style.display = events.length ? 'none' : 'block';
    emptyNode.textContent = 'По этому alert-у пока нет сохранённых действий. Добавьте первое инженерное событие ниже.';
    submitBtn.disabled = false;
    compareBtn.disabled = !alert.inspectionId;
    journalBtn.disabled = false;
    if (el('alertEventTypeInput')) el('alertEventTypeInput').value = 'note';
    if (el('alertNextStatusInput')) el('alertNextStatusInput').value = getAlertNextStatus(alert.status);

    summaryNode.innerHTML = `
      <div class="profile-alert-log-card">
        <div class="profile-alert-log-head">
          <div>
            <div class="profile-alert-log-title">${escapeHtml(alert.title)}</div>
            <div class="profile-alert-log-copy">${escapeHtml(diagnosis)} · ${escapeHtml(alert.summary)}</div>
          </div>
          <div class="history-badge-stack">
            <span class="health-badge health-badge--${severityTone}"><span class="dot"></span>${escapeHtml(getAlertSeverityLabel(alert.severity))}</span>
            <span class="health-badge health-badge--${statusMeta.tone}"><span class="dot"></span>${escapeHtml(statusMeta.label)}</span>
          </div>
        </div>
        <div class="profile-alert-status-row">
          <span class="health-badge"><span class="dot"></span>${escapeHtml(alert.assetName)}</span>
          <span class="health-badge"><span class="dot"></span>${escapeHtml(alert.recommended_action || 'Без рекомендации')}</span>
          <span class="health-badge"><span class="dot"></span>${alert.eventsCount} событий</span>
        </div>
      </div>
    `;

    listNode.innerHTML = events.map((event) => {
      const fromMeta = event.fromStatus ? getAlertStatusMeta(event.fromStatus) : null;
      const toMeta = event.toStatus ? getAlertStatusMeta(event.toStatus) : null;
      const transition = fromMeta || toMeta
        ? `${fromMeta ? fromMeta.label : 'Создание'}${toMeta ? ` → ${toMeta.label}` : ''}`
        : 'Комментарий';
      return `
        <article class="profile-alert-event">
          <div class="profile-alert-event-head">
            <div>
              <div class="profile-alert-event-title">${escapeHtml(event.eventType || event.event_type || 'note')} · ${escapeHtml(transition)}</div>
              <div class="profile-alert-event-meta">${escapeHtml(formatStamp(event.createdAt))} · ${escapeHtml(event.authorName || authState?.name || 'Unknown')}</div>
            </div>
            ${toMeta ? `<span class="health-badge health-badge--${toMeta.tone}"><span class="dot"></span>${escapeHtml(toMeta.label)}</span>` : ''}
          </div>
          <div class="profile-alert-event-note">${escapeHtml(event.message || 'Без комментария.')}</div>
        </article>
      `;
    }).join('');
  }

  function renderHistoryStats() {
    const node = el('historyStats');
    if (!node) return;
    const uniqueAssets = new Set(sessionHistory.map(item => item.assetName).filter(Boolean)).size;
    const latest = sessionHistory[0]?.savedAt ? formatStamp(sessionHistory[0].savedAt) : '—';
    const assetCount = dashboardSummary?.assets ?? uniqueAssets ?? 0;
    node.innerHTML = `
      <span class="workspace-stat-pill">${sessionHistory.length} сеансов</span>
      <span class="workspace-stat-pill">${assetCount} узлов</span>
      <span class="workspace-stat-pill">${measurementRegistry.length} измерений</span>
      <span class="workspace-stat-pill">${reportRegistry.length} отчётов</span>
      <span class="workspace-stat-pill">${alertRegistry.filter(item => item.status !== 'resolved').length} активных alert-ов</span>
      <span class="workspace-stat-pill">Обновлено ${escapeHtml(latest)}</span>
    `;
  }

  function renderHistory() {
    const listNode = el('historyList');
    const emptyNode = el('historyEmpty');
    if (!listNode || !emptyNode) return;

    renderHistoryStats();
    if (!sessionHistory.length) {
      emptyNode.style.display = 'block';
      listNode.innerHTML = '';
      return;
    }

    emptyNode.style.display = 'none';
    listNode.innerHTML = sessionHistory.map((item) => {
      const stateMeta = getSessionStateMeta(item.stateKey);
      const workMeta = getWorkStatusMeta(item.workStatus);
      const clsColor = VM.COLORS[item.cls] || '#fff';
      const confidence = ((item.confidence || 0) * 100).toFixed(1);
      const linkedReport = reportRegistry.find((report) => report.inspectionId === item.id);
      return `<article class="history-item">
        <div class="history-item-header">
          <div>
            <div class="history-item-title">${escapeHtml(item.assetName || 'Не указан объект')}</div>
            <div class="history-item-meta">${escapeHtml(formatStamp(item.savedAt))} · ${escapeHtml(authState?.name || 'Аккаунт')} · ${escapeHtml(item.input?.label || item.input_label || 'Сеанс анализа')}</div>
          </div>
          <div class="history-badge-stack">
            <span class="health-badge health-badge--${stateMeta.tone}"><span class="dot"></span>${escapeHtml(stateMeta.label)}</span>
            <span class="health-badge health-badge--${workMeta.tone}"><span class="dot"></span>${escapeHtml(workMeta.label)}</span>
            ${item.isBaseline ? '<span class="health-badge health-badge--good"><span class="dot"></span>BASELINE</span>' : ''}
          </div>
        </div>
        <div class="history-item-grid">
          <div class="history-item-card">
            <div class="label">ДИАГНОЗ</div>
            <div style="color:${clsColor};font-size:15px;line-height:1.6">${escapeHtml(VM.RU[item.cls] || item.cls)}</div>
          </div>
          <div class="history-item-card">
            <div class="label">УВЕРЕННОСТЬ</div>
            <div style="color:#fff;font-size:15px;line-height:1.6">CONF ${confidence}%</div>
          </div>
          <div class="history-item-card">
            <div class="label">ПРИОРИТЕТ</div>
            <div style="color:#fff;font-size:15px;line-height:1.6">${escapeHtml(item.playbook?.priority || stateMeta.note)}</div>
          </div>
        </div>
        ${item.note ? `<div class="history-item-note">${escapeHtml(item.note)}</div>` : ''}
        ${(item.engineerReason || item.actionTaken) ? `
          <div class="history-item-note">
            ${item.engineerReason ? `<strong>Почему:</strong> ${escapeHtml(item.engineerReason)}<br>` : ''}
            ${item.actionTaken ? `<strong>Что сделано:</strong> ${escapeHtml(item.actionTaken)}` : ''}
          </div>` : ''}
        <div class="history-item-actions">
          <button class="history-btn" type="button" data-action="open" data-id="${escapeHtml(item.id)}">ОТКРЫТЬ</button>
          <button class="history-btn" type="button" data-action="reuse" data-id="${escapeHtml(item.id)}">ЗАПОЛНИТЬ ФОРМУ</button>
          <button class="history-btn" type="button" data-action="baseline" data-id="${escapeHtml(item.id)}">${item.isBaseline ? 'ЭТАЛОН ✓' : 'СДЕЛАТЬ BASELINE'}</button>
          <button class="history-btn" type="button" data-action="compare" data-id="${escapeHtml(item.id)}">СРАВНИТЬ</button>
          <button class="history-btn" type="button" data-action="report" data-id="${escapeHtml(item.id)}">${linkedReport ? 'ОТЧЁТ' : 'СОЗДАТЬ ОТЧЁТ'}</button>
          <button class="history-btn history-btn--danger" type="button" data-action="delete" data-id="${escapeHtml(item.id)}">УДАЛИТЬ</button>
        </div>
      </article>`;
    }).join('');
  }

  function renderAnalysisComparePanel() {
    const assetSelect = el('analysisCompareAssetSelect');
    const modeSelect = el('analysisCompareModeSelect');
    const referenceSelect = el('analysisCompareReferenceSelect');
    const targetSelect = el('analysisCompareTargetSelect');
    const summaryNode = el('analysisCompareSummary');
    const panel = el('analysisComparePanel');
    if (!assetSelect || !modeSelect || !referenceSelect || !targetSelect || !summaryNode || !panel) return;

    if (!assetRegistry.length || !sessionHistory.length) {
      panel.classList.add('is-empty');
      assetSelect.innerHTML = '<option value="">Нет узлов</option>';
      modeSelect.value = analysisCompareMode;
      referenceSelect.innerHTML = '<option value="">Нет сеансов</option>';
      targetSelect.innerHTML = '<option value="">Нет сеансов</option>';
      referenceSelect.disabled = true;
      targetSelect.disabled = true;
      summaryNode.innerHTML = '<div class="workspace-empty-block">Сохраните хотя бы один серверный сеанс, чтобы включить режим сравнения и сопоставлять эталонную, текущую и контрольную записи.</div>';
      return;
    }

    panel.classList.remove('is-empty');
    syncAnalysisCompareState();
    const context = getAnalysisCompareContext();
    const sessions = context.sessions;
    const currentSnapshot = getCurrentAnalysisSnapshot();
    const currentMatchesAsset = currentSnapshot && currentSnapshot.assetId === context.asset?.id;

    assetSelect.innerHTML = assetRegistry.map((asset) => `<option value="${escapeHtml(asset.id)}">${escapeHtml(asset.name)}</option>`).join('');
    if (analysisCompareAssetId) assetSelect.value = analysisCompareAssetId;
    modeSelect.value = analysisCompareMode;

    referenceSelect.disabled = !sessions.length;
    targetSelect.disabled = !sessions.length && !currentMatchesAsset;

    referenceSelect.innerHTML = sessions.length
      ? sessions.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(buildSessionOptionLabel(item))}</option>`).join('')
      : '<option value="">Нет сеансов</option>';
    if (analysisCompareReferenceId) referenceSelect.value = analysisCompareReferenceId;

    const targetOptions = [];
    if (currentMatchesAsset) {
      targetOptions.push(`<option value="__current">Текущий анализ · ${escapeHtml(currentSnapshot.input?.label || 'Текущий кейс')}</option>`);
    }
    targetOptions.push(...sessions.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(buildSessionOptionLabel(item))}</option>`));
    targetSelect.innerHTML = targetOptions.join('') || '<option value="">Нет сеансов</option>';
    if (analysisCompareTargetId && [...targetSelect.options].some((option) => option.value === analysisCompareTargetId)) {
      targetSelect.value = analysisCompareTargetId;
    }

    const reference = context.reference;
    const target = context.target;
    if (!context.asset || !reference || !target) {
      summaryNode.innerHTML = `<div class="workspace-empty-block">${escapeHtml(context.modeMeta.note)} Выберите reference и target, чтобы построить инженерное сравнение.</div>`;
      return;
    }

    const referenceMetrics = signalMetrics(reference.signalData);
    const targetMetrics = signalMetrics(target.signalData);
    const rmsDeltaPct = referenceMetrics.rms ? ((targetMetrics.rms - referenceMetrics.rms) / referenceMetrics.rms) * 100 : null;
    const peakDeltaPct = referenceMetrics.peak ? ((targetMetrics.peak - referenceMetrics.peak) / referenceMetrics.peak) * 100 : null;
    const referenceClass = VM.RU[reference.cls] || reference.cls || '—';
    const targetClass = VM.RU[target.cls] || target.cls || '—';
    const stateTrail = `${getSessionStateMeta(reference.stateKey || 'healthy').label} → ${getSessionStateMeta(target.stateKey || 'warning').label}`;
    const note = target.actionTaken || target.engineerReason || target.note || reference.engineerReason || reference.note || context.modeMeta.note;

    summaryNode.innerHTML = `
      <div class="analysis-compare-header">
        <div>
          <div class="analysis-compare-kicker">${escapeHtml(context.modeMeta.label)}</div>
          <div class="analysis-compare-title">${escapeHtml(context.asset.name)} · ${escapeHtml(context.referenceLabel)} → ${escapeHtml(context.targetLabel)}</div>
        </div>
        <div class="history-badge-stack">
          <span class="health-badge health-badge--${getSessionStateMeta(reference.stateKey || 'healthy').tone}"><span class="dot"></span>${escapeHtml(getSessionStateMeta(reference.stateKey || 'healthy').label)}</span>
          <span class="health-badge health-badge--${getRiskMeta(target).tone}"><span class="dot"></span>${escapeHtml(getRiskMeta(target).label)}</span>
        </div>
      </div>
      <div class="analysis-compare-metrics">
        <div class="analysis-compare-metric">
          <span>Состояние</span>
          <strong>${escapeHtml(stateTrail)}</strong>
          <small>${escapeHtml(context.modeMeta.note)}</small>
        </div>
        <div class="analysis-compare-metric">
          <span>Диагноз</span>
          <strong>${escapeHtml(referenceClass)} → ${escapeHtml(targetClass)}</strong>
          <small>${((reference.confidence || 0) * 100).toFixed(1)}% → ${((target.confidence || 0) * 100).toFixed(1)}%</small>
        </div>
        <div class="analysis-compare-metric">
          <span>RMS</span>
          <strong>${referenceMetrics.rms.toFixed(3)} → ${targetMetrics.rms.toFixed(3)}</strong>
          <small>${escapeHtml(formatMetricDelta(rmsDeltaPct))}</small>
        </div>
        <div class="analysis-compare-metric">
          <span>Peak</span>
          <strong>${referenceMetrics.peak.toFixed(3)} → ${targetMetrics.peak.toFixed(3)}</strong>
          <small>${escapeHtml(formatMetricDelta(peakDeltaPct))}</small>
        </div>
      </div>
      <div class="analysis-compare-note">
        <strong>Инженерный вывод:</strong> ${escapeHtml(note)}
      </div>
    `;
  }

  function rerenderActiveDiagnosis() {
    if (!currentDiagnosis) return;
    const signal = Array.isArray(currentDiagnosis.signalData) && currentDiagnosis.signalData.length
      ? currentDiagnosis.signalData
      : Array.from(currentSignalData?.data || []);
    if (!signal.length) return;
    showDiagnosis(
      currentDiagnosis.cls,
      currentDiagnosis.probabilities || { [currentDiagnosis.cls]: currentDiagnosis.confidence || 1 },
      VM.COLORS[currentDiagnosis.cls],
      signal,
    );
  }

  function applyAnalysisCompareMode(nextMode, { force = true, openTarget = true } = {}) {
    analysisCompareMode = nextMode;
    syncAnalysisCompareState(force);
    renderAnalysisComparePanel();

    if (!openTarget) return;
    if (analysisCompareTargetId && analysisCompareTargetId !== '__current') {
      const activeSessionId = getActiveAnalysisSessionId();
      if (activeSessionId !== analysisCompareTargetId) {
        restoreSession(analysisCompareTargetId, 'open', { silent: true, skipScroll: true });
        return;
      }
    }
    rerenderActiveDiagnosis();
  }

  function renderWorkspace() {
    renderProfileOnboard();
    renderProfileHealthOverview();
    renderAlertLifecyclePanel();
    renderHistory();
    renderAnalysisComparePanel();
    renderMonitoringFeed();
    renderAssetFleet();
    renderAssetCard();
    renderAssetTrend();
    renderAssetWorkflow();
    renderAssetTimeline();
    renderComparePanel();
    renderReportPanel();
  }

  function getAssetById(assetId) {
    return assetRegistry.find((item) => item.id === assetId) || null;
  }

  function getMeasurementById(measurementId) {
    return measurementRegistry.find((item) => item.id === measurementId) || null;
  }

  function getAssetMeasurements(assetId) {
    return measurementRegistry.filter((item) => item.assetId === assetId);
  }

  function getAssetSessions(assetId) {
    return sessionHistory.filter((item) => item.assetId === assetId);
  }

  function getInspectionById(inspectionId) {
    return sessionHistory.find((item) => item.id === inspectionId) || null;
  }

  function getReportByInspection(inspectionId) {
    return reportRegistry.find((item) => item.inspectionId === inspectionId) || null;
  }

  function getAssetBaselineSession(assetId) {
    const sessions = getAssetSessions(assetId);
    return sessions.find((item) => item.isBaseline) || [...sessions].reverse().find((item) => item.stateKey === 'healthy') || null;
  }

  function getAssetByName(name) {
    const normalized = trimText(name).toLowerCase();
    return assetRegistry.find((item) => trimText(item.name).toLowerCase() === normalized) || null;
  }

  function signalMetrics(signal) {
    const data = Array.isArray(signal) ? signal : [];
    if (!data.length) return { rms: 0, peak: 0 };
    const sum = data.reduce((acc, value) => acc + value * value, 0);
    const peak = data.reduce((acc, value) => Math.max(acc, Math.abs(value)), 0);
    return { rms: Math.sqrt(sum / data.length), peak };
  }

  function buildSessionOptionLabel(item) {
    return `${item.isBaseline ? '[BASELINE] ' : ''}${formatStamp(item.savedAt)} · ${item.assetName} · ${VM.RU[item.cls] || item.cls}`;
  }

  function shouldAutoMarkBaseline() {
    if (!currentDiagnosis) return false;
    const stateKey = getCurrentSessionState();
    if (!['healthy', 'after_maintenance'].includes(stateKey)) return false;
    if (currentDiagnosis.cls !== 'normal') return false;
    const assetName = getCurrentAssetName();
    if (!assetName) return false;
    const asset = getAssetByName(assetName);
    return asset ? !getAssetBaselineSession(asset.id) : true;
  }

  function getSimulatorLaunchConfig(cls) {
    const mapping = {
      normal: { fault: 'normal', preset: 'healthy' },
      tooth_chip: { fault: 'chip' },
      tooth_miss: { fault: 'miss' },
      root_crack: { fault: 'crack' },
      surface_wear: { fault: 'wear' },
      ball_fault: { fault: 'ball', preset: 'bearing' },
      inner_race: { fault: 'inner', preset: 'bearing' },
      outer_race: { fault: 'outer', preset: 'bearing' },
      combination: { fault: 'chip', preset: 'multi' },
    };
    return mapping[cls] || { fault: 'normal', preset: 'healthy' };
  }

  function inferLabScenarioFromDiagnosis(cls) {
    if (['ball_fault', 'inner_race', 'outer_race'].includes(cls)) return 'bearing_fault_path';
    if (cls === 'normal') return 'intro_baseline';
    return 'gear_fault_path';
  }

  function buildLabLaunchUrl(labId = 'intro_baseline', extra = {}) {
    const params = new URLSearchParams();
    params.set('source', 'lab');
    params.set('lab', labId);
    Object.entries(extra).forEach(([key, value]) => {
      if (value == null || value === '') return;
      params.set(key, String(value));
    });
    return `simulator.html?${params.toString()}`;
  }

  function openLabScenario(labId = 'intro_baseline') {
    markStudyLabCheckpointsByTrigger('sim_lab', labId);
    window.open(buildLabLaunchUrl(labId), '_blank', 'noopener,noreferrer');
  }

  function buildSimulatorLaunchUrl() {
    if (!currentDiagnosis) return 'simulator.html';
    const config = getSimulatorLaunchConfig(currentDiagnosis.cls);
    const params = new URLSearchParams();
    params.set('source', 'analysis');
    params.set('cls', currentDiagnosis.cls);
    params.set('lab', inferLabScenarioFromDiagnosis(currentDiagnosis.cls));
    params.set('fault', config.fault);
    if (config.preset) params.set('preset', config.preset);
    params.set('autofocus', '1');
    params.set('impact', '1');
    if (currentDiagnosis.confidence != null) params.set('confidence', String(Number(currentDiagnosis.confidence).toFixed(4)));
    if (currentInputContext?.label) params.set('label', currentInputContext.label);
    const assetName = getCurrentAssetName();
    if (assetName) params.set('asset', assetName);
    return `simulator.html?${params.toString()}`;
  }

  function openSimulatorFromAnalysis() {
    if (!currentDiagnosis) {
      toast('Нет диагноза', 'Сначала выполните анализ сигнала, затем откройте дефект в 3D.', 'warning');
      return;
    }
    window.open(buildSimulatorLaunchUrl(), '_blank', 'noopener,noreferrer');
  }

  function resolveAnalysisAsset() {
    const typedName = trimText(el('assetNameInput')?.value);
    if (typedName && typedName !== 'Не указан объект') {
      return getAssetByName(typedName) || getAssetById(selectedAssetId);
    }
    return getAssetById(selectedAssetId);
  }

  function getAnalysisBaselineSession() {
    const asset = resolveAnalysisAsset();
    return asset ? getAssetBaselineSession(asset.id) : null;
  }

  function getLatestDefectSession(assetId) {
    const sessions = getAssetSessions(assetId);
    return sessions.find((item) => item.cls !== 'normal' || !['healthy', 'after_maintenance'].includes(item.stateKey)) || sessions[0] || null;
  }

  function getMaintenanceComparisonPair(assetId) {
    const sessions = getAssetSessions(assetId);
    const target = sessions.find((item) => item.stateKey === 'after_maintenance');
    if (!target) return null;
    const index = sessions.findIndex((item) => item.id === target.id);
    const olderSessions = index >= 0 ? sessions.slice(index + 1) : [];
    const reference = olderSessions.find((item) => ['service', 'warning'].includes(item.stateKey)) || olderSessions[0] || null;
    return reference ? { reference, target } : null;
  }

  function getAnalysisCompareModeMeta(mode = analysisCompareMode) {
    const map = {
      baseline_current: {
        label: 'BASELINE VS CURRENT',
        referenceLabel: 'Baseline',
        targetLabel: 'Current',
        note: 'Сравнение живого анализа с эталонным healthy-сеансом этого объекта.',
      },
      baseline_saved: {
        label: 'BASELINE VS SAVED SESSION',
        referenceLabel: 'Baseline',
        targetLabel: 'Saved session',
        note: 'Сравнение эталона и сохранённого дефектного сеанса из серверной истории.',
      },
      before_after: {
        label: 'BEFORE VS AFTER MAINTENANCE',
        referenceLabel: 'Before',
        targetLabel: 'After',
        note: 'Сравнение объекта до ремонта и после завершения сервисного цикла.',
      },
    };
    return map[mode] || map.baseline_current;
  }

  function getActiveAnalysisSessionId() {
    return trimText(currentDiagnosis?.input?.sessionId || currentInputContext?.sessionId) || null;
  }

  function getCurrentAnalysisSnapshot() {
    if (!currentDiagnosis) return null;
    const asset = resolveAnalysisAsset() || getAssetById(analysisCompareAssetId) || null;
    return {
      id: '__current',
      assetId: asset?.id || null,
      assetName: asset?.name || getCurrentAssetName(),
      cls: currentDiagnosis.cls,
      confidence: currentDiagnosis.confidence,
      probabilities: { ...(currentDiagnosis.probabilities || {}) },
      input: {
        ...(currentDiagnosis.input || {}),
        label: currentDiagnosis.input?.label || currentDiagnosis.sourceLabel || 'Текущий анализ',
      },
      playbook: currentDiagnosis.playbook || {},
      signalData: compactSignal(currentDiagnosis.signalData || currentSignalData?.data || []),
      sampleRate: currentDiagnosis.sampleRate || currentSignalData?.sampleRate || VM.FS,
      stateKey: getCurrentSessionState(),
      workStatus: getCurrentWorkStatus(),
      note: getCurrentSessionNote(),
      engineerReason: getCurrentEngineerReason(),
      actionTaken: getCurrentActionTaken(),
      isBaseline: false,
      isCurrent: true,
    };
  }

  function getCompareSessionLabel(session, fallback) {
    if (!session) return fallback;
    if (session.isCurrent) return 'Current';
    if (session.isBaseline) return 'Baseline';
    const shortLabels = {
      healthy: 'Healthy',
      warning: 'Warning',
      service: 'Service',
      after_maintenance: 'After',
    };
    return shortLabels[session.stateKey] || getSessionStateMeta(session.stateKey).label;
  }

  function syncAnalysisCompareState(force = false) {
    const resolvedAsset = resolveAnalysisAsset() || getAssetById(analysisCompareAssetId) || getAssetById(selectedAssetId) || assetRegistry[0] || null;
    if (resolvedAsset && (force || !analysisCompareAssetId || !getAssetById(analysisCompareAssetId))) {
      analysisCompareAssetId = resolvedAsset.id;
    }
    if (!analysisCompareAssetId || !getAssetById(analysisCompareAssetId)) {
      analysisCompareAssetId = assetRegistry[0]?.id || null;
    }

    const assetId = analysisCompareAssetId;
    const sessions = assetId ? getAssetSessions(assetId) : [];
    const baseline = assetId ? getAssetBaselineSession(assetId) : null;
    const latestDefect = assetId ? getLatestDefectSession(assetId) : null;
    const maintenancePair = assetId ? getMaintenanceComparisonPair(assetId) : null;
    const currentSnapshot = getCurrentAnalysisSnapshot();
    const currentMatchesAsset = currentSnapshot && currentSnapshot.assetId === assetId;
    const lastSession = sessions[sessions.length - 1] || null;

    if (analysisCompareMode === 'before_after') {
      if (force || !analysisCompareReferenceId || !sessions.some((item) => item.id === analysisCompareReferenceId)) {
        analysisCompareReferenceId = maintenancePair?.reference?.id || baseline?.id || lastSession?.id || null;
      }
      if (
        force
        || (analysisCompareTargetId === '__current' && !currentMatchesAsset)
        || (analysisCompareTargetId !== '__current' && !sessions.some((item) => item.id === analysisCompareTargetId))
      ) {
        analysisCompareTargetId = maintenancePair?.target?.id || (currentMatchesAsset ? '__current' : latestDefect?.id || sessions[0]?.id || '__current');
      }
    } else if (analysisCompareMode === 'baseline_saved') {
      if (force || !analysisCompareReferenceId || !sessions.some((item) => item.id === analysisCompareReferenceId)) {
        analysisCompareReferenceId = baseline?.id || lastSession?.id || null;
      }
      if (force || !analysisCompareTargetId || analysisCompareTargetId === '__current' || !sessions.some((item) => item.id === analysisCompareTargetId)) {
        analysisCompareTargetId = latestDefect?.id || sessions[0]?.id || '__current';
      }
    } else {
      if (force || !analysisCompareReferenceId || !sessions.some((item) => item.id === analysisCompareReferenceId)) {
        analysisCompareReferenceId = baseline?.id || lastSession?.id || null;
      }
      if (
        force
        || (analysisCompareTargetId === '__current' && !currentMatchesAsset)
        || (analysisCompareTargetId !== '__current' && !sessions.some((item) => item.id === analysisCompareTargetId))
      ) {
        analysisCompareTargetId = currentMatchesAsset ? '__current' : latestDefect?.id || sessions[0]?.id || '__current';
      }
    }

    if (analysisCompareReferenceId && analysisCompareReferenceId === analysisCompareTargetId) {
      const alternative = sessions.find((item) => item.id !== analysisCompareReferenceId) || null;
      if (analysisCompareTargetId === '__current') {
        analysisCompareReferenceId = alternative?.id || analysisCompareReferenceId;
      } else {
        analysisCompareTargetId = alternative?.id || analysisCompareTargetId;
      }
    }
  }

  function getAnalysisCompareContext() {
    syncAnalysisCompareState();
    const asset = getAssetById(analysisCompareAssetId) || null;
    const sessions = asset ? getAssetSessions(asset.id) : [];
    const modeMeta = getAnalysisCompareModeMeta();
    const reference = getInspectionById(analysisCompareReferenceId) || null;
    const target = analysisCompareTargetId === '__current'
      ? getCurrentAnalysisSnapshot()
      : getInspectionById(analysisCompareTargetId) || null;
    return {
      asset,
      sessions,
      modeMeta,
      reference,
      target,
      referenceLabel: getCompareSessionLabel(reference, modeMeta.referenceLabel),
      targetLabel: getCompareSessionLabel(target, modeMeta.targetLabel),
    };
  }

  function formatEngineeringFreq(freq) {
    return `${freq >= 100 ? freq.toFixed(0) : freq.toFixed(1)} Hz`;
  }

  function getCharacteristicMarkers(cls) {
    const fRot = Number(meta?.config?.f_rot || VM.F_ROT || 20);
    const gmf = Number(meta?.config?.gmf || VM.GMF || 400);
    const bsf = Number(meta?.config?.bsf || (fRot * 2.1));
    const bpfo = Number(meta?.config?.bpfo || (fRot * 3.5));
    const bpfi = Number(meta?.config?.bpfi || (fRot * 5.2));
    const markerSets = {
      normal: [
        { label: 'f_rot', freq: fRot, color: '#8ea0b5' },
        { label: 'GMF', freq: gmf, color: '#fb923c' },
        { label: '2×GMF', freq: gmf * 2, color: '#fbbf24' },
      ],
      tooth_chip: [
        { label: 'GMF-f_rot', freq: gmf - fRot, color: '#fb923c' },
        { label: 'GMF', freq: gmf, color: '#fb923c' },
        { label: 'GMF+f_rot', freq: gmf + fRot, color: '#fbbf24' },
      ],
      tooth_miss: [
        { label: 'GMF', freq: gmf, color: '#f87171' },
        { label: 'GMF+f_rot', freq: gmf + fRot, color: '#fb923c' },
        { label: '2×GMF', freq: gmf * 2, color: '#fbbf24' },
      ],
      root_crack: [
        { label: 'f_rot', freq: fRot, color: '#a78bfa' },
        { label: 'GMF-f_rot', freq: gmf - fRot, color: '#c084fc' },
        { label: 'GMF+f_rot', freq: gmf + fRot, color: '#c084fc' },
      ],
      surface_wear: [
        { label: 'GMF/2', freq: gmf / 2, color: '#fbbf24' },
        { label: 'GMF', freq: gmf, color: '#fb923c' },
        { label: 'HF band', freq: Math.min(gmf * 2, 1600), color: '#fde68a' },
      ],
      ball_fault: [
        { label: 'BSF', freq: bsf, color: '#34d399' },
        { label: '2×BSF', freq: bsf * 2, color: '#86efac' },
        { label: 'f_rot', freq: fRot, color: '#8ea0b5' },
      ],
      inner_race: [
        { label: 'BPFI', freq: bpfi, color: '#38bdf8' },
        { label: '2×BPFI', freq: bpfi * 2, color: '#7dd3fc' },
        { label: 'f_rot', freq: fRot, color: '#8ea0b5' },
      ],
      outer_race: [
        { label: 'BPFO', freq: bpfo, color: '#f472b6' },
        { label: '2×BPFO', freq: bpfo * 2, color: '#f9a8d4' },
        { label: 'f_rot', freq: fRot, color: '#8ea0b5' },
      ],
      combination: [
        { label: 'GMF', freq: gmf, color: '#fb923c' },
        { label: 'BPFI', freq: bpfi, color: '#38bdf8' },
        { label: 'BPFO', freq: bpfo, color: '#f472b6' },
        { label: 'BSF', freq: bsf, color: '#34d399' },
      ],
    };
    return (markerSets[cls] || markerSets.normal)
      .filter((marker) => Number.isFinite(marker.freq) && marker.freq > 0)
      .sort((a, b) => a.freq - b.freq);
  }

  function formatMetricDelta(value) {
    if (value == null || !Number.isFinite(value)) return 'n/a';
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  }

  function getEngineeringInterpretation(cls, assessment) {
    const hintMap = {
      normal: {
        title: 'Сигнал близок к эталону',
        note: 'Для нормального кейса важно, чтобы рабочие гармоники оставались стабильными, а вокруг GMF не появлялись выраженные боковые полосы и ударные события.',
      },
      tooth_chip: {
        title: 'Локальный gear fault',
        note: 'Ищем боковые полосы вокруг GMF и одиночные ударные события на частоте вращения. Именно они отличают ранний скол от нормального зацепления.',
      },
      tooth_miss: {
        title: 'Критическое разрушение зацепления',
        note: 'Ключевой признак — резкое усиление импульсов и распад чистой GMF-структуры. Такой кейс удобно показывать как контраст к healthy baseline.',
      },
      root_crack: {
        title: 'Модуляция на частоте вращения',
        note: 'Для трещины корня важны боковые полосы GMF ± f_rot и неустойчивость амплитуды. Это один из лучших кейсов для объяснения причинно-следственной связи.',
      },
      surface_wear: {
        title: 'Рост широкополосной энергии',
        note: 'При износе поверхность даёт не одиночный удар, а общий подъём шумового пола и усиление высокочастотной составляющей.',
      },
      ball_fault: {
        title: 'Bearing pattern в зоне BSF',
        note: 'Нужно смотреть не на GMF, а на BSF и его гармоники. Это позволяет быстро отличить подшипниковый паттерн от дефекта зубчатой передачи.',
      },
      inner_race: {
        title: 'Bearing pattern в зоне BPFI',
        note: 'Для внутренней обоймы ключевые признаки концентрируются возле BPFI. Сравнение с baseline полезно, потому что рост этой зоны видно очень наглядно.',
      },
      outer_race: {
        title: 'Bearing pattern в зоне BPFO',
        note: 'Наружная обойма чаще даёт устойчивый повторяющийся рисунок около BPFO. Это хороший кейс для объяснения локализации дефекта по спектру.',
      },
      combination: {
        title: 'Смешанный спектральный паттерн',
        note: 'Комбинированный случай показывает, что модель различает не один признак, а суперпозицию нескольких механизмов деградации сразу.',
      },
    };
    const base = hintMap[cls] || hintMap.normal;
    const deltaContext = assessment.baseline
      ? `От reference-сеанса: RMS ${formatMetricDelta(assessment.rmsDeltaPct)}, Peak ${formatMetricDelta(assessment.peakDeltaPct)}.`
      : 'Reference-сеанс ещё не назначен, поэтому сравнение пока идёт только по текущему паттерну.';
    return {
      title: base.title,
      note: `${base.note} ${deltaContext}`,
    };
  }

  function buildEngineeringAssessment(signal, cls) {
    const currentSignal = Array.from(signal || []);
    const currentMetrics = signalMetrics(currentSignal);
    const markers = getCharacteristicMarkers(cls);
    const compareContext = getAnalysisCompareContext();
    const asset = compareContext.asset || resolveAnalysisAsset();
    const referenceSession = compareContext.reference || getAnalysisBaselineSession();
    const referenceMetrics = referenceSession?.signalData?.length ? signalMetrics(referenceSession.signalData) : null;
    const rmsDeltaPct = referenceMetrics?.rms ? ((currentMetrics.rms - referenceMetrics.rms) / referenceMetrics.rms) * 100 : null;
    const peakDeltaPct = referenceMetrics?.peak ? ((currentMetrics.peak - referenceMetrics.peak) / referenceMetrics.peak) * 100 : null;
    const interpretation = getEngineeringInterpretation(cls, {
      baseline: referenceSession,
      currentMetrics,
      baselineMetrics: referenceMetrics,
      rmsDeltaPct,
      peakDeltaPct,
    });
    const currentTarget = {
      id: '__current',
      isCurrent: true,
      cls,
      signalData: currentSignal,
      sampleRate: currentSignalData?.sampleRate || VM.FS,
      stateKey: getCurrentSessionState(),
      input: {
        label: currentInputContext?.label || 'Текущий анализ',
      },
    };
    const targetSession = analysisCompareTargetId === '__current' ? currentTarget : (compareContext.target || currentTarget);
    return {
      asset,
      referenceSession,
      targetSession,
      markers,
      currentMetrics,
      baselineMetrics: referenceMetrics,
      rmsDeltaPct,
      peakDeltaPct,
      interpretation,
      markerSummary: markers.map((marker) => `${marker.label} ${formatEngineeringFreq(marker.freq)}`).join(' · '),
      compareMode: compareContext.modeMeta.label,
      compareNote: compareContext.modeMeta.note,
      referenceLabel: compareContext.referenceLabel,
      targetLabel: analysisCompareTargetId === '__current' ? compareContext.modeMeta.targetLabel : compareContext.targetLabel,
    };
  }

  function buildEngineeringEvidenceMarkup(assessment) {
    const reference = assessment.referenceSession;
    const baselineCopy = reference
      ? `
        <div class="diag-evidence-card">
          <div class="diag-evidence-label">${escapeHtml(assessment.compareMode)}</div>
          <div class="diag-evidence-value">${escapeHtml(assessment.referenceLabel)} → ${escapeHtml(assessment.targetLabel)}</div>
          <div class="diag-evidence-note">
            ${escapeHtml(reference.assetName || assessment.asset?.name || 'Объект')} · ${escapeHtml(reference.input?.label || reference.title || 'Reference session')}<br>
            RMS ${assessment.baselineMetrics?.rms?.toFixed(3) || '0.000'} → ${assessment.currentMetrics.rms.toFixed(3)}
            · Peak ${assessment.baselineMetrics?.peak?.toFixed(3) || '0.000'} → ${assessment.currentMetrics.peak.toFixed(3)}
          </div>
          <div class="diag-delta-row">
            <span class="diag-delta-chip ${assessment.rmsDeltaPct != null && assessment.rmsDeltaPct > 0 ? 'diag-delta-chip--up' : 'diag-delta-chip--down'}">ΔRMS ${escapeHtml(formatMetricDelta(assessment.rmsDeltaPct))}</span>
            <span class="diag-delta-chip ${assessment.peakDeltaPct != null && assessment.peakDeltaPct > 0 ? 'diag-delta-chip--up' : 'diag-delta-chip--down'}">ΔPeak ${escapeHtml(formatMetricDelta(assessment.peakDeltaPct))}</span>
          </div>
        </div>`
      : `
        <div class="diag-evidence-card">
          <div class="diag-evidence-label">${escapeHtml(assessment.compareMode)}</div>
          <div class="diag-evidence-value">Reference-сеанс пока не назначен</div>
          <div class="diag-evidence-note">${escapeHtml(assessment.compareNote)} Назначьте baseline или откройте сохранённый сеанс объекта, чтобы получить управляемое сравнение прямо на этой странице.</div>
          <div class="diag-delta-row">
            <span class="diag-delta-chip">Текущий RMS ${assessment.currentMetrics.rms.toFixed(3)}</span>
            <span class="diag-delta-chip">Peak ${assessment.currentMetrics.peak.toFixed(3)}</span>
          </div>
        </div>`;
    return `
      <div class="diag-evidence">
        ${baselineCopy}
        <div class="diag-evidence-card">
          <div class="diag-evidence-label">ХАРАКТЕРНЫЕ ЧАСТОТЫ</div>
          <div class="diag-marker-row">
            ${assessment.markers.map((marker) => `<span class="diag-marker-pill" style="border-color:${marker.color || '#fbbf24'}55;background:${marker.color || '#fbbf24'}14">${escapeHtml(marker.label)} · ${escapeHtml(formatEngineeringFreq(marker.freq))}</span>`).join('')}
          </div>
          <div class="diag-evidence-note">${escapeHtml(assessment.markerSummary)}</div>
        </div>
        <div class="diag-evidence-card">
          <div class="diag-evidence-label">ЧТО ВАЖНО НА ГРАФИКЕ</div>
          <div class="diag-evidence-value">${escapeHtml(assessment.interpretation.title)}</div>
          <div class="diag-evidence-note">${escapeHtml(assessment.interpretation.note)}</div>
        </div>
      </div>
    `;
  }

  function renderEngineeringVisuals(signal, cls, color, assessment) {
    if (!signal || !signal.length) return;
    const sampleRate = currentSignalData?.sampleRate || VM.FS;
    const baseline = assessment.referenceSession;
    const baselineSignal = baseline?.signalData?.length ? Float64Array.from(baseline.signalData) : null;
    const { freqs, spectrum } = FFT.computeSpectrum(signal, sampleRate);

    if (currentStop) {
      currentStop();
      currentStop = null;
    }

    if (baselineSignal) {
      Viz.drawSignalComparison('sigCanvas', baselineSignal, signal, {
        baselineColor: '#94a3b8',
        currentColor: color,
        baselineLabel: assessment.referenceLabel,
        currentLabel: assessment.targetLabel,
      });
      const baselineSpectrum = FFT.computeSpectrum(baselineSignal, baseline.sampleRate || sampleRate);
      Viz.drawSpectrumComparison('specCanvas', freqs, spectrum, baselineSpectrum.spectrum, {
        currentColor: color,
        baselineColor: '#94a3b8',
        markers: assessment.markers,
        maxFreq: 2000,
        baselineLabel: assessment.referenceLabel,
        currentLabel: assessment.targetLabel,
      });
    } else {
      currentStop = Viz.drawSignal('sigCanvas', signal, color, false);
      Viz.drawSpectrumComparison('specCanvas', freqs, spectrum, null, {
        currentColor: color,
        markers: assessment.markers,
        maxFreq: 2000,
      });
    }

    Viz.addCrosshair(el('sigCanvas'), { type: 'signal', data: signal, sampleRate, color });
    Viz.addCrosshair(el('specCanvas'), { type: 'spectrum', data: spectrum, freqs, color });

    const sigBaseText = el('sigDesc')?.dataset.baseText || '';
    const specBaseText = el('specDesc')?.dataset.baseText || '';
    if (el('sigDesc')) {
      el('sigDesc').textContent = [
        sigBaseText,
        baseline
          ? `Overlay: серый контур — ${assessment.referenceLabel.toLowerCase()} ${baseline.input?.label || baseline.title || 'reference session'}, цветной — ${assessment.targetLabel.toLowerCase()}.`
          : 'Reference-сеанс не назначен: сохраните healthy-сеанс или откройте историю объекта, чтобы включить compare mode.',
      ].filter(Boolean).join(' ');
    }
    if (el('specDesc')) {
      el('specDesc').textContent = [
        specBaseText,
        `Инженерные маркеры: ${assessment.markerSummary}.`,
      ].filter(Boolean).join(' ');
    }
  }

  function syncWorkspaceSelection(preferredAssetId = null, preferredInspectionId = null) {
    const availableAssetIds = new Set(sessionHistory.map((item) => item.assetId).filter(Boolean));
    if (preferredAssetId && availableAssetIds.has(preferredAssetId)) {
      selectedAssetId = preferredAssetId;
    }
    if (!selectedAssetId || !availableAssetIds.has(selectedAssetId)) {
      selectedAssetId = sessionHistory[0]?.assetId || assetRegistry[0]?.id || null;
    }

    const assetSessions = getAssetSessions(selectedAssetId);
    if (!assetSessions.length) {
      compareBaselineId = null;
      compareTargetId = null;
      selectedReportInspectionId = null;
      return;
    }

    if (preferredInspectionId && assetSessions.some((item) => item.id === preferredInspectionId)) {
      compareTargetId = preferredInspectionId;
      selectedReportInspectionId = preferredInspectionId;
    }

    if (!compareTargetId || !assetSessions.some((item) => item.id === compareTargetId)) {
      compareTargetId = assetSessions[0].id;
    }

    const baselineSession = getAssetBaselineSession(selectedAssetId);
    if (!compareBaselineId || !assetSessions.some((item) => item.id === compareBaselineId)) {
      compareBaselineId = baselineSession?.id || assetSessions[assetSessions.length - 1].id;
    }
    if (compareBaselineId === compareTargetId && assetSessions.length > 1) {
      compareBaselineId = assetSessions[assetSessions.length - 1].id;
    }

    if (!selectedReportInspectionId || !assetSessions.some((item) => item.id === selectedReportInspectionId)) {
      selectedReportInspectionId = compareTargetId;
    }
    if (!analysisCompareAssetId || !getAssetById(analysisCompareAssetId)) {
      analysisCompareAssetId = selectedAssetId;
    }
  }

  function renderAssetFleet() {
    const statsNode = el('assetFleetStats');
    const listNode = el('assetFleetList');
    const emptyNode = el('assetFleetEmpty');
    if (!statsNode || !listNode || !emptyNode) return;
    if (el('assetSearchInput')) el('assetSearchInput').value = assetSearchQuery;
    if (el('assetStatusFilter')) el('assetStatusFilter').value = assetStatusFilter;
    if (el('assetRiskFilter')) el('assetRiskFilter').value = assetRiskFilter;
    if (el('assetSortSelect')) el('assetSortSelect').value = assetSortMode;

    const allOverviews = assetRegistry.map(getAssetOverview);
    const filtered = getFilteredAssetOverviews();
    const total = assetRegistry.length;
    const warningCount = allOverviews.filter((item) => item.stateMeta.label === SESSION_STATES.warning.label).length;
    const highRiskCount = allOverviews.filter((item) => ['high', 'critical'].includes(item.riskMeta.key)).length;
    const avgHealth = allOverviews.length ? Math.round(allOverviews.reduce((acc, item) => acc + item.healthScore, 0) / allOverviews.length) : 0;
    const recoveringCount = allOverviews.filter((item) => normalizeStateKey(item.latest?.stateKey || item.asset.currentStatus) === 'after_maintenance').length;
    const topPriority = [...allOverviews].sort((a, b) => {
      const riskWeight = { critical: 4, high: 3, medium: 2, low: 1 };
      const diff = (riskWeight[b.riskMeta.key] || 0) - (riskWeight[a.riskMeta.key] || 0);
      if (diff) return diff;
      return a.healthScore - b.healthScore;
    })[0] || null;
    const latestUpdate = filtered[0]?.lastUpdated || sessionHistory[0]?.savedAt || '—';
    if (filtered.length && !filtered.some((item) => item.asset.id === selectedAssetId)) {
      selectedAssetId = filtered[0].asset.id;
      syncWorkspaceSelection(selectedAssetId);
    }

    statsNode.innerHTML = `
      <div class="workspace-summary-label">ПАРК ОБЪЕКТОВ</div>
      <div class="workspace-summary-grid">
        <div class="workspace-summary-card">
          <div class="workspace-summary-label">ОБЪЕКТОВ</div>
          <div class="workspace-summary-value">${total}</div>
        </div>
        <div class="workspace-summary-card">
          <div class="workspace-summary-label">СРЕДНИЙ HEALTH</div>
          <div class="workspace-summary-value">${avgHealth}/100</div>
        </div>
        <div class="workspace-summary-card">
          <div class="workspace-summary-label">HIGH / CRITICAL</div>
          <div class="workspace-summary-value">${highRiskCount}</div>
        </div>
        <div class="workspace-summary-card">
          <div class="workspace-summary-label">RECOVERING</div>
          <div class="workspace-summary-value">${recoveringCount}</div>
        </div>
      </div>
      <div class="fleet-hero-note">
        <strong>Приоритетный объект:</strong>
        ${topPriority ? `${escapeHtml(topPriority.asset.name)} · ${topPriority.healthScore}/100 · ${escapeHtml(topPriority.riskMeta.label)}` : 'ещё не определён'}
        <br>
        <span>Warning-объектов: ${warningCount} · последнее обновление ${escapeHtml(formatStamp(latestUpdate))}</span>
      </div>
    `;

    if (!filtered.length) {
      emptyNode.style.display = 'block';
      emptyNode.textContent = total
        ? 'По текущим фильтрам объекты не найдены. Измените статус, риск или строку поиска.'
        : 'Список объектов появится после сохранения хотя бы одного серверного сеанса.';
      listNode.innerHTML = '';
      return;
    }

    emptyNode.style.display = 'none';
    listNode.innerHTML = filtered.map((overview) => {
      const latest = overview.latest;
      const latestDiagnosis = latest ? (VM.RU[latest.cls] || latest.cls) : 'Нет инспекций';
      const lastComment = latest?.actionTaken || latest?.engineerReason || latest?.note || overview.riskMeta.note;
      const palette = getHealthPalette(overview.healthTone);
      return `<article class="asset-fleet-card ${overview.asset.id === selectedAssetId ? 'is-active' : ''}" data-asset-card="${escapeHtml(overview.asset.id)}">
        <div class="asset-fleet-card-top">
          <div>
            <div class="asset-fleet-title">${escapeHtml(overview.asset.name)}</div>
            <div class="asset-fleet-meta">${escapeHtml(overview.asset.location || 'Локация не указана')} · ${escapeHtml(formatStamp(overview.lastUpdated))}</div>
          </div>
          <div class="history-badge-stack">
            <span class="health-badge health-badge--${overview.stateMeta.tone}"><span class="dot"></span>${escapeHtml(overview.stateMeta.label)}</span>
            <span class="health-badge health-badge--${overview.riskMeta.tone}"><span class="dot"></span>${escapeHtml(overview.riskMeta.label)}</span>
          </div>
        </div>
        <div class="asset-fleet-badges">
          <span class="health-badge health-badge--${overview.workMeta.tone}"><span class="dot"></span>${escapeHtml(overview.workMeta.label)}</span>
          <span class="health-badge"><span class="dot"></span>${escapeHtml(overview.asset.asset_type || 'gearbox')}</span>
          <span class="health-badge health-badge--${overview.healthTone}"><span class="dot"></span>${escapeHtml(getHealthLabel(overview.healthScore))}</span>
        </div>
        <div class="asset-health-row">
          <div class="asset-health-score asset-health-score--${overview.healthTone}">
            <span>Health score</span>
            <strong>${overview.healthScore}/100</strong>
            <small>${escapeHtml(overview.healthTrend.label)} · ${escapeHtml(formatSignedScore(overview.healthTrend.delta))}</small>
          </div>
          <div class="asset-health-sparkline">
            ${buildHealthSparkline(overview.healthSeries, palette.stroke, palette.fill)}
          </div>
        </div>
        <div class="asset-fleet-grid">
          <div class="asset-fleet-metric">
            <span>Последний диагноз</span>
            <strong>${escapeHtml(latestDiagnosis)}</strong>
          </div>
          <div class="asset-fleet-metric">
            <span>Инспекций</span>
            <strong>${overview.sessions.length}</strong>
          </div>
          <div class="asset-fleet-metric">
            <span>Измерений</span>
            <strong>${overview.measurementCount}</strong>
          </div>
          <div class="asset-fleet-metric">
            <span>Переход</span>
            <strong>${escapeHtml(overview.stageTrail.map((stage) => getSessionStateMeta(stage).label).join(' → ') || overview.stateMeta.label)}</strong>
          </div>
        </div>
        <div class="asset-fleet-note">${escapeHtml(lastComment)}</div>
      </article>`;
    }).join('');
  }

  function renderAssetCard() {
    const select = el('assetFocusSelect');
    const node = el('assetCardSummary');
    if (!select || !node) return;

    select.innerHTML = assetRegistry.length
      ? assetRegistry.map((asset) => `<option value="${escapeHtml(asset.id)}">${escapeHtml(asset.name)}</option>`).join('')
      : '<option value="">Нет объектов</option>';
    if (selectedAssetId) select.value = selectedAssetId;

    const asset = getAssetById(selectedAssetId);
    const overview = asset ? getAssetOverview(asset) : null;
    const latest = overview?.latest;
    const baseline = asset ? getAssetBaselineSession(asset.id) : null;
    if (!asset || !overview) {
      node.innerHTML = '<div class="workspace-empty-block">Выберите объект из списка слева или сохраните хотя бы один сеанс, чтобы появилась детальная карточка.</div>';
      return;
    }

    node.innerHTML = `
      <div class="workspace-insight-grid workspace-insight-grid--asset">
        <div class="workspace-insight-metric">
          <span>Текущее состояние</span>
          <strong>${escapeHtml(overview.stateMeta.label)}</strong>
          <small>${escapeHtml(overview.stateMeta.note)}</small>
        </div>
        <div class="workspace-insight-metric">
          <span>Health score</span>
          <strong>${overview.healthScore}/100 · ${escapeHtml(getHealthLabel(overview.healthScore))}</strong>
          <small>${escapeHtml(overview.healthTrend.label)} · ${escapeHtml(formatSignedScore(overview.healthTrend.delta))} от предыдущего сеанса</small>
        </div>
        <div class="workspace-insight-metric">
          <span>Последний диагноз</span>
          <strong>${latest ? escapeHtml(VM.RU[latest.cls] || latest.cls) : 'Пока нет inspection'}</strong>
          <small>${latest ? `CONF ${((latest.confidence || 0) * 100).toFixed(1)}%` : 'Есть raw-измерения, но диагностика ещё не сохранена в историю.'}</small>
        </div>
        <div class="workspace-insight-metric">
          <span>Статус работ / риск</span>
          <strong>${escapeHtml(overview.workMeta.label)} · ${escapeHtml(overview.riskMeta.label)}</strong>
          <small>${escapeHtml(overview.riskMeta.note)}</small>
        </div>
        <div class="workspace-insight-metric">
          <span>История</span>
          <strong>${overview.sessions.length} инспекций</strong>
          <small>${overview.measurementCount} измерений · ${overview.reportCount} отчётов · ${escapeHtml(formatStamp(overview.lastUpdated))}</small>
        </div>
        <div class="workspace-insight-metric">
          <span>Baseline</span>
          <strong>${baseline ? escapeHtml(VM.RU[baseline.cls] || baseline.cls) : 'Не назначен'}</strong>
          <small>${baseline ? escapeHtml(formatStamp(baseline.savedAt)) : 'Назначьте эталонный сеанс для сравнений и отчётов.'}</small>
        </div>
      </div>
      <div class="workspace-insight-copy">
        <strong>${escapeHtml(asset.name)}</strong>${asset.location ? ` · ${escapeHtml(asset.location)}` : ''}<br>
        ${asset.description ? escapeHtml(asset.description) : 'Карточка агрегирует текущий статус, последний диагноз и инженерный контекст по узлу.'}
      </div>
      ${(latest?.engineerReason || latest?.actionTaken) ? `
        <div class="workspace-insight-note">
          ${latest?.engineerReason ? `<div><strong>Почему принято решение:</strong> ${escapeHtml(latest.engineerReason)}</div>` : ''}
          ${latest?.actionTaken ? `<div><strong>Что сделано дальше:</strong> ${escapeHtml(latest.actionTaken)}</div>` : ''}
        </div>` : ''}
    `;
  }

  function renderAssetTrend() {
    const node = el('assetTrendSummary');
    if (!node) return;
    const asset = getAssetById(selectedAssetId);
    const overview = asset ? getAssetOverview(asset) : null;
    if (!asset || !overview) {
      node.innerHTML = '<div class="workspace-empty-block">Выберите объект с историей, чтобы увидеть health trend и изменение состояния по последним инспекциям.</div>';
      return;
    }

    const palette = getHealthPalette(overview.healthTone);
    const recentSeries = overview.healthSeries.slice(-6);
    const best = Math.max(...recentSeries.map((item) => item.score));
    const worst = Math.min(...recentSeries.map((item) => item.score));
    node.innerHTML = `
      <div class="asset-trend-hero">
        <div class="asset-trend-score asset-trend-score--${overview.healthTone}">
          <span>Current health</span>
          <strong>${overview.healthScore}</strong>
          <small>${escapeHtml(getHealthLabel(overview.healthScore))}</small>
        </div>
        <div class="asset-trend-copy">
          <div class="asset-trend-kicker">TREND</div>
          <div class="asset-trend-title">${escapeHtml(overview.healthTrend.label)} · ${escapeHtml(formatSignedScore(overview.healthTrend.delta))} относительно предыдущей инспекции</div>
          <div class="asset-trend-note">Лучшая точка: ${best}/100 · минимальное значение: ${worst}/100 · последние ${recentSeries.length} сеансов объекта.</div>
        </div>
      </div>
      <div class="asset-trend-chart">
        ${buildHealthSparkline(recentSeries, palette.stroke, palette.fill)}
      </div>
      <div class="asset-trend-grid">
        ${recentSeries.map((item, index) => `<div class="asset-trend-point">
          <span>#${index + 1}</span>
          <strong>${item.score}</strong>
          <small>${escapeHtml(getSessionStateMeta(item.stateKey).label)}</small>
        </div>`).join('')}
      </div>
    `;
  }

  function renderAssetTimeline() {
    const node = el('assetTimeline');
    if (!node) return;
    const sessions = getAssetSessions(selectedAssetId);
    if (!sessions.length) {
      node.innerHTML = '<div class="workspace-empty-block">Таймлайн состояния появится после сохранения последовательности сеансов по одному объекту.</div>';
      return;
    }
    const stageOrder = ['healthy', 'warning', 'service', 'after_maintenance'];
    const ascending = [...sessions].reverse();
    const latestStage = sessions[0].stateKey;
    const journey = [];
    ascending.forEach((item) => {
      const stage = normalizeStateKey(item.stateKey);
      if (!journey.length || journey[journey.length - 1] !== stage) journey.push(stage);
    });
    const events = ascending.map((item, index) => `
      <div class="timeline-event ${index === ascending.length - 1 ? 'timeline-event--current' : ''}">
        <div class="timeline-event-date">${escapeHtml(formatStamp(item.savedAt))}</div>
        <div class="timeline-event-body">
          <strong>${escapeHtml(getSessionStateMeta(item.stateKey).label)}</strong>
          <span>${escapeHtml(VM.RU[item.cls] || item.cls)} · ${escapeHtml(getWorkStatusMeta(item.workStatus).label)}</span>
          <div class="timeline-event-badges">
            <span class="health-badge health-badge--${getSessionStateMeta(item.stateKey).tone}"><span class="dot"></span>${escapeHtml(getSessionStateMeta(item.stateKey).label)}</span>
            <span class="health-badge health-badge--${getRiskMeta(item).tone}"><span class="dot"></span>${escapeHtml(getRiskMeta(item).label)}</span>
            ${item.isBaseline ? '<span class="health-badge health-badge--good"><span class="dot"></span>BASELINE</span>' : ''}
          </div>
          ${(item.note || item.engineerReason || item.actionTaken) ? `
            <div class="timeline-event-note">
              ${item.note ? `${escapeHtml(item.note)}<br>` : ''}
              ${item.engineerReason ? `<strong>Почему:</strong> ${escapeHtml(item.engineerReason)}<br>` : ''}
              ${item.actionTaken ? `<strong>Действие:</strong> ${escapeHtml(item.actionTaken)}` : ''}
            </div>` : ''}
        </div>
      </div>
    `).join('');
    node.innerHTML = `
      <div class="timeline-stage-row">
        ${stageOrder.map((stage) => {
          const reached = ascending.some((item) => item.stateKey === stage);
          const current = latestStage === stage;
          return `<div class="timeline-stage ${reached ? 'timeline-stage--reached' : ''} ${current ? 'timeline-stage--current' : ''}">
            <span>${escapeHtml(getSessionStateMeta(stage).label)}</span>
            <small>${escapeHtml(getSessionStateMeta(stage).note)}</small>
          </div>`;
        }).join('')}
      </div>
      <div class="timeline-flow-copy">
        <strong>Маршрут объекта:</strong> ${escapeHtml(journey.map((stage) => getSessionStateMeta(stage).label).join(' → '))}
      </div>
      <div class="timeline-event-list">${events}</div>
    `;
  }

  function renderAssetWorkflow() {
    const node = el('assetWorkflowSummary');
    if (!node) return;
    const asset = getAssetById(selectedAssetId);
    const overview = asset ? getAssetOverview(asset) : null;
    const latest = overview?.latest;
    if (!asset || !overview || !latest) {
      node.innerHTML = '<div class="workspace-empty-block">Выберите объект с историей инспекций, чтобы увидеть рекомендованный переход по жизненному циклу.</div>';
      return;
    }

    const stateKey = normalizeStateKey(latest.stateKey);
    const nextRepairReady = stateKey === 'warning' || latest.workStatus === 'inspect';
    const nextAfterReady = stateKey === 'service' || latest.workStatus === 'repair';
    const steps = [
      { key: 'warning', label: 'Warning', note: 'Диагноз подтверждён, нужен осмотр и фиксация дефекта.' },
      { key: 'service', label: 'Repair', note: 'Узел переведён в сервисный цикл или ремонт.' },
      { key: 'after_maintenance', label: 'After maintenance', note: 'После обслуживания выполняется контрольная инспекция.' },
    ];

    node.innerHTML = `
      <div class="asset-workflow-steps">
        ${steps.map((step) => {
          const reached = overview.stageTrail.includes(step.key);
          const current = stateKey === step.key;
          return `<div class="asset-workflow-step ${reached ? 'asset-workflow-step--done' : ''} ${current ? 'asset-workflow-step--active' : ''}">
            <strong>${escapeHtml(step.label)}</strong>
            <small>${escapeHtml(step.note)}</small>
          </div>`;
        }).join('')}
      </div>
      <div class="workspace-insight-note">
        <div><strong>Текущий узел:</strong> ${escapeHtml(asset.name)}</div>
        <div><strong>Последний рабочий статус:</strong> ${escapeHtml(overview.workMeta.label)}</div>
        <div><strong>Следующий шаг:</strong> ${
          nextRepairReady
            ? 'подготовить новую запись в статусе Repair и зафиксировать ремонтное действие.'
            : nextAfterReady
              ? 'подготовить контрольную запись After maintenance после завершения ремонта.'
              : 'узел находится в stable-state; при новом отклонении можно снова открыть warning-stage.'
        }</div>
      </div>
    `;

    if (el('assetPrepareRepairBtn')) el('assetPrepareRepairBtn').disabled = !latest || (!nextRepairReady && stateKey !== 'service');
    if (el('assetPrepareAfterBtn')) el('assetPrepareAfterBtn').disabled = !latest || !nextAfterReady;
  }

  function renderComparePanel() {
    const baselineSelect = el('compareBaselineSelect');
    const targetSelect = el('compareTargetSelect');
    const node = el('compareSummary');
    if (!baselineSelect || !targetSelect || !node) return;

    const sessions = getAssetSessions(selectedAssetId);
    const optionsHtml = sessions.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(buildSessionOptionLabel(item))}</option>`).join('');
    baselineSelect.innerHTML = optionsHtml || '<option value="">Нет сеансов</option>';
    targetSelect.innerHTML = optionsHtml || '<option value="">Нет сеансов</option>';
    if (compareBaselineId) baselineSelect.value = compareBaselineId;
    if (compareTargetId) targetSelect.value = compareTargetId;

    const baseline = getInspectionById(compareBaselineId);
    const target = getInspectionById(compareTargetId);
    if (!baseline || !target) {
      node.innerHTML = '<div class="workspace-empty-block">Выберите два сеанса одного объекта, чтобы увидеть baseline vs defect или до/после ремонта.</div>';
      return;
    }
    const beforeMetrics = signalMetrics(baseline.signalData);
    const afterMetrics = signalMetrics(target.signalData);
    const rmsDelta = beforeMetrics.rms ? ((afterMetrics.rms - beforeMetrics.rms) / beforeMetrics.rms) * 100 : 0;
    const peakDelta = beforeMetrics.peak ? ((afterMetrics.peak - beforeMetrics.peak) / beforeMetrics.peak) * 100 : 0;
    node.innerHTML = `
      <div class="workspace-insight-grid workspace-insight-grid--compare">
        <div class="workspace-insight-metric">
          <span>Переход состояния</span>
          <strong>${escapeHtml(getSessionStateMeta(baseline.stateKey).label)} → ${escapeHtml(getSessionStateMeta(target.stateKey).label)}</strong>
          <small>${escapeHtml(getWorkStatusMeta(baseline.workStatus).label)} → ${escapeHtml(getWorkStatusMeta(target.workStatus).label)}</small>
        </div>
        <div class="workspace-insight-metric">
          <span>Диагноз</span>
          <strong>${escapeHtml(VM.RU[baseline.cls] || baseline.cls)} → ${escapeHtml(VM.RU[target.cls] || target.cls)}</strong>
          <small>${((baseline.confidence || 0) * 100).toFixed(1)}% → ${((target.confidence || 0) * 100).toFixed(1)}%</small>
        </div>
        <div class="workspace-insight-metric">
          <span>RMS сигнала</span>
          <strong>${beforeMetrics.rms.toFixed(3)} → ${afterMetrics.rms.toFixed(3)}</strong>
          <small>${rmsDelta >= 0 ? '+' : ''}${rmsDelta.toFixed(1)}%</small>
        </div>
        <div class="workspace-insight-metric">
          <span>Пиковая амплитуда</span>
          <strong>${beforeMetrics.peak.toFixed(3)} → ${afterMetrics.peak.toFixed(3)}</strong>
          <small>${peakDelta >= 0 ? '+' : ''}${peakDelta.toFixed(1)}%</small>
        </div>
      </div>
      <div class="workspace-insight-note">
        <div><strong>Baseline / before:</strong> ${escapeHtml(baseline.engineerReason || baseline.note || 'Комментарий не указан.')}</div>
        <div><strong>Target / after:</strong> ${escapeHtml(target.actionTaken || target.engineerReason || target.note || 'Комментарий не указан.')}</div>
      </div>
    `;
  }

  function renderReportPanel() {
    const select = el('reportSessionSelect');
    const node = el('reportSummary');
    const openBtn = el('openReportBtn');
    const copyBtn = el('copyReportLinkBtn');
    if (!select || !node || !openBtn || !copyBtn) return;

    const sessions = getAssetSessions(selectedAssetId);
    select.innerHTML = sessions.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(buildSessionOptionLabel(item))}</option>`).join('') || '<option value="">Нет сеансов</option>';
    if (selectedReportInspectionId) select.value = selectedReportInspectionId;

    const inspection = getInspectionById(selectedReportInspectionId);
    if (!inspection) {
      openBtn.disabled = true;
      copyBtn.disabled = true;
      node.innerHTML = '<div class="workspace-empty-block">Выберите сеанс, чтобы сгенерировать share-link и открыть printable report.</div>';
      return;
    }

    const report = getReportByInspection(inspection.id);
    openBtn.disabled = !report?.shareUrl;
    copyBtn.disabled = !report?.shareUrl;
    node.innerHTML = report ? `
      <div class="workspace-insight-grid workspace-insight-grid--report">
        <div class="workspace-insight-metric">
          <span>Отчёт</span>
          <strong>${escapeHtml(report.title)}</strong>
          <small>${escapeHtml(formatStamp(report.updated_at || report.updatedAt || report.created_at || report.createdAt))}</small>
        </div>
        <div class="workspace-insight-metric">
          <span>Share link</span>
          <strong>${escapeHtml(report.shareUrl)}</strong>
          <small>Можно открыть отдельно или сохранить в PDF через печать.</small>
        </div>
      </div>
      <div class="workspace-insight-copy">${escapeHtml(report.summary || 'Сводка отчёта пока пустая.')}</div>
      ${report.payload?.baseline ? `
        <div class="workspace-insight-note">
          <strong>Baseline:</strong> ${escapeHtml(report.payload.baseline.input_label || report.payload.baseline.title || 'Эталонный сеанс')}
          · ${escapeHtml(VM.RU[report.payload.baseline.predicted_class] || report.payload.baseline.predicted_class || '—')}
        </div>` : ''}
      ${report.payload?.comparison ? `
        <div class="workspace-insight-note">
          <strong>Сравнение:</strong> RMS ${Number(report.payload.comparison.baseline_metrics?.rms || 0).toFixed(3)} → ${Number(report.payload.comparison.target_metrics?.rms || 0).toFixed(3)}
          · Peak ${Number(report.payload.comparison.baseline_metrics?.peak || 0).toFixed(3)} → ${Number(report.payload.comparison.target_metrics?.peak || 0).toFixed(3)}
        </div>` : ''}
      <div class="workspace-insight-note"><strong>Рекомендации:</strong> ${escapeHtml(report.recommendations || 'Не указаны.')}</div>
    ` : '<div class="workspace-empty-block">Для выбранного сеанса отчёт ещё не создан. Нажмите кнопку ниже, чтобы сформировать share-link.</div>';
  }

  function openAssetPage(assetId = selectedAssetId, inspectionId = null) {
    syncWorkspaceSelection(assetId || selectedAssetId, inspectionId || compareTargetId || selectedReportInspectionId);
    renderWorkspace();
    goPage('profile');
    window.setTimeout(() => el('journalPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
  }

  async function setBaselineInspection(inspectionId) {
    const inspection = getInspectionById(inspectionId);
    if (!inspection) {
      toast('Сеанс не найден', 'Не удалось найти выбранную запись в истории объекта.', 'warning');
      return null;
    }
    if (!apiReady || !authState?.id) {
      compareBaselineId = inspectionId;
      renderWorkspace();
      toast('Локальный baseline', 'Без серверной сессии baseline используется только в текущем окне для сравнения.', 'info');
      return inspection;
    }
    const updated = await apiRequest(`/inspections/${inspectionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_baseline: true }),
    });
    compareBaselineId = updated.id;
    selectedAssetId = updated.asset_id || updated.assetId || selectedAssetId;
    await loadHistory();
    toast('Baseline обновлён', `Сеанс "${updated.input_label || updated.input?.label || 'Inspection'}" назначен эталоном объекта.`, 'success');
    return updated;
  }

  function prepareAssetTransition(targetStateKey, targetWorkStatus) {
    const latest = getLatestAssetSession(selectedAssetId);
    const asset = getAssetById(selectedAssetId);
    if (!latest || !asset) {
      toast('Нет базовой инспекции', 'Сначала выберите объект с сохранённой историей, чтобы подготовить следующий переход.', 'warning');
      return;
    }

    restoreSession(latest.id, 'open');
    window.setTimeout(() => {
      if (el('assetNameInput')) el('assetNameInput').value = asset.name;
      if (el('sessionStateInput')) el('sessionStateInput').value = targetStateKey;
      syncWorkStatusFromState(true);
      if (el('workStatusInput')) el('workStatusInput').value = targetWorkStatus;
      if (targetStateKey === 'service') {
        if (el('sessionNoteInput')) el('sessionNoteInput').value = 'Объект переведён в сервисный цикл после warning-stage.';
        if (el('engineerReasonInput')) el('engineerReasonInput').value = latest.engineerReason || 'Последний warning-сеанс подтвердил необходимость ремонтного вмешательства.';
        if (el('actionTakenInput')) el('actionTakenInput').value = 'Назначен ремонт и подготовлена следующая контрольная запись по объекту.';
      } else if (targetStateKey === 'after_maintenance') {
        if (el('sessionNoteInput')) el('sessionNoteInput').value = 'Контрольная запись после завершения ремонта.';
        if (el('engineerReasonInput')) el('engineerReasonInput').value = latest.actionTaken || 'Ремонт завершён, требуется подтвердить эффект обслуживания контрольной инспекцией.';
        if (el('actionTakenInput')) el('actionTakenInput').value = 'Узел возвращён в работу и переведён в after maintenance для контрольного сравнения.';
      }
      renderCaptureSummary();
      goPage('profile');
      window.setTimeout(() => el('journalPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
      toast('Шаблон перехода готов', `Для "${asset.name}" подготовлена следующая запись ${getSessionStateMeta(targetStateKey).label}.`, 'success');
    }, 180);
  }

  async function generateReportForInspection(inspectionId) {
    if (!apiReady || !authState?.id) {
      toast('Нужен вход', 'Отчёты доступны только в серверном кабинете.', 'warning');
      return null;
    }
    const report = await apiRequest(`/reports/from-inspection/${inspectionId}`, { method: 'POST' });
    const normalized = normalizeReports([report])[0];
    reportRegistry = [normalized, ...reportRegistry.filter((item) => item.id !== normalized.id)];
    selectedReportInspectionId = inspectionId;
    renderReportPanel();
    renderHistory();
    toast('Отчёт готов', 'Сформирован share-link и printable report по выбранному сеансу.', 'success');
    return normalized;
  }

  async function copyReportLink() {
    const report = getReportByInspection(selectedReportInspectionId);
    if (!report?.shareUrl) {
      toast('Нет ссылки', 'Сначала сформируйте отчёт для выбранного сеанса.', 'warning');
      return;
    }
    const absolute = typeof runtime.absoluteUrl === 'function'
      ? runtime.absoluteUrl(report.shareUrl)
      : new URL(report.shareUrl, window.location.origin).href;
    try {
      await navigator.clipboard.writeText(absolute);
      toast('Ссылка скопирована', absolute, 'success');
    } catch (e) {
      toast('Не удалось скопировать', 'Скопируйте ссылку вручную из карточки отчёта.', 'warning');
    }
  }

  function openReportLink() {
    const report = getReportByInspection(selectedReportInspectionId);
    if (!report?.shareUrl) {
      toast('Нет ссылки', 'Сначала сформируйте отчёт для выбранного сеанса.', 'warning');
      return;
    }
    const absolute = typeof runtime.absoluteUrl === 'function'
      ? runtime.absoluteUrl(report.shareUrl)
      : new URL(report.shareUrl, window.location.origin).href;
    window.open(absolute, '_blank', 'noopener,noreferrer');
  }

  function focusProfileAsset(assetId, sectionId = 'journalPanel') {
    const asset = getAssetById(assetId);
    if (!asset) return;
    selectedAssetId = asset.id;
    analysisCompareAssetId = asset.id;
    if (el('assetNameInput')) el('assetNameInput').value = asset.name;
    syncWorkspaceSelection(asset.id);
    renderWorkspace();
    goPage('profile');
    window.setTimeout(() => el(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
  }

  function focusProfileCompare(assetId, mode = 'baseline_saved', inspectionId = null) {
    const asset = getAssetById(assetId);
    if (!asset) return;
    selectedAssetId = asset.id;
    analysisCompareAssetId = asset.id;
    if (inspectionId) selectedReportInspectionId = inspectionId;
    syncWorkspaceSelection(asset.id, inspectionId);
    analysisCompareMode = mode;
    syncAnalysisCompareState(true);
    renderWorkspace();
    goPage('profile');
    window.setTimeout(() => el('analysisComparePanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
  }

  async function selectAlert(alertId, { force = false, scroll = false } = {}) {
    if (!alertId) return;
    selectedAlertId = alertId;
    try {
      await loadAlertEvents(alertId, { force });
    } catch (e) {
      toast('Не удалось загрузить журнал', e.message || 'Ошибка при загрузке истории действий.', 'warning');
    }
    renderWorkspace();
    if (scroll) {
      goPage('profile');
      window.setTimeout(() => el('profileAlertLogPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    }
  }

  async function saveAlertEvent(alertId, payload, successMessage = 'Статус alert-а обновлён') {
    if (!apiReady || !authState?.id) {
      toast('Нужен вход', 'Управление alert-ами доступно только в серверном кабинете.', 'warning');
      return null;
    }
    const updated = await apiRequest(`/alerts/${alertId}/events`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const normalized = normalizeAlerts([updated])[0];
    alertRegistry = [normalized, ...alertRegistry.filter((item) => item.id !== normalized.id)];
    selectedAlertId = normalized.id;
    await loadAlertEvents(normalized.id, { force: true });
    dashboardSummary = dashboardSummary ? {
      ...dashboardSummary,
      alerts_active: alertRegistry.filter((item) => item.status !== 'resolved').length,
      alert_events: (dashboardSummary.alert_events || 0) + 1,
    } : dashboardSummary;
    renderWorkspace();
    toast(successMessage, normalized.title, 'success');
    return normalized;
  }

  function guessMeasurementMimeType(name = '') {
    const lower = trimText(name).toLowerCase();
    if (lower.endsWith('.csv') || lower.endsWith('.txt') || lower.endsWith('.tsv') || lower.endsWith('.dat')) return 'text/plain';
    if (lower.endsWith('.wav')) return 'audio/wav';
    if (lower.endsWith('.json')) return 'application/json';
    if (lower.endsWith('.npy') || lower.endsWith('.npz')) return 'application/octet-stream';
    return 'application/octet-stream';
  }

  async function fileToBase64(file) {
    const buffer = await file.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  async function buildMeasurementUploadBody() {
    if (!currentDiagnosis || !currentSignalData?.data?.length) return null;
    if (currentInputContext?.type === 'demo') {
      throw new Error('Для monitoring-контура используйте реальный файл или сенсорную запись, а не demo-кейс.');
    }

    let originalName = currentSourceFile?.name || `${trimText(currentInputContext?.label || 'measurement').replace(/\s+/g, '_').toLowerCase() || 'measurement'}.csv`;
    let mimeType = currentSourceFile?.type || guessMeasurementMimeType(originalName);
    let contentBase64 = '';
    let sourceKind = currentInputContext?.type === 'sensor' ? 'sensor_capture' : 'uploaded_file';

    if (currentSourceFile) {
      contentBase64 = await fileToBase64(currentSourceFile);
    } else {
      const csv = ['index,value', ...Array.from(currentSignalData.data || []).map((value, index) => `${index},${Number(value).toFixed(8)}`)].join('\n');
      contentBase64 = btoa(unescape(encodeURIComponent(csv)));
      originalName = originalName.endsWith('.csv') ? originalName : `${originalName}.csv`;
      mimeType = 'text/csv';
    }

    return {
      asset_id: resolveAnalysisAsset()?.id || null,
      asset_name: getCurrentAssetName(),
      source_kind: sourceKind,
      source_label: currentDiagnosis.sourceLabel || 'Real monitoring',
      input_label: currentDiagnosis.input?.label || currentInputContext?.label || originalName,
      original_name: originalName,
      mime_type: mimeType,
      content_base64: contentBase64,
      sample_rate: currentSignalData.sampleRate || VM.FS,
      sample_count: currentSignalData.data.length,
      duration_seconds: currentSignalData.data.length / (currentSignalData.sampleRate || VM.FS),
      predicted_class: currentDiagnosis.cls,
      confidence: currentDiagnosis.confidence || 0,
      probabilities: { ...(currentDiagnosis.probabilities || {}) },
      input_context: { ...(currentDiagnosis.input || currentInputContext || {}) },
      preview_signal: compactSignal(currentSignalData.data),
      note: getCurrentSessionNote() || currentDiagnosis.playbook?.priority || '',
    };
  }

  async function uploadCurrentMeasurement() {
    if (!apiReady) {
      toast('API недоступен', 'Monitoring-контур работает только при активном backend.', 'warning');
      return null;
    }
    if (!authState?.id) {
      toast('Нужен вход', 'Сначала войдите в аккаунт, чтобы загрузить реальный файл в серверное хранилище.', 'warning');
      return null;
    }
    if (!currentDiagnosis) {
      toast('Нет анализа', 'Сначала выполните анализ сигнала, затем загрузите запись в monitoring.', 'warning');
      return null;
    }

    try {
      const payload = await buildMeasurementUploadBody();
      if (!payload) {
        toast('Нет данных', 'Для monitoring-записи нужен текущий сигнал и результат анализа.', 'warning');
        return null;
      }
      const created = await apiRequest('/measurements/upload', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const measurement = normalizeMeasurements([created])[0];
      measurementRegistry = [measurement, ...measurementRegistry.filter((item) => item.id !== measurement.id)];
      currentInputContext = {
        ...currentInputContext,
        measurementId: measurement.id,
        sourceFile: measurement.originalName,
      };
      if (currentDiagnosis) {
        updateCurrentDiagnosis({
          ...currentDiagnosis,
          input: {
            ...(currentDiagnosis.input || {}),
            measurementId: measurement.id,
            label: currentDiagnosis.input?.label || currentInputContext.label,
          },
        });
      }
      await loadHistory();
      toast('Измерение сохранено', `Файл ${measurement.originalName} загружен в серверный monitoring-контур.`, 'success');
      return measurement;
    } catch (e) {
      toast('Не удалось загрузить', e.message || 'Ошибка при сохранении измерения на сервер.', 'error');
      return null;
    }
  }

  function openMeasurementDownload(measurementId) {
    const measurement = getMeasurementById(measurementId);
    if (!measurement?.downloadUrl) {
      toast('Нет файла', 'Для выбранного измерения недоступна ссылка на скачивание.', 'warning');
      return;
    }
    const absolute = typeof runtime.absoluteUrl === 'function'
      ? runtime.absoluteUrl(measurement.downloadUrl)
      : new URL(measurement.downloadUrl, window.location.origin).href;
    window.open(absolute, '_blank', 'noopener,noreferrer');
  }

  function openMeasurementInAnalysis(measurementId) {
    const measurement = getMeasurementById(measurementId);
    if (!measurement) return;
    if (measurement.inspectionId) {
      restoreSession(measurement.inspectionId, 'open');
      return;
    }

    goPage('diag');
    analysisCompareAssetId = measurement.assetId || analysisCompareAssetId;
    if (el('assetNameInput')) el('assetNameInput').value = measurement.assetName || getCurrentAssetName();
    currentSourceFile = null;
    currentInputContext = {
      ...(measurement.inputContext || {}),
      type: measurement.sourceKind === 'sensor_capture' ? 'sensor' : 'file',
      label: measurement.inputLabel || measurement.originalName,
      measurementId: measurement.id,
      sourceFile: measurement.originalName,
    };
    currentSignalData = {
      data: Array.isArray(measurement.previewSignal) ? measurement.previewSignal : [],
      sampleRate: measurement.sampleRate || VM.FS,
    };
    activateScenarioCards(null);
    document.querySelectorAll('.fault-btn').forEach((b) => b.classList.remove('active'));
    litPipeline(5);
    if (currentStop) currentStop();

    const signal = Array.from(measurement.previewSignal || []);
    if (!signal.length) {
      toast('Нет preview-сигнала', 'Для этого измерения пока не сохранён preview, поэтому открыть его в analysis нельзя.', 'warning');
      return;
    }

    const diagClass = measurement.predictedClass || 'normal';
    const diagColor = VM.COLORS[diagClass] || '#00e5ff';
    currentStop = Viz.drawSignal('sigCanvas', signal, diagColor, true);
    Viz.addCrosshair(el('sigCanvas'), { type: 'signal', data: signal, sampleRate: measurement.sampleRate || VM.FS, color: diagColor });
    const { freqs, spectrum } = FFT.computeSpectrum(signal, measurement.sampleRate || VM.FS);
    Viz.drawSpectrum('specCanvas', freqs, spectrum, diagColor);
    Viz.addCrosshair(el('specCanvas'), { type: 'spectrum', data: spectrum, freqs, color: diagColor });
    el('sigStatus').textContent = '● MONITORING';
    el('sigStatus').style.color = diagColor;
    el('specStatus').textContent = 'SERVER';
    el('specStatus').style.color = diagColor;
    const sigBaseText = `${measurement.originalName} | ${measurement.sampleRate} Hz | ${(measurement.durationSeconds || (signal.length / (measurement.sampleRate || VM.FS))).toFixed(3)}с`;
    const specBaseText = `Server measurement · ${measurement.sourceLabel}`;
    el('sigDesc').textContent = sigBaseText;
    el('specDesc').textContent = specBaseText;
    el('sigDesc').dataset.baseText = sigBaseText;
    el('specDesc').dataset.baseText = specBaseText;
    showDiagnosis(
      diagClass,
      measurement.probabilities && Object.keys(measurement.probabilities).length ? measurement.probabilities : { [diagClass]: measurement.confidence || 1 },
      diagColor,
      signal,
    );
    toast('Измерение открыто', `Серверная запись ${measurement.originalName} загружена в analysis.`, 'success');
  }

  function renderMonitoringFeed() {
    const listNode = el('monitoringList');
    const emptyNode = el('monitoringEmpty');
    const statsNode = el('monitoringStats');
    if (!listNode || !emptyNode || !statsNode) return;

    if (!apiReady || !authState?.id) {
      statsNode.innerHTML = '';
      emptyNode.style.display = 'block';
      emptyNode.textContent = 'Войдите в серверный кабинет, чтобы сохранять реальные файлы и видеть журнал измерений.';
      listNode.innerHTML = '';
      return;
    }

    const resolvedAsset = resolveAnalysisAsset() || getAssetById(selectedAssetId) || assetRegistry[0] || null;
    const filtered = resolvedAsset ? getAssetMeasurements(resolvedAsset.id) : measurementRegistry;
    statsNode.innerHTML = `
      <span class="workspace-stat-pill">${filtered.length} записей</span>
      <span class="workspace-stat-pill">${measurementRegistry.length} всего в журнале</span>
      <span class="workspace-stat-pill">${resolvedAsset ? escapeHtml(resolvedAsset.name) : 'Все записи'}</span>
    `;

    if (!filtered.length) {
      emptyNode.style.display = 'block';
      emptyNode.textContent = resolvedAsset
        ? `Для "${resolvedAsset.name}" ещё нет серверных измерений. Загрузите реальный файл на этой странице.`
        : 'Журнал измерений пока пуст. Загрузите реальный файл после анализа.';
      listNode.innerHTML = '';
      return;
    }

    emptyNode.style.display = 'none';
    listNode.innerHTML = filtered.slice(0, 8).map((item) => {
      const cls = item.predictedClass;
      const color = cls ? (VM.COLORS[cls] || '#fff') : '#c6d1de';
      const diagnosis = cls ? (VM.RU[cls] || cls) : 'Диагноз не привязан';
      return `<article class="monitoring-item">
        <div class="monitoring-item-head">
          <div>
            <div class="monitoring-item-title">${escapeHtml(item.originalName)}</div>
            <div class="monitoring-item-meta">${escapeHtml(item.assetName)} · ${escapeHtml(formatStamp(item.createdAt))}</div>
          </div>
          <div class="history-badge-stack">
            <span class="health-badge"><span class="dot"></span>${escapeHtml(item.sourceKind)}</span>
            ${item.inspectionId ? '<span class="health-badge health-badge--good"><span class="dot"></span>LINKED</span>' : '<span class="health-badge health-badge--warning"><span class="dot"></span>RAW</span>'}
          </div>
        </div>
        <div class="history-item-grid">
          <div class="history-item-card">
            <div class="label">ДИАГНОЗ</div>
            <div style="color:${color};font-size:15px;line-height:1.6">${escapeHtml(diagnosis)}</div>
          </div>
          <div class="history-item-card">
            <div class="label">Fs / ДЛИТЕЛЬНОСТЬ</div>
            <div style="color:#fff;font-size:15px;line-height:1.6">${item.sampleRate.toFixed(0)} Hz · ${(item.durationSeconds || 0).toFixed(3)} c</div>
          </div>
          <div class="history-item-card">
            <div class="label">РАЗМЕР / ОТСЧЁТЫ</div>
            <div style="color:#fff;font-size:15px;line-height:1.6">${Math.max(1, Math.round(item.storageSize / 1024))} KB · ${item.sampleCount}</div>
          </div>
        </div>
        ${item.note ? `<div class="history-item-note">${escapeHtml(item.note)}</div>` : ''}
        <div class="history-item-actions">
          <button class="history-btn" type="button" data-measurement-action="open" data-measurement-id="${escapeHtml(item.id)}">ОТКРЫТЬ</button>
          <button class="history-btn" type="button" data-measurement-action="download" data-measurement-id="${escapeHtml(item.id)}">СКАЧАТЬ</button>
        </div>
      </article>`;
    }).join('');
  }

  function toast(title, message, tone = 'info') {
    const host = el('toastContainer');
    if (!host) return;
    const icons = {
      info: 'ℹ',
      success: '✓',
      warning: '!',
      error: '✕',
    };
    const node = document.createElement('div');
    node.className = `toast toast--${tone}`;
    node.innerHTML = `
      <div class="toast__icon">${icons[tone] || icons.info}</div>
      <div class="toast__body">
        <div class="toast__title">${escapeHtml(title)}</div>
        <div class="toast__message">${escapeHtml(message)}</div>
      </div>
      <button class="toast__close" type="button" aria-label="Закрыть">×</button>
    `;
    host.appendChild(node);
    const close = () => {
      node.classList.add('out');
      window.setTimeout(() => node.remove(), 260);
    };
    node.querySelector('.toast__close')?.addEventListener('click', close);
    window.setTimeout(close, 3200);
  }

  function compactSignal(signal) {
    return Array.from(signal || [])
      .slice(0, STORAGE_LIMITS.signalSamples)
      .map(value => Number(Number(value).toFixed(6)));
  }

  function updateCurrentDiagnosis(payload) {
    currentDiagnosis = payload;
    renderCaptureSummary();
    renderAnalysisComparePanel();
    renderStudyLabShell();
    renderAnalysisWizard();
    scheduleJourneyDraftSave('diagnosis');
  }

  function clearCurrentDiagnosis() {
    currentDiagnosis = null;
    renderCaptureSummary();
    renderAnalysisComparePanel();
    renderStudyLabShell();
    renderAnalysisWizard();
    scheduleJourneyDraftSave('clear-diagnosis');
    // Reset analysis-extras blocks when starting a new analysis
    if (typeof AnalysisExtras !== 'undefined') {
      AnalysisExtras.clearAnnotations();
      AnalysisExtras.clearExplainability();
      AnalysisExtras.clearMiniSpectrogram();
    }
  }

  function buildSessionRecord() {
    if (!currentDiagnosis) return null;
    const stateKey = getCurrentSessionState();
    const stateMeta = getSessionStateMeta(stateKey);
    const workStatus = getCurrentWorkStatus();
    const workMeta = getWorkStatusMeta(workStatus);
    return {
      asset_name: getCurrentAssetName(),
      measurement_id: currentDiagnosis.input?.measurementId || currentInputContext?.measurementId || null,
      title: currentDiagnosis.input?.label || null,
      state_key: stateKey,
      state_label: stateMeta.label,
      work_status: workStatus,
      work_status_label: workMeta.label,
      is_baseline: shouldAutoMarkBaseline(),
      note: getCurrentSessionNote(),
      engineer_reason: getCurrentEngineerReason(),
      action_taken: getCurrentActionTaken(),
      predicted_class: currentDiagnosis.cls,
      confidence: currentDiagnosis.confidence,
      probabilities: { ...currentDiagnosis.probabilities },
      source_label: currentDiagnosis.sourceLabel,
      input_type: currentDiagnosis.input?.type || 'demo',
      input_label: currentDiagnosis.input?.label || 'Session',
      input_context: currentDiagnosis.input,
      playbook: currentDiagnosis.playbook,
      signal_data: compactSignal(currentDiagnosis.signalData),
      sample_rate: currentDiagnosis.sampleRate || VM.FS,
    };
  }

  function fillJournalFields(session) {
    if (!session) return;
    if (el('assetNameInput')) el('assetNameInput').value = session.assetName || '';
    if (el('sessionStateInput')) el('sessionStateInput').value = session.stateKey || 'warning';
    if (el('workStatusInput')) el('workStatusInput').value = session.workStatus || 'observe';
    if (el('sessionNoteInput')) el('sessionNoteInput').value = session.note || '';
    if (el('engineerReasonInput')) el('engineerReasonInput').value = session.engineerReason || '';
    if (el('actionTakenInput')) el('actionTakenInput').value = session.actionTaken || '';
    renderCaptureSummary();
  }

  function openJournal() {
    goPage('profile');
    window.setTimeout(() => el('journalPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  }

  async function saveCurrentSession() {
    if (!apiReady) {
      toast('API недоступен', 'Сначала запустите FastAPI backend, чтобы сохранять сеансы в серверную базу.', 'warning');
      return false;
    }
    if (!authState?.id) {
      toast('Нужен вход', 'Сначала войдите в аккаунт, чтобы сохранить сеанс в базу.', 'warning');
      goPage('profile');
      window.setTimeout(() => el('authPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
      return false;
    }
    if (!currentDiagnosis) {
      toast('Нет активного анализа', 'Сначала выполните анализ сигнала или откройте готовый кейс.', 'warning');
      return false;
    }

    const record = buildSessionRecord();
    if (!record) return false;
    try {
      const created = await apiRequest('/inspections', {
        method: 'POST',
        body: JSON.stringify(record),
      });
      syncWorkspaceSelection(created.asset_id || created.assetId, created.id);
      await loadHistory();
    } catch (e) {
      toast('Не удалось сохранить', e.message || 'Ошибка при сохранении сеанса в базе.', 'error');
      return false;
    }

    toast('Сеанс сохранён', `Запись для "${record.asset_name}" добавлена в серверный журнал.`, 'success');
    return true;
  }

  function restoreSession(sessionId, mode = 'open', options = {}) {
    const { silent = false, skipScroll = false } = options;
    const session = sessionHistory.find(item => item.id === sessionId);
    if (!session) return;

    fillJournalFields(session);
    analysisCompareAssetId = session.assetId || analysisCompareAssetId;
    syncWorkspaceSelection(session.assetId, session.id);
    selectedReportInspectionId = session.id;
    renderWorkspace();

    if (mode === 'reuse') {
      toast('Поля заполнены', 'Контекст объекта и комментарий перенесены в форму текущего сеанса.', 'info');
      openJournal();
      return;
    }

    goPage('diag');
    currentSourceFile = null;
    currentInputContext = {
      ...(session.input || { type: 'saved', label: 'Сохранённый сеанс' }),
      sessionId: session.id,
      label: session.input?.label || session.title || 'Сохранённый сеанс',
    };
    activateScenarioCards(session.input?.scenario || null);
    document.querySelectorAll('.fault-btn').forEach(b => b.classList.toggle('active', b.dataset.cls === session.cls));
    litPipeline(5);

    const signal = Array.isArray(session.signalData) ? session.signalData : [];
    currentSignalData = { data: signal, sampleRate: session.sampleRate || VM.FS };
    if (currentStop) currentStop();
    if (signal.length) {
      currentStop = Viz.drawSignal('sigCanvas', signal, VM.COLORS[session.cls], true);
      Viz.addCrosshair(el('sigCanvas'), {
        type: 'signal',
        data: signal,
        sampleRate: session.sampleRate || VM.FS,
        color: VM.COLORS[session.cls],
      });
      const { freqs, spectrum } = FFT.computeSpectrum(signal, session.sampleRate || VM.FS);
      Viz.drawSpectrum('specCanvas', freqs, spectrum, VM.COLORS[session.cls]);
      Viz.addCrosshair(el('specCanvas'), { type: 'spectrum', data: spectrum, freqs, color: VM.COLORS[session.cls] });
      el('sigStatus').textContent = '● ЖУРНАЛ';
      el('sigStatus').style.color = VM.COLORS[session.cls];
      el('specStatus').textContent = 'READY';
      el('specStatus').style.color = VM.COLORS[session.cls];
      const restoreSigBaseText = `${session.input?.label || 'Сохранённый сеанс'} | ${(signal.length / (session.sampleRate || VM.FS)).toFixed(3)}с`;
      const restoreSpecBaseText = `Восстановленный спектр | ${(session.sampleRate || VM.FS) / 2} Гц`;
      el('sigDesc').textContent = restoreSigBaseText;
      el('specDesc').textContent = restoreSpecBaseText;
      el('sigDesc').dataset.baseText = restoreSigBaseText;
      el('specDesc').dataset.baseText = restoreSpecBaseText;
    }

    showDiagnosis(session.cls, session.probabilities || { [session.cls]: session.confidence || 1 }, VM.COLORS[session.cls], signal);
    if (!silent) {
      toast('Сеанс открыт', `Восстановлена запись от ${formatStamp(session.savedAt)}.`, 'success');
    }
    if (!skipScroll) {
      window.setTimeout(() => el('diagResult')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 140);
    }
  }

  async function deleteSession(sessionId) {
    try {
      await apiRequest(`/inspections/${sessionId}`, { method: 'DELETE' });
      await loadHistory();
      toast('Запись удалена', 'Сеанс удалён из серверного журнала.', 'info');
    } catch (e) {
      toast('Не удалось удалить', e.message || 'Ошибка при удалении сеанса.', 'error');
    }
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    const name = trimText(el('authNameInput')?.value);
    const email = trimText(el('authEmailInput')?.value).toLowerCase();
    const password = trimText(el('authPasswordInput')?.value);
    if (!name) {
      toast('Нужно имя', 'Укажите имя пользователя для регистрации.', 'warning');
      el('authNameInput')?.focus();
      return;
    }
    if (!email.includes('@')) {
      toast('Неверный email', 'Укажите корректный email для входа в систему.', 'warning');
      el('authEmailInput')?.focus();
      return;
    }
    if (!password || password.length < 8) {
      toast('Пароль слишком короткий', 'Для серверного аккаунта используйте пароль длиной от 8 символов.', 'warning');
      el('authPasswordInput')?.focus();
      return;
    }
    try {
      const payload = await apiRequest('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          display_name: name,
          role: 'operator',
        }),
      });
      authState = normalizeAuth({
        ...payload.user,
        session_id: payload.session?.id,
        session_expires_at: payload.session?.expires_at,
      });
      renderAuthSummary();
      updateHeaderProfile();
      renderCaptureSummary();
      await loadHistory();
      toast('Аккаунт создан', `Профиль ${name} зарегистрирован и готов к работе.`, 'success');
    } catch (e) {
      toast('Не удалось зарегистрироваться', e.message || 'Ошибка регистрации.', 'error');
    }
  }

  async function handleLogin() {
    const email = trimText(el('authEmailInput')?.value).toLowerCase();
    const password = trimText(el('authPasswordInput')?.value);
    if (!email || !password) {
      toast('Нужны данные для входа', 'Введите email и пароль, чтобы открыть серверный кабинет.', 'warning');
      return;
    }
    try {
      const payload = await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      authState = normalizeAuth({
        ...payload.user,
        session_id: payload.session?.id,
        session_expires_at: payload.session?.expires_at,
      });
      renderAuthSummary();
      updateHeaderProfile();
      renderCaptureSummary();
      await loadHistory();
      toast('Вход выполнен', `Серверный кабинет открыт для ${authState.name}.`, 'success');
    } catch (e) {
      toast('Не удалось войти', e.message || 'Ошибка авторизации.', 'error');
    }
  }

  async function handleLogout() {
    if (apiReady) {
      try {
        await apiRequest('/auth/logout', { method: 'POST' });
      } catch (e) {
        console.warn('[APP] logout failed:', e);
      }
    }
    authState = normalizeAuth(null);
    sessionHistory = [];
    assetRegistry = [];
    measurementRegistry = [];
    reportRegistry = [];
    alertRegistry = [];
    alertEventRegistry = {};
    selectedAlertId = null;
    dashboardSummary = null;
    selectedAssetId = null;
    compareBaselineId = null;
    compareTargetId = null;
    analysisCompareAssetId = null;
    analysisCompareReferenceId = null;
    analysisCompareTargetId = '__current';
    analysisCompareMode = 'baseline_current';
    selectedReportInspectionId = null;
    updateHeaderProfile();
    renderAuthSummary();
    renderWorkspace();
    toast('Выход выполнен', 'Серверная сессия завершена.', 'info');
  }

  function setupCabinetUI() {
    el('headerProfileChip')?.addEventListener('click', openJournal);
    el('authForm')?.addEventListener('submit', handleAuthSubmit);
    el('authLoginBtn')?.addEventListener('click', handleLogin);
    el('authImportBtn')?.addEventListener('click', () => { importLegacySessions().catch((e) => {
      toast('Импорт не выполнен', e.message || 'Ошибка импорта локального журнала.', 'error');
    }); });
    el('authLogoutBtn')?.addEventListener('click', handleLogout);
    el('historyList')?.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-action][data-id]');
      if (!btn) return;
      const { action, id } = btn.dataset;
      if (action === 'open') restoreSession(id, 'open');
      if (action === 'reuse') restoreSession(id, 'reuse');
      if (action === 'asset') {
        const assetId = getInspectionById(id)?.assetId;
        selectedReportInspectionId = id;
        openAssetPage(assetId, id);
      }
      if (action === 'baseline') {
        setBaselineInspection(id).catch((e) => {
          toast('Не удалось назначить baseline', e.message || 'Ошибка при обновлении эталонного сеанса.', 'error');
        });
      }
      if (action === 'compare') {
        compareTargetId = id;
        selectedReportInspectionId = id;
        syncWorkspaceSelection(getInspectionById(id)?.assetId, id);
        renderWorkspace();
      }
      if (action === 'report') {
        selectedAssetId = getInspectionById(id)?.assetId || selectedAssetId;
        selectedReportInspectionId = id;
        syncWorkspaceSelection(selectedAssetId, id);
        renderWorkspace();
        generateReportForInspection(id).catch((e) => {
          toast('Не удалось создать отчёт', e.message || 'Ошибка генерации отчёта.', 'error');
        });
      }
      if (action === 'delete') deleteSession(id).catch((e) => {
        toast('Не удалось удалить', e.message || 'Ошибка при удалении записи.', 'error');
      });
    });
    el('monitoringList')?.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-measurement-action][data-measurement-id]');
      if (!btn) return;
      const measurementId = btn.dataset.measurementId;
      const action = btn.dataset.measurementAction;
      if (action === 'open') openMeasurementInAnalysis(measurementId);
      if (action === 'download') openMeasurementDownload(measurementId);
      if (action === 'asset') {
        const assetId = getMeasurementById(measurementId)?.assetId;
        if (assetId) openAssetPage(assetId);
      }
    });
    el('profileAlertList')?.addEventListener('click', (event) => {
      const card = event.target.closest('[data-alert-id]');
      if (card && !event.target.closest('button')) {
        selectAlert(card.dataset.alertId, { scroll: true }).catch((e) => {
          toast('Не удалось открыть log', e.message || 'Ошибка при загрузке событий alert-а.', 'warning');
        });
        return;
      }
      const button = event.target.closest('[data-profile-alert-action][data-asset-id]');
      if (!button) return;
      const assetId = button.dataset.assetId;
      const alertId = button.dataset.alertId || null;
      const inspectionId = button.dataset.inspectionId || null;
      const measurementId = button.dataset.measurementId || null;
      const nextStatus = button.dataset.nextStatus || null;
      const action = button.dataset.profileAlertAction;
      if (action === 'select-alert' && alertId) {
        selectAlert(alertId, { scroll: true }).catch((e) => {
          toast('Не удалось открыть log', e.message || 'Ошибка при загрузке событий alert-а.', 'warning');
        });
        return;
      }
      if (action === 'advance-status' && alertId && nextStatus) {
        const nextMeta = getAlertStatusMeta(nextStatus);
        saveAlertEvent(alertId, {
          event_type: 'status_change',
          next_status: nextStatus,
          message: `Статус alert-а переведён в ${nextMeta.label}.`,
        }, 'Статус alert-а обновлён').catch((e) => {
          toast('Не удалось обновить alert', e.message || 'Ошибка при обновлении статуса alert-а.', 'error');
        });
        return;
      }
      if (action === 'open-journal') {
        focusProfileAsset(assetId, 'journalPanel');
        return;
      }
      if (action === 'open-monitoring') {
        focusProfileAsset(assetId, 'monitoringList');
        return;
      }
      if (action === 'open-compare') {
        focusProfileCompare(assetId, 'baseline_saved', inspectionId);
        return;
      }
      if (action === 'prepare-repair') {
        selectedAssetId = assetId;
        analysisCompareAssetId = assetId;
        syncWorkspaceSelection(assetId, inspectionId);
        prepareAssetTransition('service', 'repair');
        return;
      }
      if (action === 'prepare-after') {
        selectedAssetId = assetId;
        analysisCompareAssetId = assetId;
        syncWorkspaceSelection(assetId, inspectionId);
        prepareAssetTransition('after_maintenance', 'replaced');
        return;
      }
      if (action === 'set-baseline' && inspectionId) {
        setBaselineInspection(inspectionId).catch((e) => {
          toast('Не удалось назначить baseline', e.message || 'Ошибка при обновлении эталонного сеанса.', 'error');
        });
        return;
      }
      if (action === 'open-measurement' && measurementId) {
        openMeasurementInAnalysis(measurementId);
      }
    });
    el('profileAlertFilterRow')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-alert-filter]');
      if (!button) return;
      alertStatusFilter = button.dataset.alertFilter || 'all';
      renderProfileHealthOverview();
      renderAlertLifecyclePanel();
    });
    el('profileAlertSortInput')?.addEventListener('change', (event) => {
      alertSortMode = trimText(event.target.value) || 'priority';
      renderProfileHealthOverview();
      renderAlertLifecyclePanel();
    });
    el('alertEventTypeInput')?.addEventListener('change', (event) => {
      const nextNode = el('alertNextStatusInput');
      if (!nextNode) return;
      const eventType = event.target.value || 'note';
      if (eventType === 'acknowledge') nextNode.value = 'acknowledged';
      if (eventType === 'work') nextNode.value = 'in_progress';
      if (eventType === 'resolve') nextNode.value = 'resolved';
    });
    el('alertEventForm')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const alert = getAlertById(selectedAlertId);
      if (!alert) {
        toast('Alert не выбран', 'Сначала выберите alert в верхнем списке.', 'warning');
        return;
      }
      const eventType = trimText(el('alertEventTypeInput')?.value) || 'note';
      const nextStatus = trimText(el('alertNextStatusInput')?.value) || null;
      const message = trimText(el('alertEventMessageInput')?.value);
      saveAlertEvent(alert.id, {
        event_type: eventType,
        next_status: nextStatus,
        message,
      }, 'Событие сохранено').then(() => {
        if (el('alertEventMessageInput')) el('alertEventMessageInput').value = '';
      }).catch((e) => {
        toast('Не удалось сохранить событие', e.message || 'Ошибка при записи действия по alert-у.', 'error');
      });
    });
    el('alertOpenCompareBtn')?.addEventListener('click', () => {
      const alert = getAlertById(selectedAlertId);
      if (!alert?.assetId) {
        toast('Alert не выбран', 'Сначала выберите alert из списка.', 'warning');
        return;
      }
      focusProfileCompare(alert.assetId, 'baseline_saved', alert.inspectionId);
    });
    el('alertOpenJournalBtn')?.addEventListener('click', () => {
      const alert = getAlertById(selectedAlertId);
      if (!alert?.assetId) {
        toast('Alert не выбран', 'Сначала выберите alert из списка.', 'warning');
        return;
      }
      focusProfileAsset(alert.assetId, 'journalPanel');
    });
    ['assetNameInput', 'sessionNoteInput', 'engineerReasonInput', 'actionTakenInput'].forEach((id) => {
      el(id)?.addEventListener('input', () => {
        renderCaptureSummary();
        scheduleJourneyDraftSave('journal-input');
      });
      el(id)?.addEventListener('change', () => {
        renderCaptureSummary();
        scheduleJourneyDraftSave('journal-change');
      });
    });
    el('sessionStateInput')?.addEventListener('change', () => {
      syncWorkStatusFromState(true);
      renderCaptureSummary();
      scheduleJourneyDraftSave('session-state');
    });
    el('workStatusInput')?.addEventListener('change', () => {
      const work = trimText(el('workStatusInput')?.value);
      const stateNode = el('sessionStateInput');
      if (stateNode && work === 'repair') stateNode.value = 'service';
      if (stateNode && work === 'replaced') stateNode.value = 'after_maintenance';
      if (stateNode && work === 'observe' && stateNode.value === 'service') stateNode.value = 'healthy';
      renderCaptureSummary();
      scheduleJourneyDraftSave('work-status');
    });
    el('assetFocusSelect')?.addEventListener('change', (event) => {
      selectedAssetId = event.target.value || null;
      const asset = getAssetById(selectedAssetId);
      if (asset && el('assetNameInput') && !trimText(el('assetNameInput').value)) {
        el('assetNameInput').value = asset.name;
      }
      syncWorkspaceSelection(selectedAssetId);
      renderWorkspace();
    });
    el('compareBaselineSelect')?.addEventListener('change', (event) => {
      compareBaselineId = event.target.value || null;
      renderComparePanel();
    });
    el('compareTargetSelect')?.addEventListener('change', (event) => {
      compareTargetId = event.target.value || null;
      selectedReportInspectionId = compareTargetId;
      renderComparePanel();
      renderReportPanel();
    });
    el('analysisCompareAssetSelect')?.addEventListener('change', (event) => {
      analysisCompareAssetId = event.target.value || null;
      applyAnalysisCompareMode(analysisCompareMode, { force: true, openTarget: true });
    });
    el('analysisCompareModeSelect')?.addEventListener('change', (event) => {
      applyAnalysisCompareMode(event.target.value || 'baseline_current', { force: true, openTarget: true });
    });
    el('analysisCompareReferenceSelect')?.addEventListener('change', (event) => {
      analysisCompareReferenceId = event.target.value || null;
      renderAnalysisComparePanel();
      rerenderActiveDiagnosis();
    });
    el('analysisCompareTargetSelect')?.addEventListener('change', (event) => {
      analysisCompareTargetId = event.target.value || '__current';
      renderAnalysisComparePanel();
      if (analysisCompareTargetId !== '__current') {
        restoreSession(analysisCompareTargetId, 'open', { silent: true, skipScroll: true });
      } else {
        rerenderActiveDiagnosis();
      }
    });
    el('analysisComparePanel')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-analysis-compare-preset]');
      if (!button) return;
      applyAnalysisCompareMode(button.dataset.analysisComparePreset || 'baseline_current', { force: true, openTarget: true });
    });
    el('reportSessionSelect')?.addEventListener('change', (event) => {
      selectedReportInspectionId = event.target.value || null;
      renderReportPanel();
    });
    el('generateReportBtn')?.addEventListener('click', () => {
      if (!selectedReportInspectionId) return;
      generateReportForInspection(selectedReportInspectionId).catch((e) => {
        toast('Не удалось создать отчёт', e.message || 'Ошибка генерации отчёта.', 'error');
      });
    });
    el('copyReportLinkBtn')?.addEventListener('click', () => {
      copyReportLink().catch((e) => {
        toast('Не удалось скопировать', e.message || 'Ошибка буфера обмена.', 'warning');
      });
    });
    el('openReportBtn')?.addEventListener('click', openReportLink);
    el('assetFleetList')?.addEventListener('click', (event) => {
      const card = event.target.closest('[data-asset-card]');
      if (!card) return;
      selectedAssetId = card.dataset.assetCard || null;
      syncWorkspaceSelection(selectedAssetId);
      renderWorkspace();
    });
    el('assetSearchInput')?.addEventListener('input', (event) => {
      assetSearchQuery = event.target.value || '';
      renderAssetFleet();
    });
    el('assetStatusFilter')?.addEventListener('change', (event) => {
      assetStatusFilter = event.target.value || 'all';
      renderAssetFleet();
    });
    el('assetRiskFilter')?.addEventListener('change', (event) => {
      assetRiskFilter = event.target.value || 'all';
      renderAssetFleet();
    });
    el('assetSortSelect')?.addEventListener('change', (event) => {
      assetSortMode = event.target.value || 'priority';
      renderAssetFleet();
    });
    el('assetPrepareRepairBtn')?.addEventListener('click', () => prepareAssetTransition('service', 'repair'));
    el('assetPrepareAfterBtn')?.addEventListener('click', () => prepareAssetTransition('after_maintenance', 'replaced'));
    el('assetOpenJournalBtn')?.addEventListener('click', openJournal);
    if (el('assetNameInput') && !el('assetNameInput').value) {
      el('assetNameInput').value = sessionHistory[0]?.assetName || 'Gearbox A-01';
    }
    if (el('sessionStateInput') && !el('sessionStateInput').value) {
      el('sessionStateInput').value = 'warning';
    }
    if (el('workStatusInput') && !el('workStatusInput').value) {
      el('workStatusInput').value = 'observe';
    }
    syncWorkStatusFromState();
    updateHeaderProfile();
    renderAuthSummary();
    syncWorkspaceSelection();
    renderWorkspace();
    renderCaptureSummary();
  }

  function syncHeroMeta(metaObj) {
    if (!metaObj) return;
    const sampleCount = (metaObj.train_size || 0) + (metaObj.test_size || 0);
    const featureCount = metaObj.n_features || metaObj.n_features_selected || metaObj.feature_names?.length || 0;
    const setText = (id, value) => {
      const node = el(id);
      if (!node) return;
      // If a counter animation is in progress, only update the final target so it ends on correct value.
      if (node.hasAttribute('data-counter') && node.dataset.counterAnimated === '1') return;
      node.textContent = value;
    };

    setText('heroAccValue', `${(metaObj.accuracy * 100).toFixed(1)}%`);
    setText('heroClassValue', String(metaObj.classes?.length || 0));
    setText('heroSampleValue', sampleCount ? String(sampleCount) : '—');
    setText('heroSourceLine', VM.sourceLabel(metaObj));
    setText('heroModelSource', VM.sourceLabel(metaObj));
    setText('heroFeatureValue', String(featureCount || '—'));
    setText('heroClassValueStage', String(metaObj.classes?.length || 0));
  }

  function activateScenarioCards(cls) {
    document.querySelectorAll('[data-demo-class]').forEach(node => {
      node.classList.toggle('active-demo', node.dataset.demoClass === cls);
    });
  }

  function runScenario(cls, options = {}) {
    goPage('diag');
    window.setTimeout(() => runDemo(cls, options), 220);
  }

  function setupScenarioLinks() {
    document.querySelectorAll('[data-demo-class]').forEach(node => {
      node.addEventListener('click', () => runScenario(node.dataset.demoClass));
    });
  }

  function initRevealSystem() {
    const targets = [
      '.hero-copy',
      '.hero-stage',
      '.hero-command-card',
      '.sales-strip',
      '.metric-card',
      '.fault-card',
      '.diag-lead',
      '.diag-presets',
      '.diag-storyboard-card',
      '.diag-support-card',
      '.page-compass',
      '.preset-card',
      '.upload-zone',
      '.sensor-panel',
      '.fault-btn',
      '.analysis-compare-panel',
      '.analysis-compare-summary',
      '.signal-box',
      '.card',
      '.profile-command-shell',
      '.workspace-panel',
      '.profile-alert-item',
      '.assets-hero-copy',
      '.assets-hero-metrics',
      '.asset-fleet-card',
    ];
    const nodes = [...new Set(targets.flatMap(selector => [...document.querySelectorAll(selector)]))];
    if (!nodes.length) return;

    nodes.forEach((node, index) => {
      node.classList.add('reveal');
      node.style.setProperty('--reveal-delay', `${Math.min(index % 6, 5) * 55}ms`);
    });

    if (!('IntersectionObserver' in window)) {
      nodes.forEach(node => node.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.14 });

    nodes.forEach(node => observer.observe(node));
  }

  // ═══ NAV ═══
  function updateViewportChrome() {
    const progressNode = el('appProgressBar');
    if (progressNode) {
      const root = document.documentElement;
      const maxScroll = Math.max(1, root.scrollHeight - window.innerHeight);
      const ratio = Math.max(0.04, Math.min(1, (window.scrollY || root.scrollTop || 0) / maxScroll));
      progressNode.style.transform = `scaleX(${ratio})`;
    }
    // Header frosted-glass + scroll-invite fade
    const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
    document.body.classList.toggle('is-scrolled', scrollY > 60);
    const invite = el('scrollInvite');
    if (invite) invite.style.opacity = scrollY > 40 ? '0' : '';
  }

  function goPage(id) {
    ['home', 'diag', 'profile', 'assets'].forEach(p => {
      const e = el('page-'+p); if(e) e.style.display = p===id ? 'block' : 'none';
    });
    document.body.dataset.page = id;
    document.querySelectorAll('.nav-btn').forEach(b => {
      const isActive = b.dataset.page===id;
      b.classList.toggle('active', isActive);
      if(isActive) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current');
    });
    window.scrollTo({top:0,behavior:'smooth'});
    window.setTimeout(updateViewportChrome, 80);
    renderStudyLabShell();
    renderAnalysisCoach();
    renderAnalysisWizard();
    renderProfileOnboard();
    scheduleJourneyDraftSave('page');
  }

  function goHomeSection(sectionId) {
    const scrollToSection = () => {
      const target = el(sectionId);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    goPage('home');
    window.setTimeout(scrollToSection, 80);
  }

  function goPageSection(pageId, sectionId) {
    if (pageId === 'profile' && typeof UIStates !== 'undefined' && UIStates.showProfileTabForSection) {
      UIStates.showProfileTabForSection(sectionId);
    }
    const scrollToSection = () => {
      const target = el(sectionId);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const pageEl = el(`page-${pageId}`);
    const isVisible = pageId === 'home'
      ? !!pageEl && pageEl.style.display !== 'none'
      : !!pageEl && pageEl.style.display === 'block';

    if (!isVisible) {
      goPage(pageId);
      window.setTimeout(scrollToSection, 90);
      return;
    }

    scrollToSection();
  }

  function applyInitialRoute() {
    if (initialRouteApplied) return;
    initialRouteApplied = true;
    if (!initialRoute.page && !initialRoute.section && !initialRoute.demo && !initialRoute.guide && !initialRoute.lab) return;

    if (initialRoute.guide) {
      analysisGuideMode = initialRoute.guide;
    }
    if (initialRoute.lab && STUDY_LABS[initialRoute.lab]) {
      activeStudyLabId = initialRoute.lab;
      if (studyLabState) saveStudyLabState();
      renderStudyLabShell();
    }

    const targetPage = initialRoute.page || (initialRoute.demo || initialRoute.guide ? 'diag' : 'home');
    if (targetPage === 'diag') {
      goPage('diag');
      if (initialRoute.demo) {
        window.setTimeout(() => runDemo(initialRoute.demo), 240);
      } else if (initialRoute.section) {
        window.setTimeout(() => {
          const target = el(initialRoute.section);
          if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 120);
      } else {
        renderAnalysisCoach();
      }
      return;
    }

    if (targetPage === 'home' && initialRoute.section) {
      goHomeSection(initialRoute.section);
      return;
    }

    if (targetPage !== 'home') {
      goPage(targetPage);
      if (initialRoute.section) {
        window.setTimeout(() => {
          const target = el(initialRoute.section);
          if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 120);
      }
      return;
    }

    if (initialRoute.section) {
      goHomeSection(initialRoute.section);
    }
  }

  function litPipeline(step) {
    for(let i=1;i<=5;i++){const e=el('ps'+i);if(e)e.classList.toggle('lit',i<=step);}
  }

  // ═══ DEMO ═══
  function runDemo(cls, options = {}) {
    if(diagLocked) return;
    diagLocked = true;
    if(currentStop) currentStop();
    clearCurrentDiagnosis();
    currentSourceFile = null;
    const demoCase = typeof DemoCases !== 'undefined' ? DemoCases.get(cls) : null;
    const hiddenMeta = options.hiddenCase || null;
    currentInputContext = {
      type: hiddenMeta ? 'hidden_case' : 'demo',
      scenario: cls,
      label: hiddenMeta
        ? `Mystery case · ${hiddenMeta.title || 'Hidden case'}`
        : (demoCase ? `SEU Demo · ${VM.RU[cls] || cls}` : `Demo · ${VM.RU[cls] || cls}`),
      sourceFile: demoCase?.source_file || null,
      measurementId: null,
      hiddenCaseId: hiddenMeta?.challengeId || null,
      hiddenLabId: hiddenMeta?.labId || null,
    };
    if (!hiddenMeta) {
      markStudyLabCheckpointsByTrigger('demo', cls);
    }
    renderAnalysisCoach();
    scheduleJourneyDraftSave('demo-start');
    activateScenarioCards(cls);
    document.querySelectorAll('.fault-btn').forEach(b=>b.classList.toggle('active',b.dataset.cls===cls));
    litPipeline(0);
    const color = VM.COLORS[cls];
    el('sigStatus').textContent='—'; el('specStatus').textContent='—';
    el('sigDesc').textContent=''; el('specDesc').textContent='';
    if (el('sigDesc')) el('sigDesc').dataset.baseText = '';
    if (el('specDesc')) el('specDesc').dataset.baseText = '';
    el('diagResult').classList.remove('show');
    Viz.clear('sigCanvas'); Viz.clear('specCanvas');

    setTimeout(()=>{
      litPipeline(1);
      el('sigStatus').textContent='● LIVE'; el('sigStatus').style.color=color;
      const sig = demoCase?.signal?.length ? Float64Array.from(demoCase.signal) : SignalGen.generate(cls);
      currentStop = Viz.drawSignal('sigCanvas',sig,color,true);
      Viz.addCrosshair(el('sigCanvas'), {type:'signal', data:sig, sampleRate:VM.FS, color});
      const sigBaseText = demoCase
        ? `${VM.DESCRIPTIONS[cls].sig} Эталонный SEU-сегмент · ${demoCase.source_file?.split('/').slice(-2).join(' / ') || 'reference case'}`
        : VM.DESCRIPTIONS[cls].sig;
      el('sigDesc').textContent = sigBaseText;
      el('sigDesc').dataset.baseText = sigBaseText;
      currentSignalData={data:sig,sampleRate:demoCase?.sample_rate || VM.FS};

      setTimeout(()=>{
        litPipeline(2); el('specStatus').textContent='БПФ...'; el('specStatus').style.color='#fbbf24';
        setTimeout(()=>{
          litPipeline(3); el('specStatus').textContent='READY'; el('specStatus').style.color=color;
          const{freqs,spectrum}=FFT.computeSpectrum(sig);
          Viz.drawSpectrum('specCanvas',freqs,spectrum,color);
          Viz.addCrosshair(el('specCanvas'), {type:'spectrum', data:spectrum, freqs, color});
          const specBaseText = demoCase
            ? `${VM.DESCRIPTIONS[cls].spec} Готовый кейс привязан к реальному сегменту из SEU.`
            : VM.DESCRIPTIONS[cls].spec;
          el('specDesc').textContent = specBaseText;
          el('specDesc').dataset.baseText = specBaseText;
          setTimeout(()=>{
            litPipeline(4);
            setTimeout(()=>{
              litPipeline(5);
              if(Model.isLoaded()){
                const live = Model.diagnose(sig);
                if (demoCase?.predicted_class && demoCase?.probabilities) {
                  const demoCls = demoCase.predicted_class;
                  const demoProbs = demoCase.probabilities;
                  const demoRf = {
                    ...live,
                    cls: demoCls,
                    confidence: demoCase.confidence || demoProbs[demoCls] || live.confidence,
                    probabilities: demoProbs,
                  };
                  showDiagnosis(demoCls, demoProbs, VM.COLORS[demoCls], sig, live.features);
                  showAdvancedDiagnosis(sig, live.features, demoRf);
                } else {
                  showDiagnosis(live.cls, live.probabilities, VM.COLORS[live.cls], sig, live.features);
                  showAdvancedDiagnosis(sig, live.features, live);
                }
              } else { showDiagFake(cls,color); }
              diagLocked=false;
              renderAnalysisCoach();
            },400);
          },350);
        },400);
      },350);
    },200);
  }

  function detectStructuredClassHint(title = '', fallbackName = '') {
    const probe = `${title} ${fallbackName}`.toLowerCase();
    if (!probe.trim()) return null;
    if (probe.includes('health')) return 'normal';
    if (probe.includes('chipped') || probe.includes('chip') || /(^|[\W_])c(_|\d|$)/.test(probe)) return 'tooth_chip';
    if (probe.includes('miss') || /(^|[\W_])m(_|\d|$)/.test(probe)) return 'tooth_miss';
    if (probe.includes('root') || probe.includes('crack') || /(^|[\W_])r(_|\d|$)/.test(probe)) return 'root_crack';
    if (probe.includes('surface') || probe.includes('wear') || /(^|[\W_])s(_|\d|$)/.test(probe)) return 'surface_wear';
    if (probe.includes('ball')) return 'ball_fault';
    if (probe.includes('inner')) return 'inner_race';
    if (probe.includes('outer')) return 'outer_race';
    if (probe.includes('comb')) return 'combination';
    return null;
  }

  function getWindowStartPositions(totalLength, segmentLength, maxWindows = 12) {
    const totalSegments = Math.floor(totalLength / segmentLength);
    if (totalSegments <= 1) return [0];
    if (totalSegments <= maxWindows) {
      return Array.from({ length: totalSegments }, (_, index) => index * segmentLength);
    }

    const seen = new Set();
    const starts = [];
    for (let index = 0; index < maxWindows; index++) {
      const ratio = maxWindows === 1 ? 0 : index / (maxWindows - 1);
      const segmentIndex = Math.round(ratio * (totalSegments - 1));
      if (seen.has(segmentIndex)) continue;
      seen.add(segmentIndex);
      starts.push(segmentIndex * segmentLength);
    }
    return starts.sort((a, b) => a - b);
  }

  function analyzeSegmentedFile(signal, sampleRate, meta = {}) {
    const segmentLength = Math.max(64, Math.floor(sampleRate * VM.DURATION));
    if (!signal?.length) throw new Error('Нет сигнала для анализа');

    const scanLimit = meta?.sourceFormat === 'seu_structured' ? 12 : 8;
    const starts = getWindowStartPositions(signal.length, segmentLength, scanLimit);
    const segments = starts.map((start, index) => {
      const slice = signal.slice(start, start + segmentLength);
      const diagnosis = Model.diagnose(slice, sampleRate);
      return {
        index,
        start,
        signal: slice,
        diagnosis,
      };
    });

    if (!segments.length) {
      throw new Error('Не удалось сформировать сегмент для анализа');
    }

    const classMean = {};
    const classPeak = {};
    const classScores = {};
    VM.CLASSES.forEach((cls) => {
      const values = segments.map(({ diagnosis }) => diagnosis.probabilities?.[cls] || 0);
      const mean = values.reduce((sum, value) => sum + value, 0) / segments.length;
      const peak = Math.max(...values);
      classMean[cls] = mean;
      classPeak[cls] = peak;
      classScores[cls] = peak * 0.65 + mean * 0.35;
    });

    const representativeClass = VM.CLASSES.reduce((best, cls) =>
      (classScores[cls] || 0) > (classScores[best] || 0) ? cls : best
    , VM.CLASSES[0]);

    const scoreSum = VM.CLASSES.reduce((sum, cls) => sum + (classScores[cls] || 0), 0) || 1;
    const aggregated = {};
    VM.CLASSES.forEach((cls) => {
      aggregated[cls] = (classScores[cls] || 0) / scoreSum;
    });

    const representative = segments.reduce((best, candidate) => {
      if (!best) return candidate;
      const bestScore = best.diagnosis.probabilities?.[representativeClass] || 0;
      const candidateScore = candidate.diagnosis.probabilities?.[representativeClass] || 0;
      if (candidateScore === bestScore) {
        return (candidate.diagnosis.confidence || 0) > (best.diagnosis.confidence || 0) ? candidate : best;
      }
      return candidateScore > bestScore ? candidate : best;
    }, null);

    return {
      signal: representative.signal,
      diagnosis: {
        ...representative.diagnosis,
        cls: representativeClass,
        confidence: aggregated[representativeClass] || representative.diagnosis.confidence || 0,
        probabilities: aggregated,
      },
      summary: {
        analyzedWindows: segments.length,
        totalWindows: Math.max(1, Math.floor(signal.length / segmentLength)),
        representativeWindow: representative.index + 1,
        representativeStart: representative.start,
        representativeClass,
        representativeMean: classMean[representativeClass] || 0,
        representativePeak: classPeak[representativeClass] || 0,
      },
    };
  }

  // ═══ FILE DIAGNOSIS ═══
  // Supported file formats: .wav, .csv, .tsv, .txt, .mat, .npy, .npz, .dat
  // (update file input accept attribute to: .wav,.csv,.tsv,.txt,.mat,.npy,.npz,.dat)
  async function runFileDiag(file) {
    if(diagLocked)return; diagLocked=true;
    if(currentStop) currentStop();
    clearCurrentDiagnosis();
    currentSourceFile = file;
    activateScenarioCards(null);
    document.querySelectorAll('.fault-btn').forEach(b=>b.classList.remove('active'));
    litPipeline(0); el('diagResult').classList.remove('show');
    if (el('sigDesc')) el('sigDesc').dataset.baseText = '';
    if (el('specDesc')) el('specDesc').dataset.baseText = '';
    if (typeof UIStates !== 'undefined') UIStates.showAnalysisLoading();

    try {
      el('sigStatus').textContent='ЗАГРУЗКА...'; el('sigStatus').style.color='#fbbf24';
      litPipeline(1);
      const parsed = await Converter.parseFile(file);
      let signal = parsed.data;
      const fileMeta = parsed.metadata || {};
      const titleHint = detectStructuredClassHint(fileMeta.title, parsed.name);
      currentInputContext = {
        type: 'file',
        label: `${parsed.format.toUpperCase()} · ${parsed.name}`,
        name: parsed.name,
        format: parsed.format,
        channel: parsed.selectedChannel || null,
        sourceTitle: fileMeta.title || null,
        titleHint,
        measurementId: null,
      };
      renderAnalysisCoach();
      scheduleJourneyDraftSave('file-start');
      currentSignalData={data:signal,sampleRate:parsed.sampleRate};

      let chInfo = parsed.channels ? ` | Каналы: ${parsed.channels.length} | Выбран: ${parsed.selectedChannel}` : '';
      let titleInfo = fileMeta.title ? ` | Title: ${fileMeta.title}` : '';
      el('sigStatus').textContent=`\u25cf ${parsed.format.toUpperCase()} ${signal.length} pts`;
      el('sigStatus').style.color='#00e5ff';
      const fileSigBaseText = `${parsed.name} | ${parsed.sampleRate} Hz | ${(signal.length/parsed.sampleRate).toFixed(3)}с${chInfo}${titleInfo}`;
      el('sigDesc').textContent = fileSigBaseText;
      el('sigDesc').dataset.baseText = fileSigBaseText;

      let diagnosisResult = null;
      let segmentSummary = null;
      const max = Math.floor(parsed.sampleRate * VM.DURATION);
      if(signal.length > max && Model.isLoaded()) {
        const segmented = analyzeSegmentedFile(signal, parsed.sampleRate, fileMeta);
        signal = segmented.signal;
        diagnosisResult = segmented.diagnosis;
        segmentSummary = segmented.summary;
      } else if(signal.length > max) {
        signal = signal.slice(0, max);
      }
      if(signal.length < 64) throw new Error('Сигнал слишком короткий');
      currentSignalData={data:signal,sampleRate:parsed.sampleRate};

      if (segmentSummary) {
        const summaryText = `${fileSigBaseText} | Окна: ${segmentSummary.analyzedWindows}/${segmentSummary.totalWindows} | Выбрано: ${segmentSummary.representativeWindow}`;
        el('sigDesc').textContent = summaryText;
        el('sigDesc').dataset.baseText = summaryText;
        currentInputContext.segmentSummary = {
          ...segmentSummary,
          selectedClassHint: titleHint,
        };
      }

      currentStop = Viz.drawSignal('sigCanvas',signal,'#00e5ff',true);
      Viz.addCrosshair(el('sigCanvas'), {type:'signal', data:signal, sampleRate:parsed.sampleRate, color:'#00e5ff'});

      setTimeout(()=>{
        litPipeline(2); el('specStatus').textContent='БПФ...'; el('specStatus').style.color='#fbbf24';
        setTimeout(()=>{
          litPipeline(3);
          const{freqs,spectrum}=FFT.computeSpectrum(signal,parsed.sampleRate);
          Viz.drawSpectrum('specCanvas',freqs,spectrum,'#00e5ff');
          Viz.addCrosshair(el('specCanvas'), {type:'spectrum', data:spectrum, freqs, color:'#00e5ff'});
          el('specStatus').textContent='READY'; el('specStatus').style.color='#00e5ff';
          const fileSpecBaseText = segmentSummary
            ? `Спектр: макс ${Math.round(parsed.sampleRate/2)} Гц | Анализ по ${segmentSummary.analyzedWindows} окнам`
            : `Спектр: макс ${Math.round(parsed.sampleRate/2)} Гц`;
          el('specDesc').textContent = fileSpecBaseText;
          el('specDesc').dataset.baseText = fileSpecBaseText;
          setTimeout(()=>{
            litPipeline(4);
            setTimeout(()=>{
              litPipeline(5);
              if(Model.isLoaded()){
                const r = diagnosisResult || Model.diagnose(signal,parsed.sampleRate);
                showDiagnosis(r.cls,r.probabilities,VM.COLORS[r.cls],signal,r.features);
                // Advanced diagnosis with ONNX models if available
                showAdvancedDiagnosis(signal, r.features, r);
                if (typeof UIStates !== 'undefined') { UIStates.hideAnalysisLoading(); UIStates.hideAnalysisError(); }
              } else if (typeof UIStates !== 'undefined') {
                UIStates.showAnalysisError('Модель не загружена', 'Файл разобрали, но запустить классификацию не получилось — модель ещё не доступна в браузере. Перезагрузите страницу, чтобы попробовать снова.');
              } else {
                el('diagResult').innerHTML='<div style="color:var(--orange);font-family:var(--mono)">\u26a0 Модель не загружена. Запустите python train.py && python export_model.py</div>';
                el('diagResult').style.border='2px solid var(--orange)';
                el('diagResult').style.background='rgba(251,146,60,0.05)';
                el('diagResult').classList.add('show');
              }
              diagLocked=false;
              renderAnalysisCoach();
            },400);
          },350);
        },400);
      },350);
    } catch(err) {
      el('sigStatus').textContent='ОШИБКА'; el('sigStatus').style.color='#f87171';
      el('sigDesc').textContent=err.message;
      if (el('sigDesc')) el('sigDesc').dataset.baseText = err.message;
      if (typeof UIStates !== 'undefined') {
        UIStates.showAnalysisError(
          'Не удалось разобрать файл',
          (err && err.message) ? err.message : 'Формат не распознан или файл повреждён. Попробуйте другой файл или один из готовых сигналов.'
        );
      }
      diagLocked=false;
      renderAnalysisCoach();
    }
  }

  // ═══ DISPLAY ═══
  function showDiagnosis(cls, probs, color, signal, features) {
    const d = el('diagResult');
    d.style.border = `2px solid ${color}`; d.style.background = color + '0a';
    // First-success confetti (once per session)
    if (typeof UIStates !== 'undefined' && UIStates.confettiBurst && !window._vibrolabFirstDiagShown) {
      window._vibrolabFirstDiagShown = true;
      const rect = d.getBoundingClientRect();
      UIStates.confettiBurst({
        x: rect.left + rect.width / 2,
        y: Math.max(80, rect.top + 40),
      });
    }
    // C — Explainability + D — mini-spectrogram (analysis extras)
    if (typeof AnalysisExtras !== 'undefined') {
      try {
        AnalysisExtras.renderExplainability(cls, features);
        const sr = (currentSignalData && currentSignalData.sampleRate) || VM.FS;
        AnalysisExtras.renderMiniSpectrogram(signal, sr);
      } catch (e) { console.warn('[Extras] render failed', e); }
    }
    const confidence = probs[cls] || 0;
    const playbook = getPlaybook(cls);
    const hiddenContext = getCurrentHiddenCaseContext();
    const hideAnswer = !!(hiddenContext && !hiddenContext.state?.revealed);
    const sourceLabel = meta ? VM.sourceLabel(meta) : 'Browser inference';
    const engineeringAssessment = buildEngineeringAssessment(signal, cls);
    const engineeringHtml = buildEngineeringEvidenceMarkup(engineeringAssessment);
    const runnerUps = VM.CLASSES
      .filter(c => c !== cls)
      .sort((a, b) => (probs[b] || 0) - (probs[a] || 0))
      .slice(0, 2);

    if (hideAnswer) {
      d.innerHTML = buildHiddenCaseDiagnosisMarkup(cls);
      d.classList.add('show');
      updateCurrentDiagnosis({
        cls,
        confidence,
        probabilities: { ...probs },
        sourceLabel,
        input: { ...currentInputContext },
        playbook,
        signalData: compactSignal(signal || currentSignalData?.data || []),
        sampleRate: currentSignalData?.sampleRate || VM.FS,
        features: Array.isArray(features) ? [...features] : features || null,
      });
      return;
    }

    // --- OOD detection badge ---
    let oodHtml = '';
    if (typeof Model !== 'undefined' && Model.checkOOD) {
      try {
        const oodResult = Model.checkOOD(features || signal);
        const isOOD = oodResult && oodResult.ood;
        oodHtml = `<div style="margin-top:10px;padding:6px 12px;border-radius:6px;font-family:var(--mono);font-size:11px;display:inline-block;${
          isOOD
            ? 'background:rgba(251,146,60,0.15);color:#fb923c;border:1px solid #fb923c'
            : 'background:rgba(52,211,153,0.15);color:#34d399;border:1px solid #34d399'
        }">${isOOD ? '\u26a0 ВНЕ РАСПРЕДЕЛЕНИЯ' : 'В ОБЛАСТИ ОБУЧЕНИЯ \u2713'}${
          oodResult.score != null ? ` (score: ${oodResult.score.toFixed(3)})` : ''
        }</div>`;
      } catch (e) { console.warn('[APP] OOD check failed:', e); }
    }

    // --- SHAP top-3 features ---
    let shapHtml = '';
    if (typeof Model !== 'undefined' && Model.explainPrediction) {
      try {
        const expl = Model.explainPrediction(features || signal, cls);
        if (expl && expl.length) {
          const top3 = expl.slice(0, 3);
          shapHtml = `<div style="margin-top:14px">
            <div class="label" style="margin-bottom:6px">ВКЛАД ПРИЗНАКОВ · TOP-3</div>
            ${top3.map((f, i) => {
              const w = Math.min(Math.abs(f.value) * 100, 100);
              const c = f.value >= 0 ? '#34d399' : '#f87171';
              return `<div style="display:flex;align-items:center;gap:8px;margin:4px 0;font-family:var(--mono);font-size:10px">
                <span style="min-width:90px;color:var(--muted)">${f.name || 'feat_' + i}</span>
                <div style="flex:1;height:6px;background:#1a2234;border-radius:3px;overflow:hidden">
                  <div style="width:${w}%;height:100%;background:${c};border-radius:3px"></div>
                </div>
                <span style="color:${c};min-width:50px;text-align:right">${f.value >= 0 ? '+' : ''}${f.value.toFixed(4)}</span>
              </div>`;
            }).join('')}
          </div>`;
        }
      } catch (e) { console.warn('[APP] SHAP explain failed:', e); }
    }

    // --- RUL estimate gauge ---
    let rulHtml = '';
    if (typeof Model !== 'undefined' && Model.estimateRUL) {
      try {
        const rul = Model.estimateRUL(features || signal);
        if (rul != null) {
          const pct = Math.min(Math.max(rul.percent || (rul.hours / rul.maxHours * 100) || 50, 0), 100);
          const rulColor = pct > 60 ? '#34d399' : pct > 30 ? '#fbbf24' : '#f87171';
          rulHtml = `<div style="margin-top:14px">
            <div class="label" style="margin-bottom:6px">ОЦЕНКА ОСТАТОЧНОГО РЕСУРСА</div>
            <div style="display:flex;align-items:center;gap:10px">
              <div style="flex:1;height:10px;background:#1a2234;border-radius:5px;overflow:hidden">
                <div style="width:${pct}%;height:100%;background:${rulColor};border-radius:5px;transition:width 0.5s"></div>
              </div>
              <span style="font-family:var(--mono);font-size:12px;color:${rulColor};min-width:60px;text-align:right">${
                rul.hours != null ? rul.hours.toFixed(0) + ' ч' : pct.toFixed(0) + '%'
              }</span>
            </div>
          </div>`;
        }
      } catch (e) { console.warn('[APP] RUL estimation failed:', e); }
    }

    // --- Anomaly detection status ---
    let anomalyHtml = '';
    if (typeof Model !== 'undefined' && Model.detectAnomaly) {
      try {
        const anom = Model.detectAnomaly(features || signal);
        if (anom != null) {
          const isAnom = anom.anomaly || anom.score > (anom.threshold || 0.5);
          const anomScore = anom.score != null ? anom.score : (isAnom ? 0.9 : 0.1);
          const anomColor = isAnom ? '#f87171' : '#34d399';
          anomalyHtml = `<div style="margin-top:10px;padding:6px 12px;border-radius:6px;font-family:var(--mono);font-size:11px;display:inline-block;margin-right:8px;${
            isAnom
              ? 'background:rgba(248,113,113,0.15);color:#f87171;border:1px solid #f87171'
              : 'background:rgba(52,211,153,0.15);color:#34d399;border:1px solid #34d399'
          }">${isAnom ? '\u26a0 ANOMALY' : 'NORMAL \u2713'} (${(anomScore * 100).toFixed(1)}%)</div>`;
        }
      } catch (e) { console.warn('[APP] Anomaly detection failed:', e); }
    }

    // --- Multi-model comparison (ONNX) ---
    let multiModelHtml = '';
    if (typeof ModelONNX !== 'undefined' && ModelONNX.diagnose) {
      try {
        const onnxResult = ModelONNX.diagnose(signal || currentSignalData?.data);
        if (onnxResult && onnxResult.cls) {
          const agree = onnxResult.cls === cls;
          multiModelHtml = `<div style="margin-top:14px">
            <div class="label" style="margin-bottom:6px">СРАВНЕНИЕ МОДЕЛЕЙ</div>
            <div style="display:flex;gap:16px;font-family:var(--mono);font-size:11px">
              <div style="padding:8px 14px;border-radius:6px;background:${color}15;border:1px solid ${color}">
                <div style="color:var(--muted);font-size:9px;margin-bottom:4px">RF МОДЕЛЬ</div>
                <div style="color:${color}">${VM.RU[cls]} ${(probs[cls] * 100).toFixed(1)}%</div>
              </div>
              <div style="padding:8px 14px;border-radius:6px;background:${VM.COLORS[onnxResult.cls] || '#a78bfa'}15;border:1px solid ${VM.COLORS[onnxResult.cls] || '#a78bfa'}">
                <div style="color:var(--muted);font-size:9px;margin-bottom:4px">ONNX МОДЕЛЬ</div>
                <div style="color:${VM.COLORS[onnxResult.cls] || '#a78bfa'}">${VM.RU[onnxResult.cls] || onnxResult.cls} ${
                  onnxResult.confidence != null ? (onnxResult.confidence * 100).toFixed(1) + '%' : ''
                }</div>
              </div>
            </div>
            <div style="margin-top:8px;font-family:var(--mono);font-size:10px;color:${agree ? '#34d399' : '#fbbf24'}">
              ${agree ? '\u2713 МОДЕЛИ СОГЛАСНЫ С РЕЗУЛЬТАТОМ' : '\u26a0 ЕСТЬ РАСХОЖДЕНИЕ МОДЕЛЕЙ'}
            </div>
          </div>`;
        }
      } catch (e) { console.warn('[APP] ONNX comparison failed:', e); }
    }

    d.innerHTML = `${buildHiddenCaseResultBanner()}<div class="diag-shell">
      <div class="diag-main-panel">
        <div class="diag-badge-row">
          <span class="diag-badge diag-badge--${playbook.tone}">${playbook.badge}</span>
          <span class="diag-badge">CONF ${(confidence * 100).toFixed(1)}%</span>
          <span class="diag-badge">${sourceLabel}</span>
        </div>
        <div class="label">РЕЗУЛЬТАТ КЛАССИФИКАЦИИ</div>
        <div class="diag-class" style="color:${color}">${VM.ICONS[cls]} ${VM.RU[cls].toUpperCase()}</div>
        <div class="diag-text">${VM.DESCRIPTIONS[cls].diag}</div>
        <div class="diag-explanation-card diag-explanation-card--${playbook.tone}">
          <div class="diag-explanation-head">
            <span class="diag-explanation-icon" aria-hidden="true">💡</span>
            <span class="diag-explanation-title">Что это значит?</span>
          </div>
          <p class="diag-explanation-text">${playbook.plainLanguage || ''}</p>
          ${playbook.nextStep ? `<div class="diag-explanation-next">
            <span class="diag-explanation-next-label">СЛЕДУЮЩИЙ ШАГ</span>
            <span class="diag-explanation-next-text">${playbook.nextStep}</span>
          </div>` : ''}
        </div>
        <div class="diag-story-grid">
          <div class="diag-story-card">
            <div class="diag-story-label">SEVERITY</div>
            <div class="diag-story-value">${playbook.severity}</div>
            <div class="diag-story-note">${playbook.priority}</div>
          </div>
          <div class="diag-story-card">
            <div class="diag-story-label">RECOMMENDED ACTION</div>
            <div class="diag-story-value">Рекомендуемое действие</div>
            <div class="diag-story-note">${playbook.action}</div>
          </div>
          <div class="diag-story-card">
            <div class="diag-story-label">MODEL EXPLANATION</div>
            <div class="diag-story-value">Ключевой паттерн</div>
            <div class="diag-story-note">${playbook.reason}</div>
          </div>
        </div>
        ${engineeringHtml}
        <div style="margin-top:16px">${oodHtml}${anomalyHtml}</div>
        <div class="diag-action-row">
          <button class="btn btn-primary" type="button" data-save-session="1" onclick="App.saveCurrentSession()">${getSaveActionLabel()}</button>
          <button class="btn" type="button" onclick="App.uploadCurrentMeasurement()">В МОНИТОРИНГ</button>
          <button class="btn" type="button" onclick="App.openSimulatorFromAnalysis()">ПОКАЗАТЬ В 3D</button>
          <button class="btn" type="button" onclick="App.openJournal()">ПРОФИЛЬ</button>
          <a href="simulator.html" class="btn" style="display:inline-flex;align-items:center;text-decoration:none">СИМУЛЯТОР</a>
        </div>
      </div>
      <div class="diag-side-panel">
        <div class="label">РАСПРЕДЕЛЕНИЕ ВЕРОЯТНОСТЕЙ</div>
        ${VM.CLASSES.map(c => {
          const p = (probs[c] || 0) * 100;
          return `<div class="prob-bar-wrap">
            <div class="prob-label" style="color:${VM.COLORS[c]}">${VM.RU[c]}</div>
            <div class="prob-track"><div class="prob-fill" style="width:${p}%;background:${VM.COLORS[c]}"></div></div>
            <div class="prob-val" style="color:${p > 50 ? '#fff' : 'var(--muted)'}">${p.toFixed(1)}%</div>
          </div>`;
        }).join('')}
        <div class="diag-runnerups">
          <div class="diag-runnerups-label">АЛЬТЕРНАТИВНЫЕ КЛАССЫ</div>
          <div class="diag-runnerups-row">
            ${runnerUps.map(c => `<span class="diag-runnerup-pill">
              <span class="dot" style="background:${VM.COLORS[c]}"></span>
              ${VM.RU[c]} ${(probs[c] * 100).toFixed(1)}%
            </span>`).join('')}
          </div>
        </div>
      </div>
    </div>${shapHtml}${rulHtml}${multiModelHtml}`;
    d.classList.add('show');
    renderEngineeringVisuals(signal, cls, color, engineeringAssessment);
    updateCurrentDiagnosis({
      cls,
      confidence,
      probabilities: { ...probs },
      sourceLabel,
      input: { ...currentInputContext },
      playbook,
      signalData: compactSignal(signal || currentSignalData?.data || []),
      sampleRate: currentSignalData?.sampleRate || VM.FS,
      features: Array.isArray(features) ? [...features] : features || null,
    });
  }

  function showDiagFake(cls,color) {
    const p={}; VM.CLASSES.forEach(c=>{p[c]=c===cls?0.94+Math.random()*0.055:Math.random()*0.008;});
    const s=Object.values(p).reduce((a,b)=>a+b); VM.CLASSES.forEach(c=>{p[c]/=s;});
    showDiagnosis(cls,p,color);
  }

  // ═══ ADVANCED DIAGNOSIS ═══
  async function showAdvancedDiagnosis(signal, features, rfResult) {
    const d = el('diagResult');
    if (!d) return;
    if (isHiddenCasePending()) return;

    let onnxResult = null;
    if (typeof ModelONNX !== 'undefined' && ModelONNX.diagnoseAdvanced) {
      try {
        onnxResult = await ModelONNX.diagnoseAdvanced(signal, features);
      } catch (e) { console.warn('[APP] ONNX advanced diagnosis failed:', e); }
    }

    // Combine RF and ONNX results
    const rfCls = rfResult ? rfResult.cls : null;
    const rfConf = rfResult && rfResult.probabilities ? rfResult.probabilities[rfCls] : 0;

    // --- Build advanced panel ---
    let html = '<div style="margin-top:20px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.06)">';
    html += '<div class="label" style="margin-bottom:12px">ДОПОЛНИТЕЛЬНАЯ АНАЛИТИКА</div>';

    // RUL gauge
    let rulValue = null;
    if (onnxResult && onnxResult.rul != null) {
      rulValue = onnxResult.rul;
    } else if (typeof Model !== 'undefined' && Model.estimateRUL) {
      try { rulValue = Model.estimateRUL(features || signal); } catch (e) {}
    }
    if (rulValue != null) {
      const pct = typeof rulValue === 'object'
        ? (rulValue.percent || (rulValue.hours / (rulValue.maxHours || 1000) * 100) || 50)
        : (rulValue * 100);
      const clampPct = Math.min(Math.max(pct, 0), 100);
      const rColor = clampPct > 60 ? '#34d399' : clampPct > 30 ? '#fbbf24' : '#f87171';
      html += `<div style="margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;font-family:var(--mono);font-size:10px;margin-bottom:4px">
          <span style="color:var(--muted)">ОСТАТОЧНЫЙ РЕСУРС</span>
          <span style="color:${rColor}">${clampPct.toFixed(0)}% осталось</span>
        </div>
        <div style="height:12px;background:#1a2234;border-radius:6px;overflow:hidden;position:relative">
          <div style="width:${clampPct}%;height:100%;background:linear-gradient(90deg,${rColor},${rColor}80);border-radius:6px;transition:width 0.6s"></div>
        </div>
      </div>`;
    }

    // Anomaly meter
    let anomalyScore = null;
    if (onnxResult && onnxResult.anomalyScore != null) {
      anomalyScore = onnxResult.anomalyScore;
    } else if (typeof Model !== 'undefined' && Model.detectAnomaly) {
      try {
        const a = Model.detectAnomaly(features || signal);
        anomalyScore = a ? (a.score != null ? a.score : (a.anomaly ? 0.85 : 0.1)) : null;
      } catch (e) {}
    }
    if (anomalyScore != null) {
      const aClamp = Math.min(Math.max(anomalyScore, 0), 1);
      const aColor = aClamp > 0.7 ? '#f87171' : aClamp > 0.4 ? '#fbbf24' : '#34d399';
      html += `<div style="margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;font-family:var(--mono);font-size:10px;margin-bottom:4px">
          <span style="color:var(--muted)">ОЦЕНКА АНОМАЛЬНОСТИ</span>
          <span style="color:${aColor}">${(aClamp * 100).toFixed(1)}%</span>
        </div>
        <div style="height:8px;background:#1a2234;border-radius:4px;overflow:hidden">
          <div style="width:${aClamp * 100}%;height:100%;background:${aColor};border-radius:4px;transition:width 0.6s"></div>
        </div>
      </div>`;
    }

    // Multi-model agreement
    if (onnxResult && rfResult) {
      const models = [{ name: 'Random Forest', cls: rfCls, conf: rfConf }];
      if (onnxResult.cnn) models.push({ name: 'CNN', cls: onnxResult.cnn.cls, conf: onnxResult.cnn.confidence || 0 });
      if (onnxResult.gru) models.push({ name: 'GRU', cls: onnxResult.gru.cls, conf: onnxResult.gru.confidence || 0 });
      if (onnxResult.autoencoder) models.push({ name: 'Autoencoder', cls: onnxResult.autoencoder.cls, conf: onnxResult.autoencoder.confidence || 0 });
      if (onnxResult.cls) models.push({ name: 'ONNX Ensemble', cls: onnxResult.cls, conf: onnxResult.confidence || 0 });

      const uniqueVotes = [...new Set(models.map(m => m.cls))];
      const allAgree = uniqueVotes.length === 1;
      const majorityVote = uniqueVotes.reduce((best, c) => {
        const count = models.filter(m => m.cls === c).length;
        return count > best.count ? { cls: c, count } : best;
      }, { cls: null, count: 0 });

      html += `<div style="margin-bottom:14px">
        <div class="label" style="margin-bottom:8px">СОГЛАСИЕ МОДЕЛЕЙ</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${models.map(m => {
            const mc = VM.COLORS[m.cls] || '#a78bfa';
            return `<div style="padding:6px 12px;border-radius:6px;background:${mc}12;border:1px solid ${mc}40;font-family:var(--mono);font-size:10px">
              <div style="color:var(--muted);font-size:8px;margin-bottom:2px">${m.name}</div>
              <div style="color:${mc}">${VM.RU[m.cls] || m.cls} ${(m.conf * 100).toFixed(1)}%</div>
            </div>`;
          }).join('')}
        </div>
        <div style="margin-top:8px;font-family:var(--mono);font-size:10px;color:${allAgree ? '#34d399' : '#fbbf24'}">
          ${allAgree
            ? '\u2713 ПОЛНОЕ СОГЛАСИЕ МОДЕЛЕЙ'
            : '\u26a0 ЧАСТИЧНОЕ СОГЛАСИЕ · большинство за ' + (VM.RU[majorityVote.cls] || majorityVote.cls) + ' (' + majorityVote.count + '/' + models.length + ')'
          }
        </div>
      </div>`;
    }

    html += '</div>';
    d.innerHTML += html;
  }

  // ═══ SENSOR UI ═══
  let sensorStream = null, sensorConnected = false;

  function initSensorUI() {
    if (document.body?.dataset?.mode !== 'lab') return;
    const zone = el('uploadZone');
    if (!zone || !zone.parentNode) return;
    // Don't add twice
    if (el('sensorPanel')) return;

    const panel = document.createElement('div');
    panel.id = 'sensorPanel';
    panel.style.cssText = 'margin-top:20px;padding:16px;border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:rgba(0,0,0,0.2)';
    panel.innerHTML = `
      <div class="label" style="margin-bottom:10px">SENSOR CONNECTION</div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <button class="btn" id="btnSensorSerial" onclick="App.connectSensor('serial')" style="font-size:11px">\ud83d\udd0c Serial</button>
        <button class="btn" id="btnSensorBLE" onclick="App.connectSensor('ble')" style="font-size:11px">\ud83d\udce1 BLE</button>
        <button class="btn btn-primary" id="btnSensorRecord" onclick="App.recordSensor()" style="font-size:11px;display:none">\u23fa Record & Diagnose</button>
        <span id="sensorStatus" style="font-family:var(--mono);font-size:11px;color:var(--muted)">\u25cb Disconnected</span>
      </div>
    `;
    zone.parentNode.insertBefore(panel, zone.nextSibling);
  }

  async function connectSensorUI(type) {
    const statusEl = el('sensorStatus');
    const recordBtn = el('btnSensorRecord');

    if (typeof Sensor === 'undefined') {
      if (statusEl) statusEl.innerHTML = '<span style="color:#f87171">\u2717 Sensor module not loaded</span>';
      return;
    }

    if (statusEl) statusEl.innerHTML = '<span style="color:#fbbf24">\u25cb Connecting...</span>';

    try {
      if (type === 'serial' && Sensor.connectSerial) {
        sensorStream = await Sensor.connectSerial();
      } else if (type === 'ble' && Sensor.connectBLE) {
        sensorStream = await Sensor.connectBLE();
      } else {
        throw new Error('Connection type "' + type + '" not supported');
      }
      sensorConnected = true;
      if (statusEl) statusEl.innerHTML = '<span style="color:#34d399">\u25cf Connected (' + type.toUpperCase() + ')</span>';
      if (recordBtn) recordBtn.style.display = 'inline-flex';
      console.log('[APP] Sensor connected via', type);
    } catch (e) {
      sensorConnected = false;
      if (statusEl) statusEl.innerHTML = `<span style="color:#f87171">\u2717 ${e.message || 'Connection failed'}</span>`;
      console.warn('[APP] Sensor connection failed:', e);
    }
  }

  async function startSensorRecording() {
    if (!sensorConnected || typeof Sensor === 'undefined') return;
    const statusEl = el('sensorStatus');
    if (statusEl) statusEl.innerHTML = '<span style="color:#fbbf24">\u25cf Recording...</span>';
    clearCurrentDiagnosis();
    currentSourceFile = null;

    try {
      const duration = 0.5; // seconds
      const recording = await Sensor.record(sensorStream, { duration });
      if (!recording || !recording.data || recording.data.length < 64) {
        throw new Error('Recording too short (' + (recording ? recording.data.length : 0) + ' samples)');
      }
      if (statusEl) statusEl.innerHTML = '<span style="color:#34d399">\u25cf Connected</span>';

      currentInputContext = {
        type: 'sensor',
        label: 'Live sensor capture',
        measurementId: null,
      };
      currentSignalData = { data: recording.data, sampleRate: recording.sampleRate || VM.FS };
      const signal = recording.data;
      const sr = recording.sampleRate || VM.FS;

      // Draw signal
      if (currentStop) currentStop();
      currentStop = Viz.drawSignal('sigCanvas', signal, '#a78bfa', true);
      el('sigStatus').textContent = '\u25cf SENSOR'; el('sigStatus').style.color = '#a78bfa';
      const sensorSigBaseText = `Sensor recording | ${sr} Hz | ${signal.length} pts | ${(signal.length / sr).toFixed(3)}s`;
      el('sigDesc').textContent = sensorSigBaseText;
      el('sigDesc').dataset.baseText = sensorSigBaseText;

      // Spectrum
      const { freqs, spectrum } = FFT.computeSpectrum(signal, sr);
      Viz.drawSpectrum('specCanvas', freqs, spectrum, '#a78bfa');
      el('specStatus').textContent = 'READY'; el('specStatus').style.color = '#a78bfa';
      const sensorSpecBaseText = `FFT | Nyquist ${Math.round(sr / 2)} Hz`;
      el('specDesc').textContent = sensorSpecBaseText;
      el('specDesc').dataset.baseText = sensorSpecBaseText;

      // Diagnose
      litPipeline(5);
      if (Model.isLoaded()) {
        const r = Model.diagnose(signal, sr);
        showDiagnosis(r.cls, r.probabilities, VM.COLORS[r.cls], signal, r.features);
        showAdvancedDiagnosis(signal, r.features, r);
      }
    } catch (e) {
      if (statusEl) statusEl.innerHTML = `<span style="color:#f87171">\u2717 ${e.message}</span>`;
      console.warn('[APP] Sensor recording failed:', e);
    }
  }

  // ═══ UPLOAD ZONES ═══
  function setupUpload() {
    setupDrop('uploadZone','uploadFileInput',f=>runFileDiag(f));
    setupDrop('convertDropZone','convertFileInput',f=>handleConvert(f));
  }

  function setupDrop(zoneId, inputId, handler) {
    const z=el(zoneId), inp=el(inputId);
    if(!z||!inp) return;
    z.addEventListener('click',()=>inp.click());
    z.addEventListener('dragover',e=>{e.preventDefault();z.classList.add('dragover');});
    z.addEventListener('dragleave',()=>z.classList.remove('dragover'));
    z.addEventListener('drop',e=>{e.preventDefault();z.classList.remove('dragover');if(e.dataTransfer.files.length)handler(e.dataTransfer.files[0]);});
    inp.addEventListener('change',()=>{if(inp.files.length)handler(inp.files[0]);});
  }

  // ═══ CONVERTER ═══
  async function handleConvert(file) {
    const rEl=el('convertResult'),info=el('convertInfo'),acts=el('convertActions');
    try {
      const p=await Converter.parseFile(file);
      currentSignalData={data:p.data,sampleRate:p.sampleRate};
      const chHtml=p.channels?`<div style="margin:12px 0"><span class="label" style="margin-right:8px">КАНАЛ:</span>${p.channels.map(ch=>
        `<button class="fault-btn ${ch.name===p.selectedChannel?'active':''}" style="padding:6px 14px;font-size:10px" data-ch="${ch.name}" onclick="App._switchCh&&App._switchCh('${ch.name}')">${ch.name}</button>`
      ).join('')}</div>`:'';

      info.innerHTML=`<div style="margin-bottom:8px"><span style="color:var(--green);font-family:var(--mono)">✓ ${file.name}</span>
        <span style="color:var(--muted);margin-left:12px;font-size:12px">${p.format.toUpperCase()} | ${p.sampleRate}Hz | ${p.data.length} pts | ${(p.data.length/p.sampleRate).toFixed(3)}с${p.channels?' | '+p.channels.length+'ch':''}</span></div>${chHtml}`;

      const cv=el('convertPreview');
      if(cv) Viz.drawSignal(cv,p.data.length>2000?p.data.slice(0,2000):p.data,'#00e5ff',false);

      acts.innerHTML='';
      if(p.format==='wav'){
        acts.innerHTML+=`<button class="btn" onclick="Converter.download(Converter.createCSV(App._csData.data,App._csData.sr),'${file.name.replace(/\.wav$/i,'.csv')}')">📄 CSV</button>`;
      } else {
        acts.innerHTML+=`<button class="btn" onclick="Converter.download(Converter.createWAV(App._csData.data,App._csData.sr),'${file.name.replace(/\.(csv|tsv|txt)$/i,'.wav')}')">🔊 WAV</button>`;
      }
      acts.innerHTML+=`<button class="btn btn-primary" onclick="goPage('diag');setTimeout(()=>App.fileDiag(App._csFile),300)">⚡ ДИАГНОСТИКА</button>`;
      App._csData={data:p.data,sr:p.sampleRate}; App._csFile=file;

      if(p.channels){
        App._switchCh=async(ch)=>{
          const rp=await Converter.parseFile(file,ch);
          App._csData={data:rp.data,sr:rp.sampleRate};
          if(cv) Viz.drawSignal(cv,rp.data.length>2000?rp.data.slice(0,2000):rp.data,'#00e5ff',false);
          document.querySelectorAll('[data-ch]').forEach(b=>b.classList.toggle('active',b.dataset.ch===ch));
        };
      }
      rEl.classList.add('show');
    } catch(err) {
      info.innerHTML=`<span style="color:var(--red);font-family:var(--mono)">✗ ${err.message}</span>`;
      acts.innerHTML=''; rEl.classList.add('show');
    }
  }

  // ═══ BUILD UI ═══
  function buildFaultBtns() {
    const c=el('faultBtns'); if(!c)return;
    c.innerHTML='';
    VM.CLASSES.forEach(cls=>{
      const playbook = getPlaybook(cls);
      const b=document.createElement('button');
      b.className='fault-btn'; b.dataset.cls=cls;
      b.innerHTML=`<span class="fault-btn-top">
        <span class="dot" style="background:${VM.COLORS[cls]}"></span>
        <span class="fault-btn-icon" style="color:${VM.COLORS[cls]}">${VM.ICONS[cls]}</span>
        <span class="fault-btn-state fault-btn-state--${playbook.tone}">${playbook.badge}</span>
      </span>
      <span class="fault-btn-title">${VM.RU[cls]}</span>
      <span class="fault-btn-caption">${playbook.short}</span>`;
      b.onclick=()=>runDemo(cls); c.appendChild(b);
    });
  }

  function buildModel() {
    // Try to use meta.json data, fallback to placeholder
    if(!meta) { buildModelPlaceholder(); return; }
    syncHeroMeta(meta);

    // Confusion matrix
    const cm=meta.confusion_matrix, cls=meta.classes;
    const t=el('cmTable'); if(t) {
      let h='<thead><tr><th style="text-align:left;font-size:8px">ФАКТ↓ ПРЕД→</th>';
      cls.forEach(c=>{h+=`<th style="color:${VM.COLORS[c]||'var(--text)'};min-width:36px">${(VM.RU[c]||c).substring(0,5)}</th>`;});
      h+='</tr></thead><tbody>';
      cls.forEach((tc,i)=>{
        h+=`<tr><td style="text-align:left;color:${VM.COLORS[tc]||'var(--text)'};font-weight:600;padding-right:10px">${VM.RU[tc]||tc}</td>`;
        cls.forEach((pc,j)=>{
          const v=cm[i][j],d=i===j;
          h+=`<td style="background:${d?(VM.COLORS[tc]||'#00e5ff')+'20':v>0?'#fb923c25':'transparent'};color:${d?'#fff':v>0?'#fb923c':'#1a2234'};font-weight:${d?700:400}">${v}</td>`;
        }); h+='</tr>';
      }); h+='</tbody>'; t.innerHTML=h;
    }

    // Class metrics
    const mc=el('clsMetrics'); if(mc&&meta.class_metrics) {
      mc.innerHTML='';
      cls.forEach(c=>{
        const m=meta.class_metrics[c]||{precision:0,recall:0,f1:0};
        mc.innerHTML+=`<div class="cls-row">
          <div><span class="cls-dot" style="background:${VM.COLORS[c]||'#ccc'}"></span><span class="mono" style="font-size:11px;color:${VM.COLORS[c]||'#ccc'}">${VM.RU[c]||c}</span></div>
          <div><div class="cls-val">${(m.precision*100).toFixed(1)}%</div><div class="cls-sublabel">PRECISION</div></div>
          <div><div class="cls-val">${(m.recall*100).toFixed(1)}%</div><div class="cls-sublabel">RECALL</div></div>
          <div><div class="cls-val" style="color:${m.f1>=0.99?'var(--green)':'var(--yellow)'}">${(m.f1*100).toFixed(1)}%</div><div class="cls-sublabel">F1</div></div>
        </div>`;
      });
    }

    // Feature importances
    const fb=el('fiBars'); if(fb&&meta.feature_importances) {
      fb.innerHTML='';
      const fi=meta.feature_importances.slice(0,15), maxV=fi[0].importance;
      const cols=['#00e5ff','#00e5ff','#00e5ff','#34d399','#34d399','#34d399','#fbbf24','#fbbf24','#fbbf24','#fbbf24','#a78bfa','#a78bfa','#4a5568','#4a5568','#4a5568'];
      fi.forEach((f,i)=>{
        fb.innerHTML+=`<div class="fi-bar-row"><div class="fi-name">${f.name}</div>
          <div class="fi-track"><div class="fi-fill" style="width:${f.importance/maxV*100}%;background:${cols[i]||'#4a5568'}"></div></div>
          <div class="fi-val">${(f.importance*100).toFixed(2)}%</div></div>`;
      });
    }

    // Update metrics cards with count-up animation
    const acc=el('metAcc'),f1e=el('metF1'),ncl=el('metClasses'),nfe=el('metFeats'),nsa=el('metSamples'),src=el('metSource');
    function countUp(el, target, suffix, decimals, duration) {
      if(!el) return;
      const start = 0, d = duration || 1200, t0 = performance.now();
      function step(now) {
        const p = Math.min((now - t0) / d, 1);
        const ease = 1 - Math.pow(1 - p, 3); // easeOutCubic
        const v = start + (target - start) * ease;
        el.textContent = v.toFixed(decimals || 0) + (suffix || '');
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }
    // Use IntersectionObserver to trigger when visible
    const metricsRow = document.querySelector('.metrics-row');
    if (metricsRow && !metricsRow.dataset.animated) {
      const obs = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            metricsRow.dataset.animated = '1';
            countUp(acc, meta.accuracy*100, '%', 1);
            countUp(f1e, meta.f1, '', 3);
            countUp(ncl, meta.classes.length, '', 0, 800);
            countUp(nfe, meta.n_features||meta.n_features_selected||meta.feature_names.length, '', 0, 800);
            countUp(nsa, meta.train_size+meta.test_size, '', 0, 1000);
            if(src) src.textContent=VM.sourceLabel(meta);
            obs.unobserve(metricsRow);
          }
        });
      }, { threshold: 0.3 });
      obs.observe(metricsRow);
    } else {
      if(acc) acc.textContent=(meta.accuracy*100).toFixed(1)+'%';
      if(f1e) f1e.textContent=meta.f1.toFixed(3);
      if(ncl) ncl.textContent=meta.classes.length;
      if(nfe) nfe.textContent=meta.n_features||meta.n_features_selected||meta.feature_names.length;
      if(nsa) nsa.textContent=meta.train_size+meta.test_size;
      if(src) src.textContent=VM.sourceLabel(meta);
    }

    // Model params
    const mp=el('modelParams'); if(mp&&meta.model_params) {
      const p=meta.model_params.rf_tuned||meta.model_params;
      const nf=meta.n_features||meta.n_features_selected||'?';
      let html=`<b>Алгоритм:</b> ${meta.best_model||'Random Forest'}<br><b>Деревья:</b> ${p.n_estimators}<br>
        <b>Max depth:</b> ${p.max_depth}<br><b>Признаков:</b> ${nf}<br>`;
      if(meta.cv_mean!=null) html+=`<b>CV Score:</b> <span style="color:var(--green)">${(meta.cv_mean*100).toFixed(1)}% ± ${(meta.cv_std*100).toFixed(1)}</span><br>`;
      html+=`<b>Train/Test:</b> ${meta.train_size}/${meta.test_size}<br>
        <b>Источник:</b> ${VM.sourceLabel(meta)}<br>
        <b>fs:</b> ${meta.config.fs} Hz | <b>GMF:</b> ${meta.config.gmf} Hz`;
      if(meta.pipeline) html+=`<br><b>Pipeline:</b> ${meta.pipeline}`;
      mp.innerHTML=html;
    }
  }

  function buildModelPlaceholder() {
    const t=el('cmTable'); if(t) t.innerHTML='<tr><td style="color:var(--muted);padding:40px">Обучите модель: python train.py → python export_model.py</td></tr>';
    const mc=el('clsMetrics'); if(mc) mc.innerHTML='<div style="color:var(--muted);padding:20px">Метрики появятся после обучения</div>';
    const fb=el('fiBars'); if(fb) fb.innerHTML='<div style="color:var(--muted);padding:20px">Feature importances появятся после обучения</div>';
  }

  function el(id) { return document.getElementById(id); }

  // ═══ INIT ═══
  async function init() {
    document.body.dataset.page = document.body.dataset.page || 'home';
    loadStudyLabState();
    loadJourneyOnboardingState();
    loadJourneyDraftState();
    document.querySelectorAll('.nav-btn').forEach(b => {
      if (b.dataset.page) b.addEventListener('click', () => goPage(b.dataset.page));
    });
    document.querySelectorAll('[data-guide-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        analysisGuideMode = button.dataset.guideMode || 'first_time';
        renderAnalysisCoach();
        scheduleJourneyDraftSave('guide-mode');
      });
    });
    el('journeyOnboardClose')?.addEventListener('click', () => closeJourneyOnboarding());
    el('journeyOnboardSkip')?.addEventListener('click', () => closeJourneyOnboarding());
    el('journeyOnboardClear')?.addEventListener('click', () => clearJourneyDraft({ announce: true }));
    el('journeyOnboard')?.addEventListener('click', (event) => {
      if (event.target === el('journeyOnboard')) closeJourneyOnboarding();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && el('journeyOnboard') && !el('journeyOnboard').hidden) {
        closeJourneyOnboarding();
      }
    });
    document.addEventListener('click', (event) => {
      const labSelectNode = event.target.closest('[data-study-lab-select]');
      if (labSelectNode) {
        setActiveStudyLab(labSelectNode.dataset.studyLabSelect, { scroll: false });
        return;
      }
      const studyActionNode = event.target.closest('[data-study-action]');
      if (studyActionNode) {
        runStudyAction(studyActionNode.dataset.studyAction, studyActionNode.dataset);
        return;
      }
      const hiddenGuessNode = event.target.closest('[data-hidden-guess]');
      if (hiddenGuessNode) {
        selectHiddenCaseAnswer(hiddenGuessNode.dataset.hiddenGuess);
        return;
      }
      const actionNode = event.target.closest('[data-ux-action]');
      if (!actionNode) return;
      runUxAction(actionNode.dataset.uxAction, actionNode.dataset);
    });
    setupCabinetUI();
    setupUpload();
    Viz.heroOscilloscope('heroOsc');

    // Load meta.json
    try {
      const r=await fetch(`model/meta.json?v=${ASSET_VERSION}`, { cache: 'no-store' });
      if(r.ok) {
        meta=await r.json();
        VM.syncMeta(meta);
        console.log('[APP] meta.json loaded:',meta.source,meta.dataset_scope,meta.accuracy);
      }
    } catch(e) { console.log('[APP] No meta.json'); }

    buildFaultBtns();
    renderStudyLabShell();
    renderAnalysisWizard();
    renderJourneyOnboarding();
    buildModel();
    setupScenarioLinks();
    initRevealSystem();
    updateViewportChrome();
    window.addEventListener('scroll', updateViewportChrome, { passive: true });
    window.addEventListener('resize', updateViewportChrome);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') saveJourneyDraftSnapshot('visibility');
    });
    window.addEventListener('beforeunload', () => {
      saveJourneyDraftSnapshot('beforeunload');
    });
    if (typeof DemoCases !== 'undefined') {
      await DemoCases.load(`model/demo_cases.json?v=${ASSET_VERSION}`);
    }

    // Load RF model
    if (typeof UIStates !== 'undefined') UIStates.setModelLoading(true);
    const ok=await Model.load(`model/rf_model.json?v=${ASSET_VERSION}`);
    if (typeof UIStates !== 'undefined') {
      UIStates.setModelLoading(false);
      if (ok) UIStates.hideModelError(); else UIStates.showModelError();
    }
    console.log(ok?'[APP] RF Model ready':'[APP] RF Model not found \u2014 demo mode');

    try {
      await apiRequest('/health');
      apiReady = true;
      if (typeof UIStates !== 'undefined') UIStates.hideBackendOffline();
      await loadAuthState();
      if (authState?.id) {
        await loadHistory();
      } else {
        renderAuthSummary();
        syncWorkspaceSelection();
        renderWorkspace();
      }
    } catch (e) {
      apiReady = false;
      authState = normalizeAuth(null);
      sessionHistory = [];
      assetRegistry = [];
      measurementRegistry = [];
      reportRegistry = [];
      dashboardSummary = null;
      renderAuthSummary();
      syncWorkspaceSelection();
      renderWorkspace();
      if (typeof UIStates !== 'undefined') UIStates.showBackendOffline();
      console.warn('[APP] Backend API not available:', e.message || e);
    }
    updateHeaderProfile();
    renderCaptureSummary();
    applyInitialRoute();
    if (shouldAutoRestoreJourneyDraft(journeyDraftState)) {
      await restoreJourneyDraft({ announce: false });
    } else if (shouldShowJourneyOnboarding()) {
      window.setTimeout(() => openJourneyOnboarding({ focus: false }), 180);
    }

    // Load ONNX models if available
    if (typeof ModelONNX !== 'undefined' && ModelONNX.loadAll) {
      try {
        const onnxOk = await ModelONNX.loadAll();
        console.log(onnxOk ? '[APP] ONNX models loaded' : '[APP] ONNX models not available');
      } catch (e) { console.log('[APP] ONNX load skipped:', e.message || e); }
    }

    // Initialize sensor UI
    initSensorUI();

    // Log available models
    const availModels = ['RF'];
    if (typeof ModelONNX !== 'undefined') availModels.push('ONNX');
    if (typeof Model !== 'undefined' && Model.checkOOD) availModels.push('OOD');
    if (typeof Model !== 'undefined' && Model.explainPrediction) availModels.push('SHAP');
    if (typeof Model !== 'undefined' && Model.estimateRUL) availModels.push('RUL');
    if (typeof Model !== 'undefined' && Model.detectAnomaly) availModels.push('Anomaly');
    if (typeof Sensor !== 'undefined') availModels.push('Sensor');
    console.log('[APP] Available modules:', availModels.join(', '));

    window.goPage=goPage;
    window.goHomeSection=goHomeSection;
    window.goPageSection=goPageSection;
  }

  return {
    init,
    goPage,
    goHomeSection,
    goPageSection,
    openJournal,
    openAssetPage,
    openSimulatorFromAnalysis,
    openLabScenario,
    openJourneyOnboarding,
    restoreJourneyDraft,
    clearJourneyDraft,
    uploadCurrentMeasurement,
    saveCurrentSession,
    fileDiag: runFileDiag,
    runScenario,
    connectSensor: connectSensorUI,
    recordSensor: startSensorRecording,
    showAdvancedDiagnosis
  };
})();

document.addEventListener('DOMContentLoaded', App.init);
