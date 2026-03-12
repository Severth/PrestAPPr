const API_URL = "https://prestappr-production.up.railway.app";
const BASE_URL = `${API_URL}/api`;

const api = {
    // ── AUTHENTICATION ─────────────────────────────
    setToken(token) {
        localStorage.setItem('token', token);
    },
    getToken() {
        return localStorage.getItem('token');
    },
    logout() {
        localStorage.removeItem('token');
        window.location.href = 'login.html';
    },

    async fetchAuth(url, options = {}) {
        const token = this.getToken();
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...(options.headers || {})
        };
        
        const res = await fetch(url, { ...options, headers });
        
        if (res.status === 401) {
            this.logout();
            throw { error: 'Sesión expirada' };
        }
        
        return res;
    },

    async login(email, password) {
        const res = await fetch(`${BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!res.ok) throw data;
        this.setToken(data.token);
        return data;
    },

    // ── FETCH WRAPPER ─────────────────────────────
    async call(endpoint, options = {}) {
        const res = await this.fetchAuth(`${BASE_URL}${endpoint}`, options);
        
        if (res.status === 403) {
            throw { error: 'Acceso prohibido' };
        }

        const data = await res.json();
        if (!res.ok) throw data;
        return data;
    },

    // ── DASHBOARD & STATS ──────────────────────────
    async getDashboardStats(periodo = 'total') {
        return this.call(`/dashboard-stats?periodo=${periodo}`);
    },

    async getDistribucionCuentas() {
        return this.call('/distribucion-cuentas');
    },

    async getActividadReciente() {
        return this.call('/actividad-reciente');
    },

    async getPrestamosTabla() {
        return this.call('/prestamos-tabla');
    },

    // ── CONFIGURACION ─────────────────────────────
    async getCapital() {
        return this.call('/capital');
    },
    async updateCapital(capital_base) {
        return this.call('/capital', {
            method: 'PUT',
            body: JSON.stringify({ capital_base })
        });
    },
    async getReportes() {
        return this.call('/reportes');
    },
    async getTransacciones() {
        return this.call('/transacciones');
    },

    // ── SOLICITUDES ──────────────────────────────
    async getSolicitudes() {
        return this.call('/solicitudes');
    },
    async crearSolicitud(data) {
        // Public request doesn't need token
        const res = await fetch(`${BASE_URL}/solicitudes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!res.ok) throw await res.json();
        return res.json();
    },
    async resolverSolicitud(id, accion) {
        return this.call(`/solicitudes/${id}/accion`, {
            method: 'POST',
            body: JSON.stringify({ accion })
        });
    },

    // ── USUARIOS ────────────────────────────────
    async getUsuarios(q = '') {
        return this.call(`/usuarios?q=${encodeURIComponent(q)}`);
    },

    async getUsuario(id) {
        return this.call(`/usuarios/${id}`);
    },

    async crearUsuario(data) {
        return this.call('/usuarios', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    async actualizarUsuario(id, data) {
        return this.call(`/usuarios/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },

    // ── PRÉSTAMOS ────────────────────────────────
    async getPrestamo(id) {
        return this.call(`/prestamos/${id}`);
    },

    async crearPrestamo(data) {
        return this.call('/prestamos', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    // ── CUOTAS ────────────────────────────────
    async pagarCuota(id, data = {}) {
        return this.call(`/cuotas/${id}/pagar`, {
            method: 'PATCH',
            body: JSON.stringify(data)
        });
    },

    // ── COBROS ────────────────────────────────
    async getCobrosHoy() {
        return this.call('/cobros-dia');
    },

    async getCobrosVencidos() {
        return this.call('/cobros-vencidos');
    },

    async getCarteraActiva() {
        return this.call('/cartera-activa');
    },

    // ── CALCULADORA ────────────────────────────────
    async calcular(monto, tasa, plazo) {
        const res = await fetch(`${BASE_URL}/calcular?monto=${monto}&tasa=${tasa}&plazo=${plazo}`);
        if (!res.ok) throw await res.json();
        return res.json();
    }
};

// Asegurar que el objeto api esté disponible globalmente para evitar conflictos de scope
window.api = api;
