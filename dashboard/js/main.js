// ==========================================================================
// Certoma Dashboard - Main JavaScript
// ==========================================================================

// Global state
let currentYear = new Date().getFullYear();
let currentSection = 'all';
let employeesData = [];
let ofsData = [];
let costsData = [];
let monthlyData = [];

// Section constants
const SECTION_COLORS = {
    'Acabamento': '#E6692D',
    'Estofagem': '#2c3e50',
    'Pintura': '#28a745',
    'Preparação': '#17a2b8',
    'Montagem': '#ffc107'
};

const SECTION_HOUR_KEYS = {
    'Acabamento': 'acabamentoHours',
    'Estofagem': 'estofagemHours',
    'Pintura': 'pinturaHours',
    'Preparação': 'preparacaoHours',
    'Montagem': 'montagemHours'
};

const SECTION_SHORT_NAMES = {
    'Acabamento': 'Acab.',
    'Estofagem': 'Estof.',
    'Pintura': 'Pint.',
    'Preparação': 'Prep.',
    'Montagem': 'Mont.'
};

const SECTION_CSS_CLASSES = {
    'Acabamento': 'acabamento',
    'Estofagem': 'estofagem',
    'Pintura': 'pintura',
    'Preparação': 'preparacao',
    'Montagem': 'montagem'
};

// ==========================================================================
// Initialization
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
    Auth.init();

    // Check URL params for Deep Linking
    const params = new URLSearchParams(window.location.search);
    if (params.has('of')) {
        window.pendingDeepLink = { type: 'of', id: params.get('of') };
    } else if (params.has('employee')) {
        window.pendingDeepLink = { type: 'employee', id: params.get('employee') };
    } else if (params.has('view')) {
        window.pendingDeepLink = { type: 'view', id: params.get('view') };
    }
});

window.loadDashboard = async () => {
    // Set date
    document.getElementById('current-date').textContent = new Date().toLocaleDateString('pt-PT', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    // Populate year selector dynamically
    const yearSelect = document.getElementById('year-selector');
    const thisYear = new Date().getFullYear();
    yearSelect.innerHTML = '';
    for (let y = thisYear; y >= 2024; y--) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        if (y === thisYear) opt.selected = true;
        yearSelect.appendChild(opt);
    }
    currentYear = thisYear;

    // Setup navigation
    setupNavigation();

    // Setup controls
    setupControls();

    // Handle deep links if any
    if (window.pendingDeepLink) {
        if (window.pendingDeepLink.type === 'of') {
            await showOFDetail(window.pendingDeepLink.id);
        } else if (window.pendingDeepLink.type === 'employee') {
            await showEmployeeDetail(window.pendingDeepLink.id);
        } else if (window.pendingDeepLink.type === 'view') {
            switchView(window.pendingDeepLink.id);
        }
        window.pendingDeepLink = null;
    } else {
        // Load default view
        await loadAllData();
    }

    // Start polling active workers
    setInterval(renderActiveWorkers, 30000);
};

// ==========================================================================
// Navigation
// ==========================================================================

function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const view = item.dataset.view;
            switchView(view);

            // Update URL
            const url = new URL(window.location);
            url.searchParams.delete('of');
            url.searchParams.delete('employee');
            if (view !== 'overview') {
                url.searchParams.set('view', view);
            } else {
                url.searchParams.delete('view');
            }
            window.history.pushState({}, '', url);
        });
    });

    // Back button
    document.getElementById('back-to-main').addEventListener('click', () => {
        switchView('overview');
        const url = new URL(window.location);
        url.searchParams.delete('of');
        url.searchParams.delete('employee');
        window.history.pushState({}, '', url);
    });
}

function switchView(viewName) {
    // Hide all views
    document.querySelectorAll('.view-section').forEach(el => {
        el.classList.remove('active');
    });

    // Show target view
    const targetView = document.getElementById(`view-${viewName}`);
    if (targetView) {
        targetView.classList.add('active');
    }

    // Update nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.view === viewName) {
            item.classList.add('active');
        }
    });

    // Update page title
    const titles = {
        'overview': 'Visão Geral',
        'employees': 'Funcionários',
        'ofs': 'Ordens de Fabrico',
        'costs': 'Gestão de Custos',
        'detail': 'Detalhe'
    };
    document.getElementById('page-title').textContent = titles[viewName] || 'Dashboard';

    // Load view-specific data if needed
    if (viewName === 'employees' && employeesData.length === 0) {
        loadEmployeesView();
    } else if (viewName === 'ofs' && ofsData.length === 0) {
        loadOFsView();
    } else if (viewName === 'costs') {
        loadCostsView();
    } else if (viewName === 'employees') {
        renderEmployeesGrid(employeesData);
    } else if (viewName === 'ofs') {
        renderOFsTable(ofsData);
    }
}

// ==========================================================================
// Controls
// ==========================================================================

function setupControls() {
    // Year selector
    document.getElementById('year-selector').addEventListener('change', async (e) => {
        currentYear = parseInt(e.target.value);
        await loadAllData();
    });

    // Section filter
    document.getElementById('section-filter').addEventListener('change', (e) => {
        currentSection = e.target.value;
        if (employeesData.length > 0) {
            renderEmployeesGrid(filterBySection(employeesData));
            DashboardCharts.renderEmployeePerformance('chartEmployeePerformance', filterBySection(employeesData));
        }
        if (ofsData.length > 0) {
            const filteredOFs = currentSection === 'all'
                ? ofsData
                : ofsData.filter(of => (of[SECTION_HOUR_KEYS[currentSection]] || 0) > 0);
            renderOFsTable(filteredOFs);
        }
    });

    // Search inputs
    document.getElementById('employee-search')?.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = employeesData.filter(emp => emp.name.toLowerCase().includes(query));
        renderEmployeesGrid(filtered);
    });

    document.getElementById('of-search')?.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = ofsData.filter(of => String(of.of).includes(query));
        renderOFsTable(filtered);
    });

    // Add cost button
    document.getElementById('btn-add-cost').addEventListener('click', () => {
        showAddCostModal();
    });
}

function filterBySection(data) {
    if (currentSection === 'all') return data;
    return data.filter(item => item.section && item.section[currentSection] > 0);
}

// ==========================================================================
// Data Loading
// ==========================================================================

async function loadAllData() {
    try {
        // Load all data in parallel
        const [employeesRes, ofsRes, costsRes] = await Promise.all([
            API.getEmployees(currentYear),
            API.getOFs(currentYear),
            API.getCosts()
        ]);

        employeesData = employeesRes.data || [];
        ofsData = ofsRes.data || [];
        costsData = costsRes.data || [];
        monthlyData = employeesRes.monthly || [];

        // Update summary stats
        updateSummaryStats();

        // Render charts
        hideLoading('loading-employee');
        hideLoading('loading-of');
        hideLoading('loading-monthly');

        DashboardCharts.renderEmployeePerformance('chartEmployeePerformance', employeesData);
        DashboardCharts.renderOFProgress('chartOFProgress', ofsData);
        DashboardCharts.renderMonthlyTrend('chartMonthlyTrend', monthlyData);

        // Render active workers
        await renderActiveWorkers();

        // Render views if already showing
        const activeView = document.querySelector('.view-section.active');
        if (activeView?.id === 'view-employees') {
            renderEmployeesGrid(employeesData);
        } else if (activeView?.id === 'view-ofs') {
            renderOFsTable(ofsData);
        } else if (activeView?.id === 'view-costs') {
            renderCostsTable();
        }

    } catch (e) {
        console.error('Failed to load data:', e);
        showToast('Erro ao carregar dados: ' + e.message, 'error');
    }
}

function updateSummaryStats() {
    const totalHours = employeesData.reduce((acc, emp) => acc + (emp.hours || 0), 0);
    const activeEmployees = employeesData.filter(emp => (emp.hours || 0) > 0).length;
    const totalOFs = ofsData.length;

    // Find most active section
    const sectionTotals = {};
    employeesData.forEach(emp => {
        if (emp.section) {
            Object.keys(emp.section).forEach(sec => {
                sectionTotals[sec] = (sectionTotals[sec] || 0) + (emp.section[sec] || 0);
            });
        }
    });
    let mostActiveSection = '-';
    let maxSectionHours = 0;
    Object.keys(sectionTotals).forEach(sec => {
        if (sectionTotals[sec] > maxSectionHours) {
            maxSectionHours = sectionTotals[sec];
            mostActiveSection = sec;
        }
    });

    // Calculate total cost
    let totalCost = 0;
    employeesData.forEach(emp => {
        const costEntry = costsData.find(c => c.name.toLowerCase() === emp.name.toLowerCase());
        if (costEntry) {
            totalCost += emp.hours * costEntry.cost;
        }
    });

    // Update DOM
    document.getElementById('stat-total-hours').textContent = Math.round(totalHours).toLocaleString('pt-PT');
    document.getElementById('stat-active-employees').textContent = activeEmployees;
    document.getElementById('stat-total-ofs').textContent = totalOFs;
    const mostActiveSectionEl = document.getElementById('stat-most-active-section');
    if (mostActiveSection !== '-') {
        mostActiveSectionEl.innerHTML = `${mostActiveSection}<span class="unit">${Math.round(maxSectionHours)}h</span>`;
    } else {
        mostActiveSectionEl.textContent = '-';
    }
    document.getElementById('stat-total-cost').innerHTML = `${Math.round(totalCost).toLocaleString('pt-PT')}<span class="unit">€</span>`;
}

// ==========================================================================
// Active Workers
// ==========================================================================

async function renderActiveWorkers() {
    try {
        const res = await API.getSummary();
        const container = document.getElementById('active-workers-list');
        const lastUpdated = document.getElementById('last-updated');

        lastUpdated.textContent = 'Atualizado: ' + new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });

        const acabamento = res.activeWorkers?.acabamento || [];
        const estofagem = res.activeWorkers?.estofagem || [];
        const pintura = res.activeWorkers?.pintura || [];
        const preparacao = res.activeWorkers?.preparacao || [];
        const montagem = res.activeWorkers?.montagem || [];

        if (
            acabamento.length === 0
            && estofagem.length === 0
            && pintura.length === 0
            && preparacao.length === 0
            && montagem.length === 0
        ) {
            container.innerHTML = `
                <div style="color: var(--text-light); margin: auto; text-align: center; padding: 20px;">
                    <p style="font-size: 1.2em; margin-bottom: 5px;">😴</p>
                    <p>Sem trabalhadores ativos no momento</p>
                </div>
            `;
            return;
        }

        let html = '';

        acabamento.forEach(w => {
            const elapsed = getElapsedTime(w.start);
            html += `
                <div class="worker-badge acabamento" onclick="showEmployeeDetail('${w.funcionario}')">
                    <div class="worker-info">
                        <strong>${w.funcionario}</strong>
                        <span>Acabamento • OF ${w.of || 'Geral'}</span>
                        <span class="worker-time">⏱ ${elapsed}</span>
                    </div>
                </div>
            `;
        });

        estofagem.forEach(w => {
            const elapsed = getElapsedTime(w.start);
            html += `
                <div class="worker-badge estofagem" onclick="showEmployeeDetail('${w.funcionario}')">
                    <div class="worker-info">
                        <strong>${w.funcionario}</strong>
                        <span>Estofagem • OF ${w.of || 'Geral'}</span>
                        <span class="worker-time" style="color: var(--info);">⏱ ${elapsed}</span>
                    </div>
                </div>
            `;
        });

        pintura.forEach(w => {
            const elapsed = getElapsedTime(w.start);
            html += `
                <div class="worker-badge pintura" onclick="showEmployeeDetail('${w.funcionario}')">
                    <div class="worker-info">
                        <strong>${w.funcionario}</strong>
                        <span>Pintura • OF ${w.of || 'Geral'}</span>
                        <span class="worker-time">⏱ ${elapsed}</span>
                    </div>
                </div>
            `;
        });

        preparacao.forEach(w => {
            const elapsed = getElapsedTime(w.start);
            html += `
                <div class="worker-badge preparacao" onclick="showEmployeeDetail('${w.funcionario}')">
                    <div class="worker-info">
                        <strong>${w.funcionario}</strong>
                        <span>Preparação • OF ${w.of || 'Geral'}</span>
                        <span class="worker-time">⏱ ${elapsed}</span>
                    </div>
                </div>
            `;
        });

        montagem.forEach(w => {
            const elapsed = getElapsedTime(w.start);
            html += `
                <div class="worker-badge montagem" onclick="showEmployeeDetail('${w.funcionario}')">
                    <div class="worker-info">
                        <strong>${w.funcionario}</strong>
                        <span>Montagem • OF ${w.of || 'Geral'}</span>
                        <span class="worker-time">⏱ ${elapsed}</span>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    } catch (e) {
        console.error('Failed to load active workers:', e);
    }
}

function getElapsedTime(startDate) {
    const start = new Date(startDate);
    const now = new Date();
    const diffMin = Math.floor((now - start) / 60000);
    const hours = Math.floor(diffMin / 60);
    const mins = diffMin % 60;
    return `${hours}h ${mins}m`;
}

// ==========================================================================
// Employees View
// ==========================================================================

async function loadEmployeesView() {
    if (employeesData.length === 0) {
        try {
            const res = await API.getEmployees(currentYear);
            employeesData = res.data || [];
        } catch (e) {
            showToast('Erro ao carregar funcionários', 'error');
            return;
        }
    }
    renderEmployeesGrid(employeesData);
}

function renderEmployeesGrid(data) {
    const container = document.getElementById('employees-grid');
    if (!container) return;

    if (data.length === 0) {
        container.innerHTML = `
            <div class="loading-placeholder">
                <p>Sem dados de funcionários para ${currentYear}</p>
            </div>
        `;
        return;
    }

    // Sort by hours descending
    const sorted = [...data].sort((a, b) => b.hours - a.hours);

    container.innerHTML = sorted.map(emp => {
        const costEntry = costsData.find(c => c.name.toLowerCase() === emp.name.toLowerCase());
        const totalCost = costEntry ? (emp.hours * costEntry.cost).toFixed(0) : '-';

        // Build section tags
        let sectionTags = '';
        if (emp.section) {
            Object.keys(emp.section).forEach(sec => {
                if (emp.section[sec] > 0 && SECTION_CSS_CLASSES[sec]) {
                    sectionTags += `<span class="section-tag ${SECTION_CSS_CLASSES[sec]}">${SECTION_SHORT_NAMES[sec] || sec}</span>`;
                }
            });
        }

        // Build section breakdown text (only sections with data)
        let breakdownParts = [];
        if (emp.section) {
            Object.keys(emp.section).forEach(sec => {
                if (emp.section[sec] > 0) {
                    breakdownParts.push(`${SECTION_SHORT_NAMES[sec] || sec}: ${Math.round(emp.section[sec])}h`);
                }
            });
        }
        const breakdownText = breakdownParts.length > 0 ? breakdownParts.join(' | ') : '';

        return `
            <div class="employee-card" onclick="showEmployeeDetail('${emp.name}')">
                <div class="employee-card-header">
                    <h3>${emp.name}</h3>
                    <div>${sectionTags}</div>
                </div>
                <div class="employee-stats">
                    <div class="employee-stat">
                        <div class="employee-stat-value">${Math.round(emp.hours)}</div>
                        <div class="employee-stat-label">Total Horas</div>
                    </div>
                    <div class="employee-stat">
                        <div class="employee-stat-value">${costEntry?.cost || '-'}</div>
                        <div class="employee-stat-label">€/hora</div>
                    </div>
                    <div class="employee-stat">
                        <div class="employee-stat-value">${totalCost}</div>
                        <div class="employee-stat-label">Custo Total</div>
                    </div>
                    ${breakdownText ? `<div class="section-breakdown">${breakdownText}</div>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// ==========================================================================
// OFs View
// ==========================================================================

async function loadOFsView() {
    if (ofsData.length === 0) {
        try {
            const res = await API.getOFs(currentYear);
            ofsData = res.data || [];
        } catch (e) {
            showToast('Erro ao carregar OFs', 'error');
            return;
        }
    }
    renderOFsTable(ofsData);
}

function renderOFsTable(data) {
    const tbody = document.getElementById('ofs-table-body');
    if (!tbody) return;

    if (data.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="loading-cell">Sem OFs para ${currentYear}</td>
            </tr>
        `;
        return;
    }

    // Calculate average cost per hour (simplified estimate)
    const avgCostPerHour = costsData.length > 0
        ? costsData.reduce((acc, c) => acc + c.cost, 0) / costsData.length
        : 0;

    tbody.innerHTML = data.map(of => {
        const estimatedCost = avgCostPerHour > 0 ? of.totalHours * avgCostPerHour : 0;
        const costDisplay = avgCostPerHour > 0
            ? `<span title="Média: ${avgCostPerHour.toFixed(1)}€/h × ${(of.totalHours || 0).toFixed(1)}h">~${estimatedCost.toFixed(0)}€</span>`
            : '-';
        return `
            <tr onclick="showOFDetail(${of.of})" style="cursor: pointer;">
                <td><strong>OF ${of.of}</strong></td>
                <td>${of.acabamentoHours?.toFixed(1) || 0}h</td>
                <td>${of.estofagemHours?.toFixed(1) || 0}h</td>
                <td>${of.pinturaHours?.toFixed(1) || 0}h</td>
                <td>${of.preparacaoHours?.toFixed(1) || 0}h</td>
                <td>${of.montagemHours?.toFixed(1) || 0}h</td>
                <td><strong>${of.totalHours?.toFixed(1) || 0}h</strong></td>
                <td>${costDisplay}</td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); showOFDetail(${of.of})">
                        Ver Detalhes
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// ==========================================================================
// Costs View
// ==========================================================================

async function loadCostsView() {
    if (costsData.length === 0) {
        try {
            const res = await API.getCosts();
            costsData = res.data || [];
        } catch (e) {
            showToast('Erro ao carregar custos', 'error');
            return;
        }
    }
    renderCostsTable();
}

function renderCostsTable() {
    const tbody = document.getElementById('costs-table-body');
    if (!tbody) return;

    if (costsData.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="loading-cell">Sem custos configurados</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = costsData.map(c => {
        // Find employee hours
        const empData = employeesData.find(e => e.name.toLowerCase() === c.name.toLowerCase());
        const hours = empData?.hours || 0;
        const totalCost = hours * c.cost;

        return `
            <tr>
                <td><strong>${c.name}</strong></td>
                <td>
                    <input type="number" step="0.5" value="${c.cost}"
                        onchange="updateCost('${c.id}', '${c.name}', this.value)"
                        style="width: 80px; padding: 6px; border: 1px solid var(--border); border-radius: 4px;">
                    €/h
                </td>
                <td>${hours.toFixed(1)}h</td>
                <td><strong>${totalCost.toFixed(0)}€</strong></td>
                <td>
                    <button class="btn btn-sm btn-danger" onclick="deleteCost('${c.id}', '${c.name}')">
                        Eliminar
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// ==========================================================================
// Detail Views
// ==========================================================================

window.showOFDetail = async (ofNum) => {
    switchView('detail');

    const container = document.getElementById('detail-content');
    const title = document.getElementById('detail-title');
    const subtitle = document.getElementById('detail-subtitle');

    title.textContent = `Ordem de Fabrico ${ofNum}`;
    subtitle.textContent = 'A carregar detalhes...';
    container.innerHTML = '<div class="loading-placeholder"><div class="spinner"></div></div>';

    // Update URL
    const url = new URL(window.location);
    url.searchParams.set('of', ofNum);
    url.searchParams.delete('employee');
    url.searchParams.delete('view');
    window.history.pushState({}, '', url);

    try {
        const res = await API.getOFDetail(ofNum);
        const d = res.data;

        const safeHours = (acc, p) => {
            if (!p.end || !p.start) return acc;
            return acc + (new Date(p.end) - new Date(p.start)) / 36e5;
        };
        const totalAcab = d.acabamento.reduce(safeHours, 0);
        const totalEstof = d.estofagem.reduce(safeHours, 0);
        const totalPint = d.pintura?.reduce(safeHours, 0) || 0;
        const totalPrep = d.preparacao?.reduce(safeHours, 0) || 0;
        const totalMont = d.montagem?.reduce(safeHours, 0) || 0;
        const totalHours = totalAcab + totalEstof + totalPint + totalPrep + totalMont;
        const totalUnits = d.units?.length || 0;
        const productivity = totalHours > 0 ? (totalUnits / totalHours).toFixed(2) : 0;

        // Calculate cost
        let totalCost = 0;
        const allShifts = [
            ...d.acabamento,
            ...d.estofagem,
            ...(d.pintura || []),
            ...(d.preparacao || []),
            ...(d.montagem || [])
        ];
        allShifts.forEach(shift => {
            if (!shift.end || !shift.start) return;
            const hours = (new Date(shift.end) - new Date(shift.start)) / 36e5;
            const costEntry = costsData.find(c => c.name.toLowerCase() === shift.funcionario.toLowerCase());
            if (costEntry) {
                totalCost += hours * costEntry.cost;
            }
        });

        const costPerUnit = totalUnits > 0 ? (totalCost / totalUnits).toFixed(2) : '-';

        subtitle.textContent = `${allShifts.length} registos de trabalho`;

        container.innerHTML = `
            <div class="detail-stats-row">
                <div class="detail-stat-card">
                    <h4>Horas Acabamento</h4>
                    <div class="value">${totalAcab.toFixed(1)}h</div>
                </div>
                <div class="detail-stat-card">
                    <h4>Horas Estofagem</h4>
                    <div class="value info">${totalEstof.toFixed(1)}h</div>
                </div>
                <div class="detail-stat-card">
                    <h4>Horas Pintura</h4>
                    <div class="value success">${totalPint.toFixed(1)}h</div>
                </div>
                <div class="detail-stat-card">
                    <h4>Horas Preparação</h4>
                    <div class="value info">${totalPrep.toFixed(1)}h</div>
                </div>
                <div class="detail-stat-card">
                    <h4>Horas Montagem</h4>
                    <div class="value">${totalMont.toFixed(1)}h</div>
                </div>
                <div class="detail-stat-card">
                    <h4>Total Horas</h4>
                    <div class="value">${totalHours.toFixed(1)}h</div>
                </div>
                <div class="detail-stat-card">
                    <h4>Unidades</h4>
                    <div class="value success">${totalUnits}</div>
                </div>
                <div class="detail-stat-card">
                    <h4>Produtividade</h4>
                    <div class="value">${productivity} un/h</div>
                </div>
                <div class="detail-stat-card">
                    <h4>Custo Total</h4>
                    <div class="value">${totalCost.toFixed(0)}€</div>
                </div>
                <div class="detail-stat-card">
                    <h4>Custo/Unidade</h4>
                    <div class="value">${costPerUnit}€</div>
                </div>
            </div>

            <div class="chart-container">
                <h2>📋 Registos de Trabalho</h2>
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Secção</th>
                            <th>Funcionário</th>
                            <th>Início</th>
                            <th>Fim</th>
                            <th>Duração</th>
                            <th>Custo</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${d.acabamento.map(r => renderShiftRow(r, 'Acabamento')).join('')}
                        ${d.estofagem.map(r => renderShiftRow(r, 'Estofagem')).join('')}
                        ${d.pintura?.map(r => renderShiftRow(r, 'Pintura')).join('') || ''}
                        ${d.preparacao?.map(r => renderShiftRow(r, 'Preparação')).join('') || ''}
                        ${d.montagem?.map(r => renderShiftRow(r, 'Montagem')).join('') || ''}
                    </tbody>
                </table>
            </div>
        `;

    } catch (e) {
        container.innerHTML = `<div style="color: var(--danger); padding: 20px;">Erro ao carregar OF: ${e.message}</div>`;
    }
};

window.showEmployeeDetail = async (name) => {
    switchView('detail');

    const container = document.getElementById('detail-content');
    const title = document.getElementById('detail-title');
    const subtitle = document.getElementById('detail-subtitle');

    title.textContent = name;
    subtitle.textContent = 'A carregar detalhes...';
    container.innerHTML = '<div class="loading-placeholder"><div class="spinner"></div></div>';

    // Update URL
    const url = new URL(window.location);
    url.searchParams.set('employee', name);
    url.searchParams.delete('of');
    url.searchParams.delete('view');
    window.history.pushState({}, '', url);

    try {
        const res = await API.getEmployeeDetail(name, currentYear);
        const d = res.data;

        const totalHours = d.history.reduce((acc, h) => {
            if (!h.end || !h.start) return acc;
            return acc + (new Date(h.end) - new Date(h.start)) / 36e5;
        }, 0);

        // Get units from global data
        const empData = employeesData.find(e => e.name.toLowerCase() === name.toLowerCase());
        const totalUnits = empData?.units || 0;
        const productivity = totalHours > 0 ? (totalUnits / totalHours).toFixed(2) : 0;

        // Get cost info
        const costEntry = costsData.find(c => c.name.toLowerCase() === name.toLowerCase());
        const costPerHour = costEntry?.cost || 0;
        const totalCost = totalHours * costPerHour;

        // Section breakdown
        const safeSum = (acc, h) => {
            if (!h.end || !h.start) return acc;
            return acc + (new Date(h.end) - new Date(h.start)) / 36e5;
        };
        const acabHours = d.history.filter(h => h.section === 'Acabamento').reduce(safeSum, 0);
        const estofHours = d.history.filter(h => h.section === 'Estofagem').reduce(safeSum, 0);
        const pintHours = d.history.filter(h => h.section === 'Pintura').reduce(safeSum, 0);
        const prepHours = d.history.filter(h => h.section === 'Preparação').reduce(safeSum, 0);
        const montHours = d.history.filter(h => h.section === 'Montagem').reduce(safeSum, 0);

        subtitle.textContent = `${d.history.length} turnos registados em ${currentYear}`;

        container.innerHTML = `
            <div class="detail-stats-row">
                <div class="detail-stat-card">
                    <h4>Total Horas</h4>
                    <div class="value">${totalHours.toFixed(1)}h</div>
                </div>
                <div class="detail-stat-card">
                    <h4>Unidades</h4>
                    <div class="value success">${totalUnits}</div>
                </div>
                <div class="detail-stat-card">
                    <h4>Produtividade</h4>
                    <div class="value">${productivity} un/h</div>
                </div>
                <div class="detail-stat-card">
                    <h4>Custo/Hora</h4>
                    <div class="value">${costPerHour}€/h</div>
                </div>
                <div class="detail-stat-card">
                    <h4>Custo Total</h4>
                    <div class="value">${totalCost.toFixed(0)}€</div>
                </div>
                <div class="detail-stat-card">
                    <h4>Acabamento</h4>
                    <div class="value">${acabHours.toFixed(1)}h</div>
                </div>
                <div class="detail-stat-card">
                    <h4>Estofagem</h4>
                    <div class="value info">${estofHours.toFixed(1)}h</div>
                </div>
                <div class="detail-stat-card">
                    <h4>Pintura</h4>
                    <div class="value success">${pintHours.toFixed(1)}h</div>
                </div>
                <div class="detail-stat-card">
                    <h4>Preparação</h4>
                    <div class="value info">${prepHours.toFixed(1)}h</div>
                </div>
                <div class="detail-stat-card">
                    <h4>Montagem</h4>
                    <div class="value">${montHours.toFixed(1)}h</div>
                </div>
            </div>

            <div class="chart-container">
                <h2>📋 Histórico de Turnos</h2>
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>OF</th>
                            <th>Secção</th>
                            <th>Duração</th>
                            <th>Custo</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${d.history.map(h => {
            const hStart = h.start ? new Date(h.start) : null;
            const hEnd = h.end ? new Date(h.end) : null;
            const hours = (hEnd && hStart) ? (hEnd - hStart) / 36e5 : 0;
            const cost = hours * costPerHour;
            const sectionColor = SECTION_COLORS[h.section] || '#ccc';
            return `
                                <tr onclick="showOFDetail(${h.of})" style="cursor: pointer; border-left: 4px solid ${sectionColor};">
                                    <td>${hStart ? hStart.toLocaleDateString('pt-PT') : '-'}</td>
                                    <td>${h.of || '-'}</td>
                                    <td>${h.section}</td>
                                    <td>${hours.toFixed(2)}h</td>
                                    <td>${cost.toFixed(0)}€</td>
                                </tr>
                            `;
        }).join('')}
                    </tbody>
                </table>
            </div>
        `;

    } catch (e) {
        container.innerHTML = `<div style="color: var(--danger); padding: 20px;">Erro ao carregar funcionário: ${e.message}</div>`;
    }
};

function renderShiftRow(r, section) {
    const startDate = r.start ? new Date(r.start) : null;
    const endDate = r.end ? new Date(r.end) : null;
    const hours = (endDate && startDate) ? (endDate - startDate) / 36e5 : 0;
    const costEntry = costsData.find(c => c.name.toLowerCase() === r.funcionario.toLowerCase());
    const cost = costEntry ? (hours * costEntry.cost).toFixed(0) : '-';
    const endDisplay = endDate ? endDate.toLocaleTimeString('pt-PT') : 'Em curso';
    const sectionColor = SECTION_COLORS[section] || '#ccc';

    return `
        <tr onclick="showEmployeeDetail('${r.funcionario}')" style="cursor: pointer; border-left: 4px solid ${sectionColor};">
            <td>${section}</td>
            <td>${r.funcionario}</td>
            <td>${startDate ? startDate.toLocaleString('pt-PT') : '-'}</td>
            <td>${endDisplay}</td>
            <td>${hours.toFixed(2)}h</td>
            <td>${cost}€</td>
        </tr>
    `;
}

// ==========================================================================
// Cost Management
// ==========================================================================

window.updateCost = async (id, name, cost) => {
    try {
        await API.saveCost({ id, name, cost: parseFloat(cost) });
        showToast(`Custo de ${name} atualizado para ${cost}€/h`, 'success');

        // Refresh costs
        const res = await API.getCosts();
        costsData = res.data || [];
        updateSummaryStats();
    } catch (e) {
        showToast('Erro ao atualizar custo: ' + e.message, 'error');
    }
};

window.deleteCost = async (id, name) => {
    showConfirmModal(
        'Eliminar Funcionário',
        `Tem a certeza que deseja eliminar o custo de "${name}"?`,
        async () => {
            try {
                await API.deleteCost(id);
                showToast(`${name} eliminado`, 'success');

                // Refresh
                const res = await API.getCosts();
                costsData = res.data || [];
                renderCostsTable();
                updateSummaryStats();
            } catch (e) {
                showToast('Erro ao eliminar: ' + e.message, 'error');
            }
        }
    );
};

function showAddCostModal() {
    const modalOverlay = document.getElementById('modal-overlay');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalConfirm = document.getElementById('modal-confirm');
    const modalCancel = document.getElementById('modal-cancel');
    const modalClose = document.getElementById('modal-close');

    modalTitle.textContent = 'Adicionar Funcionário';
    modalBody.innerHTML = `
        <div class="form-group">
            <label for="new-emp-name">Nome do Funcionário</label>
            <input type="text" id="new-emp-name" placeholder="Ex: João Silva">
        </div>
        <div class="form-group">
            <label for="new-emp-cost">Custo por Hora (€)</label>
            <input type="number" id="new-emp-cost" step="0.5" value="10" min="0">
        </div>
    `;

    modalConfirm.textContent = 'Adicionar';
    modalConfirm.onclick = async () => {
        const name = document.getElementById('new-emp-name').value.trim();
        const cost = parseFloat(document.getElementById('new-emp-cost').value);

        if (!name) {
            showToast('Por favor insira um nome', 'error');
            return;
        }

        try {
            await API.saveCost({ name, cost });
            showToast(`${name} adicionado com ${cost}€/h`, 'success');
            closeModal();

            // Refresh
            const res = await API.getCosts();
            costsData = res.data || [];
            renderCostsTable();
        } catch (e) {
            showToast('Erro: ' + e.message, 'error');
        }
    };

    modalCancel.onclick = closeModal;
    modalClose.onclick = closeModal;

    modalOverlay.classList.add('active');
}

function showConfirmModal(title, message, onConfirm) {
    const modalOverlay = document.getElementById('modal-overlay');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalConfirm = document.getElementById('modal-confirm');
    const modalCancel = document.getElementById('modal-cancel');
    const modalClose = document.getElementById('modal-close');

    modalTitle.textContent = title;
    modalBody.innerHTML = `<p>${message}</p>`;
    modalConfirm.textContent = 'Confirmar';
    modalConfirm.className = 'btn btn-danger';

    modalConfirm.onclick = () => {
        closeModal();
        onConfirm();
    };

    modalCancel.onclick = closeModal;
    modalClose.onclick = closeModal;

    modalOverlay.classList.add('active');
}

function closeModal() {
    document.getElementById('modal-overlay').classList.remove('active');
    document.getElementById('modal-confirm').className = 'btn btn-primary';
}

// ==========================================================================
// Toast Notifications
// ==========================================================================

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');

    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || '📢'}</span>
        <span class="toast-message">${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;

    container.appendChild(toast);

    // Auto remove after 3s
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// ==========================================================================
// Utilities
// ==========================================================================

function hideLoading(elementId) {
    const el = document.getElementById(elementId);
    if (el) el.classList.add('hidden');
}
