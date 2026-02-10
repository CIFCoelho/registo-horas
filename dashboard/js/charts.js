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

    renderEmployeePerformance(canvasId, data) {
        this.destroy(canvasId);
        const ctx = document.getElementById(canvasId).getContext('2d');

        // Sort by hours desc (top 10)
        const sorted = [...data].sort((a, b) => b.hours - a.hours).slice(0, 10);

        this.instances[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: sorted.map(d => d.name),
                datasets: [
                    {
                        label: 'Horas Trabalhadas',
                        data: sorted.map(d => d.hours),
                        backgroundColor: 'rgba(230, 105, 45, 0.8)',
                        yAxisID: 'y',
                        order: 2
                    },
                    {
                        label: 'Unidades (Total)',
                        data: sorted.map(d => d.units),
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
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: { display: true, text: 'Horas' }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: { display: true, text: 'Unidades' },
                        grid: { drawOnChartArea: false }
                    }
                },
                onClick: (e, elements) => {
                    if (elements.length > 0) {
                        const idx = elements[0].index;
                        const name = sorted[idx].name;
                        window.showEmployeeDetail(name);
                    }
                }
            }
        });
    },

    renderOFProgress(canvasId, data) {
        this.destroy(canvasId);
        const ctx = document.getElementById(canvasId).getContext('2d');

        // Display top 8 recent OFs
        const recent = [...data].slice(0, 8);

        this.instances[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: recent.map(d => `OF ${d.of}`),
                datasets: [
                    {
                        label: 'Acabamento (h)',
                        data: recent.map(d => d.acabamentoHours || 0),
                        backgroundColor: '#E6692D'
                    },
                    {
                        label: 'Estofagem (h)',
                        data: recent.map(d => d.estofagemHours || 0),
                        backgroundColor: '#2c3e50'
                    },
                    {
                        label: 'Pintura (h)',
                        data: recent.map(d => d.pinturaHours || 0),
                        backgroundColor: '#28a745'
                    },
                    {
                        label: 'Preparação (h)',
                        data: recent.map(d => d.preparacaoHours || 0),
                        backgroundColor: '#17a2b8'
                    },
                    {
                        label: 'Montagem (h)',
                        data: recent.map(d => d.montagemHours || 0),
                        backgroundColor: '#ffc107'
                    }
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
                        const idx = elements[0].index;
                        const ofNum = recent[idx].of;
                        window.showOFDetail(ofNum);
                    }
                }
            }
        });
    },

    renderMonthlyTrend(canvasId, monthlyData) {
        this.destroy(canvasId);
        const ctx = document.getElementById(canvasId).getContext('2d');

        // monthlyData is an array of 12 objects with { hours, units }
        const hoursData = monthlyData.map(m => Math.round(m.hours * 100) / 100);
        const unitsData = monthlyData.map(m => m.units);

        this.instances[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
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
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                scales: {
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: { display: true, text: 'Horas' },
                        beginAtZero: true
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: { display: true, text: 'Unidades' },
                        grid: { drawOnChartArea: false },
                        beginAtZero: true
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.dataset.label || '';
                                const value = context.parsed.y;
                                if (label.includes('Horas')) {
                                    return `${label}: ${value.toFixed(1)}h`;
                                }
                                return `${label}: ${value}`;
                            }
                        }
                    }
                }
            }
        });
    }
};
