// themes.js - Theme selection page logic
(function() {
  'use strict';

  function buildThemeCard(theme) {
    const isActive = window.getCurrentTheme() === theme.id;
    const miniCardBg  = theme.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)';
    const headerBg    = theme.dark ? 'rgba(255,255,255,0.04)' : '#ffffff';

    return `
      <div class="theme-card${isActive ? ' active' : ''}" data-theme="${theme.id}" role="button" tabindex="0" aria-label="Tema ${theme.label}">
        <div class="theme-preview">
          <div class="tp-sidebar" style="background-color: ${theme.sidebar}">
            <div class="tp-logo"></div>
            <div class="tp-nav-item" style="background-color: ${theme.accent}; opacity: 0.85;"></div>
            <div class="tp-nav-item" style="background: rgba(255,255,255,0.12);"></div>
            <div class="tp-nav-item" style="background: rgba(255,255,255,0.12);"></div>
            <div class="tp-nav-item" style="background: rgba(255,255,255,0.12);"></div>
          </div>
          <div class="tp-content" style="background-color: ${theme.bg}">
            <div class="tp-header" style="background-color: ${headerBg}; border-bottom: 1px solid ${theme.accent}30;"></div>
            <div class="tp-body">
              <div class="tp-row">
                <div class="tp-mini-card" style="background: ${miniCardBg}; border: 1px solid ${theme.accent}20;"></div>
                <div class="tp-mini-card" style="background: ${miniCardBg}; border: 1px solid ${theme.accent}20;"></div>
                <div class="tp-mini-card" style="background: ${miniCardBg}; border: 1px solid ${theme.accent}20;"></div>
              </div>
              <div class="tp-btn-row">
                <div class="tp-btn" style="background-color: ${theme.accent};"></div>
              </div>
            </div>
          </div>
        </div>
        <div class="theme-card-info">
          <span class="theme-card-name">${theme.label}</span>
          <span class="theme-card-check" aria-hidden="true">✓</span>
        </div>
      </div>
    `;
  }

  function renderThemes() {
    var themes    = window.THEMES || [];
    var lightGrid = document.getElementById('lightThemesGrid');
    var darkGrid  = document.getElementById('darkThemesGrid');
    if (!lightGrid || !darkGrid) return;

    lightGrid.innerHTML = themes.filter(function(t) { return !t.dark; }).map(buildThemeCard).join('');
    darkGrid.innerHTML  = themes.filter(function(t) { return  t.dark; }).map(buildThemeCard).join('');

    document.querySelectorAll('.theme-card').forEach(function(card) {
      card.addEventListener('click', function() { activate(card.dataset.theme); });
      card.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(card.dataset.theme); }
      });
    });
  }

  function activate(themeId) {
    window.applyTheme(themeId);
    document.querySelectorAll('.theme-card').forEach(function(c) {
      c.classList.toggle('active', c.dataset.theme === themeId);
    });
  }

  document.addEventListener('DOMContentLoaded', renderThemes);
})();
