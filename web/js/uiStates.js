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
  };
})(window);
