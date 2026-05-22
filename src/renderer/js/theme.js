// theme.js - Theme management
(function() {
  'use strict';

  const THEMES = [
    // Temas claros
    { id: 'light',     label: 'Claro',     dark: false, color: '#e5e7eb', sidebar: '#1f2937', bg: '#f9fafb', accent: '#3b82f6' },
    { id: 'forest',    label: 'Bosque',    dark: false, color: '#14532d', sidebar: '#14532d', bg: '#f0fdf4', accent: '#16a34a' },
    { id: 'purple',    label: 'Violeta',   dark: false, color: '#4c1d95', sidebar: '#4c1d95', bg: '#faf5ff', accent: '#7c3aed' },
    { id: 'sunset',    label: 'Sunset',    dark: false, color: '#9a3412', sidebar: '#9a3412', bg: '#fff7ed', accent: '#ea580c' },
    { id: 'floral',    label: 'Flores',    dark: false, color: '#ec4899', sidebar: '#500724', bg: '#fff0f6', accent: '#ec4899' },
    { id: 'ondas',     label: 'Ondas',     dark: false, color: '#facc15', sidebar: '#4a2c0a', bg: '#fefce8', accent: '#facc15' },
    { id: 'marroqui',  label: 'Marroquí',  dark: false, color: '#c2440a', sidebar: '#6b3011', bg: '#fef3e8', accent: '#c2440a' },
    { id: 'diamantes', label: 'Diamantes', dark: false, color: '#4f46e5', sidebar: '#1e1b4b', bg: '#f0f4ff', accent: '#4f46e5' },
    { id: 'zigzag',    label: 'Zigzag',    dark: false, color: '#0d9488', sidebar: '#134e4a', bg: '#f0fdfa', accent: '#0d9488' },
    // Temas oscuros
    { id: 'dark',      label: 'Oscuro',    dark: true,  color: '#1f2937', sidebar: '#0f172a', bg: '#111827', accent: '#60a5fa' },
    { id: 'ocean',     label: 'Océano',    dark: true,  color: '#0c4a6e', sidebar: '#071120', bg: '#0c1a33', accent: '#38bdf8' },
    { id: 'matrix',    label: 'Matrix',    dark: true,  color: '#006622', sidebar: '#000802', bg: '#000d03', accent: '#00e639' },
    { id: 'blueprint', label: 'Cyberpunk', dark: true,  color: '#d946ef', sidebar: '#06000c', bg: '#0a0010', accent: '#d946ef' },
    { id: 'aurora',    label: 'Aurora',    dark: true,  color: '#5b21b6', sidebar: '#040412', bg: '#07071a', accent: '#a78bfa' },
    { id: 'halloween', label: 'Halloween',  dark: true,  color: '#ea580c', sidebar: '#1a0a00', bg: '#0d0500', accent: '#f97316' },
    { id: 'lunar',     label: 'Lunar',      dark: true,  color: '#1c1c1e', sidebar: '#0a0a0a', bg: '#111113', accent: '#ffffff' },
    { id: 'miami',     label: 'Miami Wave', dark: true,  color: '#ff2d78', sidebar: '#040012', bg: '#06001a', accent: '#ff2d78' },
    { id: 'carmesi',   label: 'Carmesí',    dark: true,  color: '#e11d48', sidebar: '#0a0003', bg: '#0d0005', accent: '#fb7185' },
  ];

  function applyTheme(themeId) {
    document.documentElement.setAttribute('data-theme', themeId);
    localStorage.setItem('app-theme', themeId);

    // Update active swatch state
    document.querySelectorAll('.theme-swatch').forEach(function(swatch) {
      swatch.classList.toggle('active', swatch.dataset.theme === themeId);
    });
  }

  function getCurrentTheme() {
    return localStorage.getItem('app-theme') || 'light';
  }

  function initTheme() {
    applyTheme(getCurrentTheme());
  }

  // Expose globally
  window.THEMES = THEMES;
  window.applyTheme = applyTheme;
  window.getCurrentTheme = getCurrentTheme;
  window.initTheme = initTheme;

  // Apply immediately to prevent flash of unstyled content
  initTheme();
})();
