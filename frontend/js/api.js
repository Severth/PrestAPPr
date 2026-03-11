/**
 * api.js - Módulo central de peticiones al backend de PrestAPPr
 * Cambia BASE_URL si tu backend corre en otro puerto o servidor.
 */
const BASE_URL = 'http://localhost:3001/api';

const api = {
    // ── CONFIGURACION ─────────────────────────────
    async getCapital() {
        const res = await fetch(`${BASE_URL}/capital`);
        if (!res.ok) throw await res.json();
        return res.json();
    },
    async updateCapital(capital_base) {
        const res = await fetch(`${BASE_URL}/capital`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ capital_base })
        });
        if (!res.ok) throw await res.json();
        return res.json();
    },
    async getReportes() {
        const res = await fetch(`${BASE_URL}/reportes`);
        if (!res.ok) throw await res.json();
        return res.json();
    },
    async getTransacciones() {
        const res = await fetch(`${BASE_URL}/transacciones`);
        if (!res.ok) throw await res.json();
        return res.json();
    },

    // ── SOLICITUDES EXTERNAS ──────────────────────
    async getSolicitudes() {
        const res = await fetch(`${BASE_URL}/solicitudes`);
        if (!res.ok) throw await res.json();
        return res.json();
    },
    async resolverSolicitud(id, accion) {
        const res = await fetch(`${BASE_URL}/solicitudes/${id}/accion`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accion })
        });
        if (!res.ok) throw await res.json();
        return res.json();
    },

    // ── USUARIOS ────────────────────────────────
    async getUsuarios(q = '') {
        const res = await fetch(`${BASE_URL}/usuarios?q=${encodeURIComponent(q)}`);
        if (!res.ok) throw await res.json();
        return res.json();
    },

    async getUsuario(id) {
        const res = await fetch(`${BASE_URL}/usuarios/${id}`);
        if (!res.ok) throw await res.json();
        return res.json();
    },

    async crearUsuario(data) {
        const res = await fetch(`${BASE_URL}/usuarios`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!res.ok) throw await res.json();
        return res.json();
    },

    async actualizarUsuario(id, data) {
        const res = await fetch(`${BASE_URL}/usuarios/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!res.ok) throw await res.json();
        return res.json();
    },

    // ── PRÉSTAMOS ────────────────────────────────
    async getPrestamo(id) {
        const res = await fetch(`${BASE_URL}/prestamos/${id}`);
        if (!res.ok) throw await res.json();
        return res.json();
    },

    async crearPrestamo(data) {
        const res = await fetch(`${BASE_URL}/prestamos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!res.ok) throw await res.json();
        return res.json();
    },

    // ── CUOTAS ────────────────────────────────
    async pagarCuota(id, data = {}) {
        const res = await fetch(`${BASE_URL}/cuotas/${id}/pagar`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!res.ok) throw await res.json();
        return res.json();
    },

    // ── COBROS ────────────────────────────────
    async getCobrosHoy() {
        const res = await fetch(`${BASE_URL}/cobros-dia`);
        if (!res.ok) throw await res.json();
        return res.json();
    },

    async getCobrosVencidos() {
        const res = await fetch(`${BASE_URL}/cobros-vencidos`);
        if (!res.ok) throw await res.json();
        return res.json();
    },

    async getCarteraActiva() {
        const res = await fetch(`${BASE_URL}/cartera-activa`);
        if (!res.ok) throw await res.json();
        return res.json();
    },

    // ── CALCULADORA ────────────────────────────────
    async calcular(monto, tasa, plazo) {
        const res = await fetch(`${BASE_URL}/calcular?monto=${monto}&tasa=${tasa}&plazo=${plazo}`);
        if (!res.ok) throw await res.json();
        return res.json();
    }
};
