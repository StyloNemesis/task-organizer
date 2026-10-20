// imputations.js - Gestión de Imputaciones, Calendario, Códigos, Festivos y Bolsa de Vacaciones
(function () {
  'use strict';

  // ===================== ESTADO GLOBAL =====================
  let allProjects = [];
  let allImputationCodes = [];
  let currentMonthImputations = [];
  let currentCodeAllocations = [];
  let currentHolidays = []; // Array de { date: 'YYYY-MM-DD', name: '...' }
  let currentAnnualLeaveBalance = null;

  const now = new Date();
  let currentYear = now.getFullYear();
  let currentMonth = now.getMonth(); // 0-indexed (0 = Enero ... 11 = Diciembre)

  let activeProjectFilterIds = null; // null significa "mostrar todos", o Set de IDs numéricos
  let treeSearchTerm = '';
  const treeExpandedProjects = new Set();

  let editingDayDate = null;
  let editingDayEntries = [];

  let contextMenuTargetDate = null;

  const MONTHS_ES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const DAYS_OF_WEEK_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  // ===================== INICIALIZACIÓN =====================
  document.addEventListener('DOMContentLoaded', async function () {
    loadSavedFilterPreferences();
    setupEventListeners();
    await loadInitialData();
  });

  function loadSavedFilterPreferences() {
    try {
      const stored = localStorage.getItem('imputations_filter_projects');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          activeProjectFilterIds = new Set(parsed.map(Number));
        }
      }
    } catch (e) {
      activeProjectFilterIds = null;
    }
  }

  function saveFilterPreferences() {
    if (activeProjectFilterIds === null) {
      localStorage.removeItem('imputations_filter_projects');
    } else {
      localStorage.setItem('imputations_filter_projects', JSON.stringify(Array.from(activeProjectFilterIds)));
    }
  }

  async function loadInitialData() {
    try {
      showLoading(true);
      await Promise.all([
        loadProjects(),
        loadImputationCodes()
      ]);
      await loadMonthData();
      renderAll();
    } catch (err) {
      console.error('Error al inicializar imputaciones:', err);
      showAlert('Error al cargar datos de imputaciones: ' + err.message, 'danger');
    } finally {
      showLoading(false);
    }
  }

  async function loadProjects() {
    if (window.api && window.api.getProjects) {
      allProjects = await window.api.getProjects();
    } else {
      allProjects = [];
    }
  }

  async function loadImputationCodes() {
    if (window.api && window.api.getImputationCodes) {
      allImputationCodes = await window.api.getImputationCodes();
    } else {
      allImputationCodes = [];
    }
  }

  async function loadMonthData() {
    const padMonth = String(currentMonth + 1).padStart(2, '0');
    const period = `${currentYear}-${padMonth}`;

    const promises = [];

    if (window.api && window.api.getMonthImputations) {
      promises.push(window.api.getMonthImputations(currentYear, currentMonth + 1).then(data => {
        currentMonthImputations = data || [];
      }));
    } else {
      currentMonthImputations = [];
    }

    if (window.api && window.api.getCodeAllocations) {
      promises.push(window.api.getCodeAllocations(period).then(data => {
        currentCodeAllocations = data || [];
      }));
    } else {
      currentCodeAllocations = [];
    }

    if (window.api && window.api.getHolidays) {
      promises.push(window.api.getHolidays(currentYear).then(data => {
        currentHolidays = data || [];
      }));
    } else {
      currentHolidays = [];
    }

    if (window.api && window.api.getAnnualLeaveBalance) {
      promises.push(window.api.getAnnualLeaveBalance(currentYear).then(data => {
        currentAnnualLeaveBalance = data || null;
      }));
    } else {
      currentAnnualLeaveBalance = null;
    }

    await Promise.all(promises);
  }

  // ===================== EVENT LISTENERS =====================
  function setupEventListeners() {
    // Navegación de mes
    document.getElementById('prevMonthBtn').addEventListener('click', () => {
      currentMonth--;
      if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
      }
      onMonthChanged();
    });

    document.getElementById('nextMonthBtn').addEventListener('click', () => {
      currentMonth++;
      if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
      }
      onMonthChanged();
    });

    document.getElementById('todayBtn').addEventListener('click', () => {
      const today = new Date();
      currentYear = today.getFullYear();
      currentMonth = today.getMonth();
      onMonthChanged();
    });

    document.getElementById('imputeTodayBtn').addEventListener('click', () => {
      const today = new Date();
      openDayModal(toISODateLocal(today));
    });

    // Búsqueda en el árbol
    const searchInput = document.getElementById('treeSearchInput');
    searchInput.addEventListener('input', (e) => {
      treeSearchTerm = e.target.value.trim().toLowerCase();
      renderProjectsTree();
    });

    // Botones de filtro de proyectos
    document.getElementById('openFilterProjectsBtn').addEventListener('click', openProjectFilterModal);
    document.getElementById('resetProjectFilterBtn').addEventListener('click', resetProjectFilter);

    // Botón nuevo código global
    document.getElementById('newGlobalCodeBtn').addEventListener('click', () => {
      openCodeModal(null);
    });

    // Expandir todos los repartos
    const expandAllBtn = document.getElementById('expandAllAllocationsBtn');
    if (expandAllBtn) {
      expandAllBtn.addEventListener('click', () => {
        const cards = document.querySelectorAll('.allocation-project-card');
        const anyCollapsed = Array.from(cards).some(c => !c.classList.contains('expanded'));
        cards.forEach(c => {
          if (anyCollapsed) c.classList.add('expanded');
          else c.classList.remove('expanded');
        });
        expandAllBtn.textContent = anyCollapsed ? 'Colapsar todos' : 'Expandir todos';
      });
    }

    // Botón autoajustar todo en el calendario
    const autoAdjustAllBtn = document.getElementById('autoAdjustAllBtn');
    if (autoAdjustAllBtn) {
      autoAdjustAllBtn.addEventListener('click', () => {
        window.autoAdjustAllToCalendar();
      });
    }

    // Modal de código de imputación
    document.getElementById('closeCodeModalBtn').addEventListener('click', closeCodeModal);
    document.getElementById('cancelCodeModalBtn').addEventListener('click', closeCodeModal);
    document.getElementById('imputationCodeForm').addEventListener('submit', handleSaveCode);

    // Modal de filtro de proyectos
    document.getElementById('closeProjectFilterModalBtn').addEventListener('click', closeProjectFilterModal);
    const cancelFilterBtn = document.getElementById('cancelProjectFilterModalBtn');
    if (cancelFilterBtn) cancelFilterBtn.addEventListener('click', closeProjectFilterModal);
    document.getElementById('saveProjectFilterBtn').addEventListener('click', handleSaveProjectFilter);
    document.getElementById('selectAllFilterProjectsBtn').addEventListener('click', () => setAllChecklist(true));
    document.getElementById('deselectAllFilterProjectsBtn').addEventListener('click', () => setAllChecklist(false));
    document.getElementById('resetToAllFilterProjectsBtn').addEventListener('click', () => {
      activeProjectFilterIds = null;
      saveFilterPreferences();
      closeProjectFilterModal();
      renderAll();
    });

    // Filtro buscador dentro del modal
    document.getElementById('filterModalSearchInput').addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      document.querySelectorAll('.filter-project-checkbox-item').forEach(el => {
        const text = el.getAttribute('data-name') || '';
        el.style.display = text.toLowerCase().includes(q) ? '' : 'none';
      });
    });

    // Modal de día
    document.getElementById('closeDayModalBtn').addEventListener('click', closeDayModal);
    document.getElementById('cancelDayModalBtn').addEventListener('click', closeDayModal);
    document.getElementById('saveDayModalBtn').addEventListener('click', handleSaveDayImputations);
    document.getElementById('deleteDayImputationsBtn').addEventListener('click', handleDeleteDayImputations);
    document.getElementById('addProjectRowBtn').addEventListener('click', () => addDayEntryRow());
    document.getElementById('addVacationRowBtn').addEventListener('click', handleAddVacationRow);
    document.getElementById('addPersonalHoursRowBtn').addEventListener('click', handleAddPersonalHoursRow);
    document.getElementById('addOvertimeRowBtn').addEventListener('click', () => addDayEntryRow(null, null, 1, true));
    document.getElementById('fillFullDayBtn').addEventListener('click', handleFillFullDay);

    // Modal de cupos anuales de vacaciones
    document.getElementById('openLeaveQuotaModalBtn').addEventListener('click', openLeaveQuotaModal);
    document.getElementById('closeLeaveQuotaModalBtn').addEventListener('click', closeLeaveQuotaModal);
    document.getElementById('cancelLeaveQuotaModalBtn').addEventListener('click', closeLeaveQuotaModal);
    document.getElementById('leaveQuotaForm').addEventListener('submit', handleSaveLeaveQuota);

    // Modal de festivos
    document.getElementById('closeHolidayModalBtn').addEventListener('click', closeHolidayModal);
    document.getElementById('cancelHolidayModalBtn').addEventListener('click', closeHolidayModal);
    document.getElementById('holidayForm').addEventListener('submit', handleSaveHoliday);
    document.getElementById('deleteHolidayBtn').addEventListener('click', handleDeleteHoliday);

    // Menú contextual flotante (Click derecho)
    document.getElementById('contextMenuToggleHoliday').addEventListener('click', handleContextMenuToggleHoliday);
    document.getElementById('contextMenuVacation').addEventListener('click', handleContextMenuVacation);
    document.getElementById('contextMenuPersonalHours').addEventListener('click', handleContextMenuPersonalHours);
    document.getElementById('contextMenuFullDay').addEventListener('click', handleContextMenuFullDay);
    document.getElementById('contextMenuOpenModal').addEventListener('click', () => {
      hideContextMenu();
      if (contextMenuTargetDate) openDayModal(contextMenuTargetDate);
    });

    // Menú contextual de código (Click derecho en código)
    document.getElementById('contextMenuFillRemainingMonth').addEventListener('click', () => {
      handleContextMenuFillRemainingMonth(1);
    });
    document.getElementById('contextMenuFillFromToday').addEventListener('click', () => {
      handleContextMenuFillRemainingMonth(new Date().getDate());
    });
    document.getElementById('contextMenuEditCode').addEventListener('click', handleContextMenuEditCode);
    document.getElementById('contextMenuDeleteCode').addEventListener('click', handleContextMenuDeleteCode);

    // Ocultar menús contextuales con click fuera
    document.addEventListener('click', (e) => {
      const menu = document.getElementById('dayContextMenu');
      if (menu && !menu.contains(e.target)) {
        hideContextMenu();
      }
      const codeMenu = document.getElementById('codeContextMenu');
      if (codeMenu && !codeMenu.contains(e.target)) {
        hideCodeContextMenu();
      }
    });

    // Modal de prompt personalizado (reemplazo de window.prompt)
    const closeCustomPromptBtn = document.getElementById('closeCustomPromptBtn');
    if (closeCustomPromptBtn) closeCustomPromptBtn.addEventListener('click', () => closeCustomPrompt(null));
    const cancelCustomPromptBtn = document.getElementById('cancelCustomPromptBtn');
    if (cancelCustomPromptBtn) cancelCustomPromptBtn.addEventListener('click', () => closeCustomPrompt(null));
    const customPromptForm = document.getElementById('customPromptForm');
    if (customPromptForm) {
      customPromptForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('customPromptInput');
        const val = input ? input.value : null;
        closeCustomPrompt(val);
      });
    }

    // Cierre de modales y menús con Escape
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        hideContextMenu();
        hideCodeContextMenu();
        closeDayModal();
        closeCodeModal();
        closeProjectFilterModal();
        closeLeaveQuotaModal();
        closeHolidayModal();
        closeCustomPrompt(null);
      }
    });

    // Iconos en headers
    const filterIconEl = document.getElementById('filterIcon');
    if (filterIconEl && ICONS.filter) filterIconEl.innerHTML = ICONS.filter;

    const treeHeaderIconEl = document.getElementById('treeHeaderIcon');
    if (treeHeaderIconEl && ICONS.folder) treeHeaderIconEl.innerHTML = ICONS.folder;

    // Drag & Drop sobre la lista del modal de día (si está abierto)
    const dayList = document.getElementById('dayImputationsList');
    if (dayList) {
      dayList.addEventListener('dragover', (e) => {
        if (!draggedCodeData && !e.dataTransfer.types.includes('application/json')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        dayList.classList.add('list-drag-over');
      });
      dayList.addEventListener('dragleave', (e) => {
        if (!dayList.contains(e.relatedTarget)) {
          dayList.classList.remove('list-drag-over');
        }
      });
      dayList.addEventListener('drop', (e) => {
        e.preventDefault();
        dayList.classList.remove('list-drag-over');
        let dropData = draggedCodeData;
        if (!dropData) {
          try {
            dropData = JSON.parse(e.dataTransfer.getData('application/json'));
          } catch (err) {}
        }
        if (!dropData) return;
        addDayEntryRow(dropData.projectId, dropData.codeId, null, false);
        showAlert(`Añadida fila para "${dropData.codeName || 'código'}" en el día.`, 'info');
      });
    }
  }

  async function onMonthChanged() {
    showLoading(true);
    await loadMonthData();
    renderAll();
    showLoading(false);
  }

  function renderAll() {
    renderMonthTitle();
    renderFilterBadge();
    renderAnnualLeaveCard();
    renderScheduleRulesBar();
    renderProjectsTree();
    renderCalendar();
    renderAllocationsSection();
    renderMonthlySummaryAndCharts();
  }

  function renderMonthTitle() {
    const label = `${MONTHS_ES[currentMonth]} ${currentYear}`;
    document.getElementById('currentMonthLabel').textContent = label;
    const sub = document.getElementById('monthlySummarySubtitle');
    if (sub) sub.textContent = `Métricas y distribución visual correspondientes a ${label}.`;
  }

  function renderFilterBadge() {
    const badge = document.getElementById('activeFilterBadge');
    const banner = document.getElementById('filterStatusBanner');
    const bannerText = document.getElementById('filterStatusText');

    if (activeProjectFilterIds !== null) {
      const count = activeProjectFilterIds.size;
      badge.textContent = count;
      badge.style.display = 'inline-flex';
      banner.style.display = 'flex';
      bannerText.textContent = `Mostrando ${count} de ${allProjects.length} proyectos`;
    } else {
      badge.style.display = 'none';
      banner.style.display = 'none';
    }
  }

  function resetProjectFilter() {
    activeProjectFilterIds = null;
    saveFilterPreferences();
    renderAll();
  }

  // ===================== REGLAS DE CAPACIDAD Y VERANO (JULIO / AGOSTO) =====================
  function getDailyCapacityRule(dateStr) {
    // dateStr: YYYY-MM-DD
    const parts = dateStr.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10); // 1-12
    const day = parseInt(parts[2], 10);
    const d = new Date(year, month - 1, day);
    const dow = d.getDay(); // 0 = Domingo, 1 = Lunes, ..., 5 = Viernes, 6 = Sábado

    // 1. Comprobar si es festivo
    const holiday = currentHolidays.find(h => h.date === dateStr);
    if (holiday) {
      return {
        dow,
        isWeekend: true, // Se comporta como no laborable
        isHoliday: true,
        holidayName: holiday.name || 'Festivo',
        maxRegularHours: 0.0,
        label: `🎉 Festivo: ${holiday.name || 'Día Festivo'} (Horas extra)`
      };
    }

    // 2. Comprobar si es fin de semana
    if (dow === 0 || dow === 6) {
      return {
        dow,
        isWeekend: true,
        isHoliday: false,
        maxRegularHours: 0.0,
        label: 'Fin de Semana (Horas extra)'
      };
    }

    // 3. Meses de Julio (7) y Agosto (8): Jornada intensiva de 7 horas de Lunes a Viernes
    const isSummerSchedule = (month === 7 || month === 8);
    if (isSummerSchedule) {
      return {
        dow,
        isWeekend: false,
        isHoliday: false,
        isSummerSchedule: true,
        maxRegularHours: 7.0,
        label: `Lunes a Viernes de Verano (máx 7h)`
      };
    }

    // 4. Resto del año: Lunes a Jueves máx 9h, Viernes máx 7h
    if (dow >= 1 && dow <= 4) {
      return {
        dow,
        isWeekend: false,
        isHoliday: false,
        maxRegularHours: 9.0,
        label: 'Lunes a Jueves (máx 9h)'
      };
    } else {
      return {
        dow,
        isWeekend: false,
        isHoliday: false,
        maxRegularHours: 7.0,
        label: 'Viernes (máx 7h)'
      };
    }
  }

  function renderScheduleRulesBar() {
    const bar = document.getElementById('scheduleRulesBar');
    const isSummerMonth = (currentMonth === 6 || currentMonth === 7); // Julio o Agosto

    if (isSummerMonth) {
      bar.innerHTML = `
        <div class="schedule-rule-item">
          <span class="schedule-dot schedule-dot--summer"></span>
          <span>☀️ <strong>Verano (Jul-Ago):</strong> L-V máx. <strong>7h</strong></span>
        </div>
        <div class="schedule-rule-item">
          <span class="schedule-dot schedule-dot--weekend"></span>
          <span>S-D: <strong>0h</strong></span>
        </div>
        <div class="schedule-rule-item schedule-rule-item--push">
          <span class="badge-overtime-info">⚡ Horas extra</span>
          <span class="badge-holiday-hint ml-2" title="Haz click derecho sobre un día del calendario para marcarlo como festivo">💡 Click derecho: Festivo</span>
        </div>
      `;
    } else {
      bar.innerHTML = `
        <div class="schedule-rule-item">
          <span class="schedule-dot schedule-dot--regular"></span>
          <span>L-J: <strong>9h máx</strong></span>
        </div>
        <div class="schedule-rule-item">
          <span class="schedule-dot schedule-dot--friday"></span>
          <span>Viernes: <strong>7h máx</strong></span>
        </div>
        <div class="schedule-rule-item">
          <span class="schedule-dot schedule-dot--weekend"></span>
          <span>S-D: <strong>0h</strong></span>
        </div>
        <div class="schedule-rule-item schedule-rule-item--push">
          <span class="badge-overtime-info">⚡ Horas extra</span>
          <span class="badge-holiday-hint ml-2" title="Haz click derecho sobre un día del calendario para marcarlo como festivo">💡 Click derecho: Festivo</span>
        </div>
      `;
    }

    // Cabecera de días de la semana
    const weekdaysHeader = document.getElementById('calendarWeekdaysHeader');
    if (weekdaysHeader) {
      if (isSummerMonth) {
        weekdaysHeader.innerHTML = `
          <div class="calendar-weekday">Lun <small>(7h)</small></div>
          <div class="calendar-weekday">Mar <small>(7h)</small></div>
          <div class="calendar-weekday">Mié <small>(7h)</small></div>
          <div class="calendar-weekday">Jue <small>(7h)</small></div>
          <div class="calendar-weekday">Vie <small>(7h)</small></div>
          <div class="calendar-weekday calendar-weekday--weekend">Sáb <small>(ext)</small></div>
          <div class="calendar-weekday calendar-weekday--weekend">Dom <small>(ext)</small></div>
        `;
      } else {
        weekdaysHeader.innerHTML = `
          <div class="calendar-weekday">Lun <small>(9h)</small></div>
          <div class="calendar-weekday">Mar <small>(9h)</small></div>
          <div class="calendar-weekday">Mié <small>(9h)</small></div>
          <div class="calendar-weekday">Jue <small>(9h)</small></div>
          <div class="calendar-weekday">Vie <small>(7h)</small></div>
          <div class="calendar-weekday calendar-weekday--weekend">Sáb <small>(ext)</small></div>
          <div class="calendar-weekday calendar-weekday--weekend">Dom <small>(ext)</small></div>
        `;
      }
    }
  }

  // ===================== BOLSA ANUAL DE VACACIONES Y LIBRE DISPOSICIÓN =====================
  function renderAnnualLeaveCard() {
    const yearLabel = document.getElementById('leaveCurrentYearLabel');
    if (yearLabel) yearLabel.textContent = currentYear;

    if (!currentAnnualLeaveBalance) return;

    const b = currentAnnualLeaveBalance;
    const q = b.quota;

    // Actualizar badges de los códigos vinculados
    const pillPrev = document.getElementById('codePillVacationPrevious');
    if (pillPrev) {
      const codeName = b.codes?.vacation_previous?.code || 'VAC-ANT';
      pillPrev.textContent = `[${codeName}]`;
      pillPrev.title = `Código de imputación: ${codeName} (${b.codes?.vacation_previous?.description || 'Año anterior'})`;
    }

    const pillCurr = document.getElementById('codePillVacationCurrent');
    if (pillCurr) {
      const codeName = b.codes?.vacation_current?.code || 'VAC-ACT';
      pillCurr.textContent = `[${codeName}]`;
      pillCurr.title = `Código de imputación: ${codeName} (${b.codes?.vacation_current?.description || 'Año actual'})`;
    }

    const pillLd = document.getElementById('codePillPersonalHours');
    if (pillLd) {
      const codeName = b.codes?.personal_hours?.code || 'LIBRE-DISP';
      pillLd.textContent = `[${codeName}]`;
      pillLd.title = `Código de imputación: ${codeName} (${b.codes?.personal_hours?.description || 'Libre Disposición'})`;
    }

    // 1. Vacaciones Año Anterior
    document.getElementById('totalVacationPrevious').textContent = q.vacation_days_previous;
    document.getElementById('consumedVacationPrevious').textContent = b.consumed.vacation_previous;
    document.getElementById('remainingVacationPrevious').innerHTML = `${b.remaining.vacation_previous} <small>días</small>`;

    const expiryPrevEl = document.getElementById('expiryVacationPrevious');
    if (b.is_previous_expired) {
      expiryPrevEl.className = 'leave-stat-expiry leave-stat-expiry--expired';
      expiryPrevEl.textContent = `⚠️ Caducadas el 31 Mar ${currentYear}`;
    } else {
      expiryPrevEl.className = 'leave-stat-expiry leave-stat-expiry--warning';
      expiryPrevEl.textContent = `⏱️ Caducan 31 Mar ${currentYear}`;
    }

    const pctPrev = q.vacation_days_previous > 0
      ? Math.min(100, Math.round((b.consumed.vacation_previous / q.vacation_days_previous) * 100))
      : 0;
    const progPrev = document.getElementById('progressVacationPrevious');
    if (progPrev) progPrev.style.width = `${pctPrev}%`;

    // 2. Vacaciones Año Actual
    document.getElementById('totalVacationCurrent').textContent = q.vacation_days_current;
    document.getElementById('consumedVacationCurrent').textContent = b.consumed.vacation_current;
    document.getElementById('remainingVacationCurrent').innerHTML = `${b.remaining.vacation_current} <small>días</small>`;

    const expiryCurrEl = document.getElementById('expiryVacationCurrent');
    expiryCurrEl.className = 'leave-stat-expiry leave-stat-expiry--active';
    expiryCurrEl.textContent = `✓ Disfrutables hasta 31 Mar ${currentYear + 1}`;

    const pctCurr = q.vacation_days_current > 0
      ? Math.min(100, Math.round((b.consumed.vacation_current / q.vacation_days_current) * 100))
      : 0;
    const progCurr = document.getElementById('progressVacationCurrent');
    if (progCurr) progCurr.style.width = `${pctCurr}%`;

    // 3. Horas Libre Disposición
    document.getElementById('totalPersonalHours').textContent = q.personal_hours;
    document.getElementById('consumedPersonalHours').textContent = b.consumed.personal_hours;
    document.getElementById('remainingPersonalHours').innerHTML = `${b.remaining.personal_hours} <small>horas</small>`;

    const expiryLdEl = document.getElementById('expiryPersonalHours');
    if (b.is_personal_expired) {
      expiryLdEl.className = 'leave-stat-expiry leave-stat-expiry--expired';
      expiryLdEl.textContent = `⚠️ Caducadas el 31 Dic ${currentYear}`;
    } else {
      expiryLdEl.className = 'leave-stat-expiry leave-stat-expiry--purple';
      expiryLdEl.textContent = `⏱️ Caducan 31 Dic ${currentYear}`;
    }

    const pctLd = q.personal_hours > 0
      ? Math.min(100, Math.round((b.consumed.personal_hours / q.personal_hours) * 100))
      : 0;
    const progLd = document.getElementById('progressPersonalHours');
    if (progLd) progLd.style.width = `${pctLd}%`;
  }

  function openLeaveQuotaModal() {
    const modal = document.getElementById('leaveQuotaModal');
    document.getElementById('quotaYearTitle').textContent = currentYear;
    document.getElementById('quotaYearInput').value = currentYear;

    const b = currentAnnualLeaveBalance;
    const q = b?.quota || {
      vacation_days_current: 22,
      vacation_days_previous: 0,
      personal_hours: 14
    };

    document.getElementById('quotaVacationCurrentInput').value = q.vacation_days_current;
    document.getElementById('quotaVacationPreviousInput').value = q.vacation_days_previous;
    document.getElementById('quotaPersonalHoursInput').value = q.personal_hours;

    function populateCodeSelect(selectId, selectedCodeId) {
      const select = document.getElementById(selectId);
      if (!select) return;
      let html = '<option value="">-- Sin asignar / Autodetectar --</option>';
      allImputationCodes.forEach(c => {
        const isSel = (selectedCodeId && c.id === selectedCodeId) ? 'selected' : '';
        html += `<option value="${c.id}" ${isSel}>${escapeHtml(c.project_name ? `${c.project_name} → ` : '')}[${escapeHtml(c.code)}] ${escapeHtml(c.description || '')}</option>`;
      });
      select.innerHTML = html;
    }

    populateCodeSelect('quotaVacationCurrentCodeSelect', q.vacation_current_code_id || b?.codes?.vacation_current?.id || null);
    populateCodeSelect('quotaVacationPreviousCodeSelect', q.vacation_previous_code_id || b?.codes?.vacation_previous?.id || null);
    populateCodeSelect('quotaPersonalHoursCodeSelect', q.personal_hours_code_id || b?.codes?.personal_hours?.id || null);

    modal.classList.add('active');
  }

  function closeLeaveQuotaModal() {
    document.getElementById('leaveQuotaModal').classList.remove('active');
  }

  async function handleSaveLeaveQuota(e) {
    e.preventDefault();
    const year = parseInt(document.getElementById('quotaYearInput').value, 10);
    const curr = parseFloat(document.getElementById('quotaVacationCurrentInput').value) || 0;
    const prev = parseFloat(document.getElementById('quotaVacationPreviousInput').value) || 0;
    const personal = parseFloat(document.getElementById('quotaPersonalHoursInput').value) || 0;

    const vacCurrCodeId = document.getElementById('quotaVacationCurrentCodeSelect')?.value ? parseInt(document.getElementById('quotaVacationCurrentCodeSelect').value, 10) : null;
    const vacPrevCodeId = document.getElementById('quotaVacationPreviousCodeSelect')?.value ? parseInt(document.getElementById('quotaVacationPreviousCodeSelect').value, 10) : null;
    const personalCodeId = document.getElementById('quotaPersonalHoursCodeSelect')?.value ? parseInt(document.getElementById('quotaPersonalHoursCodeSelect').value, 10) : null;

    try {
      await window.api.saveAnnualLeaveQuota({
        year,
        vacation_days_current: curr,
        vacation_days_previous: prev,
        personal_hours: personal,
        vacation_current_code_id: vacCurrCodeId,
        vacation_previous_code_id: vacPrevCodeId,
        personal_hours_code_id: personalCodeId
      });
      closeLeaveQuotaModal();
      await loadImputationCodes();
      await loadMonthData();
      renderAll();
      showAlert('Cupos anuales y códigos de imputación actualizados correctamente.', 'success');
    } catch (err) {
      showAlert('Error al guardar cupos: ' + err.message, 'danger');
    }
  }

  // ===================== DÍAS FESTIVOS =====================
  function openHolidayModal(dateStr, existingName = '') {
    const modal = document.getElementById('holidayModal');
    const dateObj = parseISODateLocal(dateStr);
    const dayFormatted = `${DAYS_OF_WEEK_ES[dateObj.getDay()]}, ${dateObj.getDate()} de ${MONTHS_ES[dateObj.getMonth()]} de ${dateObj.getFullYear()}`;

    document.getElementById('holidayDateInput').value = dateStr;
    document.getElementById('holidayDateSubtitle').textContent = dayFormatted;
    document.getElementById('holidayNameInput').value = existingName || 'Festivo';

    const delBtn = document.getElementById('deleteHolidayBtn');
    if (existingName) {
      document.getElementById('holidayModalTitle').textContent = 'Editar Día Festivo';
      delBtn.style.display = 'inline-block';
    } else {
      document.getElementById('holidayModalTitle').textContent = 'Marcar Día Festivo';
      delBtn.style.display = 'none';
    }

    modal.classList.add('active');
    setTimeout(() => {
      const inp = document.getElementById('holidayNameInput');
      inp.focus();
      inp.select();
    }, 50);
  }

  function closeHolidayModal() {
    document.getElementById('holidayModal').classList.remove('active');
  }

  async function handleSaveHoliday(e) {
    e.preventDefault();
    const date = document.getElementById('holidayDateInput').value;
    const name = document.getElementById('holidayNameInput').value.trim() || 'Festivo';

    try {
      await window.api.setHoliday(date, name);
      closeHolidayModal();
      await loadMonthData();
      renderAll();
      showAlert(`Día ${date} marcado como festivo: "${name}".`, 'success');
    } catch (err) {
      showAlert('Error al guardar festivo: ' + err.message, 'danger');
    }
  }

  async function handleDeleteHoliday() {
    const date = document.getElementById('holidayDateInput').value;
    if (!date) return;
    try {
      await window.api.removeHoliday(date);
      closeHolidayModal();
      await loadMonthData();
      renderAll();
      showAlert(`Día festivo eliminado para el ${date}.`, 'info');
    } catch (err) {
      showAlert('Error al eliminar festivo: ' + err.message, 'danger');
    }
  }

  // Menú contextual flotante
  function showDayContextMenu(e, dateStr) {
    e.preventDefault();
    contextMenuTargetDate = dateStr;
    const menu = document.getElementById('dayContextMenu');

    const dateObj = parseISODateLocal(dateStr);
    const dateLabel = `${dateObj.getDate()} ${MONTHS_ES[dateObj.getMonth()]}`;
    document.getElementById('contextMenuDateHeader').textContent = dateLabel;

    const holiday = currentHolidays.find(h => h.date === dateStr);
    const toggleHolidayText = document.getElementById('contextMenuHolidayText');
    const toggleHolidayIcon = document.getElementById('contextMenuHolidayIcon');

    if (holiday) {
      toggleHolidayText.textContent = `Quitar Festivo (${holiday.name || 'Festivo'})`;
      toggleHolidayIcon.textContent = '❌';
    } else {
      toggleHolidayText.textContent = 'Marcar como Festivo...';
      toggleHolidayIcon.textContent = '🎉';
    }

    // Posicionamiento en pantalla
    menu.style.display = 'block';
    const menuWidth = 220;
    const menuHeight = 180;
    let x = e.clientX;
    let y = e.clientY;

    if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 10;
    if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 10;

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
  }

  function hideContextMenu() {
    const menu = document.getElementById('dayContextMenu');
    if (menu) menu.style.display = 'none';
  }

  async function handleContextMenuToggleHoliday() {
    hideContextMenu();
    if (!contextMenuTargetDate) return;
    const holiday = currentHolidays.find(h => h.date === contextMenuTargetDate);
    if (holiday) {
      if (confirm(`¿Quitar festivo "${holiday.name}" del ${contextMenuTargetDate}?`)) {
        await window.api.removeHoliday(contextMenuTargetDate);
        await loadMonthData();
        renderAll();
        showAlert('Festivo eliminado.', 'info');
      }
    } else {
      openHolidayModal(contextMenuTargetDate);
    }
  }

  async function handleContextMenuVacation() {
    hideContextMenu();
    if (!contextMenuTargetDate) return;
    openDayModal(contextMenuTargetDate);
    handleAddVacationRow();
  }

  async function handleContextMenuPersonalHours() {
    hideContextMenu();
    if (!contextMenuTargetDate) return;
    openDayModal(contextMenuTargetDate);
    handleAddPersonalHoursRow();
  }

  async function handleContextMenuFullDay() {
    hideContextMenu();
    if (!contextMenuTargetDate) return;
    openDayModal(contextMenuTargetDate);
    handleFillFullDay();
  }

  // ===================== MENÚ CONTEXTUAL DE CÓDIGO (CLICK DERECHO) =====================
  let contextMenuTargetCode = null;

  function showCodeContextMenu(e, codeId, projectId) {
    e.preventDefault();
    e.stopPropagation();
    hideContextMenu(); // Ocultar el menú de día si estaba abierto

    const code = allImputationCodes.find(c => c.id === codeId);
    const proj = allProjects.find(p => p.id === projectId);
    const codeName = code ? code.code : `Código #${codeId}`;
    const projName = proj ? proj.name : '';

    contextMenuTargetCode = {
      codeId,
      projectId,
      codeName,
      projectName: projName,
      code
    };

    const menu = document.getElementById('codeContextMenu');
    if (!menu) return;

    document.getElementById('contextMenuCodeHeader').textContent = `${codeName}${projName ? ' · ' + projName : ''}`;

    // Determinar si mostrar opción "desde hoy hasta fin de mes"
    const today = new Date();
    const isCurrentCalendarMonth = (today.getFullYear() === currentYear && today.getMonth() === currentMonth);
    const fillFromTodayBtn = document.getElementById('contextMenuFillFromToday');
    const fillFromTodayText = document.getElementById('contextMenuFillFromTodayText');

    if (isCurrentCalendarMonth && today.getDate() > 1) {
      if (fillFromTodayBtn) fillFromTodayBtn.style.display = 'flex';
      if (fillFromTodayText) fillFromTodayText.textContent = `Cargar desde hoy (${today.getDate()} ${MONTHS_ES[currentMonth]}) hasta fin de mes`;
    } else {
      if (fillFromTodayBtn) fillFromTodayBtn.style.display = 'none';
    }

    menu.style.display = 'block';
    const menuWidth = 250;
    const menuHeight = 180;
    let x = e.clientX;
    let y = e.clientY;

    if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 10;
    if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 10;

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
  }

  function hideCodeContextMenu() {
    const menu = document.getElementById('codeContextMenu');
    if (menu) menu.style.display = 'none';
    contextMenuTargetCode = null;
  }

  async function handleContextMenuFillRemainingMonth(fromDay = 1) {
    if (!contextMenuTargetCode) return;
    const { codeId, projectId, codeName, projectName } = contextMenuTargetCode;
    hideCodeContextMenu();

    const monthLabel = `${MONTHS_ES[currentMonth]} ${currentYear}`;
    const rangeText = fromDay > 1
      ? `desde el día ${fromDay} hasta fin de mes en ${monthLabel}`
      : `todos los días laborables restantes de ${monthLabel}`;

    const confirmMsg = `¿Deseas cargar con el código "${codeName}" (${projectName}) ${rangeText}?\n\n` +
      `• Rellenará todos los huecos laborables (L–V) hasta 9h (L–J) y 7h (Viernes o Verano).\n` +
      `• Respetará días festivos, fines de semana e imputaciones previas (como vacaciones o asuntos propios).`;

    if (!confirm(confirmMsg)) return;

    try {
      showLoading(true);
      const res = await window.api.fillMonthRemainingGaps({
        year: currentYear,
        month: currentMonth + 1,
        projectId,
        codeId,
        fromDay
      });

      await loadMonthData();
      renderAll();
      showLoading(false);

      if (res.daysFilledCount > 0) {
        showAlert(
          `✓ Se han cargado <strong>${formatHours(res.totalAddedHours)}h</strong> en <strong>${res.daysFilledCount} días laborables</strong> para "<strong>${escapeHtml(codeName)}</strong>".`,
          'success'
        );
      } else {
        showAlert(`No había huecos laborables libres restantes en ${monthLabel} para este código.`, 'info');
      }
    } catch (err) {
      showLoading(false);
      showAlert('Error al cargar mes restante: ' + err.message, 'danger');
    }
  }

  function handleContextMenuEditCode() {
    if (!contextMenuTargetCode) return;
    const { codeId } = contextMenuTargetCode;
    hideCodeContextMenu();
    window.editImputationCode(codeId);
  }

  async function handleContextMenuDeleteCode() {
    if (!contextMenuTargetCode) return;
    const { codeId } = contextMenuTargetCode;
    hideCodeContextMenu();
    window.deleteImputationCode(codeId);
  }

  // ===================== ÁRBOL DE PROYECTOS Y CÓDIGOS =====================
  function getVisibleProjects() {
    let projs = allProjects;
    if (activeProjectFilterIds !== null) {
      projs = projs.filter(p => activeProjectFilterIds.has(p.id) || (p.parent_id && activeProjectFilterIds.has(p.parent_id)));
    }
    return projs;
  }

  function renderProjectsTree() {
    const container = document.getElementById('projectsTreeContainer');
    const visibleProjects = getVisibleProjects();
    const mainProjects = visibleProjects.filter(p => !p.parent_id);

    // Horas imputadas este mes por código
    const codeHoursMap = {};
    currentCodeAllocations.forEach(a => {
      codeHoursMap[a.code_id] = (codeHoursMap[a.code_id] || 0) + (a.hours || 0);
    });

    // Mapear códigos por proyecto
    const codesByProject = {};
    allImputationCodes.forEach(code => {
      if (!codesByProject[code.project_id]) codesByProject[code.project_id] = [];
      codesByProject[code.project_id].push(code);
    });

    let renderedProjectsCount = 0;

    if (mainProjects.length === 0) {
      container.innerHTML = `
        <div class="tree-empty-state">
          <p>No hay proyectos para mostrar.</p>
          ${activeProjectFilterIds !== null ? '<button class="btn btn-sm btn-secondary mt-2" onclick="window.resetProjectFilter()">Restablecer filtro</button>' : ''}
        </div>
      `;
      document.getElementById('treeStatsProjects').textContent = '0 proyectos';
      document.getElementById('treeStatsCodes').textContent = '0 códigos';
      return;
    }

    let html = '';

    mainProjects.forEach(project => {
      const subProjects = visibleProjects.filter(p => p.parent_id === project.id);
      const projectCodes = codesByProject[project.id] || [];

      const matchProject = project.name.toLowerCase().includes(treeSearchTerm);
      const matchingCodes = projectCodes.filter(c =>
        c.code.toLowerCase().includes(treeSearchTerm) || (c.description && c.description.toLowerCase().includes(treeSearchTerm))
      );
      const matchingSubProjects = subProjects.filter(sub => {
        const subCodes = codesByProject[sub.id] || [];
        const matchSub = sub.name.toLowerCase().includes(treeSearchTerm);
        const matchSubCodes = subCodes.some(c => c.code.toLowerCase().includes(treeSearchTerm));
        return matchSub || matchSubCodes;
      });

      if (treeSearchTerm && !matchProject && matchingCodes.length === 0 && matchingSubProjects.length === 0) {
        return;
      }

      renderedProjectsCount++;
      const isExpanded = treeSearchTerm ? true : treeExpandedProjects.has(project.id);
      const totalCodesCount = projectCodes.length;

      html += `
        <div class="tree-node tree-node--project ${isExpanded ? 'is-expanded' : ''}" data-project-id="${project.id}">
          <div class="tree-node-row" onclick="window.toggleTreeNode(${project.id})">
            <span class="tree-node-chevron">
              ${isExpanded ? (ICONS.chevronDown || '▼') : (ICONS.chevronRight || '▶')}
            </span>
            <span class="tree-project-color-dot" style="background-color: ${project.color || '#3b82f6'};"></span>
            <span class="tree-node-name" title="${escapeHtml(project.name)}">${escapeHtml(project.name)}</span>
            <span class="tree-count-pill" title="${totalCodesCount} códigos">${totalCodesCount}</span>
            <div class="tree-row-actions" onclick="event.stopPropagation();">
              <button class="btn-tree-action" title="Añadir código a este proyecto" onclick="window.openNewCodeForProject(${project.id})">
                ${ICONS.add || '+'}
              </button>
            </div>
          </div>

          <div class="tree-node-children" style="display: ${isExpanded ? 'block' : 'none'};">
            ${renderCodesListHtml(matchingCodes.length > 0 || !treeSearchTerm ? projectCodes : matchingCodes, codeHoursMap, project.id)}

            ${subProjects.map(sub => {
              const subCodes = codesByProject[sub.id] || [];
              const isSubExpanded = treeSearchTerm ? true : treeExpandedProjects.has(sub.id);
              renderedProjectsCount++;
              return `
                <div class="tree-node tree-node--subproject ${isSubExpanded ? 'is-expanded' : ''}" data-project-id="${sub.id}">
                  <div class="tree-node-row tree-node-row--sub" onclick="window.toggleTreeNode(${sub.id})">
                    <span class="tree-node-chevron">
                      ${isSubExpanded ? (ICONS.chevronDown || '▼') : (ICONS.chevronRight || '▶')}
                    </span>
                    <span class="tree-project-color-dot" style="background-color: ${sub.color || project.color || '#60a5fa'};"></span>
                    <span class="tree-node-name" title="${escapeHtml(sub.name)}">${escapeHtml(sub.name)}</span>
                    <span class="tree-count-pill">${subCodes.length}</span>
                    <div class="tree-row-actions" onclick="event.stopPropagation();">
                      <button class="btn-tree-action" title="Añadir código a este subproyecto" onclick="window.openNewCodeForProject(${sub.id})">
                        ${ICONS.add || '+'}
                      </button>
                    </div>
                  </div>
                  <div class="tree-node-children" style="display: ${isSubExpanded ? 'block' : 'none'};">
                    ${renderCodesListHtml(subCodes, codeHoursMap, sub.id)}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
    document.getElementById('treeStatsProjects').textContent = `${renderedProjectsCount} proyectos`;
    document.getElementById('treeStatsCodes').textContent = `${allImputationCodes.length} códigos`;

    setupTreeDragListeners();
  }

  function renderCodesListHtml(codes, codeHoursMap, projectId) {
    if (!codes || codes.length === 0) {
      return `
        <div class="tree-empty-codes">
          <span>Sin códigos</span>
          <button class="btn-link-sm" onclick="window.openNewCodeForProject(${projectId})">+ Crear código</button>
        </div>
      `;
    }

    return codes.map(code => {
      const allocatedHours = codeHoursMap[code.id] || 0;
      return `
        <div class="tree-code-item" draggable="true" data-code-id="${code.id}" data-project-id="${projectId}" data-code-name="${escapeHtml(code.code)}" title="Arrastra este código al calendario para imputarlo directamente a un día">
          <span class="tree-drag-grip" title="Arrastrar al calendario">⋮⋮</span>
          <div class="tree-code-item-main">
            <span class="tree-code-tag" title="${escapeHtml(code.description || code.code)}">
              ${escapeHtml(code.code)}
            </span>
            ${code.description ? `<span class="tree-code-desc" title="${escapeHtml(code.description)}">${escapeHtml(code.description)}</span>` : ''}
          </div>
          <div class="tree-code-meta">
            ${allocatedHours > 0 ? `<span class="tree-code-hours" title="${allocatedHours}h repartidas este mes">${allocatedHours}h</span>` : ''}
            <div class="tree-code-actions" onclick="event.stopPropagation();">
              <button class="btn-tree-icon" title="Editar código" onclick="window.editImputationCode(${code.id})">
                ${ICONS.edit || '✎'}
              </button>
              <button class="btn-tree-icon btn-tree-icon--danger" title="Eliminar código" onclick="window.deleteImputationCode(${code.id})">
                ${ICONS.delete || '🗑'}
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // ===================== DRAG & DROP DESDE EL ÁRBOL HACIA EL CALENDARIO =====================
  let draggedCodeData = null;

  function handleTreeCodeDragStart(e) {
    if (e.target.closest('.tree-code-actions') || e.target.closest('.btn-tree-icon')) {
      e.preventDefault();
      return;
    }
    const codeId = parseInt(this.getAttribute('data-code-id'), 10);
    const projectId = parseInt(this.getAttribute('data-project-id'), 10);
    const code = allImputationCodes.find(c => c.id === codeId);
    const proj = allProjects.find(p => p.id === projectId);

    draggedCodeData = {
      type: 'imputation-code',
      codeId: codeId,
      projectId: projectId,
      codeName: code ? code.code : (this.getAttribute('data-code-name') || 'Código'),
      projectName: proj ? proj.name : 'Proyecto',
      projectColor: proj ? proj.color : '#3b82f6'
    };

    this.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/json', JSON.stringify(draggedCodeData));
    e.dataTransfer.setData('text/plain', draggedCodeData.codeName);
  }

  function handleTreeCodeDragEnd() {
    this.classList.remove('is-dragging');
    draggedCodeData = null;
    clearAllCalendarDragOver();
  }

  function handleTreeProjectDragStart(e) {
    if (e.target.closest('.tree-row-actions') || e.target.closest('.tree-node-chevron') || e.target.closest('button')) {
      e.preventDefault();
      return;
    }
    const node = this.closest('.tree-node');
    const projectId = parseInt(node?.getAttribute('data-project-id'), 10);
    if (!projectId) return;

    const proj = allProjects.find(p => p.id === projectId);
    const projectCodes = allImputationCodes.filter(c => c.project_id === projectId);
    const firstCode = projectCodes[0] || null;

    draggedCodeData = {
      type: 'project',
      projectId: projectId,
      codeId: firstCode ? firstCode.id : null,
      codeName: firstCode ? firstCode.code : '',
      projectName: proj ? proj.name : 'Proyecto',
      projectColor: proj ? proj.color : '#3b82f6'
    };

    this.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/json', JSON.stringify(draggedCodeData));
    e.dataTransfer.setData('text/plain', draggedCodeData.projectName);
  }

  function handleTreeProjectDragEnd() {
    this.classList.remove('is-dragging');
    draggedCodeData = null;
    clearAllCalendarDragOver();
  }

  function setupTreeDragListeners() {
    document.querySelectorAll('.tree-code-item').forEach(item => {
      item.addEventListener('dragstart', handleTreeCodeDragStart);
      item.addEventListener('dragend', handleTreeCodeDragEnd);
      item.addEventListener('contextmenu', (e) => {
        const cid = parseInt(item.getAttribute('data-code-id'), 10);
        const pid = parseInt(item.getAttribute('data-project-id'), 10);
        showCodeContextMenu(e, cid, pid);
      });
    });

    document.querySelectorAll('.tree-node-row').forEach(row => {
      row.setAttribute('draggable', 'true');
      row.setAttribute('title', 'Arrastra al calendario para imputar a este proyecto');
      row.addEventListener('dragstart', handleTreeProjectDragStart);
      row.addEventListener('dragend', handleTreeProjectDragEnd);
    });
  }

  function clearAllCalendarDragOver() {
    document.querySelectorAll('.imputation-day-cell').forEach(c => {
      c.classList.remove('cell-drag-over', 'cell-drag-over--overtime');
      const prev = c.querySelector('.day-cell-drop-preview');
      if (prev) prev.remove();
    });
  }

  window.toggleTreeNode = function (projectId) {
    if (treeExpandedProjects.has(projectId)) {
      treeExpandedProjects.delete(projectId);
    } else {
      treeExpandedProjects.add(projectId);
    }
    renderProjectsTree();
  };

  window.openNewCodeForProject = function (projectId) {
    openCodeModal(null, projectId);
  };

  window.editImputationCode = function (codeId) {
    const code = allImputationCodes.find(c => c.id === codeId);
    if (code) openCodeModal(code);
  };

  window.deleteImputationCode = async function (codeId) {
    const code = allImputationCodes.find(c => c.id === codeId);
    if (!code) return;
    if (confirm(`¿Estás seguro de que deseas eliminar el código "${code.code}"? Si tiene horas repartidas, también se eliminarán.`)) {
      try {
        await window.api.deleteImputationCode(codeId);
        await loadImputationCodes();
        await loadMonthData();
        renderAll();
        showAlert(`Código "${code.code}" eliminado con éxito.`, 'success');
      } catch (err) {
        showAlert('Error al eliminar código: ' + err.message, 'danger');
      }
    }
  };

  // ===================== MODAL DE CÓDIGO DE IMPUTACIÓN =====================
  function openCodeModal(code = null, defaultProjectId = null) {
    const modal = document.getElementById('imputationCodeModal');
    const title = document.getElementById('codeModalTitle');
    const idInput = document.getElementById('codeModalId');
    const projectSelect = document.getElementById('codeModalProjectSelect');
    const codeInput = document.getElementById('codeModalCodeInput');
    const descInput = document.getElementById('codeModalDescInput');

    projectSelect.innerHTML = allProjects.map(p => {
      const prefix = p.parent_id ? '  ↳ ' : '';
      return `<option value="${p.id}">${prefix}${escapeHtml(p.name)}</option>`;
    }).join('');

    const leaveTypeSelect = document.getElementById('codeModalLeaveTypeSelect');

    if (code) {
      title.textContent = 'Editar Código de Imputación';
      idInput.value = code.id;
      projectSelect.value = code.project_id;
      codeInput.value = code.code;
      descInput.value = code.description || '';
      if (leaveTypeSelect) leaveTypeSelect.value = code.leave_type || '';
    } else {
      title.textContent = 'Nuevo Código de Imputación';
      idInput.value = '';
      if (defaultProjectId) projectSelect.value = defaultProjectId;
      codeInput.value = '';
      descInput.value = '';
      if (leaveTypeSelect) leaveTypeSelect.value = '';
    }

    modal.classList.add('active');
    setTimeout(() => codeInput.focus(), 50);
  }

  function closeCodeModal() {
    document.getElementById('imputationCodeModal').classList.remove('active');
  }

  // ===================== PROMPT PERSONALIZADO (COMPATIBLE CON ELECTRON) =====================
  let customPromptResolve = null;

  function showCustomPrompt({ title = 'Indicar Horas', message = '', defaultValue = '', min = '0', max = '744', step = '0.25' } = {}) {
    return new Promise(resolve => {
      customPromptResolve = resolve;

      const modal = document.getElementById('customPromptModal');
      const titleEl = document.getElementById('customPromptTitle');
      const msgEl = document.getElementById('customPromptMessage');
      const input = document.getElementById('customPromptInput');

      if (titleEl) titleEl.textContent = title;
      if (msgEl) msgEl.textContent = message;
      if (input) {
        input.value = defaultValue;
        input.min = min;
        input.max = max;
        input.step = step;
      }

      if (modal) modal.classList.add('active');
      setTimeout(() => {
        if (input) {
          input.focus();
          input.select();
        }
      }, 50);
    });
  }

  function closeCustomPrompt(result = null) {
    const modal = document.getElementById('customPromptModal');
    if (modal) modal.classList.remove('active');
    if (customPromptResolve) {
      const res = customPromptResolve;
      customPromptResolve = null;
      res(result);
    }
  }

  async function handleSaveCode(e) {
    e.preventDefault();
    const id = document.getElementById('codeModalId').value;
    const projectId = parseInt(document.getElementById('codeModalProjectSelect').value, 10);
    const code = document.getElementById('codeModalCodeInput').value.trim();
    const description = document.getElementById('codeModalDescInput').value.trim();
    const leaveType = document.getElementById('codeModalLeaveTypeSelect')?.value || null;

    if (!code) {
      showAlert('Por favor, indica un código de imputación.', 'warning');
      return;
    }

    try {
      if (id) {
        await window.api.updateImputationCode(parseInt(id, 10), {
          project_id: projectId,
          code,
          description,
          leave_type: leaveType
        });
        showAlert(`Código "${code}" actualizado correctamente.`, 'success');
      } else {
        await window.api.createImputationCode({
          project_id: projectId,
          code,
          description,
          leave_type: leaveType
        });
        treeExpandedProjects.add(projectId);
        showAlert(`Código "${code}" creado correctamente.`, 'success');
      }
      closeCodeModal();
      await loadImputationCodes();
      await loadMonthData();
      renderAll();
    } catch (err) {
      showAlert('Error al guardar el código: ' + err.message, 'danger');
    }
  }

  // ===================== MODAL DE FILTRO DE PROYECTOS =====================
  function openProjectFilterModal() {
    const modal = document.getElementById('projectFilterModal');
    const checklist = document.getElementById('filterProjectsChecklist');
    document.getElementById('filterModalSearchInput').value = '';

    checklist.innerHTML = allProjects.map(p => {
      const isChecked = activeProjectFilterIds === null || activeProjectFilterIds.has(p.id);
      const isSub = Boolean(p.parent_id);
      return `
        <label class="filter-project-checkbox-item ${isSub ? 'is-subproject' : ''}" data-name="${escapeHtml(p.name)}">
          <input type="checkbox" value="${p.id}" ${isChecked ? 'checked' : ''} class="filter-project-checkbox">
          <span class="project-filter-dot" style="background-color: ${p.color || '#3b82f6'};"></span>
          <span class="filter-project-name">${isSub ? '↳ ' : ''}${escapeHtml(p.name)}</span>
        </label>
      `;
    }).join('');

    modal.classList.add('active');
  }

  function closeProjectFilterModal() {
    document.getElementById('projectFilterModal').classList.remove('active');
  }

  function setAllChecklist(checked) {
    document.querySelectorAll('.filter-project-checkbox').forEach(cb => {
      cb.checked = checked;
    });
  }

  function handleSaveProjectFilter() {
    const checked = Array.from(document.querySelectorAll('.filter-project-checkbox:checked')).map(cb => parseInt(cb.value, 10));

    if (checked.length === allProjects.length || checked.length === 0) {
      activeProjectFilterIds = null;
    } else {
      activeProjectFilterIds = new Set(checked);
    }

    saveFilterPreferences();
    closeProjectFilterModal();
    renderAll();
    showAlert('Filtro de proyectos guardado.', 'info');
  }

  // ===================== CALENDARIO DE IMPUTACIONES =====================
  function renderCalendar() {
    const grid = document.getElementById('imputationCalendarGrid');
    grid.innerHTML = '';

    const todayStr = toISODateLocal(new Date());

    const firstDay = new Date(currentYear, currentMonth, 1);
    let startDow = firstDay.getDay(); // 0 Dom
    startDow = (startDow + 6) % 7;   // Lun = 0 ... Dom = 6

    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

    const impsByDate = {};
    currentMonthImputations.forEach(imp => {
      if (!impsByDate[imp.date]) impsByDate[imp.date] = [];
      impsByDate[imp.date].push(imp);
    });

    const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7;

    for (let i = 0; i < totalCells; i++) {
      let dayNum, dateStr, isOtherMonth;

      if (i < startDow) {
        dayNum = daysInPrevMonth - startDow + 1 + i;
        const d = new Date(currentYear, currentMonth - 1, dayNum);
        dateStr = toISODateLocal(d);
        isOtherMonth = true;
      } else if (i < startDow + daysInMonth) {
        dayNum = i - startDow + 1;
        dateStr = `${currentYear}-${pad(currentMonth + 1)}-${pad(dayNum)}`;
        isOtherMonth = false;
      } else {
        dayNum = i - startDow - daysInMonth + 1;
        const d = new Date(currentYear, currentMonth + 1, dayNum);
        dateStr = toISODateLocal(d);
        isOtherMonth = true;
      }

      const isToday = dateStr === todayStr;
      const dayImputations = impsByDate[dateStr] || [];
      const cell = buildDayCell(dayNum, dateStr, isOtherMonth, isToday, dayImputations);
      grid.appendChild(cell);
    }
  }

  function buildDayCell(dayNum, dateStr, isOtherMonth, isToday, imputations) {
    const rule = getDailyCapacityRule(dateStr);
    const cell = document.createElement('div');

    let regularHours = 0;
    let overtimeHours = 0;
    imputations.forEach(i => {
      const h = Number(i.hours || 0);
      if (i.is_overtime || rule.isWeekend) {
        overtimeHours += h;
      } else {
        regularHours += h;
      }
    });
    const totalDayHours = regularHours + overtimeHours;

    let dayStatusClass = 'day--empty';
    if (totalDayHours > 0) {
      if (rule.isHoliday) {
        dayStatusClass = 'day--holiday-imputed';
      } else if (rule.isWeekend) {
        dayStatusClass = 'day--weekend-overtime';
      } else if (regularHours >= rule.maxRegularHours) {
        dayStatusClass = 'day--full';
      } else {
        dayStatusClass = 'day--partial';
      }
    } else if (rule.isHoliday) {
      dayStatusClass = 'day--holiday-empty';
    }

    cell.className = `imputation-day-cell ${isOtherMonth ? 'day--other-month' : ''} ${isToday ? 'day--today' : ''} ${rule.isWeekend ? 'day--weekend' : ''} ${rule.isHoliday ? 'day--holiday' : ''} ${dayStatusClass}`;

    // Click izquierdo abre modal
    cell.addEventListener('click', () => {
      openDayModal(dateStr);
    });

    // Click derecho abre menú contextual para festivos/vacaciones
    cell.addEventListener('contextmenu', (e) => {
      showDayContextMenu(e, dateStr);
    });

    // Drag & Drop: recibir códigos arrastrados desde el árbol o la tabla
    if (!isOtherMonth) {
      const remainingGap = Math.max(0, Math.round((rule.maxRegularHours - regularHours) * 100) / 100);

      cell.addEventListener('dragover', (e) => {
        if (!draggedCodeData && !e.dataTransfer.types.includes('application/json')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';

        const isOvertimeDay = rule.isWeekend || rule.isHoliday;
        cell.classList.add('cell-drag-over');
        if (isOvertimeDay) {
          cell.classList.add('cell-drag-over--overtime');
        }

        // Preview flotante de horas
        let preview = cell.querySelector('.day-cell-drop-preview');
        if (!preview) {
          preview = document.createElement('span');
          preview.className = 'day-cell-drop-preview';
          cell.appendChild(preview);
        }
        const labelHours = isOvertimeDay ? '+2h ext' : (remainingGap > 0 ? `+${formatHours(remainingGap)}h` : '+2h ext');
        const tagText = draggedCodeData?.codeName ? ` ${draggedCodeData.codeName}` : '';
        preview.textContent = `${labelHours}${tagText}`;
      });

      cell.addEventListener('dragleave', (e) => {
        if (!cell.contains(e.relatedTarget)) {
          cell.classList.remove('cell-drag-over', 'cell-drag-over--overtime');
          const preview = cell.querySelector('.day-cell-drop-preview');
          if (preview) preview.remove();
        }
      });

      cell.addEventListener('drop', async (e) => {
        e.preventDefault();
        cell.classList.remove('cell-drag-over', 'cell-drag-over--overtime');
        const preview = cell.querySelector('.day-cell-drop-preview');
        if (preview) preview.remove();

        let dropData = draggedCodeData;
        if (!dropData) {
          try {
            const raw = e.dataTransfer.getData('application/json');
            if (raw) dropData = JSON.parse(raw);
          } catch (err) {}
        }

        if (!dropData) return;

        const isShiftOrAlt = e.shiftKey || e.altKey;
        await handleDropCodeOnDay(dateStr, dropData, isShiftOrAlt);
      });
    }

    // Encabezado
    const header = document.createElement('div');
    header.className = 'day-cell-header';

    const numSpan = document.createElement('span');
    numSpan.className = 'day-cell-number';
    numSpan.textContent = dayNum;
    header.appendChild(numSpan);

    if (rule.isHoliday) {
      const holiBadge = document.createElement('span');
      holiBadge.className = 'day-cell-holiday-badge';
      holiBadge.title = `Día Festivo: ${rule.holidayName}`;
      holiBadge.textContent = `🎉 ${rule.holidayName}`;
      header.appendChild(holiBadge);
    } else if (totalDayHours > 0) {
      const hoursBadge = document.createElement('span');
      hoursBadge.className = 'day-cell-hours-badge';
      if (overtimeHours > 0 && regularHours > 0) {
        hoursBadge.innerHTML = `<strong>${formatHours(regularHours)}h</strong><small class="badge-extra">+${formatHours(overtimeHours)}h</small>`;
      } else if (overtimeHours > 0) {
        hoursBadge.innerHTML = `<span class="badge-extra">⚡ ${formatHours(overtimeHours)}h ext</span>`;
      } else {
        const isMaxed = regularHours >= rule.maxRegularHours;
        hoursBadge.innerHTML = `${formatHours(regularHours)} <small>/ ${rule.maxRegularHours}h</small>${isMaxed ? ' ✓' : ''}`;
      }
      header.appendChild(hoursBadge);
    } else if (!rule.isWeekend && !isOtherMonth) {
      const maxSpan = document.createElement('span');
      maxSpan.className = 'day-cell-capacity-hint';
      maxSpan.textContent = `${rule.maxRegularHours}h máx`;
      header.appendChild(maxSpan);
    }

    cell.appendChild(header);

    // Lista de píldoras de proyectos y códigos
    const list = document.createElement('div');
    list.className = 'day-cell-projects-list';

    imputations.forEach(imp => {
      const isVacationPill = imp.code_leave_type === 'vacation_current'
        || imp.code_leave_type === 'vacation_previous'
        || imp.code_name?.startsWith('VAC')
        || imp.project_name === 'Vacaciones y Ausencias';
      const isPersonalHoursPill = imp.code_leave_type === 'personal_hours'
        || imp.code_name === 'LIBRE-DISP';

      const pill = document.createElement('div');
      pill.className = `day-project-pill ${imp.is_overtime ? 'pill--overtime' : ''} ${isVacationPill ? 'pill--vacation' : ''} ${isPersonalHoursPill ? 'pill--personal' : ''}`;
      const codeInfo = imp.code_name ? ` [${imp.code_name}]` : '';
      pill.title = `${imp.project_name}${codeInfo}: ${imp.hours}h ${imp.is_overtime ? '(Horas Extra)' : ''} ${imp.notes ? `\nNota: ${imp.notes}` : ''}`;
      pill.innerHTML = `
        <span class="day-project-dot" style="background-color: ${imp.project_color || '#3b82f6'};"></span>
        <span class="day-project-name">${escapeHtml(imp.code_name || imp.project_name)}</span>
        <span class="day-project-hours">${formatHours(imp.hours)}h${imp.is_overtime ? ' ⚡' : ''}</span>
      `;

      if (imp.code_id) {
        pill.addEventListener('contextmenu', (e) => {
          e.stopPropagation();
          showCodeContextMenu(e, imp.code_id, imp.project_id);
        });
      }

      list.appendChild(pill);
    });

    cell.appendChild(list);
    return cell;
  }

  async function handleDropCodeOnDay(dateStr, dropData, forcePromptHours = false) {
    const rule = getDailyCapacityRule(dateStr);
    const dateObj = parseISODateLocal(dateStr);
    const dayFormatted = `${dateObj.getDate()} de ${MONTHS_ES[dateObj.getMonth()]}`;

    const projectId = dropData.projectId;
    let codeId = dropData.codeId;
    let codeName = dropData.codeName;

    // Si se arrastró un proyecto sin código específico, buscar si tiene códigos
    if (!codeId) {
      const pCodes = allImputationCodes.filter(c => c.project_id === projectId);
      if (pCodes.length > 0) {
        codeId = pCodes[0].id;
        codeName = pCodes[0].code;
      }
    }

    if (!codeName) {
      const codeObj = allImputationCodes.find(c => c.id === codeId);
      codeName = codeObj ? codeObj.code : (dropData.projectName || 'Imputación');
    }

    // Imputaciones actuales en este día
    const dayImps = currentMonthImputations.filter(i => i.date === dateStr);
    let regularHours = 0;
    dayImps.forEach(i => {
      if (!i.is_overtime && !rule.isWeekend && !rule.isHoliday) {
        regularHours += Number(i.hours || 0);
      }
    });

    const maxReg = rule.maxRegularHours;
    const remainingGap = Math.max(0, Math.round((maxReg - regularHours) * 100) / 100);

    let hoursToImpute = 0;
    let isOvertime = false;

    if (rule.isWeekend || rule.isHoliday) {
      isOvertime = true;
      const promptVal = await showCustomPrompt({
        title: 'Horas Extraordinarias',
        message: `El ${dayFormatted} es ${rule.isHoliday ? 'festivo (' + rule.holidayName + ')' : 'fin de semana'}.\n\n¿Cuántas HORAS EXTRA deseas imputar para "${codeName}"?`,
        defaultValue: '2.0',
        min: '0.25',
        step: '0.25'
      });
      if (promptVal === null) return;
      hoursToImpute = parseFloat(promptVal) || 0;
      if (hoursToImpute <= 0) return;
    } else if (forcePromptHours) {
      const defaultH = remainingGap > 0 ? remainingGap : 2.0;
      const promptVal = await showCustomPrompt({
        title: 'Imputar Horas',
        message: `Imputar "${codeName}" el ${dayFormatted}.\n\nHueco ordinario disponible: ${remainingGap}h (máx. ${maxReg}h).\n\nIntroduce las horas:`,
        defaultValue: String(defaultH),
        min: '0.25',
        step: '0.25'
      });
      if (promptVal === null) return;
      hoursToImpute = parseFloat(promptVal) || 0;
      if (hoursToImpute <= 0) return;
      if (remainingGap === 0) isOvertime = true;
    } else {
      if (remainingGap > 0) {
        hoursToImpute = remainingGap;
        isOvertime = false;
      } else {
        const promptVal = await showCustomPrompt({
          title: 'Jornada Completa - Horas Extra',
          message: `La jornada ordinaria del ${dayFormatted} ya está al 100% (${maxReg}h completadas).\n\n¿Deseas registrar HORAS EXTRAordinarias para "${codeName}"? Introduce las horas (o pulsa Cancelar para abrir el día):`,
          defaultValue: '2.0',
          min: '0.25',
          step: '0.25'
        });
        if (promptVal === null) {
          openDayModal(dateStr);
          return;
        }
        hoursToImpute = parseFloat(promptVal) || 0;
        if (hoursToImpute <= 0) return;
        isOvertime = true;
      }
    }

    // Preparar entradas existentes para guardar
    const existingEntries = dayImps.map(i => ({
      project_id: i.project_id,
      code_id: i.code_id,
      hours: Number(i.hours || 0),
      is_overtime: Boolean(i.is_overtime),
      notes: i.notes || ''
    }));

    // Comprobar si ya existe este código con el mismo régimen
    const sameEntry = existingEntries.find(e => e.code_id === codeId && e.is_overtime === isOvertime);
    if (sameEntry) {
      sameEntry.hours = Math.round((sameEntry.hours + hoursToImpute) * 100) / 100;
    } else {
      existingEntries.push({
        project_id: projectId,
        code_id: codeId,
        hours: hoursToImpute,
        is_overtime: isOvertime,
        notes: 'Arrastrado desde árbol'
      });
    }

    try {
      showLoading(true);
      await window.api.batchSaveDayImputations(dateStr, existingEntries);
      await loadMonthData();
      renderAll();
      showLoading(false);
      showAlert(
        `✓ Imputadas <strong>${formatHours(hoursToImpute)}h</strong> para "<strong>${escapeHtml(codeName)}</strong>" el ${dayFormatted}${isOvertime ? ' <em>(Horas Extra)</em>' : ''}.<span style="display:block; margin-top:3px; font-size:0.82em; opacity:0.9;">💡 Consejo: mantén pulsado <strong>Shift</strong> al arrastrar si deseas elegir horas específicas.</span>`,
        'success'
      );
    } catch (err) {
      showLoading(false);
      showAlert('Error al imputar código: ' + err.message, 'danger');
    }
  }

  // ===================== MODAL DE IMPUTACIÓN DEL DÍA =====================
  function openDayModal(dateStr) {
    editingDayDate = dateStr;
    const rule = getDailyCapacityRule(dateStr);
    const dateObj = parseISODateLocal(dateStr);
    const dayName = DAYS_OF_WEEK_ES[dateObj.getDay()];
    const dayFormatted = `${dayName}, ${dateObj.getDate()} de ${MONTHS_ES[dateObj.getMonth()]} de ${dateObj.getFullYear()}`;

    document.getElementById('dayModalTitle').textContent = `Imputar Horas para el ${dayFormatted}`;

    let subText = '';
    if (rule.isHoliday) {
      subText = `🎉 Día Festivo (${rule.holidayName}): no laborable. Si has trabajado, puedes registrar horas extra.`;
    } else if (rule.isWeekend) {
      subText = 'Fin de semana (no laborable). Puedes registrar horas extraordinarias marcando la casilla "Extra".';
    } else if (rule.isSummerSchedule) {
      subText = '☀️ Jornada Intensiva de Verano: máximo 7.0 horas ordinarias.';
    } else {
      subText = `Jornada ordinaria: máximo ${rule.maxRegularHours} horas (${rule.dow === 5 ? 'Viernes' : 'Lunes a Jueves'}).`;
    }
    document.getElementById('dayModalSubtitle').textContent = subText;

    const dayImps = currentMonthImputations.filter(i => i.date === dateStr);
    editingDayEntries = dayImps.map(i => ({
      project_id: i.project_id,
      code_id: i.code_id || null,
      hours: Number(i.hours || 0),
      is_overtime: Boolean(i.is_overtime) || rule.isWeekend || rule.isHoliday,
      notes: i.notes || ''
    }));

    if (editingDayEntries.length === 0 && !rule.isWeekend && !rule.isHoliday) {
      const visible = getVisibleProjects();
      const firstProjId = visible.length > 0 ? visible[0].id : (allProjects[0]?.id || null);
      if (firstProjId) {
        editingDayEntries.push({
          project_id: firstProjId,
          code_id: null,
          hours: rule.maxRegularHours,
          is_overtime: false,
          notes: ''
        });
      }
    }

    renderDayModalRows();
    updateDayCapacityMeter();
    hideDayModalAlert();
    document.getElementById('dayImputationModal').classList.add('active');
  }

  function closeDayModal() {
    document.getElementById('dayImputationModal').classList.remove('active');
    editingDayDate = null;
    editingDayEntries = [];
  }

  function renderDayModalRows() {
    const list = document.getElementById('dayImputationsList');
    list.innerHTML = '';
    const visibleProjects = getVisibleProjects();
    const projectsList = visibleProjects.length > 0 ? visibleProjects : allProjects;
    const rule = getDailyCapacityRule(editingDayDate);

    if (editingDayEntries.length === 0) {
      list.innerHTML = `
        <div class="day-rows-empty">
          <p>No hay proyectos imputados para este día. Pulsa en <strong>+ Añadir Proyecto</strong>, <strong>🏖️ Vacaciones</strong> o <strong>⏱️ Libre Disposición</strong> para comenzar.</p>
        </div>
      `;
      return;
    }

    editingDayEntries.forEach((entry, index) => {
      const row = document.createElement('div');
      row.className = 'day-imputation-row';

      // Select de proyectos
      const optionsHtml = projectsList.map(p => {
        const isSelected = p.id === entry.project_id ? 'selected' : '';
        const prefix = p.parent_id ? '  ↳ ' : '';
        return `<option value="${p.id}" ${isSelected}>${prefix}${escapeHtml(p.name)}</option>`;
      }).join('');

      // Select de códigos según el proyecto seleccionado
      const projectCodes = allImputationCodes.filter(c => c.project_id === entry.project_id);
      let codesOptionsHtml = '<option value="">-- General / Sin código --</option>';
      codesOptionsHtml += projectCodes.map(c => {
        const isSelected = c.id === entry.code_id ? 'selected' : '';
        return `<option value="${c.id}" ${isSelected}>${escapeHtml(c.code)} - ${escapeHtml(c.description || '')}</option>`;
      }).join('');

      row.innerHTML = `
        <div class="col-proj">
          <select class="form-control day-row-project-select" data-index="${index}">
            ${optionsHtml}
          </select>
        </div>
        <div class="col-code-select">
          <select class="form-control day-row-code-select" data-index="${index}">
            ${codesOptionsHtml}
          </select>
        </div>
        <div class="col-hours">
          <input type="number" min="0.25" max="24" step="0.25" class="form-control day-row-hours-input" data-index="${index}" value="${entry.hours || ''}" placeholder="0.0">
        </div>
        <div class="col-type">
          <label class="overtime-checkbox-label" title="Marcar como hora extraordinaria">
            <input type="checkbox" class="day-row-overtime-check" data-index="${index}" ${entry.is_overtime || rule.isWeekend || rule.isHoliday ? 'checked' : ''} ${rule.isWeekend || rule.isHoliday ? 'disabled' : ''}>
            <span>Extra</span>
          </label>
        </div>
        <div class="col-notes">
          <input type="text" class="form-control day-row-notes-input" data-index="${index}" value="${escapeHtml(entry.notes || '')}" placeholder="Comentario opcional...">
        </div>
        <div class="col-action">
          <button type="button" class="btn-remove-row" data-index="${index}" title="Eliminar fila">&times;</button>
        </div>
      `;

      row.querySelector('.day-row-project-select').addEventListener('change', (e) => {
        entry.project_id = parseInt(e.target.value, 10);
        const newCodes = allImputationCodes.filter(c => c.project_id === entry.project_id);
        entry.code_id = newCodes.length > 0 ? newCodes[0].id : null;
        renderDayModalRows();
      });

      row.querySelector('.day-row-code-select').addEventListener('change', (e) => {
        entry.code_id = e.target.value ? parseInt(e.target.value, 10) : null;
      });

      row.querySelector('.day-row-hours-input').addEventListener('input', (e) => {
        entry.hours = parseFloat(e.target.value) || 0;
        updateDayCapacityMeter();
      });

      row.querySelector('.day-row-overtime-check').addEventListener('change', (e) => {
        entry.is_overtime = e.target.checked;
        updateDayCapacityMeter();
      });

      row.querySelector('.day-row-notes-input').addEventListener('input', (e) => {
        entry.notes = e.target.value;
      });

      row.querySelector('.btn-remove-row').addEventListener('click', () => {
        editingDayEntries.splice(index, 1);
        renderDayModalRows();
        updateDayCapacityMeter();
      });

      list.appendChild(row);
    });
  }

  function addDayEntryRow(defaultProjectId = null, defaultCodeId = null, defaultHours = null, isOvertime = false) {
    const rule = getDailyCapacityRule(editingDayDate);
    const visible = getVisibleProjects();
    const projId = defaultProjectId || (visible.length > 0 ? visible[0].id : (allProjects[0]?.id || null));

    if (!projId) {
      showAlert('No hay proyectos creados en la aplicación.', 'warning');
      return;
    }

    const projectCodes = allImputationCodes.filter(c => c.project_id === projId);
    const resolvedCodeId = defaultCodeId !== null ? defaultCodeId : (projectCodes.length > 0 ? projectCodes[0].id : null);

    let hours = defaultHours;
    if (hours === null) {
      if (rule.isWeekend || rule.isHoliday || isOvertime) {
        hours = 2.0;
      } else {
        const currentRegular = editingDayEntries.reduce((sum, e) => sum + (e.is_overtime ? 0 : Number(e.hours || 0)), 0);
        hours = Math.max(0, rule.maxRegularHours - currentRegular) || rule.maxRegularHours;
      }
    }

    editingDayEntries.push({
      project_id: projId,
      code_id: resolvedCodeId,
      hours: hours,
      is_overtime: isOvertime || rule.isWeekend || rule.isHoliday,
      notes: ''
    });

    renderDayModalRows();
    updateDayCapacityMeter();
  }

  function handleAddVacationRow() {
    const rule = getDailyCapacityRule(editingDayDate);
    const leaveProj = allProjects.find(p => p.name === 'Vacaciones y Ausencias') || allProjects[0];

    // Determinar si corresponde Año Anterior o Año Actual
    // Se consumen las del año anterior si estamos en o antes del 31 de marzo y quedan días del año anterior
    const dateParts = editingDayDate.split('-');
    const m = parseInt(dateParts[1], 10);
    const d = parseInt(dateParts[2], 10);
    const isBeforeApr1 = (m < 3 || (m === 3 && d <= 31));

    let targetCode = null;
    let label = 'Vacaciones';

    if (isBeforeApr1 && currentAnnualLeaveBalance && currentAnnualLeaveBalance.remaining.vacation_previous > 0) {
      targetCode = currentAnnualLeaveBalance.codes?.vacation_previous;
      label = targetCode ? `${targetCode.code} (Año anterior)` : 'Año anterior';
    } else {
      targetCode = currentAnnualLeaveBalance?.codes?.vacation_current;
      label = targetCode ? `${targetCode.code} (Año actual)` : 'Año actual';
    }

    if (!targetCode) {
      targetCode = allImputationCodes.find(c => c.leave_type === (isBeforeApr1 ? 'vacation_previous' : 'vacation_current'))
        || allImputationCodes.find(c => c.code === (isBeforeApr1 ? 'VAC-ANT' : 'VAC-ACT'))
        || allImputationCodes.find(c => leaveProj && c.project_id === leaveProj.id);
    }

    const targetProjId = targetCode?.project_id || leaveProj?.id || (allProjects[0]?.id || null);
    const fullHours = rule.maxRegularHours || (rule.isSummerSchedule ? 7.0 : 7.0);
    addDayEntryRow(targetProjId, targetCode?.id || null, fullHours, false);
    showAlert(`Añadida fila de vacaciones: ${label}.`, 'info');
  }

  function handleAddPersonalHoursRow() {
    const leaveProj = allProjects.find(p => p.name === 'Vacaciones y Ausencias') || allProjects[0];

    let targetCode = currentAnnualLeaveBalance?.codes?.personal_hours;
    if (!targetCode) {
      targetCode = allImputationCodes.find(c => c.leave_type === 'personal_hours')
        || allImputationCodes.find(c => c.code === 'LIBRE-DISP')
        || allImputationCodes.find(c => leaveProj && c.project_id === leaveProj.id);
    }

    const targetProjId = targetCode?.project_id || leaveProj?.id || (allProjects[0]?.id || null);
    addDayEntryRow(targetProjId, targetCode?.id || null, 2.0, false);
    showAlert(`Añadida fila de Horas de Libre Disposición (${targetCode ? targetCode.code : 'Horas'}).`, 'info');
  }

  function handleFillFullDay() {
    const rule = getDailyCapacityRule(editingDayDate);
    if (rule.isWeekend || rule.isHoliday) {
      showAlert('Es día no laborable (fin de semana o festivo). Utiliza la opción de Horas Extra.', 'info');
      return;
    }

    const currentRegular = editingDayEntries.reduce((sum, e) => sum + (e.is_overtime ? 0 : Number(e.hours || 0)), 0);
    const needed = rule.maxRegularHours - currentRegular;

    if (needed <= 0) {
      showAlert(`Ya has cubierto la jornada ordinaria de ${rule.maxRegularHours}h.`, 'info');
      return;
    }

    if (editingDayEntries.length > 0) {
      const target = editingDayEntries.find(e => !e.is_overtime) || editingDayEntries[0];
      target.hours = Number(target.hours || 0) + needed;
    } else {
      addDayEntryRow(null, null, rule.maxRegularHours, false);
      return;
    }

    renderDayModalRows();
    updateDayCapacityMeter();
  }

  function updateDayCapacityMeter() {
    const rule = getDailyCapacityRule(editingDayDate);
    let regularHours = 0;
    let overtimeHours = 0;

    editingDayEntries.forEach(e => {
      const h = Number(e.hours || 0);
      if (e.is_overtime || rule.isWeekend || rule.isHoliday) {
        overtimeHours += h;
      } else {
        regularHours += h;
      }
    });

    const summaryEl = document.getElementById('dayCapacitySummary');
    const statusTextEl = document.getElementById('dayCapacityStatusText');
    const fillRegularEl = document.getElementById('dayCapacityFillRegular');
    const fillOvertimeEl = document.getElementById('dayCapacityFillOvertime');

    const maxReg = rule.maxRegularHours;

    if (rule.isHoliday) {
      summaryEl.innerHTML = `${formatHours(overtimeHours)}h <small class="badge-extra">Horas Extra (Festivo)</small>`;
      statusTextEl.innerHTML = `🎉 <strong>Día Festivo (${rule.holidayName}):</strong> No requiere horas ordinarias. Las registradas computan como extraordinarias.`;
      fillRegularEl.style.width = '0%';
      fillOvertimeEl.style.width = overtimeHours > 0 ? '100%' : '0%';
      hideDayModalAlert();
      return;
    }

    if (rule.isWeekend) {
      summaryEl.innerHTML = `${formatHours(overtimeHours)}h <small class="badge-extra">Horas Extra</small>`;
      statusTextEl.innerHTML = overtimeHours > 0
        ? `⚡ Imputadas ${formatHours(overtimeHours)}h extraordinarias en fin de semana.`
        : 'Fin de semana (no laborable). Puedes registrar horas extra si has trabajado.';
      fillRegularEl.style.width = '0%';
      fillOvertimeEl.style.width = overtimeHours > 0 ? '100%' : '0%';
      hideDayModalAlert();
      return;
    }

    // Días laborables (Lunes a Jueves máx 9h, Viernes máx 7h, o Verano L-V máx 7h)
    const regularPercent = maxReg > 0 ? Math.min(100, (regularHours / maxReg) * 100) : 0;
    fillRegularEl.style.width = `${regularPercent}%`;

    const extraScale = 5;
    const overtimePercent = Math.min(50, (overtimeHours / extraScale) * 100);
    fillOvertimeEl.style.width = `${overtimePercent}%`;

    const scheduleDesc = rule.isSummerSchedule ? 'ordinarias de verano' : 'ordinarias';

    if (overtimeHours > 0) {
      summaryEl.innerHTML = `${formatHours(regularHours)}h <small>/ ${maxReg}h ${scheduleDesc}</small> + <span class="badge-extra">${formatHours(overtimeHours)}h extra</span>`;
    } else {
      summaryEl.innerHTML = `${formatHours(regularHours)} <small>/ ${maxReg}h ${scheduleDesc}</small>`;
    }

    if (regularHours > maxReg) {
      const excess = regularHours - maxReg;
      fillRegularEl.classList.add('exceeded');
      statusTextEl.innerHTML = `<span class="text-danger">⚠️ Has superado el máximo ordinario de ${maxReg}h por ${formatHours(excess)}h. Puedes marcar el exceso como "Extra".</span>`;
      showDayModalAlert(`El límite de horas ordinarias para este día (${rule.label}) es de ${maxReg}h. El total actual es de ${formatHours(regularHours)}h.`, 'warning');
    } else if (regularHours === maxReg) {
      fillRegularEl.classList.remove('exceeded');
      statusTextEl.innerHTML = `<span class="text-success">✓ Jornada ordinaria completada al 100% (${maxReg}h).</span>`;
      hideDayModalAlert();
    } else {
      fillRegularEl.classList.remove('exceeded');
      const remaining = maxReg - regularHours;
      statusTextEl.innerHTML = `Faltan <strong>${formatHours(remaining)}h</strong> para alcanzar la jornada ordinaria máxima de ${maxReg}h.`;
      hideDayModalAlert();
    }
  }

  function showDayModalAlert(msg, type = 'warning') {
    const el = document.getElementById('dayModalAlert');
    el.className = `alert-inline alert-${type}`;
    el.innerHTML = msg;
    el.style.display = 'block';
  }

  function hideDayModalAlert() {
    const el = document.getElementById('dayModalAlert');
    el.style.display = 'none';
  }

  async function handleSaveDayImputations() {
    if (!editingDayDate) return;
    const rule = getDailyCapacityRule(editingDayDate);

    const validEntries = editingDayEntries
      .filter(e => e.project_id && Number(e.hours) > 0)
      .map(e => ({
        project_id: parseInt(e.project_id, 10),
        code_id: e.code_id ? parseInt(e.code_id, 10) : null,
        hours: Number(e.hours),
        is_overtime: Boolean(e.is_overtime || rule.isWeekend || rule.isHoliday),
        notes: (e.notes || '').trim()
      }));

    let regularSum = 0;
    validEntries.forEach(e => {
      if (!e.is_overtime && !rule.isWeekend && !rule.isHoliday) regularSum += e.hours;
    });

    if (!rule.isWeekend && !rule.isHoliday && regularSum > rule.maxRegularHours) {
      const excess = regularSum - rule.maxRegularHours;
      if (!confirm(`Las horas ordinarias (${formatHours(regularSum)}h) superan el máximo de ${rule.maxRegularHours}h por ${formatHours(excess)}h.\n\n¿Deseas que el exceso de ${formatHours(excess)}h se guarde automáticamente como horas extra?`)) {
        return;
      }
      let currentReg = 0;
      validEntries.forEach(e => {
        if (!e.is_overtime) {
          if (currentReg + e.hours <= rule.maxRegularHours) {
            currentReg += e.hours;
          } else {
            const fit = Math.max(0, rule.maxRegularHours - currentReg);
            const extra = e.hours - fit;
            if (fit > 0) {
              e.hours = fit;
              validEntries.push({
                project_id: e.project_id,
                code_id: e.code_id,
                hours: extra,
                is_overtime: true,
                notes: e.notes ? `${e.notes} (Exceso jornada)` : 'Horas extra'
              });
            } else {
              e.is_overtime = true;
            }
            currentReg += fit;
          }
        }
      });
    }

    try {
      await window.api.batchSaveDayImputations(editingDayDate, validEntries);
      closeDayModal();
      await loadMonthData();
      renderAll();
      showAlert(`Imputaciones para el ${editingDayDate} guardadas correctamente.`, 'success');
    } catch (err) {
      showAlert('Error al guardar imputaciones del día: ' + err.message, 'danger');
    }
  }

  async function handleDeleteDayImputations() {
    if (!editingDayDate) return;
    if (confirm(`¿Estás seguro de que deseas eliminar todas las imputaciones del día ${editingDayDate}?`)) {
      try {
        await window.api.deleteDayImputations(editingDayDate);
        closeDayModal();
        await loadMonthData();
        renderAll();
        showAlert(`Imputaciones del ${editingDayDate} eliminadas.`, 'info');
      } catch (err) {
        showAlert('Error al borrar imputaciones: ' + err.message, 'danger');
      }
    }
  }

  // ===================== REPARTO DE HORAS POR PROYECTO ENTRE CÓDIGOS =====================
  function renderAllocationsSection() {
    const container = document.getElementById('allocationsContainer');
    const globalProgress = document.getElementById('allocationsGlobalProgress');

    // 1. Horas por proyecto en el calendario este mes
    const projectCalHoursMap = {};
    currentMonthImputations.forEach(imp => {
      const pid = imp.project_id;
      if (!projectCalHoursMap[pid]) {
        projectCalHoursMap[pid] = {
          total: 0,
          regular: 0,
          overtime: 0,
          projectName: imp.project_name,
          projectColor: imp.project_color || '#3b82f6'
        };
      }
      const h = Number(imp.hours || 0);
      projectCalHoursMap[pid].total += h;
      if (imp.is_overtime) projectCalHoursMap[pid].overtime += h;
      else projectCalHoursMap[pid].regular += h;
    });

    // 2. Horas por código en el calendario este mes y horas sin código
    const codeCalHoursMap = {};
    const unassignedHoursByProject = {};
    currentMonthImputations.forEach(imp => {
      if (imp.code_id) {
        codeCalHoursMap[imp.code_id] = (codeCalHoursMap[imp.code_id] || 0) + Number(imp.hours || 0);
      } else {
        unassignedHoursByProject[imp.project_id] = (unassignedHoursByProject[imp.project_id] || 0) + Number(imp.hours || 0);
      }
    });

    // 3. Asignaciones guardadas en DB
    const currentAllocMap = {};
    currentCodeAllocations.forEach(a => {
      currentAllocMap[a.code_id] = Number(a.hours || 0);
    });

    // 4. Códigos agrupados por proyecto
    const codesByProject = {};
    allImputationCodes.forEach(c => {
      if (!codesByProject[c.project_id]) codesByProject[c.project_id] = [];
      codesByProject[c.project_id].push(c);
    });

    // 5. Determinar proyectos a mostrar
    const visibleProjects = getVisibleProjects();
    const candidateProjects = visibleProjects.length > 0 ? visibleProjects : allProjects;

    const projectMapById = {};
    allProjects.forEach(p => { projectMapById[p.id] = p; });

    const targetProjectIds = new Set();
    candidateProjects.forEach(p => {
      if (p.name === 'Vacaciones y Ausencias') {
        if (projectCalHoursMap[p.id] && projectCalHoursMap[p.id].total > 0) {
          targetProjectIds.add(p.id);
        }
      } else {
        targetProjectIds.add(p.id);
      }
    });

    // Asegurar que cualquier proyecto con horas este mes se muestre
    Object.keys(projectCalHoursMap).forEach(pidStr => {
      targetProjectIds.add(Number(pidStr));
    });

    const activeProjectIds = Array.from(targetProjectIds);

    if (activeProjectIds.length === 0) {
      container.innerHTML = `
        <div class="allocations-empty">
          <p>No hay proyectos disponibles para repartir horas.</p>
          <small>Crea proyectos y códigos de imputación para autoajustar tus horas en el calendario.</small>
        </div>
      `;
      globalProgress.className = 'badge badge-secondary';
      globalProgress.textContent = '0h en el mes';
      return;
    }

    let totalMonthHours = 0;
    let totalAllocatedHours = 0;
    let totalCalHoursAll = 0;

    let html = '';

    activeProjectIds.forEach(pid => {
      const proj = projectMapById[pid] || { id: pid, name: `Proyecto #${pid}`, color: '#3b82f6' };
      const pData = projectCalHoursMap[pid] || {
        total: 0,
        regular: 0,
        overtime: 0,
        projectName: proj.name,
        projectColor: proj.color || '#3b82f6'
      };

      totalCalHoursAll += pData.total;
      const projectCodes = codesByProject[pid] || [];
      const unassignedCal = unassignedHoursByProject[pid] || 0;

      // Calcular horas asignadas para este proyecto
      let projectAllocated = 0;
      projectCodes.forEach(c => {
        const calH = codeCalHoursMap[c.id] || 0;
        const dbAllocH = currentAllocMap[c.id];
        let initialH = 0;
        if (dbAllocH !== undefined && dbAllocH !== null) {
          initialH = dbAllocH;
        } else if (calH > 0) {
          initialH = calH;
        }
        projectAllocated += initialH;
      });

      totalAllocatedHours += projectAllocated;
      totalMonthHours += (pData.total > 0 ? pData.total : projectAllocated);

      const pending = Math.round((pData.total - projectAllocated) * 100) / 100;
      let percent = 0;
      if (pData.total > 0) {
        percent = Math.min(100, Math.round((projectAllocated / pData.total) * 100));
      } else if (projectAllocated > 0) {
        percent = 100;
      }

      let statusBadgeClass = 'badge-secondary';
      let statusText = '0h asignadas';

      if (pData.total > 0) {
        if (pending === 0) {
          statusBadgeClass = 'badge-success';
          statusText = '100% Repartido';
        } else if (pending > 0) {
          statusBadgeClass = 'badge-warning';
          statusText = `${formatHours(pending)}h pendientes`;
        } else {
          statusBadgeClass = 'badge-info';
          statusText = `+${formatHours(Math.abs(pending))}h asignadas (${formatHours(projectAllocated)}h)`;
        }
      } else if (projectAllocated > 0) {
        statusBadgeClass = 'badge-info';
        statusText = `${formatHours(projectAllocated)}h planificadas`;
      }

      html += `
        <div class="allocation-project-card" data-project-id="${pid}">
          <div class="allocation-card-header" onclick="window.toggleAllocationCard(${pid})">
            <div class="allocation-header-left">
              <span class="allocation-chevron">▶</span>
              <span class="allocation-project-dot" style="background-color: ${pData.projectColor};"></span>
              <h4 class="allocation-project-title">${escapeHtml(pData.projectName)}</h4>
              <span class="allocation-total-badge" title="Horas totales imputadas en el calendario este mes">${formatHours(pData.total)}h en calendario</span>
              ${unassignedCal > 0 ? `
                <span class="badge badge-warning ml-2" title="${formatHours(unassignedCal)}h imputadas al proyecto sin código específico">${formatHours(unassignedCal)}h sin código</span>
              ` : ''}
              <span class="badge ${statusBadgeClass} ml-2" id="allocStatusBadge_${pid}">${statusText}</span>
            </div>
            <div class="allocation-header-right" onclick="event.stopPropagation();">
              <div class="allocation-mini-progress">
                <div class="allocation-mini-fill" id="allocFill_${pid}" style="width: ${percent}%;"></div>
              </div>
              <span class="allocation-percent-label" id="allocPercentLabel_${pid}">${pData.total > 0 ? percent + '%' : (projectAllocated > 0 ? formatHours(projectAllocated) + 'h' : '0%')}</span>
              <button class="btn btn-sm btn-primary btn-quick-adjust" onclick="window.autoAdjustProjectToCalendar(${pid})" title="Autoajustar los códigos de este proyecto en los huecos laborables (L-V)">
                ⚡ Autoajustar
              </button>
              <button class="btn btn-sm btn-secondary btn-quick-split" onclick="window.autoSplitEqually(${pid})" title="Repartir las horas equitativamente entre los códigos">
                Repartir Equitativo
              </button>
              <button class="btn btn-sm btn-secondary btn-quick-clear" onclick="window.clearProjectAllocations(${pid})" title="Limpiar horas asignadas o imputaciones del proyecto">
                Limpiar
              </button>
            </div>
          </div>

          <div class="allocation-card-body">
            ${projectCodes.length > 0 ? `
              <div class="allocation-codes-table">
                <div class="allocation-table-header">
                  <div class="col-code">Código de Imputación</div>
                  <div class="col-desc">Descripción</div>
                  <div class="col-calendar" title="Horas imputadas actualmente en el calendario">En Calendario</div>
                  <div class="col-hours" title="Horas asignadas para autoajustar o planificar">Horas Asignadas</div>
                  <div class="col-pct">% Proyecto</div>
                  <div class="col-action">Acciones</div>
                </div>
                <div class="allocation-table-rows">
                  ${projectCodes.map(code => {
                    const calH = codeCalHoursMap[code.id] || 0;
                    const dbAllocH = currentAllocMap[code.id];
                    let initialH = 0;
                    if (dbAllocH !== undefined && dbAllocH !== null) {
                      initialH = dbAllocH;
                    } else if (calH > 0) {
                      initialH = calH;
                    }

                    const baseTotal = pData.total > 0 ? pData.total : projectAllocated;
                    const codePct = baseTotal > 0 ? Math.round((initialH / baseTotal) * 100) : 0;
                    const isFullyInCalendar = calH > 0 && initialH > 0 && calH >= initialH;

                    return `
                      <div class="allocation-code-row" draggable="true" data-code-id="${code.id}" data-project-id="${pid}" data-code-name="${escapeHtml(code.code)}" title="Arrastra este código al calendario para imputarlo a un día">
                        <div class="col-code">
                          <span class="tree-drag-grip" title="Arrastrar al calendario">⋮⋮</span>
                          <span class="code-badge-pill">${escapeHtml(code.code)}</span>
                        </div>
                        <div class="col-desc" title="${escapeHtml(code.description || '')}">
                          ${escapeHtml(code.description || '-')}
                        </div>
                        <div class="col-calendar">
                          <span class="badge ${calH > 0 ? 'badge-primary' : 'badge-secondary'}" id="codeCalBadge_${code.id}" title="Horas en el calendario">
                            ${formatHours(calH)}h
                          </span>
                        </div>
                        <div class="col-hours">
                          <input type="number" min="0" max="744" step="0.25"
                            class="form-control code-alloc-input"
                            data-project-id="${pid}"
                            data-code-id="${code.id}"
                            value="${initialH > 0 ? initialH : ''}"
                            placeholder="0.0">
                        </div>
                        <div class="col-pct">
                          <span class="code-pct-label" id="codePct_${code.id}">${codePct}%</span>
                        </div>
                        <div class="col-action">
                          <button type="button" class="btn-code-adjust ${isFullyInCalendar ? 'btn-code-adjust--synced' : ''}"
                            onclick="window.autoAdjustCodeToCalendar(${pid}, ${code.id})"
                            title="${isFullyInCalendar ? 'Sincronizado con el calendario' : 'Autoajustar horas en los huecos laborables (L-V)'}">
                            ⚡ Autoajustar
                          </button>
                          <button type="button" class="btn-link-action"
                            onclick="window.assignRemainingToCode(${pid}, ${code.id})"
                            title="Asignar todo el tiempo pendiente del proyecto a este código">
                            Restante
                          </button>
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            ` : `
              <div class="allocation-no-codes">
                <p>Este proyecto no tiene códigos de imputación definidos.</p>
                <button class="btn btn-sm btn-primary" onclick="window.openNewCodeForProject(${pid})">+ Crear primer código para ${escapeHtml(pData.projectName)}</button>
              </div>
            `}
          </div>
        </div>
      `;
    });

    container.innerHTML = html;

    // Listeners para inputs de horas asignadas
    document.querySelectorAll('.code-alloc-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const pid = parseInt(e.target.getAttribute('data-project-id'), 10);
        const cid = parseInt(e.target.getAttribute('data-code-id'), 10);
        const val = parseFloat(e.target.value) || 0;
        updateCodeAllocationLive(pid, cid, val);
        saveAllAllocationsPeriodDebounced();
      });
      input.addEventListener('change', () => {
        saveAllAllocationsPeriodDebounced();
      });
    });

    // Listeners para drag & drop y click derecho de filas de reparto hacia el calendario
    document.querySelectorAll('.allocation-code-row').forEach(row => {
      row.addEventListener('dragstart', handleTreeCodeDragStart);
      row.addEventListener('dragend', handleTreeCodeDragEnd);
      row.addEventListener('contextmenu', (e) => {
        const cid = parseInt(row.getAttribute('data-code-id'), 10);
        const pid = parseInt(row.getAttribute('data-project-id'), 10);
        showCodeContextMenu(e, cid, pid);
      });
    });

    // Actualizar progreso global
    const baseGlobal = totalCalHoursAll > 0 ? totalCalHoursAll : totalAllocatedHours;
    const globalPct = baseGlobal > 0 ? Math.round((totalAllocatedHours / baseGlobal) * 100) : 0;
    if (totalCalHoursAll > 0 && totalAllocatedHours >= totalCalHoursAll) {
      globalProgress.className = 'badge badge-success';
      globalProgress.textContent = `${formatHours(totalAllocatedHours)}h asignadas / ${formatHours(totalCalHoursAll)}h en calendario (100%) ✓`;
    } else if (totalCalHoursAll > 0) {
      globalProgress.className = 'badge badge-info';
      globalProgress.textContent = `${formatHours(totalAllocatedHours)}h de ${formatHours(totalCalHoursAll)}h repartidas (${globalPct}%)`;
    } else {
      globalProgress.className = 'badge badge-info';
      globalProgress.textContent = `${formatHours(totalAllocatedHours)}h planificadas`;
    }
  }

  window.toggleAllocationCard = function (projectId) {
    const card = document.querySelector(`.allocation-project-card[data-project-id="${projectId}"]`);
    if (card) card.classList.toggle('expanded');
  };

  window.autoAdjustCodeToCalendar = async function (projectId, codeId) {
    const input = document.querySelector(`.code-alloc-input[data-code-id="${codeId}"]`);
    const targetHours = parseFloat(input?.value) || 0;

    if (targetHours <= 0) {
      showAlert('Introduce las horas que deseas asignar a este código antes de autoajustar.', 'warning');
      input?.focus();
      return;
    }

    const calHours = currentMonthImputations
      .filter(i => i.code_id === codeId)
      .reduce((s, i) => s + Number(i.hours || 0), 0);

    const needed = Math.round((targetHours - calHours) * 100) / 100;
    const code = allImputationCodes.find(c => c.id === codeId);
    const codeName = code ? code.code : 'código';

    if (needed <= 0) {
      showAlert(`El código "${codeName}" ya tiene ${formatHours(calHours)}h imputadas en el calendario.`, 'info');
      return;
    }

    if (!confirm(`¿Deseas autoajustar ${formatHours(needed)}h para el código "${codeName}" en los huecos laborables (L-V) de ${MONTHS_ES[currentMonth]} ${currentYear}?\n\nSe respetarán los máximos diarios (9h L-J, 7h V, y 7h L-V en julio/agosto) y los festivos.`)) {
      return;
    }

    try {
      showLoading(true);
      const res = await window.api.autoAdjustToCalendar({
        year: currentYear,
        month: currentMonth + 1,
        items: [{ project_id: projectId, code_id: codeId, target_hours: targetHours }],
        mode: 'fill_gaps'
      });
      await loadMonthData();
      renderAll();
      showLoading(false);
      showAlert(`Autoajustadas ${formatHours(res.totalAddedHours)}h para "${codeName}" en el calendario (${res.daysModifiedCount} días modificados).`, 'success');
    } catch (err) {
      showLoading(false);
      showAlert('Error al autoajustar en el calendario: ' + err.message, 'danger');
    }
  };

  window.autoAdjustProjectToCalendar = async function (projectId) {
    const inputs = document.querySelectorAll(`.code-alloc-input[data-project-id="${projectId}"]`);
    const items = [];
    inputs.forEach(inp => {
      const cid = parseInt(inp.getAttribute('data-code-id'), 10);
      const h = parseFloat(inp.value) || 0;
      if (h > 0) {
        items.push({ project_id: projectId, code_id: cid, target_hours: h });
      }
    });

    if (items.length === 0) {
      showAlert('Indica las horas en al menos un código de este proyecto antes de autoajustar.', 'warning');
      return;
    }

    const proj = allProjects.find(p => p.id === projectId);
    const projName = proj ? proj.name : 'proyecto';

    let totalNeeded = 0;
    items.forEach(it => {
      const calH = currentMonthImputations.filter(i => i.code_id === it.code_id).reduce((s, i) => s + Number(i.hours || 0), 0);
      totalNeeded += Math.max(0, it.target_hours - calH);
    });

    if (totalNeeded <= 0) {
      showAlert(`Todas las horas asignadas para "${projName}" ya están cubiertas en el calendario.`, 'info');
      return;
    }

    if (!confirm(`¿Autoajustar ${formatHours(totalNeeded)}h pendientes para el proyecto "${projName}" en los huecos laborables (L-V) de ${MONTHS_ES[currentMonth]} ${currentYear}?`)) {
      return;
    }

    try {
      showLoading(true);
      const res = await window.api.autoAdjustToCalendar({
        year: currentYear,
        month: currentMonth + 1,
        items,
        mode: 'fill_gaps'
      });
      await loadMonthData();
      renderAll();
      showLoading(false);
      showAlert(`Se han autoajustado ${formatHours(res.totalAddedHours)}h para "${projName}" en el calendario (${res.daysModifiedCount} días modificados).`, 'success');
    } catch (err) {
      showLoading(false);
      showAlert('Error al autoajustar proyecto: ' + err.message, 'danger');
    }
  };

  window.autoAdjustAllToCalendar = async function () {
    const inputs = document.querySelectorAll('.code-alloc-input');
    const items = [];
    inputs.forEach(inp => {
      const pid = parseInt(inp.getAttribute('data-project-id'), 10);
      const cid = parseInt(inp.getAttribute('data-code-id'), 10);
      const h = parseFloat(inp.value) || 0;
      if (h > 0) {
        items.push({ project_id: pid, code_id: cid, target_hours: h });
      }
    });

    if (items.length === 0) {
      showAlert('No has indicado horas en ningún código. Asigna horas a tus códigos antes de autoajustar.', 'warning');
      return;
    }

    let totalNeeded = 0;
    items.forEach(it => {
      const calH = currentMonthImputations.filter(i => i.code_id === it.code_id).reduce((s, i) => s + Number(i.hours || 0), 0);
      totalNeeded += Math.max(0, it.target_hours - calH);
    });

    if (totalNeeded <= 0) {
      showAlert('Todas las horas asignadas en los códigos ya están reflejadas en el calendario.', 'info');
      return;
    }

    if (!confirm(`¿Deseas autoajustar ${formatHours(totalNeeded)}h de todos tus códigos en los huecos laborables (L-V) del calendario para ${MONTHS_ES[currentMonth]} ${currentYear}?\n\nSe respetarán las capacidades ordinarias (9h L-J, 7h V, y 7h en verano) y los festivos.`)) {
      return;
    }

    try {
      showLoading(true);
      const res = await window.api.autoAdjustToCalendar({
        year: currentYear,
        month: currentMonth + 1,
        items,
        mode: 'fill_gaps'
      });
      await loadMonthData();
      renderAll();
      showLoading(false);
      showAlert(`Autoajuste completado con éxito: ${formatHours(res.totalAddedHours)}h repartidas en el calendario (${res.daysModifiedCount} días modificados).`, 'success');
    } catch (err) {
      showLoading(false);
      showAlert('Error al autoajustar en el calendario: ' + err.message, 'danger');
    }
  };

  window.autoSplitEqually = async function (projectId) {
    const codes = allImputationCodes.filter(c => c.project_id === projectId);
    if (codes.length === 0) {
      showAlert('Este proyecto no tiene códigos de imputación creados.', 'warning');
      return;
    }

    const projCalHours = currentMonthImputations
      .filter(i => i.project_id === projectId)
      .reduce((s, i) => s + Number(i.hours || 0), 0);

    let totalToDistribute = projCalHours;

    if (totalToDistribute <= 0) {
      const inputPrompt = await showCustomPrompt({
        title: 'Repartir Horas Equitativamente',
        message: 'Este proyecto no tiene horas imputadas en el calendario.\n\nIntroduce el total de horas que deseas repartir equitativamente entre sus códigos para este mes:',
        defaultValue: '160',
        min: '1',
        step: '1'
      });
      if (inputPrompt === null) return;
      totalToDistribute = parseFloat(inputPrompt) || 0;
      if (totalToDistribute <= 0) return;
    }

    const count = codes.length;
    const rawPerCode = totalToDistribute / count;
    const perCode = Math.round(rawPerCode * 4) / 4;
    let distributed = 0;

    codes.forEach((c, idx) => {
      const isLast = idx === count - 1;
      const h = isLast ? Math.round((totalToDistribute - distributed) * 100) / 100 : perCode;
      distributed += h;

      const input = document.querySelector(`.code-alloc-input[data-code-id="${c.id}"]`);
      if (input) input.value = h > 0 ? h : '';
    });

    recalculateProjectAllocationLive(projectId);
    saveAllAllocationsPeriodDebounced();
    showAlert(`Repartidas ${formatHours(totalToDistribute)}h equitativamente entre los ${count} códigos del proyecto.`, 'info');
  };

  window.clearProjectAllocations = async function (projectId) {
    const projCalHours = currentMonthImputations
      .filter(i => i.project_id === projectId)
      .reduce((s, i) => s + Number(i.hours || 0), 0);

    const padMonth = String(currentMonth + 1).padStart(2, '0');
    const period = `${currentYear}-${padMonth}`;

    if (projCalHours > 0) {
      const clearCalendar = confirm(`El proyecto tiene ${formatHours(projCalHours)}h imputadas en el calendario este mes.\n\n¿Deseas también BORRAR las imputaciones del calendario para este proyecto?\n- Aceptar: Borrar tanto las imputaciones del calendario como el reparto.\n- Cancelar: Poner a 0 únicamente los valores de la tabla de reparto.`);
      if (clearCalendar) {
        try {
          showLoading(true);
          await window.api.clearProjectMonthImputations(projectId, period);
          await loadMonthData();
          renderAll();
          showLoading(false);
          showAlert('Imputaciones del calendario y reparto eliminados.', 'info');
          return;
        } catch (err) {
          showLoading(false);
          showAlert('Error al limpiar imputaciones: ' + err.message, 'danger');
          return;
        }
      }
    }

    const inputs = document.querySelectorAll(`.code-alloc-input[data-project-id="${projectId}"]`);
    inputs.forEach(input => { input.value = ''; });
    recalculateProjectAllocationLive(projectId);
    saveAllAllocationsPeriodDebounced();
  };

  window.assignRemainingToCode = async function (projectId, codeId) {
    const inputs = document.querySelectorAll(`.code-alloc-input[data-project-id="${projectId}"]`);
    let currentAlloc = 0;
    let targetInput = null;

    inputs.forEach(input => {
      const cid = parseInt(input.getAttribute('data-code-id'), 10);
      if (cid === codeId) {
        targetInput = input;
      } else {
        currentAlloc += (parseFloat(input.value) || 0);
      }
    });

    const projectTotal = currentMonthImputations
      .filter(i => i.project_id === projectId)
      .reduce((s, i) => s + Number(i.hours || 0), 0);

    let baseTarget = projectTotal;
    if (baseTarget <= 0) {
      const promptVal = await showCustomPrompt({
        title: 'Asignar Restante a Código',
        message: 'Introduce el total de horas del proyecto para este mes:',
        defaultValue: '160',
        min: '1',
        step: '1'
      });
      if (promptVal === null) return;
      baseTarget = parseFloat(promptVal) || 0;
    }

    const remaining = Math.max(0, Math.round((baseTarget - currentAlloc) * 100) / 100);
    if (targetInput) {
      targetInput.value = remaining > 0 ? remaining : '';
      recalculateProjectAllocationLive(projectId);
      saveAllAllocationsPeriodDebounced();
    }
  };

  function updateCodeAllocationLive(projectId, codeId, newHours) {
    recalculateProjectAllocationLive(projectId);
  }

  function recalculateProjectAllocationLive(projectId) {
    const inputs = document.querySelectorAll(`.code-alloc-input[data-project-id="${projectId}"]`);
    const projectTotal = currentMonthImputations
      .filter(i => i.project_id === projectId)
      .reduce((s, i) => s + Number(i.hours || 0), 0);

    let sum = 0;
    inputs.forEach(input => {
      const cid = parseInt(input.getAttribute('data-code-id'), 10);
      const h = parseFloat(input.value) || 0;
      sum += h;
      const base = projectTotal > 0 ? projectTotal : sum;
      const pctLabel = document.getElementById(`codePct_${cid}`);
      if (pctLabel) {
        const pct = base > 0 ? Math.round((h / base) * 100) : 0;
        pctLabel.textContent = `${pct}%`;
      }
    });

    const fillEl = document.getElementById(`allocFill_${projectId}`);
    const percentLabelEl = document.getElementById(`allocPercentLabel_${projectId}`);
    const badgeEl = document.getElementById(`allocStatusBadge_${projectId}`);

    if (projectTotal > 0) {
      const pending = Math.round((projectTotal - sum) * 100) / 100;
      const percent = Math.min(100, Math.round((sum / projectTotal) * 100));

      if (fillEl) fillEl.style.width = `${percent}%`;
      if (percentLabelEl) percentLabelEl.textContent = `${percent}%`;

      if (badgeEl) {
        if (pending === 0) {
          badgeEl.className = 'badge badge-success ml-2';
          badgeEl.textContent = '100% Repartido';
        } else if (pending < 0) {
          badgeEl.className = 'badge badge-danger ml-2';
          badgeEl.textContent = `Excedido en ${formatHours(Math.abs(pending))}h`;
        } else {
          badgeEl.className = 'badge badge-warning ml-2';
          badgeEl.textContent = `${formatHours(pending)}h pendientes`;
        }
      }
    } else {
      if (fillEl) fillEl.style.width = sum > 0 ? '100%' : '0%';
      if (percentLabelEl) percentLabelEl.textContent = sum > 0 ? `${formatHours(sum)}h` : '0%';
      if (badgeEl) {
        if (sum > 0) {
          badgeEl.className = 'badge badge-info ml-2';
          badgeEl.textContent = `${formatHours(sum)}h planificadas`;
        } else {
          badgeEl.className = 'badge badge-secondary ml-2';
          badgeEl.textContent = '0h asignadas';
        }
      }
    }

    updateAllocatedKpiOnly();
  }

  let saveAllocationsTimeout = null;
  function saveAllAllocationsPeriodDebounced() {
    clearTimeout(saveAllocationsTimeout);
    saveAllocationsTimeout = setTimeout(saveAllAllocationsPeriod, 500);
  }

  async function saveAllAllocationsPeriod() {
    const padMonth = String(currentMonth + 1).padStart(2, '0');
    const period = `${currentYear}-${padMonth}`;

    const allocationsToSave = [];
    document.querySelectorAll('.code-alloc-input').forEach(input => {
      const pid = parseInt(input.getAttribute('data-project-id'), 10);
      const cid = parseInt(input.getAttribute('data-code-id'), 10);
      const h = parseFloat(input.value) || 0;
      allocationsToSave.push({
        project_id: pid,
        code_id: cid,
        hours: h
      });
    });

    try {
      if (window.api && window.api.batchSaveCodeAllocations) {
        await window.api.batchSaveCodeAllocations(period, allocationsToSave);
        currentCodeAllocations = await window.api.getCodeAllocations(period);
        renderProjectsTree();
        renderMonthlySummaryAndCharts();
      }
    } catch (err) {
      console.error('Error al guardar asignaciones de códigos:', err);
    }
  }

  function updateAllocatedKpiOnly() {
    let sum = 0;
    document.querySelectorAll('.code-alloc-input').forEach(i => {
      sum += (parseFloat(i.value) || 0);
    });
    const totalMonthHours = currentMonthImputations.reduce((s, i) => s + Number(i.hours || 0), 0);
    const base = totalMonthHours > 0 ? totalMonthHours : sum;
    const pct = base > 0 ? Math.round((sum / base) * 100) : 0;

    const kpiAllocatedPercent = document.getElementById('kpiAllocatedPercent');
    const kpiAllocatedHours = document.getElementById('kpiAllocatedHours');
    if (kpiAllocatedPercent) kpiAllocatedPercent.textContent = `${pct}%`;
    if (kpiAllocatedHours) {
      if (totalMonthHours > 0) {
        kpiAllocatedHours.textContent = `${formatHours(sum)}h de ${formatHours(totalMonthHours)}h`;
      } else {
        kpiAllocatedHours.textContent = `${formatHours(sum)}h planificadas`;
      }
    }

    const globalProgress = document.getElementById('allocationsGlobalProgress');
    if (globalProgress) {
      if (totalMonthHours > 0 && sum >= totalMonthHours) {
        globalProgress.className = 'badge badge-success';
        globalProgress.textContent = `${formatHours(sum)}h de ${formatHours(totalMonthHours)}h repartidas (100%) ✓`;
      } else if (totalMonthHours > 0) {
        globalProgress.className = 'badge badge-info';
        globalProgress.textContent = `${formatHours(sum)}h de ${formatHours(totalMonthHours)}h repartidas (${pct}%)`;
      } else {
        globalProgress.className = 'badge badge-info';
        globalProgress.textContent = `${formatHours(sum)}h planificadas`;
      }
    }
  }

  // ===================== RESUMEN MENSUAL Y GRÁFICAS =====================
  function renderMonthlySummaryAndCharts() {
    let totalHours = 0;
    let regularHours = 0;
    let overtimeHours = 0;

    const daysWithHours = new Set();
    const daysWithOvertime = new Set();
    const hoursByProject = {};

    currentMonthImputations.forEach(i => {
      const h = Number(i.hours || 0);
      totalHours += h;
      daysWithHours.add(i.date);

      if (i.is_overtime) {
        overtimeHours += h;
        daysWithOvertime.add(i.date);
      } else {
        regularHours += h;
      }

      if (!hoursByProject[i.project_id]) {
        hoursByProject[i.project_id] = {
          name: i.project_name || 'Sin nombre',
          color: i.project_color || '#3b82f6',
          hours: 0
        };
      }
      hoursByProject[i.project_id].hours += h;
    });

    // Calcular días laborables teóricos y horas teóricas del mes
    // Considerando que Julio y Agosto son de 7h/día, y que los festivos son no laborables (0h)
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    let theoreticalWorkDays = 0;
    let theoreticalHours = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${currentYear}-${pad(currentMonth + 1)}-${pad(day)}`;
      const rule = getDailyCapacityRule(dateStr);
      if (!rule.isWeekend && !rule.isHoliday) {
        theoreticalWorkDays++;
        theoreticalHours += rule.maxRegularHours; // 7h en verano/viernes, 9h L-J ordinario
      }
    }

    const avgHoursPerDay = daysWithHours.size > 0 ? (totalHours / daysWithHours.size).toFixed(1) : '0.0';

    let totalAllocatedHours = 0;
    currentCodeAllocations.forEach(a => {
      totalAllocatedHours += (a.hours || 0);
    });
    const allocatedPct = totalHours > 0 ? Math.round((totalAllocatedHours / totalHours) * 100) : 0;

    document.getElementById('kpiTotalHours').innerHTML = `${formatHours(totalHours)} <small>h</small>`;
    document.getElementById('kpiHoursBreakdown').textContent = `${formatHours(regularHours)}h ord · ${formatHours(overtimeHours)}h ext`;

    document.getElementById('kpiRegularHours').innerHTML = `${formatHours(regularHours)} <small>h</small>`;
    document.getElementById('kpiTheoreticalComparison').textContent = `de ${formatHours(theoreticalHours)}h esperadas`;

    document.getElementById('kpiOvertimeHours').innerHTML = `${formatHours(overtimeHours)} <small>h</small>`;
    document.getElementById('kpiOvertimeDays').textContent = `en ${daysWithOvertime.size} ${daysWithOvertime.size === 1 ? 'día' : 'días'}`;

    document.getElementById('kpiDaysWorked').textContent = daysWithHours.size;
    document.getElementById('kpiDaysTheoretical').textContent = `de ${theoreticalWorkDays} laborables`;

    document.getElementById('kpiAvgHours').innerHTML = `${avgHoursPerDay} <small>h/d</small>`;

    document.getElementById('kpiAllocatedPercent').textContent = `${allocatedPct}%`;
    document.getElementById('kpiAllocatedHours').textContent = `${formatHours(totalAllocatedHours)}h de ${formatHours(totalHours)}h`;

    renderProjectDonutChart(hoursByProject, totalHours);
    renderDailyEvolutionBarChart(daysInMonth, theoreticalHours);
    renderCodeHorizontalBarChart();
  }

  // GRÁFICA 1: DONUT CHART (HORAS POR PROYECTO)
  function renderProjectDonutChart(hoursByProject, totalHours) {
    const container = document.getElementById('projectDonutChartContainer');
    const items = Object.values(hoursByProject).filter(item => item.hours > 0);

    if (items.length === 0 || totalHours === 0) {
      container.innerHTML = `
        <div class="chart-empty-state">
          <span>Sin datos de proyectos este mes</span>
        </div>
      `;
      return;
    }

    items.sort((a, b) => b.hours - a.hours);

    const size = 220;
    const strokeWidth = 32;
    const radius = (size - strokeWidth) / 2;
    const center = size / 2;
    const circumference = 2 * Math.PI * radius;

    let accumulatedAngle = 0;
    let svgPaths = '';

    items.forEach((item) => {
      const pct = item.hours / totalHours;
      const strokeDash = pct * circumference;
      const strokeGap = circumference - strokeDash;
      const rotation = (accumulatedAngle * 360) - 90;

      svgPaths += `
        <circle
          cx="${center}"
          cy="${center}"
          r="${radius}"
          fill="transparent"
          stroke="${item.color}"
          stroke-width="${strokeWidth}"
          stroke-dasharray="${strokeDash} ${strokeGap}"
          transform="rotate(${rotation} ${center} ${center})"
          class="donut-segment"
          data-project="${escapeHtml(item.name)}"
          data-hours="${formatHours(item.hours)}"
          data-pct="${Math.round(pct * 100)}"
        />
      `;
      accumulatedAngle += pct;
    });

    const legendHtml = items.map(item => {
      const pct = Math.round((item.hours / totalHours) * 100);
      return `
        <div class="chart-legend-item" title="${escapeHtml(item.name)}: ${formatHours(item.hours)}h (${pct}%)">
          <span class="legend-color-dot" style="background-color: ${item.color};"></span>
          <span class="legend-label">${escapeHtml(item.name)}</span>
          <span class="legend-value">${formatHours(item.hours)}h</span>
          <span class="legend-pct">${pct}%</span>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="donut-chart-layout">
        <div class="donut-svg-wrapper">
          <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="donut-svg">
            ${svgPaths}
            <circle cx="${center}" cy="${center}" r="${radius - strokeWidth / 2 - 2}" fill="var(--bg-secondary)" />
            <text x="${center}" y="${center - 6}" text-anchor="middle" class="donut-center-total">${formatHours(totalHours)}h</text>
            <text x="${center}" y="${center + 14}" text-anchor="middle" class="donut-center-sub">TOTAL</text>
          </svg>
        </div>
        <div class="chart-legend-container">
          ${legendHtml}
        </div>
      </div>
    `;

    container.querySelectorAll('.donut-segment').forEach(seg => {
      seg.addEventListener('mouseenter', (e) => {
        const pName = e.target.getAttribute('data-project');
        const h = e.target.getAttribute('data-hours');
        const pct = e.target.getAttribute('data-pct');
        const centerTotal = container.querySelector('.donut-center-total');
        const centerSub = container.querySelector('.donut-center-sub');
        if (centerTotal && centerSub) {
          centerTotal.textContent = `${h}h`;
          centerSub.textContent = `${pct}% ${pName}`.substring(0, 15);
        }
      });
      seg.addEventListener('mouseleave', () => {
        const centerTotal = container.querySelector('.donut-center-total');
        const centerSub = container.querySelector('.donut-center-sub');
        if (centerTotal && centerSub) {
          centerTotal.textContent = `${formatHours(totalHours)}h`;
          centerSub.textContent = 'TOTAL';
        }
      });
    });
  }

  // GRÁFICA 2: BARRAS DIARIAS (ORDINARIAS VS EXTRA) CON LÍNEA DE JORNADA
  function renderDailyEvolutionBarChart(daysInMonth) {
    const container = document.getElementById('dailyBarChartContainer');

    const dailyData = {};
    for (let d = 1; d <= daysInMonth; d++) {
      dailyData[d] = { regular: 0, overtime: 0, total: 0 };
    }

    currentMonthImputations.forEach(i => {
      const parts = i.date.split('-');
      const d = parseInt(parts[2], 10);
      if (dailyData[d]) {
        const h = Number(i.hours || 0);
        if (i.is_overtime) dailyData[d].overtime += h;
        else dailyData[d].regular += h;
        dailyData[d].total += h;
      }
    });

    const isSummerMonth = (currentMonth === 6 || currentMonth === 7);

    let maxVal = 10;
    for (let d = 1; d <= daysInMonth; d++) {
      if (dailyData[d].total > maxVal) maxVal = Math.ceil(dailyData[d].total);
    }

    const colWidth = 100 / daysInMonth;

    let barsHtml = '';
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${currentYear}-${pad(currentMonth + 1)}-${pad(day)}`;
      const rule = getDailyCapacityRule(dateStr);
      const data = dailyData[day];

      const regHeightPct = (data.regular / maxVal) * 100;
      const extraHeightPct = (data.overtime / maxVal) * 100;
      const targetHeightPct = (rule.maxRegularHours / maxVal) * 100;

      const isCurrentDay = dateStr === toISODateLocal(new Date());

      barsHtml += `
        <div class="daily-bar-column ${rule.isWeekend ? 'is-weekend' : ''} ${rule.isHoliday ? 'is-holiday' : ''} ${isCurrentDay ? 'is-today' : ''}" style="width: ${colWidth}%;" title="${day} ${MONTHS_ES[currentMonth]}: ${formatHours(data.regular)}h ord + ${formatHours(data.overtime)}h ext (${rule.label})">
          <div class="daily-bar-track">
            ${!rule.isWeekend && !rule.isHoliday ? `<div class="daily-target-marker" style="bottom: ${targetHeightPct}%;"></div>` : ''}
            <div class="daily-bar-stack">
              ${data.overtime > 0 ? `<div class="bar-segment bar-segment--extra" style="height: ${extraHeightPct}%;"></div>` : ''}
              ${data.regular > 0 ? `<div class="bar-segment bar-segment--regular" style="height: ${regHeightPct}%;"></div>` : ''}
            </div>
          </div>
          <span class="daily-bar-label">${day % 2 !== 0 || daysInMonth <= 15 ? day : ''}</span>
        </div>
      `;
    }

    container.innerHTML = `
      <div class="daily-chart-layout">
        <div class="daily-chart-y-axis">
          <span>${maxVal}h</span>
          <span>${Math.round(maxVal / 2)}h</span>
          <span>0h</span>
        </div>
        <div class="daily-chart-bars-area">
          ${!isSummerMonth ? `
            <div class="daily-chart-guide-line" style="bottom: ${(9 / maxVal) * 100}%;" title="Límite 9h (L-J)">
              <span class="guide-line-tag">9h</span>
            </div>
          ` : ''}
          <div class="daily-chart-guide-line daily-chart-guide-line--friday" style="bottom: ${(7 / maxVal) * 100}%;" title="${isSummerMonth ? 'Límite 7h (Verano L-V)' : 'Límite 7h (V)'}">
            <span class="guide-line-tag">7h</span>
          </div>
          ${barsHtml}
        </div>
      </div>
      <div class="daily-chart-legend">
        <span class="legend-chip"><span class="legend-color-dot" style="background:#3b82f6;"></span> Ordinarias</span>
        <span class="legend-chip"><span class="legend-color-dot" style="background:#f59e0b;"></span> Horas Extra</span>
        <span class="legend-chip"><span class="legend-line-dot"></span> Límite jornada (${isSummerMonth ? '7h verano' : '9h / 7h'})</span>
      </div>
    `;
  }

  // GRÁFICA 3: BARRAS HORIZONTALES POR CÓDIGO DE IMPUTACIÓN
  function renderCodeHorizontalBarChart() {
    const container = document.getElementById('codeHorizontalBarChartContainer');

    const codeTotals = {};
    currentCodeAllocations.forEach(a => {
      const cid = a.code_id;
      if (!codeTotals[cid]) {
        codeTotals[cid] = {
          code: a.code_name || 'Sin código',
          description: a.code_description || '',
          projectName: a.project_name || '',
          projectColor: a.project_color || '#3b82f6',
          hours: 0
        };
      }
      codeTotals[cid].hours += Number(a.hours || 0);
    });

    const items = Object.values(codeTotals).filter(i => i.hours > 0);

    if (items.length === 0) {
      container.innerHTML = `
        <div class="chart-empty-state">
          <span>Aún no hay horas repartidas entre los códigos de imputación este mes.</span>
        </div>
      `;
      return;
    }

    items.sort((a, b) => b.hours - a.hours);
    const maxCodeHours = items[0].hours;
    const totalAllocated = items.reduce((s, i) => s + i.hours, 0);

    const rowsHtml = items.map(item => {
      const pctOfMax = (item.hours / maxCodeHours) * 100;
      const pctOfTotal = Math.round((item.hours / totalAllocated) * 100);
      return `
        <div class="code-h-bar-row">
          <div class="code-h-bar-info">
            <span class="code-pill-small">${escapeHtml(item.code)}</span>
            <span class="code-project-sub" style="color: ${item.projectColor};">${escapeHtml(item.projectName)}</span>
            ${item.description ? `<span class="code-desc-sub" title="${escapeHtml(item.description)}">${escapeHtml(item.description)}</span>` : ''}
          </div>
          <div class="code-h-bar-track-wrapper">
            <div class="code-h-bar-track">
              <div class="code-h-bar-fill" style="width: ${pctOfMax}%; background-color: ${item.projectColor};"></div>
            </div>
            <span class="code-h-bar-value">${formatHours(item.hours)}h <small>(${pctOfTotal}%)</small></span>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="code-h-bars-list">
        ${rowsHtml}
      </div>
    `;
  }

  // ===================== EXPORTACIÓN Y COPIA =====================
  function handleCopySummary() {
    const padMonth = String(currentMonth + 1).padStart(2, '0');
    const monthName = MONTHS_ES[currentMonth];
    let txt = `RESUMEN DE IMPUTACIONES - ${monthName.toUpperCase()} ${currentYear}\n`;
    txt += `=================================================\n\n`;

    const projectTotals = {};
    let grandTotal = 0;
    let regularTotal = 0;
    let overtimeTotal = 0;

    currentMonthImputations.forEach(i => {
      const pid = i.project_id;
      if (!projectTotals[pid]) {
        projectTotals[pid] = { name: i.project_name, hours: 0, regular: 0, overtime: 0 };
      }
      const h = Number(i.hours || 0);
      grandTotal += h;
      projectTotals[pid].hours += h;
      if (i.is_overtime) {
        overtimeTotal += h;
        projectTotals[pid].overtime += h;
      } else {
        regularTotal += h;
        projectTotals[pid].regular += h;
      }
    });

    txt += `TOTAL HORAS DEL MES: ${formatHours(grandTotal)}h\n`;
    txt += `  - Horas Ordinarias: ${formatHours(regularTotal)}h\n`;
    txt += `  - Horas Extraordinarias: ${formatHours(overtimeTotal)}h\n\n`;

    txt += `DESGLOSE POR PROYECTOS:\n`;
    Object.values(projectTotals).forEach(p => {
      txt += `  * ${p.name}: ${formatHours(p.hours)}h (Ord: ${formatHours(p.regular)}h | Extra: ${formatHours(p.overtime)}h)\n`;
    });

    if (currentCodeAllocations.length > 0) {
      txt += `\nREPARTO POR CÓDIGOS DE IMPUTACIÓN:\n`;
      currentCodeAllocations.filter(a => a.hours > 0).forEach(a => {
        txt += `  * [${a.code_name}] ${a.project_name}: ${formatHours(a.hours)}h ${a.code_description ? `(${a.code_description})` : ''}\n`;
      });
    }

    if (currentAnnualLeaveBalance) {
      const b = currentAnnualLeaveBalance;
      txt += `\nESTADO DE VACACIONES Y LIBRE DISPOSICIÓN (${currentYear}):\n`;
      txt += `  * Vacaciones Año Anterior: ${b.remaining.vacation_previous} días restantes (Caducidad: 31 Mar ${currentYear})\n`;
      txt += `  * Vacaciones Año Actual: ${b.remaining.vacation_current} días restantes (Disfrutables hasta: 31 Mar ${currentYear + 1})\n`;
      txt += `  * Libre Disposición: ${b.remaining.personal_hours} horas restantes (Caducidad: 31 Dic ${currentYear})\n`;
    }

    if (window.api && window.api.copyToClipboard) {
      window.api.copyToClipboard(txt);
      showAlert('Resumen mensual copiado al portapapeles con éxito.', 'success');
    }
  }

  function handleExportCsv() {
    const padMonth = String(currentMonth + 1).padStart(2, '0');
    let csv = '\uFEFF';
    csv += 'Fecha;Proyecto;Codigo_Imputacion;Tipo;Horas;Notas\n';

    currentMonthImputations.forEach(i => {
      const tipo = i.is_overtime ? 'Extra' : 'Ordinaria';
      const notesClean = (i.notes || '').replace(/;/g, ',').replace(/\n/g, ' ');
      csv += `${i.date};"${i.project_name}";"${i.code_name || ''}";${tipo};${String(i.hours).replace('.', ',')};"${notesClean}"\n`;
    });

    csv += '\n\nPeriodo;Proyecto;Codigo_Imputacion;Descripcion;Horas_Asignadas\n';
    currentCodeAllocations.forEach(a => {
      const descClean = (a.code_description || '').replace(/;/g, ',').replace(/\n/g, ' ');
      csv += `${a.period};"${a.project_name}";"${a.code_name}";"${descClean}";${String(a.hours).replace('.', ',')}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `imputaciones-${currentYear}-${padMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showAlert('Fichero CSV descargado con éxito.', 'success');
  }

  // ===================== HELPERS / UTILIDADES =====================
  function showAlert(msg, type = 'info') {
    const alertEl = document.getElementById('imputationAlert');
    if (!alertEl) return;
    alertEl.className = `imputation-alert imputation-alert--${type}`;
    alertEl.innerHTML = msg;
    alertEl.style.display = 'block';
    if (alertEl._timeout) clearTimeout(alertEl._timeout);
    alertEl._timeout = setTimeout(() => {
      if (alertEl) alertEl.style.display = 'none';
    }, 4500);
  }

  function showLoading(show) {
    const tree = document.getElementById('projectsTreeContainer');
    if (show && tree && tree.children.length === 0) {
      tree.innerHTML = '<div class="tree-loading">Cargando...</div>';
    }
  }

  function formatHours(h) {
    if (typeof h !== 'number' || isNaN(h)) return '0.0';
    return Number.isInteger(h) ? h.toFixed(1) : String(Math.round(h * 100) / 100);
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function toISODateLocal(date) {
    const y = date.getFullYear();
    const m = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    return `${y}-${m}-${d}`;
  }

  function parseISODateLocal(dateStr) {
    const parts = dateStr.split('-');
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  window.resetProjectFilter = resetProjectFilter;
})();
