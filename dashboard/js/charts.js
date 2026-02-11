const DashboardCharts = {
    // Colors reused from example.html
    colors: {
        primary: '#E6692D',
        secondary: '#2c3e50',
        success: '#28a745',
        info: '#17a2b8',
        warning: '#ffc107',
        gradient: ['#E6692D', '#FF8C50', '#FFA873', '#c95a24', '#a64a1e']
    },

    instances: {},

    destroy(id) {
        if (this.instances[id]) {
            this.instances[id].destroy();
        }
    },

    renderAcabamentoPerformance(canvasId, data) {
        this.destroy(canvasId);
        const ctx = document.getElementById(canvasId).getContext('2d');

        // Filter: Acabamento hours > 0, sort desc, top 10
        const sorted = data.filter(d => d.section?.['Acabamento'] > 0)
            .sort((a, b) => (b.section?.['Acabamento'] || 0) - (a.section?.['Acabamento'] || 0))
            .slice(0, 10);

        this.instances[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: sorted.map(d => d.name),
                datasets: [
                    {
                        label: 'Horas Acabamento',
                        data: sorted.map(d => d.section?.['Acabamento'] || 0),
                        backgroundColor: '#E6692D',
                        yAxisID: 'y',
                        order: 2
                    },
                    {
                        label: 'Unidades',
                        data: sorted.map(d => d.unitsAcabamento || d.units || 0),
                        type: 'line',
                        borderColor: '#2c3e50',
                        pointBackgroundColor: '#2c3e50',
                        yAxisID: 'y1',
                        order: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Horas' } },
                    y1: { type: 'linear', display: true, position: 'right', title: { display: true, text: 'Unidades' }, grid: { drawOnChartArea: false } }
                },
                onClick: (e, elements) => {
                    if (elements.length > 0) {
                        window.showEmployeeDetail(sorted[elements[0].index].name);
                    }
                }
            }
        });
    },

    renderEstofagemPerformance(canvasId, data) {
        this.destroy(canvasId);
        const ctx = document.getElementById(canvasId).getContext('2d');

        // Filter: Estofagem hours > 0, sort desc, top 10
        const sorted = data.filter(d => d.section?.['Estofagem'] > 0)
            .sort((a, b) => (b.section?.['Estofagem'] || 0) - (a.section?.['Estofagem'] || 0))
            .slice(0, 10);

        this.instances[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: sorted.map(d => d.name),
                datasets: [
                    {
                        label: 'Horas Estofagem',
                        data: sorted.map(d => d.section?.['Estofagem'] || 0),
                        backgroundColor: '#2c3e50',
                        yAxisID: 'y',
                        order: 2
                    },
                    {
                        label: 'Unidades',
                        data: sorted.map(d => d.unitsEstofagem || d.units || 0),
                        type: 'line',
                        borderColor: '#E6692D',
                        pointBackgroundColor: '#E6692D',
                        yAxisID: 'y1',
                        order: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Horas' } },
                    y1: { type: 'linear', display: true, position: 'right', title: { display: true, text: 'Unidades' }, grid: { drawOnChartArea: false } }
                },
                onClick: (e, elements) => {
                    if (elements.length > 0) {
                        window.showEmployeeDetail(sorted[elements[0].index].name);
                    }
                }
            }
        });
    },

    renderOFProgress(canvasId, data) {
        this.destroy(canvasId);
        const ctx = document.getElementById(canvasId).getContext('2d');

        // Filter out OF 0/Geral and take top 12 recent
        const filtered = data.filter(d => d.of !== 0 && d.of !== '0');
        const recent = [...filtered].slice(0, 12);

        this.instances[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: recent.map(d => `OF ${d.of}`),
                datasets: [
                    { label: 'Acabamento', data: recent.map(d => d.acabamentoHours || 0), backgroundColor: '#E6692D' },
                    { label: 'Estofagem', data: recent.map(d => d.estofagemHours || 0), backgroundColor: '#2c3e50' },
                    { label: 'Pintura', data: recent.map(d => d.pinturaHours || 0), backgroundColor: '#28a745' },
                    { label: 'Preparação', data: recent.map(d => d.preparacaoHours || 0), backgroundColor: '#17a2b8' },
                    { label: 'Montagem', data: recent.map(d => d.montagemHours || 0), backgroundColor: '#ffc107' }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { stacked: true },
                    y: { stacked: true, title: { display: true, text: 'Horas Totais' } }
                },
                onClick: (e, elements) => {
                    if (elements.length > 0) {
                        const ofNum = recent[elements[0].index].of;
                        window.showOFDetail(ofNum);
                    }
                }
            }
        });
    },

    renderMonthlyTrend(canvasId, monthlyData, selectedYear = new Date().getFullYear()) {
        this.destroy(canvasId);
        const ctx = document.getElementById(canvasId).getContext('2d');

        const allLabels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth(); // 0-indexed

        // For current year: show only up to current month (inclusive)
        // For past years: show all 12 months
        const monthsToShow = (selectedYear >= currentYear) ? currentMonth + 1 : 12;

        const labels = allLabels.slice(0, monthsToShow);
        const hoursData = monthlyData.slice(0, monthsToShow).map(m => Math.round(m.hours * 100) / 100);
        const unitsData = monthlyData.slice(0, monthsToShow).map(m => m.units);

        this.instances[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Horas Totais',
                        data: hoursData,
                        borderColor: this.colors.primary,
                        backgroundColor: 'rgba(230, 105, 45, 0.1)',
                        fill: true,
                        tension: 0.3,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Unidades Produzidas',
                        data: unitsData,
                        borderColor: this.colors.secondary,
                        backgroundColor: 'rgba(44, 62, 80, 0.1)',
                        fill: false,
                        tension: 0.3,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    y: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Horas' }, beginAtZero: true },
                    y1: { type: 'linear', display: true, position: 'right', title: { display: true, text: 'Unidades' }, grid: { drawOnChartArea: false }, beginAtZero: true }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                const label = context.dataset.label || '';
                                const value = context.parsed.y;
                                if (label.includes('Horas')) return `${label}: ${value.toFixed(1)}h`;
                                return `${label}: ${value}`;
                            }
                        }
                    }
                }
            }
        });
    }
};
