/**
 * VibroLab — режим презентации (C).
 * Запускает скриптованный показ платформы: счётчики → пайплайн → анализ нормы
 * → анализ дефекта → диагноз. Снизу плавающие субтитры, сверху — точки шагов.
 * Esc — выход.
 */

(function () {
  let active = false;
  let cancelTimers = [];
  let escHandler = null;

  const STEPS = [
    {
      title: 'VibroLab',
      subtitle: 'Учебная платформа вибродиагностики — для студентов и преподавателей ИТМО',
      duration: 4800,
      action: () => { goPage('home'); scrollTo({ top: 0, behavior: 'smooth' }); resetCounters(); },
    },
    {
      title: '53 признака → Random Forest → инференс в браузере',
      subtitle: '98.4% точности на полном наборе SEU. Никакого сервера — всё считается у пользователя.',
      duration: 5200,
      action: () => { scrollToSelector('#section-method', 80); },
    },
    {
      title: 'Сначала — эталонный сигнал',
      subtitle: 'Спокойный спектр, чистые гармоники зубчатой частоты, без ударов.',
      duration: 5600,
      action: () => { goPage('diag'); setTimeout(() => clickDemoCase('normal'), 350); },
    },
    {
      title: 'А теперь — тот же узел, но с дефектом зуба',
      subtitle: 'Сигнал ломается в реальном времени, спектр меняет структуру вокруг GMF.',
      duration: 5800,
      action: () => { clickDemoCase('tooth_miss'); },
    },
    {
      title: 'Диагноз за ~2 мс прямо в браузере',
      subtitle: 'Класс, вероятности, объяснение — без серверного ML. Удобно для лекции, для лабы, для отчёта.',
      duration: 5400,
      action: () => { scrollToSelector('#diagResult', 100); },
    },
    {
      title: 'Готово',
      subtitle: 'Нажмите ▷ снова, чтобы повторить · Esc — выход',
      duration: 4000,
      action: () => {},
      isFinal: true,
    },
  ];

  function resetCounters() {
    document.querySelectorAll('[data-counter]').forEach(el => {
      el.removeAttribute('data-counter-animated');
    });
    if (window.UIStates && UIStates.animateCounter) {
      document.querySelectorAll('[data-counter]').forEach(el => {
        UIStates.animateCounter(el, 1600);
      });
    }
  }

  function scrollToSelector(sel, offset = 0) {
    const node = document.querySelector(sel);
    if (!node) return;
    const top = node.getBoundingClientRect().top + window.pageYOffset - offset;
    window.scrollTo({ top, behavior: 'smooth' });
  }

  function clickDemoCase(cls) {
    const card = document.querySelector(`[data-demo-class="${cls}"]`);
    if (card) card.click();
    else if (window.App && App.runScenario) App.runScenario(cls);
  }

  function buildOverlay() {
    if (document.getElementById('presentationOverlay')) return;
    const el = document.createElement('div');
    el.id = 'presentationOverlay';
    el.className = 'presentation-overlay';
    el.innerHTML = `
      <div class="presentation-progress" id="presentationProgress"></div>
      <div class="presentation-cardstack">
        <div class="presentation-title" id="presentationTitle"></div>
        <div class="presentation-subtitle" id="presentationSubtitle"></div>
      </div>
      <button class="presentation-exit" type="button" id="presentationExit">Esc · ВЫЙТИ</button>
    `;
    document.body.appendChild(el);
    document.getElementById('presentationExit').addEventListener('click', stop);
  }

  function renderProgress(currentIdx) {
    const wrap = document.getElementById('presentationProgress');
    if (!wrap) return;
    wrap.innerHTML = STEPS.map((_, i) =>
      `<span class="presentation-dot${i <= currentIdx ? ' is-done' : ''}${i === currentIdx ? ' is-current' : ''}"></span>`
    ).join('');
  }

  function showStep(idx) {
    const step = STEPS[idx];
    if (!step) return;
    const titleEl = document.getElementById('presentationTitle');
    const subEl = document.getElementById('presentationSubtitle');
    if (titleEl && subEl) {
      const stack = document.querySelector('.presentation-cardstack');
      stack.classList.remove('is-in');
      // re-flow for retrigger
      void stack.offsetWidth;
      titleEl.textContent = step.title;
      subEl.textContent = step.subtitle;
      stack.classList.add('is-in');
    }
    renderProgress(idx);
    if (step.action) {
      try { step.action(); } catch (e) { console.warn('[Presentation] step action failed', e); }
    }
  }

  function start() {
    if (active) { stop(); return; }
    active = true;
    document.documentElement.classList.add('presentation-mode');
    buildOverlay();
    escHandler = (e) => { if (e.key === 'Escape') stop(); };
    document.addEventListener('keydown', escHandler);
    document.getElementById('presentationOverlay').classList.add('show');

    let idx = 0;
    showStep(idx);
    function next() {
      if (!active) return;
      const cur = STEPS[idx];
      if (!cur) { stop(); return; }
      const t = setTimeout(() => {
        idx += 1;
        if (idx >= STEPS.length) { stop(); return; }
        showStep(idx);
        next();
      }, cur.duration);
      cancelTimers.push(t);
    }
    next();
  }

  function stop() {
    active = false;
    cancelTimers.forEach(t => clearTimeout(t));
    cancelTimers = [];
    if (escHandler) { document.removeEventListener('keydown', escHandler); escHandler = null; }
    const ov = document.getElementById('presentationOverlay');
    if (ov) ov.classList.remove('show');
    document.documentElement.classList.remove('presentation-mode');
  }

  function init() {
    const btn = document.getElementById('presentationToggle');
    if (btn) btn.addEventListener('click', start);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.Presentation = { start, stop };
})();
