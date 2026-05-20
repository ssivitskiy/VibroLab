/**
 * VibroLab — UI states helper.
 * Управляет skeleton-плейсхолдерами, error-картами и status-баннерами.
 * Подключается до app.js, чтобы app.js мог вызывать UIStates.* напрямую.
 */

(function (global) {
  function show(el) { if (el) el.classList.add('show'); }
  function hide(el) { if (el) el.classList.remove('show'); }
  function byId(id) { return document.getElementById(id); }

  function setModelLoading(state) {
    const overlay = byId('modelLoadingOverlay');
    if (!overlay) return;
    if (state) {
      overlay.classList.add('show');
      overlay.setAttribute('aria-busy', 'true');
    } else {
      overlay.classList.remove('show');
      overlay.removeAttribute('aria-busy');
    }
  }

  function showModelError() {
    const card = byId('modelErrorCard');
    show(card);
    setModelLoading(false);
  }

  function hideModelError() {
    hide(byId('modelErrorCard'));
  }

  function showAnalysisLoading() {
    show(byId('diagSkeleton'));
    hide(byId('diagErrorCard'));
    const result = byId('diagResult');
    if (result) result.classList.remove('show');
  }

  function hideAnalysisLoading() {
    hide(byId('diagSkeleton'));
  }

  function showAnalysisError(title, message) {
    hideAnalysisLoading();
    const card = byId('diagErrorCard');
    const t = byId('diagErrorTitle');
    const m = byId('diagErrorText');
    if (t && title) t.textContent = title;
    if (m && message) m.textContent = message;
    show(card);
  }

  function hideAnalysisError() {
    hide(byId('diagErrorCard'));
  }

  function showBackendOffline() {
    show(byId('backendOfflineBanner'));
  }

  function hideBackendOffline() {
    hide(byId('backendOfflineBanner'));
  }

  // ── PROFILE TABS ───────────────────────────────────────────
  const PROFILE_SECTION_TO_TAB = {
    authPanel: 'account',
    profileHealthPanel: 'overview',
    profileOnboard: 'overview',
    profileAlertsOnlyPanel: 'alerts',
    profileAlertLogPanel: 'alerts',
    journalPanel: 'journal',
    analysisComparePanel: 'compare',
    monitoringPanel: 'monitoring',
  };
  const PROFILE_TAB_STORAGE_KEY = 'vibrolab-profile-tab';
  const PROFILE_DEFAULT_TAB = 'overview';

  function showProfileTab(name) {
    if (!name) name = PROFILE_DEFAULT_TAB;
    document.querySelectorAll('[data-tab-group]').forEach(elm => {
      const groups = (elm.dataset.tabGroup || '').split(/\s+/);
      elm.hidden = !groups.includes(name);
    });
    document.querySelectorAll('.profile-tab').forEach(btn => {
      const active = btn.dataset.profileTab === name;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
      btn.setAttribute('tabindex', active ? '0' : '-1');
    });
    try { localStorage.setItem(PROFILE_TAB_STORAGE_KEY, name); } catch (e) {}
  }

  function showProfileTabForSection(sectionId) {
    const tab = PROFILE_SECTION_TO_TAB[sectionId];
    if (tab) showProfileTab(tab);
  }

  function initProfileTabs() {
    const tabsContainer = document.querySelector('.profile-tabs');
    if (!tabsContainer) return;
    tabsContainer.addEventListener('click', e => {
      const btn = e.target.closest('.profile-tab');
      if (btn && btn.dataset.profileTab) showProfileTab(btn.dataset.profileTab);
    });
    tabsContainer.addEventListener('keydown', e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const tabs = Array.from(tabsContainer.querySelectorAll('.profile-tab'));
      const current = tabs.findIndex(t => t.classList.contains('is-active'));
      if (current < 0) return;
      const next = e.key === 'ArrowRight'
        ? (current + 1) % tabs.length
        : (current - 1 + tabs.length) % tabs.length;
      showProfileTab(tabs[next].dataset.profileTab);
      tabs[next].focus();
      e.preventDefault();
    });
    let saved = PROFILE_DEFAULT_TAB;
    try { saved = localStorage.getItem(PROFILE_TAB_STORAGE_KEY) || PROFILE_DEFAULT_TAB; } catch (e) {}
    if (!PROFILE_SECTION_TO_TAB.hasOwnProperty('_')) {
      // sanity: ensure restored tab actually exists in current DOM
      const known = ['overview', 'alerts', 'journal', 'compare', 'monitoring', 'account'];
      if (!known.includes(saved)) saved = PROFILE_DEFAULT_TAB;
    }
    showProfileTab(saved);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProfileTabs);
  } else {
    initProfileTabs();
  }

  // ── ANIMATED COUNTERS (D) ──────────────────────────────────
  // Once an element with [data-counter] enters the viewport, count up from 0.
  function animateCounter(el, duration = 1400) {
    if (el.dataset.counterAnimated === '1') return;
    const original = (el.textContent || '').trim();
    const match = original.match(/^(-?\d+(?:\.\d+)?)(.*)$/);
    if (!match) return;
    const target = parseFloat(match[1]);
    const isInt = !match[1].includes('.');
    const suffix = match[2] || '';
    if (!isFinite(target)) return;
    el.dataset.counterAnimated = '1';
    const start = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      const val = target * eased;
      el.textContent = (isInt ? Math.round(val) : val.toFixed(1)) + suffix;
      if (t < 1) requestAnimationFrame(tick);
      else el.textContent = original;
    }
    requestAnimationFrame(tick);
  }

  function initCounterObserver() {
    const targets = document.querySelectorAll('[data-counter]');
    if (!targets.length) return;
    if (typeof IntersectionObserver === 'undefined') {
      targets.forEach(t => animateCounter(t));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.35, rootMargin: '0px 0px -40px 0px' });
    targets.forEach(t => io.observe(t));
  }

  // ── CONFETTI BURST (G) ─────────────────────────────────────
  let confettiShown = false;
  function confettiBurst(opts = {}) {
    if (confettiShown && !opts.force) return;
    confettiShown = true;
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9998';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const colors = ['#00e5ff', '#34d399', '#fbbf24', '#a78bfa', '#f472b6', '#60a5fa'];
    const cx = opts.x ?? canvas.width / 2;
    const cy = opts.y ?? canvas.height / 3;
    const N = 36;
    const parts = [];
    for (let i = 0; i < N; i++) {
      const angle = (Math.PI / N) * i + (Math.random() - 0.5) * 0.6;
      const speed = 6 + Math.random() * 5;
      parts.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed * (Math.random() < 0.5 ? -1 : 1),
        vy: Math.sin(angle) * speed - 4 - Math.random() * 3,
        size: 4 + Math.random() * 4,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        color: colors[(Math.random() * colors.length) | 0],
        life: 1,
      });
    }
    const start = performance.now();
    function frame(now) {
      const t = (now - start) / 1800;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = 0;
      for (const p of parts) {
        p.vy += 0.22;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        p.life = Math.max(0, 1 - t);
        if (p.life > 0 && p.y < canvas.height + 40) {
          alive++;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.globalAlpha = p.life;
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
          ctx.restore();
        }
      }
      if (alive > 0 && t < 1.6) requestAnimationFrame(frame);
      else canvas.remove();
    }
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCounterObserver);
  } else {
    initCounterObserver();
  }

  global.UIStates = {
    setModelLoading,
    showModelError,
    hideModelError,
    showAnalysisLoading,
    hideAnalysisLoading,
    showAnalysisError,
    hideAnalysisError,
    showBackendOffline,
    hideBackendOffline,
    showProfileTab,
    showProfileTabForSection,
    animateCounter,
    confettiBurst,
  };
})(window);
