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
    return data.filter(item => {
        if (item.section && item.section[currentSection === 'acabamento' ? 'Acabamento' : 'Estofagem']) {
            return true;
        }
        return false;
    });
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
    const totalUnits = employeesData.reduce((acc, emp) => acc + (emp.units || 0), 0);
    const avgProd = totalHours > 0 ? (totalUnits / totalHours) : 0;

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
    document.getElementById('stat-total-units').textContent = totalUnits.toLocaleString('pt-PT');
    document.getElementById('stat-avg-prod').innerHTML = `${avgProd.toFixed(2)}<span class="unit">un/h</span>`;
    document.getElementById('stat-total-cost').innerHTML = `${totalCost.toFixed(0).toLocaleString('pt-PT')}<span class="unit">€</span>`;
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

        if (acabamento.length === 0 && estofagem.length === 0) {
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
        const productivity = emp.hours > 0 ? (emp.units / emp.hours).toFixed(2) : 0;
        const costEntry = costsData.find(c => c.name.toLowerCase() === emp.name.toLowerCase());
        const totalCost = costEntry ? (emp.hours * costEntry.cost).toFixed(0) : '-';

        // Performance badge
        let badge = 'medium';
        if (productivity >= 1) badge = 'high';
        else if (productivity < 0.5) badge = 'low';

        return `
            <div class="employee-card" onclick="showEmployeeDetail('${emp.name}')">
                <div class="employee-card-header">
                    <h3>${emp.name}</h3>
                    <span class="employee-badge ${badge}">${productivity} un/h</span>
                </div>
                <div class="employee-stats">
                    <div class="employee-stat">
                        <div class="employee-stat-value">${Math.round(emp.hours)}</div>
                        <div class="employee-stat-label">Horas</div>
                    </div>
                    <div class="employee-stat">
                        <div class="employee-stat-value">${emp.units}</div>
                        <div class="employee-stat-label">Unidades</div>
                    </div>
                    <div class="employee-stat">
                        <div class="employee-stat-value">${costEntry?.cost || '-'}</div>
                        <div class="employee-stat-label">€/hora</div>
                    </div>
                    <div class="employee-stat">
                        <div class="employee-stat-value">${totalCost}</div>
                        <div class="employee-stat-label">Custo Total</div>
                    </div>
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
                <td colspan="6" class="loading-cell">Sem OFs para ${currentYear}</td>
            </tr>
        `;
        return;
    }

    // Calculate average cost per hour (simplified)
    const avgCostPerHour = costsData.length > 0
        ? costsData.reduce((acc, c) => acc + c.cost, 0) / costsData.length
        : 10;

    tbody.innerHTML = data.map(of => {
        const estimatedCost = of.totalHours * avgCostPerHour;
        return `
            <tr onclick="showOFDetail(${of.of})" style="cursor: pointer;">
                <td><strong>OF ${of.of}</strong></td>
                <td>${of.acabamentoHours?.toFixed(1) || 0}h</td>
                <td>${of.estofagemHours?.toFixed(1) || 0}h</td>
                <td><strong>${of.totalHours?.toFixed(1) || 0}h</strong></td>
                <td>${estimatedCost.toFixed(0)}€</td>
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

        const totalAcab = d.acabamento.reduce((acc, p) => acc + (new Date(p.end) - new Date(p.start)) / 36e5, 0);
        const totalEstof = d.estofagem.reduce((acc, p) => acc + (new Date(p.end) - new Date(p.start)) / 36e5, 0);
        const totalHours = totalAcab + totalEstof;
        const totalUnits = d.units?.length || 0;
        const productivity = totalHours > 0 ? (totalUnits / totalHours).toFixed(2) : 0;

        // Calculate cost
        let totalCost = 0;
        const allShifts = [...d.acabamento, ...d.estofagem];
        allShifts.forEach(shift => {
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

        const totalHours = d.history.reduce((acc, h) => acc + (new Date(h.end) - new Date(h.start)) / 36e5, 0);

        // Get units from global data
        const empData = employeesData.find(e => e.name.toLowerCase() === name.toLowerCase());
        const totalUnits = empData?.units || 0;
        const productivity = totalHours > 0 ? (totalUnits / totalHours).toFixed(2) : 0;

        // Get cost info
        const costEntry = costsData.find(c => c.name.toLowerCase() === name.toLowerCase());
        const costPerHour = costEntry?.cost || 0;
        const totalCost = totalHours * costPerHour;

        // Section breakdown
        const acabHours = d.history.filter(h => h.section === 'Acabamento').reduce((acc, h) => acc + (new Date(h.end) - new Date(h.start)) / 36e5, 0);
        const estofHours = d.history.filter(h => h.section === 'Estofagem').reduce((acc, h) => acc + (new Date(h.end) - new Date(h.start)) / 36e5, 0);

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
            const hours = (new Date(h.end) - new Date(h.start)) / 36e5;
            const cost = hours * costPerHour;
            return `
                                <tr onclick="showOFDetail(${h.of})" style="cursor: pointer;">
                                    <td>${new Date(h.start).toLocaleDateString('pt-PT')}</td>
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
    const hours = (new Date(r.end) - new Date(r.start)) / 36e5;
    const costEntry = costsData.find(c => c.name.toLowerCase() === r.funcionario.toLowerCase());
    const cost = costEntry ? (hours * costEntry.cost).toFixed(0) : '-';

    return `
        <tr onclick="showEmployeeDetail('${r.funcionario}')" style="cursor: pointer;">
            <td>${section}</td>
            <td>${r.funcionario}</td>
            <td>${new Date(r.start).toLocaleString('pt-PT')}</td>
            <td>${new Date(r.end).toLocaleTimeString('pt-PT')}</td>
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
