/**
 * api.js - Módulo central de peticiones al backend de PrestAPPr
 * Cambia BASE_URL si tu backend corre en otro puerto o servidor.
 */
const BASE_URL = 'http://localhost:3001/api';

const api = {
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
    async pagarCuota(id) {
        const res = await fetch(`${BASE_URL}/cuotas/${id}/pagar`, { method: 'PATCH' });
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

    // ── CALCULADORA ────────────────────────────────
    async calcular(monto, tasa, plazo) {
        const res = await fetch(`${BASE_URL}/calcular?monto=${monto}&tasa=${tasa}&plazo=${plazo}`);
        if (!res.ok) throw await res.json();
        return res.json();
    }
};
