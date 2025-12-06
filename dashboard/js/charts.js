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
                        data: recent.map(d => d.acabamentoHours),
                        backgroundColor: '#E6692D'
                    },
                    {
                        label: 'Estofagem (h)',
                        data: recent.map(d => d.estofagemHours),
                        backgroundColor: '#2c3e50'
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

    renderMonthlyTrend(canvasId, data) {
        // Needs prepared monthly formatted data
        // Placeholder for now
        this.destroy(canvasId);
        const ctx = document.getElementById(canvasId).getContext('2d');

        this.instances[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
                datasets: [{
                    label: 'Horas Totais',
                    data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // Todo: Aggregate in main.js
                    borderColor: '#28a745',
                    fill: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });
    }
};
