const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const db = require('./db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { calculateAmortization, calcularResumen } = require('./utils/amortization');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';

// CORS: allow frontend to call this API
app.use(cors({ origin: '*' }));
app.use(bodyParser.json());

// Middleware to protect routes
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Acceso denegado. Token no proporcionado.' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            console.error('JWT Verification Error:', err.message);
            return res.status(403).json({ error: 'Token inválido o expirado.' });
        }
        req.user = user;
        next();
    });
};

// ─────────────────────────────────────────────
// AUTENTICACIÓN
// ─────────────────────────────────────────────

// POST /api/login
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });

    try {
        const result = await db.query('SELECT * FROM admins WHERE email = $1', [email]);
        const admin = result.rows[0];

        if (!admin) return res.status(401).json({ error: 'Credenciales inválidas' });

        const validPassword = await bcrypt.compare(password, admin.password_hash);
        if (!validPassword) return res.status(401).json({ error: 'Credenciales inválidas' });

        const token = jwt.sign({ id: admin.id, email: admin.email }, JWT_SECRET, { expiresIn: '8h' });
        res.json({ token, user: { email: admin.email } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Initialize Schema
db.initSchema();

// ─────────────────────────────────────────────
// CONFIGURACIÓN (CAPITAL BASE)
// ─────────────────────────────────────────────

// GET /api/capital
app.get('/api/capital', authenticateToken, async (req, res) => {
    try {
        const result = await db.query('SELECT capital_base FROM configuracion WHERE id = 1');
        res.json({ capital_base: result.rows[0] ? result.rows[0].capital_base : 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/capital
app.put('/api/capital', authenticateToken, async (req, res) => {
    const { capital_base } = req.body;
    try {
        await db.query('UPDATE configuracion SET capital_base = $1 WHERE id = 1', [capital_base]);
        res.json({ message: 'Capital base actualizado' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────
// USUARIOS
// ─────────────────────────────────────────────

// GET /api/usuarios - List all users
app.get('/api/usuarios', authenticateToken, async (req, res) => {
    const search = req.query.q ? `%${req.query.q}%` : '%';
    const sql = `
        SELECT u.*, 
               (SELECT COUNT(id) FROM prestamos p WHERE p.usuario_id = u.id AND p.tasa_interes_anual > 0) as creditos_con_interes
        FROM usuarios u
        WHERE u.estado='Activo' AND (u.nombre_completo ILIKE $1 OR u.dni ILIKE $2) 
        ORDER BY u.nombre_completo
    `;
    try {
        const result = await db.query(sql, [search, search]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/usuarios/:id - Get user with their loans
app.get('/api/usuarios/:id', authenticateToken, async (req, res) => {
    try {
        const userRes = await db.query('SELECT * FROM usuarios WHERE id = $1', [req.params.id]);
        const usuario = userRes.rows[0];
        if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

        const loansRes = await db.query('SELECT * FROM prestamos WHERE usuario_id = $1 ORDER BY created_at DESC', [req.params.id]);
        res.json({ ...usuario, prestamos: loansRes.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/usuarios - Create user
app.post('/api/usuarios', authenticateToken, async (req, res) => {
    const { nombre_completo, dni, telefono, correo, direccion } = req.body;
    if (!nombre_completo || !dni || !telefono) {
        return res.status(400).json({ error: 'Nombre, DNI y Teléfono son obligatorios' });
    }
    const sql = `INSERT INTO usuarios (nombre_completo, dni, telefono, correo, direccion) VALUES ($1, $2, $3, $4, $5) RETURNING id`;
    try {
        const result = await db.query(sql, [nombre_completo, dni, telefono, correo, direccion]);
        res.status(201).json({ id: result.rows[0].id, message: 'Usuario creado exitosamente' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// PUT /api/usuarios/:id - Update user
app.put('/api/usuarios/:id', authenticateToken, async (req, res) => {
    const { nombre_completo, telefono, correo, direccion } = req.body;
    const sql = `UPDATE usuarios SET nombre_completo=$1, telefono=$2, correo=$3, direccion=$4 WHERE id=$5`;
    try {
        const result = await db.query(sql, [nombre_completo, telefono, correo, direccion, req.params.id]);
        res.json({ message: 'Usuario actualizado', rowCount: result.rowCount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────
// SOLICITUDES DE CRÉDITO EXTERNAS
// ─────────────────────────────────────────────

// GET /api/solicitudes - List pending requests
app.get('/api/solicitudes', authenticateToken, async (req, res) => {
    try {
        const result = await db.query(`SELECT * FROM usuarios WHERE estado = 'Pendiente' ORDER BY created_at DESC`);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/solicitudes - Create pending user from public form
app.post('/api/solicitudes', async (req, res) => {
    const { nombre_completo, dni, telefono, direccion, monto_solicitado, plazo_meses_solicitado } = req.body;
    if (!nombre_completo || !dni || !telefono || !monto_solicitado || !plazo_meses_solicitado) {
        return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    try {
        // Check if DNI already exists
        const check = await db.query('SELECT id FROM usuarios WHERE dni = $1', [dni]);
        if (check.rows.length > 0) return res.status(400).json({ error: 'Ya existe un usuario con este DNI.' });

        const sql = `INSERT INTO usuarios (nombre_completo, dni, telefono, direccion, estado, monto_solicitado, plazo_meses_solicitado) VALUES ($1, $2, $3, $4, 'Pendiente', $5, $6) RETURNING id`;
        const result = await db.query(sql, [nombre_completo, dni, telefono, direccion, monto_solicitado, plazo_meses_solicitado]);
        res.status(201).json({ id: result.rows[0].id, message: 'Solicitud enviada exitosamente' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// POST /api/solicitudes/:id/accion - Approve or Reject request
app.post('/api/solicitudes/:id/accion', authenticateToken, async (req, res) => {
    const { accion } = req.body;
    const id = req.params.id;

    try {
        if (accion === 'rechazar') {
            await db.query(`UPDATE usuarios SET estado='Rechazado' WHERE id=$1`, [id]);
            return res.json({ success: true, message: 'Solicitud rechazada' });
        } else if (accion === 'aprobar') {
            await db.query(`UPDATE usuarios SET estado='Activo' WHERE id=$1`, [id]);
            return res.json({ success: true, message: 'Usuario aprobado. Ahora puedes generarle su crédito.' });
        } else {
            return res.status(400).json({ error: 'Acción no válida' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────
// PRESTAMOS
// ─────────────────────────────────────────────

// GET /api/prestamos/:id - Get loan with all installments
app.get('/api/prestamos/:id', authenticateToken, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID de préstamo inválido' });

    try {
        const loanRes = await db.query(`
            SELECT p.*, u.nombre_completo, u.telefono 
            FROM prestamos p 
            JOIN usuarios u ON p.usuario_id = u.id 
            WHERE p.id = $1`, [req.params.id]);
        
        const prestamo = loanRes.rows[0];
        if (!prestamo) return res.status(404).json({ error: 'Préstamo no encontrado' });

        const installmentsRes = await db.query('SELECT * FROM cuotas WHERE prestamo_id = $1 ORDER BY numero_cuota', [req.params.id]);
        res.json({ ...prestamo, cuotas: installmentsRes.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/prestamos - Create loan
app.post('/api/prestamos', authenticateToken, async (req, res) => {
    let { usuario_id, monto, tasa_interes_mensual, plazo_meses, fecha_inicio, metodo_desembolso, cuenta_origen } = req.body;
    
    // Default fecha_inicio to today if not provided
    if (!fecha_inicio) {
        fecha_inicio = new Date().toISOString().split('T')[0];
    }

    if (!usuario_id || !monto || !tasa_interes_mensual || !plazo_meses) {
        return res.status(400).json({ error: 'Faltan campos obligatorios (usuario_id, monto, tasa, plazo)' });
    }

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        const confRes = await client.query('SELECT capital_base FROM configuracion WHERE id = 1 FOR UPDATE');
        const conf = confRes.rows[0];
        if (!conf || conf.capital_base < monto) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Capital insuficiente para este préstamo' });
        }

        await client.query('UPDATE configuracion SET capital_base = capital_base - $1 WHERE id = 1', [monto]);

        const sqlLoan = `INSERT INTO prestamos (usuario_id, monto, tasa_interes_anual, tasa_interes_mensual, plazo_meses, fecha_inicio, metodo_desembolso, cuenta_origen) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`;
        const tasaAnual = parseFloat((tasa_interes_mensual * 12).toFixed(2));
        const loanResult = await client.query(sqlLoan, [usuario_id, monto, tasaAnual, tasa_interes_mensual, plazo_meses, fecha_inicio, metodo_desembolso || 'Efectivo', cuenta_origen || '']);
        const prestamo_id = loanResult.rows[0].id;

        const planPagos = calculateAmortization(monto, tasa_interes_mensual, plazo_meses, fecha_inicio);

        for (const c of planPagos) {
            const sqlCuotas = `INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, monto_cuota, capital, interes, saldo, estado) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`;
            await client.query(sqlCuotas, [prestamo_id, c.numero_cuota, c.fecha_vencimiento, c.monto_cuota, c.capital, c.interes, c.saldo, 'Pendiente']);
        }

        await client.query('COMMIT');
        res.status(201).json({ success: true, id: prestamo_id, prestamo_id, cuotas_generadas: planPagos.length, planPagos });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// PUT /api/prestamos/:id/estado - Update loan status
app.put('/api/prestamos/:id/estado', authenticateToken, async (req, res) => {
    const { estado } = req.body;
    try {
        await db.query('UPDATE prestamos SET estado=$1 WHERE id=$2', [estado, req.params.id]);
        res.json({ message: 'Estado actualizado' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────
// CUOTAS
// ─────────────────────────────────────────────

// PATCH /api/cuotas/:id/pagar - Mark installment as paid or partial payment
app.patch('/api/cuotas/:id/pagar', authenticateToken, async (req, res) => {
    const { tipo, metodo, cuenta_origen, cuenta_destino, cobrador, capital_abonado } = req.body;
    // tipo: 'completo', 'interes', 'capital' (abono extra)

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        const cuotaRes = await client.query('SELECT * FROM cuotas WHERE id=$1', [req.params.id]);
        const cuota = cuotaRes.rows[0];
        if (!cuota || cuota.estado === 'Pagado') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Cuota no encontrada o ya pagada' });
        }

        const prestamoRes = await client.query('SELECT * FROM prestamos WHERE id=$1', [cuota.prestamo_id]);
        const prestamo = prestamoRes.rows[0];

        let montoAdeudado = cuota.monto_cuota;
        let nuevoEstado = 'Pagado';
        let abonoAdicionalCapital = 0;

        if (tipo === 'interes') {
            montoAdeudado = cuota.interes;
            nuevoEstado = 'Abono_interes';
        } else if (tipo === 'capital') {
            abonoAdicionalCapital = parseFloat(capital_abonado || cuota.capital);
            if (isNaN(abonoAdicionalCapital) || abonoAdicionalCapital <= 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Monto de capital inválido' });
            }
            montoAdeudado = cuota.interes + abonoAdicionalCapital;
            nuevoEstado = 'Agregado_capital_extra';
        }

        const sqlUpdateCuota = `UPDATE cuotas SET estado=$1, fecha_pago=CURRENT_TIMESTAMP, tipo_pago=$2, metodo_pago=$3, cuenta_origen=$4, cuenta_destino=$5, cobrador=$6, capital=$7, monto_cuota=$8, saldo=$9 WHERE id=$10`;
        
        let updatedCapital = (tipo === 'completo') ? cuota.capital : ((tipo === 'capital') ? abonoAdicionalCapital : 0);
        let updatedMonto = (tipo === 'completo') ? cuota.monto_cuota : montoAdeudado;
        let lastSaldo = cuota.saldo + cuota.capital - updatedCapital;

        await client.query(sqlUpdateCuota, [nuevoEstado, tipo || 'completo', metodo || 'Efectivo', cuenta_origen || '', cuenta_destino || '', cobrador || '', updatedCapital, updatedMonto, lastSaldo, req.params.id]);

        // Registrar retorno al capital base
        await client.query('UPDATE configuracion SET capital_base = capital_base + $1 WHERE id = 1', [montoAdeudado]);

        // Recalculo de cuotas restantes
        if (tipo === 'interes' || tipo === 'capital') {
            await client.query('DELETE FROM cuotas WHERE prestamo_id = $1 AND estado = $2 AND numero_cuota > $3', [cuota.prestamo_id, 'Pendiente', cuota.numero_cuota]);

            let remainingN = prestamo.plazo_meses - cuota.numero_cuota;
            if (tipo === 'interes') {
                remainingN += 1;
            }
            
            if (remainingN > 0 && lastSaldo > 0.01) {
                const i = prestamo.tasa_interes_mensual / 100;
                let nuevaCuotaMensual = lastSaldo * (i * Math.pow(1 + i, remainingN)) / (Math.pow(1 + i, remainingN) - 1);
                
                let nuevoSaldoTracker = lastSaldo;
                let startVencimiento = new Date(cuota.fecha_vencimiento);
                // Ensure date is handled correctly for local timezone vs UTC
                startVencimiento.setHours(12,0,0,0);

                for (let n = 1; n <= remainingN; n++) {
                    const interesN = nuevoSaldoTracker * i;
                    const capitalN = nuevaCuotaMensual - interesN;
                    nuevoSaldoTracker -= capitalN;
                    
                    startVencimiento.setMonth(startVencimiento.getMonth() + 1);

                    const sqlRepopulate = `INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, monto_cuota, capital, interes, saldo, estado) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`;
                    await client.query(sqlRepopulate, [
                        prestamo.id, 
                        cuota.numero_cuota + n, 
                        startVencimiento.toISOString().split('T')[0], 
                        parseFloat(nuevaCuotaMensual.toFixed(2)), 
                        parseFloat(capitalN.toFixed(2)), 
                        parseFloat(interesN.toFixed(2)), 
                        parseFloat(Math.max(0, nuevoSaldoTracker).toFixed(2)), 
                        'Pendiente'
                    ]);
                }
            }
        }

        await client.query('COMMIT');
        
        // Check finalizacion after commit to avoid holding connection longer than necessary
        await checkFinalizacion(cuota.prestamo_id);
        
        res.json({ success: true, message: `Pago registrado (${tipo || 'completo'}). ${tipo !== 'completo' ? 'Plan recalculado.' : ''}` });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

async function checkFinalizacion(prestamo_id) {
    try {
        const result = await db.query('SELECT COUNT(*) as pendientes FROM cuotas WHERE prestamo_id=$1 AND estado = $2', [prestamo_id, 'Pendiente']);
        if (result.rows[0] && parseInt(result.rows[0].pendientes) === 0) {
            await db.query('UPDATE prestamos SET estado=$1 WHERE id=$2', ['Finalizado', prestamo_id]);
        }
    } catch (err) {
        console.error("Error checkFinalizacion:", err.message);
    }
}

// ─────────────────────────────────────────────
// COBROS DEL DÍA
// ─────────────────────────────────────────────

// GET /api/cobros-dia - Today's pending installments
app.get('/api/cobros-dia', authenticateToken, async (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const sql = `
        SELECT c.id as cuota_id, c.numero_cuota, c.fecha_vencimiento, c.monto_cuota, c.estado,
               p.id as prestamo_id, p.monto as monto_prestamo,
               u.id as usuario_id, u.nombre_completo, u.telefono
        FROM cuotas c
        JOIN prestamos p ON c.prestamo_id = p.id
        JOIN usuarios u ON p.usuario_id = u.id
        WHERE c.fecha_vencimiento = $1 AND c.estado = 'Pendiente'
        ORDER BY u.nombre_completo
    `;
    try {
        const result = await db.query(sql, [today]);
        const results = result.rows.map(row => {
            const msg = encodeURIComponent(`Hola ${row.nombre_completo}, te recordamos que tu cuota #${row.numero_cuota} de $${row.monto_cuota} vence hoy.`);
            return {
                ...row,
                es_mora: false,
                wa_link: `https://wa.me/57${row.telefono.replace(/\D/g, '')}?text=${msg}`
            };
        });
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/cobros-vencidos - Overdue installments
app.get('/api/cobros-vencidos', authenticateToken, async (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const sql = `
        SELECT c.id as cuota_id, c.numero_cuota, c.fecha_vencimiento, c.monto_cuota,
               p.id as prestamo_id,
               u.nombre_completo, u.telefono
        FROM cuotas c
        JOIN prestamos p ON c.prestamo_id = p.id
        JOIN usuarios u ON p.usuario_id = u.id
        WHERE c.fecha_vencimiento < $1 AND c.estado = 'Pendiente'
        ORDER BY c.fecha_vencimiento ASC
    `;
    try {
        const result = await db.query(sql, [today]);
        const results = result.rows.map(row => {
            const msg = encodeURIComponent(`⚠️ Hola ${row.nombre_completo}, tienes una cuota #${row.numero_cuota} de $${row.monto_cuota} VENCIDA desde el ${row.fecha_vencimiento}. Por favor regulariza tu pago lo antes posible.`);
            return {
                ...row,
                es_mora: true,
                wa_link: `https://wa.me/57${row.telefono.replace(/\D/g, '')}?text=${msg}`
            };
        });
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/cartera-activa - All active loans mapping
app.get('/api/cartera-activa', authenticateToken, async (req, res) => {
    const sql = `
        SELECT u.id as usuario_id, u.nombre_completo, u.telefono,
               p.id as prestamo_id, p.monto, p.fecha_inicio, p.tasa_interes_mensual,
               (SELECT MIN(c.fecha_vencimiento) FROM cuotas c WHERE c.prestamo_id = p.id AND c.estado = 'Pendiente') as proximo_vencimiento,
               (SELECT c.monto_cuota FROM cuotas c WHERE c.prestamo_id = p.id AND c.estado = 'Pendiente' ORDER BY c.numero_cuota ASC LIMIT 1) as proximo_pago_monto,
               (SELECT c.saldo FROM cuotas c WHERE c.prestamo_id = p.id AND c.estado != 'Pendiente' ORDER BY c.numero_cuota DESC LIMIT 1) as ultimo_saldo
        FROM prestamos p
        JOIN usuarios u ON p.usuario_id = u.id
        WHERE p.estado IN ('Activo')
        ORDER BY proximo_vencimiento ASC
    `;
    try {
        const result = await db.query(sql);
        const results = result.rows.map(r => {
            r.saldo_activo = r.ultimo_saldo !== null ? r.ultimo_saldo : r.monto;
            return r;
        });
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/transacciones - Latest Payments
app.get('/api/transacciones', authenticateToken, async (req, res) => {
    const sql = `
        SELECT c.id, c.monto_cuota as monto, c.tipo_pago, c.metodo_pago, c.fecha_pago, c.cuenta_destino,
               p.id as prestamo_id, u.nombre_completo 
        FROM cuotas c
        JOIN prestamos p ON c.prestamo_id = p.id
        JOIN usuarios u ON p.usuario_id = u.id
        WHERE c.estado IN ('Pagado', 'Abono_interes', 'Abono_capital')
        ORDER BY c.fecha_pago DESC LIMIT 15
    `;
    try {
        const result = await db.query(sql);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/reportes - General Dashboard statistics
app.get('/api/reportes', authenticateToken, async (req, res) => {
    try {
        const confRes = await db.query('SELECT capital_base FROM configuracion WHERE id=1');
        const stats = { capital_base: confRes.rows[0] ? confRes.rows[0].capital_base : 0, interes_ganado: 0, dinero_en_calle: 0 };

        const gananciaRes = await db.query(`SELECT SUM(interes) as ganancia FROM cuotas WHERE estado IN ('Pagado', 'Abono_interes')`);
        if (gananciaRes.rows[0] && gananciaRes.rows[0].ganancia) stats.interes_ganado = gananciaRes.rows[0].ganancia;

        const calleRes = await db.query(`SELECT SUM(saldo) as calle FROM cuotas WHERE estado = 'Pendiente'`);
        if (calleRes.rows[0] && calleRes.rows[0].calle) stats.dinero_en_calle = calleRes.rows[0].calle;

        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/calcular - Real-time amortization preview
app.get('/api/calcular', (req, res) => {
    const { monto, tasa, plazo } = req.query;
    if (!monto || !tasa || !plazo) return res.status(400).json({ error: 'Faltan parámetros' });
    res.json(calcularResumen(monto, tasa, plazo));
});

// ─────────────────────────────────────────────
// DASHBOARD ESTADÍSTICAS (Fase 2)
// ─────────────────────────────────────────────

// GET /api/dashboard-stats?periodo=hoy|semana|mes|total
app.get('/api/dashboard-stats', authenticateToken, async (req, res) => {
    const periodo = req.query.periodo || 'total';

    let fechaFiltro = null;
    const now = new Date();
    if (periodo === 'hoy') {
        fechaFiltro = now.toISOString().split('T')[0];
    } else if (periodo === 'semana') {
        const d = new Date(now);
        d.setDate(d.getDate() - 7);
        fechaFiltro = d.toISOString().split('T')[0];
    } else if (periodo === 'mes') {
        const d = new Date(now);
        d.setDate(d.getDate() - 30);
        fechaFiltro = d.toISOString().split('T')[0];
    }

    const today = now.toISOString().split('T')[0];
    const pagoFilter = fechaFiltro ? `AND c.fecha_pago::DATE >= $1` : '';
    const prestamoFilter = fechaFiltro ? `AND p.fecha_inicio >= $1` : '';
    const params = fechaFiltro ? [fechaFiltro] : [];

    try {
        const stats = {
            capital_libre: 0,
            capital_prestado: 0,
            intereses_ganados: 0,
            pendiente_cobrar: 0,
            cobrado_efectivo: 0,
            cobrado_transferencia: 0,
            prestamos_activos: 0,
            prestamos_vencidos: 0,
            monto_prestado_periodo: 0,
            monto_cobrado_periodo: 0,
            monto_desembolsado_periodo: 0
        };

        const confRes = await db.query('SELECT capital_base FROM configuracion WHERE id=1');
        stats.capital_libre = confRes.rows[0] ? confRes.rows[0].capital_base : 0;

        const prestadoRes = await db.query(`SELECT SUM(p.monto) as total FROM prestamos p WHERE p.estado = 'Activo'`);
        stats.capital_prestado = prestadoRes.rows[0].total || 0;

        const ganadoRes = await db.query(`SELECT SUM(c.interes) as ganado FROM cuotas c WHERE c.estado IN ('Pagado','Abono_interes') ${pagoFilter}`, params);
        stats.intereses_ganados = ganadoRes.rows[0].ganado || 0;

        const pendienteRes = await db.query(`SELECT SUM(c.monto_cuota) as pendiente FROM cuotas c WHERE c.estado = 'Pendiente'`);
        stats.pendiente_cobrar = pendienteRes.rows[0].pendiente || 0;

        const efRes = await db.query(`SELECT SUM(c.monto_cuota) as ef FROM cuotas c WHERE c.estado IN ('Pagado','Abono_interes','Agregado_capital_extra') AND c.metodo_pago = 'Efectivo' ${pagoFilter}`, params);
        stats.cobrado_efectivo = efRes.rows[0].ef || 0;

        const trRes = await db.query(`SELECT SUM(c.monto_cuota) as tr FROM cuotas c WHERE c.estado IN ('Pagado','Abono_interes','Agregado_capital_extra') AND c.metodo_pago = 'Transferencia' ${pagoFilter}`, params);
        stats.cobrado_transferencia = trRes.rows[0].tr || 0;

        const activosRes = await db.query(`SELECT COUNT(*) as activos FROM prestamos WHERE estado = 'Activo'`);
        stats.prestamos_activos = activosRes.rows[0].activos || 0;

        const vencidosRes = await db.query(`SELECT COUNT(DISTINCT c.prestamo_id) as vencidos FROM cuotas c WHERE c.estado = 'Pendiente' AND c.fecha_vencimiento < $1`, [today]);
        stats.prestamos_vencidos = vencidosRes.rows[0].vencidos || 0;

        const prestadoPeriodoRes = await db.query(`SELECT SUM(p.monto) as prestado FROM prestamos p WHERE 1=1 ${prestamoFilter}`, params);
        stats.monto_prestado_periodo = prestadoPeriodoRes.rows[0].prestado || 0;
        stats.monto_desembolsado_periodo = prestadoPeriodoRes.rows[0].prestado || 0;

        const cobradoPeriodoRes = await db.query(`SELECT SUM(c.monto_cuota) as cobrado FROM cuotas c WHERE c.estado IN ('Pagado','Abono_interes','Agregado_capital_extra') ${pagoFilter}`, params);
        stats.monto_cobrado_periodo = cobradoPeriodoRes.rows[0].cobrado || 0;

        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/actividad-reciente - Últimos eventos del sistema
app.get('/api/actividad-reciente', authenticateToken, async (req, res) => {
    const sqlPagos = `
        SELECT 'pago' as tipo, u.nombre_completo, c.monto_cuota as monto, c.fecha_pago as fecha, c.metodo_pago
        FROM cuotas c
        JOIN prestamos p ON c.prestamo_id = p.id
        JOIN usuarios u ON p.usuario_id = u.id
        WHERE c.estado IN ('Pagado','Abono_interes','Agregado_capital_extra') AND c.fecha_pago IS NOT NULL
        ORDER BY c.fecha_pago DESC LIMIT 8
    `;
    const sqlPrestamos = `
        SELECT 'prestamo' as tipo, u.nombre_completo, p.monto, p.created_at as fecha, p.metodo_desembolso as metodo_pago
        FROM prestamos p
        JOIN usuarios u ON p.usuario_id = u.id
        ORDER BY p.created_at DESC LIMIT 6
    `;
    const sqlClientes = `
        SELECT 'cliente' as tipo, u.nombre_completo, 0 as monto, u.created_at as fecha, NULL as metodo_pago
        FROM usuarios u WHERE u.estado = 'Activo'
        ORDER BY u.created_at DESC LIMIT 4
    `;

    try {
        const [pagos, prestamos, clientes] = await Promise.all([
            db.query(sqlPagos),
            db.query(sqlPrestamos),
            db.query(sqlClientes)
        ]);

        const todos = [...pagos.rows, ...prestamos.rows, ...clientes.rows]
            .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
            .slice(0, 15);
        res.json(todos);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/prestamos-tabla - Tabla de préstamos activos con días de atraso
app.get('/api/prestamos-tabla', authenticateToken, async (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const sql = `
        SELECT p.id, u.nombre_completo, u.telefono, p.fecha_inicio, p.monto, p.metodo_desembolso, p.tasa_interes_mensual,
               (SELECT MIN(c.fecha_vencimiento) FROM cuotas c WHERE c.prestamo_id = p.id AND c.estado = 'Pendiente' AND c.fecha_vencimiento < CURRENT_DATE) as fecha_atraso_mas_antigua,
               (SELECT SUM(c.monto_cuota) FROM cuotas c WHERE c.prestamo_id = p.id AND c.estado = 'Pendiente') as saldo_pendiente,
               (SELECT COUNT(*) FROM cuotas c WHERE c.prestamo_id = p.id AND c.estado = 'Pendiente' AND c.fecha_vencimiento < CURRENT_DATE) as cuotas_vencidas
        FROM prestamos p
        JOIN usuarios u ON p.usuario_id = u.id
        WHERE p.estado = 'Activo'
        ORDER BY fecha_atraso_mas_antigua ASC NULLS LAST, p.fecha_inicio DESC
    `;
    try {
        const result = await db.query(sql);
        const today_d = new Date(today);
        const rows = result.rows.map(r => {
            let dias_atraso = 0;
            if (r.fecha_atraso_mas_antigua) {
                const diff = today_d - new Date(r.fecha_atraso_mas_antigua);
                dias_atraso = Math.floor(diff / (1000 * 60 * 60 * 24));
            }
            return {
                ...r,
                dias_atraso,
                estado_tabla: dias_atraso > 0 ? 'Vencido' : 'Vigente'
            };
        });
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/distribucion-cuentas - Balance estimado por canal
app.get('/api/distribucion-cuentas', authenticateToken, async (req, res) => {
    const sqlPagos = `SELECT metodo_pago as metodo, SUM(monto_cuota) as total FROM cuotas 
                      WHERE estado IN ('Pagado','Abono_interes','Agregado_capital_extra') GROUP BY metodo_pago`;
    const sqlDesembolsos = `SELECT metodo_desembolso as metodo, SUM(monto) as total FROM prestamos GROUP BY metodo_desembolso`;

    try {
        const [pagos, desembolsos, confRes] = await Promise.all([
            db.query(sqlPagos),
            db.query(sqlDesembolsos),
            db.query('SELECT capital_base FROM configuracion WHERE id=1')
        ]);

        const balance = { Efectivo: 0, Transferencia: 0 };
        pagos.rows.forEach(p => { if (balance[p.metodo] !== undefined) balance[p.metodo] += parseFloat(p.total); });
        desembolsos.rows.forEach(d => { if (balance[d.metodo] !== undefined) balance[d.metodo] -= parseFloat(d.total); });

        const capitalBase = confRes.rows[0] ? parseFloat(confRes.rows[0].capital_base) : 0;
        balance.Efectivo += capitalBase;
        res.json(balance);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`\n🚀 PrestAPPr Backend ejecutándose en el puerto ${PORT}`);
    if (JWT_SECRET === 'fallback-secret-key') {
        console.warn('⚠️  ADVERTENCIA: JWT_SECRET está usando la clave de respaldo. Asegúrate de configurar JWT_SECRET en las variables de entorno de Railway.');
    }
});
