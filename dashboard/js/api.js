const API_BASE = (() => {
    const h = window.location.hostname;
    if (h === 'localhost' || h === '127.0.0.1') return 'http://localhost:8787/api/dashboard';
    if (h === '192.168.1.103') return 'http://192.168.1.103/api/dashboard';
    return window.location.origin + '/api/dashboard';
})();

const API = {
    async get(endpoint, params = {}) {
        const url = new URL(`${API_BASE}${endpoint}`);
        Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));

        try {
            const resp = await fetch(url);
            if (!resp.ok) {
                const text = await resp.text();
                throw new Error(text || `Error ${resp.status}`);
            }
            const json = await resp.json();
            return json;
        } catch (e) {
            console.error(`API Error [${endpoint}]:`, e);
            throw e;
        }
    },

    async post(endpoint, body) {
        try {
            const resp = await fetch(`${API_BASE}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!resp.ok) {
                const text = await resp.text();
                throw new Error(text || `Error ${resp.status}`);
            }
            return await resp.json();
        } catch (e) {
            console.error(`API Error [POST ${endpoint}]:`, e);
            throw e;
        }
    },

    async delete(endpoint) {
        try {
            const resp = await fetch(`${API_BASE}${endpoint}`, {
                method: 'DELETE'
            });
            if (!resp.ok) {
                const text = await resp.text();
                throw new Error(text || `Error ${resp.status}`);
            }
            return await resp.json();
        } catch (e) {
            console.error(`API Error [DELETE ${endpoint}]:`, e);
            throw e;
        }
    },

    // Specific Methods
    getOFsList: () => API.get('/ofs-list'),
    saveOF: (data) => API.post('/of-manage', data),
    getAquecimento: (year, refresh) => API.get('/aquecimento', { year, ...(refresh && { refresh: 'true' }) }),

    getSummary: (refresh) => API.get('/summary', refresh ? { refresh: 'true' } : {}),
    getEmployees: (year, refresh) => API.get('/employees', { year, ...(refresh && { refresh: 'true' }) }),
    getOFs: (year, refresh) => API.get('/ofs', { year, ...(refresh && { refresh: 'true' }) }),
    getCosts: (refresh) => API.get('/costs', refresh ? { refresh: 'true' } : {}),
    getOFDetail: (id) => API.get(`/of/${id}`),
    getEmployeeDetail: (name, year) => API.get(`/employee/${encodeURIComponent(name)}`, { year }),

    saveCost: (data) => API.post('/employee-cost', data),
    deleteCost: (id) => API.delete(`/employee-cost/${id}`)
};
