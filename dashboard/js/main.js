document.addEventListener('DOMContentLoaded', () => {
    Auth.init();

    // Check URL params for Deep Linking
    const params = new URLSearchParams(window.location.search);
    if (params.has('of')) {
        // We need to wait for auth, so we store intent
        window.pendingDeepLink = { type: 'of', id: params.get('of') };
    } else if (params.has('employee')) {
        window.pendingDeepLink = { type: 'employee', id: params.get('employee') };
    }
});

window.loadDashboard = async () => {
    // Set date
    document.getElementById('current-date').textContent = new Date().toLocaleDateString('pt-PT', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    // Handle deep links if any
    if (window.pendingDeepLink) {
        if (window.pendingDeepLink.type === 'of') showOFDetail(window.pendingDeepLink.id);
        if (window.pendingDeepLink.type === 'employee') showEmployeeDetail(window.pendingDeepLink.id);
        window.pendingDeepLink = null; // Clear
    } else {
        // Load default view
        renderActiveWorkers();
        loadAnnualData(2025);
        loadCostTable();
    }

    // Bind Controls
    document.getElementById('year-selector').addEventListener('change', (e) => {
        loadAnnualData(e.target.value);
    });

    // Start polling active workers
    setInterval(renderActiveWorkers, 30000);
    renderActiveWorkers(); // Immediate
};

// --- Active Workers ---
async function renderActiveWorkers() {
    try {
        const res = await API.getSummary();
        const container = document.getElementById('active-workers-list');
        const lastUpdated = document.getElementById('last-updated');

        lastUpdated.textContent = 'Atualizado: ' + new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });

        const acabamento = res.activeWorkers.acabamento || [];
        const estofagem = res.activeWorkers.estofagem || [];

        if (acabamento.length === 0 && estofagem.length === 0) {
            container.innerHTML = '<div style="color:#999; margin:auto;">Sem trabalhadores ativos no momento.</div>';
            return;
        }

        let html = '';

        acabamento.forEach(w => {
            const start = new Date(w.start);
            const now = new Date();
            const diffMin = Math.floor((now - start) / 60000);
            const hours = Math.floor(diffMin / 60);
            const mins = diffMin % 60;

            html += `
            <div class="worker-badge acabamento">
                <div class="worker-info">
                    <strong>${w.funcionario}</strong>
                    <span>Acabamento • OF ${w.of || 'Geral'}</span>
                    <span style="display:block; font-size:0.8em; color:var(--primary); margin-top:2px;">
                        ⏱ ${hours}h ${mins}m
                    </span>
                </div>
            </div>`;
        });

        estofagem.forEach(w => {
            const start = new Date(w.start);
            const now = new Date();
            const diffMin = Math.floor((now - start) / 60000);
            const hours = Math.floor(diffMin / 60);
            const mins = diffMin % 60;

            html += `
            <div class="worker-badge estofagem">
                <div class="worker-info">
                    <strong>${w.funcionario}</strong>
                    <span>Estofagem • OF ${w.of || 'Geral'}</span>
                     <span style="display:block; font-size:0.8em; color:var(--info); margin-top:2px;">
                        ⏱ ${hours}h ${mins}m
                    </span>
                </div>
            </div>`;
        });

        container.innerHTML = html;
    } catch (e) {
        console.error("Failed to load active workers", e);
    }
}

// --- Annual Data ---
async function loadAnnualData(year) {
    try {
        const [employees, ofs] = await Promise.all([
            API.getEmployees(year),
            API.getOFs(year)
        ]);

        // Summary Stats
        const totalHours = employees.data.reduce((acc, curr) => acc + curr.hours, 0);
        const totalUnits = employees.data.reduce((acc, curr) => acc + curr.units, 0);
        const avgProd = totalHours > 0 ? (totalUnits / totalHours).toFixed(2) : 0;

        document.getElementById('stat-total-hours').textContent = totalHours.toFixed(0);
        document.getElementById('stat-total-units').textContent = totalUnits;
        document.getElementById('stat-avg-prod').innerHTML = `${avgProd}<span class="unit">un/h</span>`;

        // Render Charts
        DashboardCharts.renderEmployeePerformance('chartEmployeePerformance', employees.data);
        DashboardCharts.renderOFProgress('chartOFProgress', ofs.data);

        // (Optional) Calculate Monthly Trend on client if date data available
        // For now chartMonthlyTrend is placeholder in Charts.js

    } catch (e) {
        alert("Erro ao carregar dados anuais: " + e.message);
    }
}

// --- Costs ---
async function loadCostTable() {
    try {
        const costs = await API.getCosts();
        const tbody = document.querySelector('#costs-table tbody');

        // Calculate Total Estimated Cost based on Employee Hours (simple approx using current loaded data)
        // Note: Real cost calculation requires matching hours with historical cost, but we use current cost for simplicity

        tbody.innerHTML = costs.data.map(c => `
            <tr>
                <td>${c.name}</td>
                <td>
                    <input type="number" step="0.5" value="${c.cost}" 
                        onchange="updateCost('${c.id}', '${c.name}', this.value)"
                        style="width:80px; padding:4px;">
                </td>
                <td>
                    <button style="background:var(--danger); color:white; border:none; border-radius:4px; padding:5px 10px; cursor:pointer;"
                        onclick="deleteCost('${c.id}')">Eliminar</button>
                </td>
            </tr>
        `).join('');

        // Setup Add Button
        document.getElementById('btn-add-cost').onclick = () => {
            const name = prompt("Nome do Funcionário:");
            if (name) {
                const cost = prompt("Custo Hora (€):", "10");
                if (cost) updateCost(null, name, cost).then(loadCostTable);
            }
        };

    } catch (e) {
        console.warn("Failed to load costs (maybe not configured)", e);
    }
}

window.updateCost = async (id, name, cost) => {
    await API.saveCost({ id, name, cost });
    // Toast or reload
};

window.deleteCost = async (id) => {
    if (confirm('Tem a certeza?')) {
        await API.deleteCost(id);
        loadCostTable();
    }
};


// --- Detail Views ---
window.showOFDetail = async (ofNum) => {
    switchToView('view-detail');
    const container = document.getElementById('detail-content');
    const title = document.getElementById('detail-title');
    title.textContent = `Detalhe da OF ${ofNum}`;
    container.innerHTML = 'Carregando...';

    const cleanURL = new URL(window.location);
    cleanURL.searchParams.set('of', ofNum);
    window.history.pushState({}, '', cleanURL);

    try {
        const res = await API.getOFDetail(ofNum);
        const d = res.data;

        const totalAcabHeight = d.acabamento.reduce((acc, p) => acc + (new Date(p.end) - new Date(p.start)) / 36e5, 0);
        const totalEstofHeight = d.estofagem.reduce((acc, p) => acc + (new Date(p.end) - new Date(p.start)) / 36e5, 0);

        container.innerHTML = `
            <div class="stats-grid">
               <div class="stat-card"><h3>Horas Acabamento</h3><div class="value">${totalAcabHeight.toFixed(1)}</div></div>
               <div class="stat-card"><h3>Horas Estofagem</h3><div class="value">${totalEstofHeight.toFixed(1)}</div></div>
               <div class="stat-card"><h3>Total Unidades</h3><div class="value">${d.units.length}</div></div>
            </div>
            
            <div class="chart-container">
                <h3>Registos de Trabalho</h3>
                <table>
                    <thead><tr><th>Secção</th><th>Funcionário</th><th>Início</th><th>Fim</th><th>Duração</th></tr></thead>
                    <tbody>
                        ${d.acabamento.map(r => row(r, 'Acabamento')).join('')}
                        ${d.estofagem.map(r => row(r, 'Estofagem')).join('')}
                    </tbody>
                </table>
            </div>
        `;

        function row(r, section) {
            const dur = ((new Date(r.end) - new Date(r.start)) / 36e5).toFixed(2);
            return `<tr>
                <td>${section}</td>
                <td>${r.funcionario}</td>
                <td>${new Date(r.start).toLocaleString()}</td>
                <td>${new Date(r.end).toLocaleTimeString()}</td>
                <td>${dur}h</td>
            </tr>`;
        }

    } catch (e) {
        container.innerHTML = `<div style="color:red">Erro: ${e.message}</div>`;
    }
};

window.showEmployeeDetail = async (name) => {
    switchToView('view-detail');
    const container = document.getElementById('detail-content');
    const title = document.getElementById('detail-title');
    title.textContent = `Ficha de: ${name}`;
    container.innerHTML = 'Carregando...';

    const cleanURL = new URL(window.location);
    cleanURL.searchParams.set('employee', name);
    window.history.pushState({}, '', cleanURL);

    try {
        const res = await API.getEmployeeDetail(name, new Date().getFullYear());
        const d = res.data;

        container.innerHTML = `
             <div class="chart-container">
                <h3>Histórico de Turnos (Ano Corrente)</h3>
                <table>
                    <thead><tr><th>Data</th><th>OF</th><th>Secção</th><th>Duração</th></tr></thead>
                    <tbody>
                        ${d.history.map(h => {
            const dur = ((new Date(h.end) - new Date(h.start)) / 36e5).toFixed(2);
            return `<tr>
                                <td>${new Date(h.start).toLocaleDateString()}</td>
                                <td>${h.of || '-'}</td>
                                <td>${h.section}</td>
                                <td>${dur}h</td>
                             </tr>`;
        }).join('')}
                    </tbody>
                </table>
            </div>
        `;

    } catch (e) {
        container.innerHTML = `<div style="color:red">Erro: ${e.message}</div>`;
    }
};


document.getElementById('back-to-main').addEventListener('click', () => {
    switchToView('view-main');
    const cleanURL = new URL(window.location);
    cleanURL.searchParams.delete('of');
    cleanURL.searchParams.delete('employee');
    window.history.pushState({}, '', cleanURL);
});

function switchToView(viewId) {
    document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
    document.getElementById(viewId).style.display = 'block';
}
