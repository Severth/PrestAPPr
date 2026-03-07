const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const db = require('./db');
const { calculateAmortization, calcularResumen } = require('./utils/amortization');
const dotenv = require('dotenv')


const env = dotenv.config()





const app = express();
const PORT = process.env.PORT || 5000;



// CORS: allow frontend (served separately or via file://) to call this API
app.use(cors({ origin: '*' }));
app.use(bodyParser.json());

// ─────────────────────────────────────────────
// USUARIOS
// ─────────────────────────────────────────────

// GET /api/usuarios - List all users
app.get('/api/usuarios', (req, res) => {
    const search = req.query.q ? `%${req.query.q}%` : '%';
    const sql = `SELECT * FROM usuarios WHERE nombre_completo LIKE ? OR dni LIKE ? ORDER BY nombre_completo`;
    db.all(sql, [search, search], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// GET /api/usuarios/:id - Get user with their loans
app.get('/api/usuarios/:id', (req, res) => {
    db.get('SELECT * FROM usuarios WHERE id = ?', [req.params.id], (err, usuario) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

        db.all('SELECT * FROM prestamos WHERE usuario_id = ? ORDER BY created_at DESC', [req.params.id], (err, prestamos) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ...usuario, prestamos });
        });
    });
});

// POST /api/usuarios - Create user
app.post('/api/usuarios', (req, res) => {
    const { nombre_completo, dni, telefono, correo, direccion } = req.body;
    if (!nombre_completo || !dni || !telefono) {
        return res.status(400).json({ error: 'Nombre, DNI y Teléfono son obligatorios' });
    }
    const sql = `INSERT INTO usuarios (nombre_completo, dni, telefono, correo, direccion) VALUES (?, ?, ?, ?, ?)`;
    db.run(sql, [nombre_completo, dni, telefono, correo, direccion], function (err) {
        if (err) return res.status(400).json({ error: err.message });
        res.status(201).json({ id: this.lastID, message: 'Usuario creado exitosamente' });
    });
});

// PUT /api/usuarios/:id - Update user
app.put('/api/usuarios/:id', (req, res) => {
    const { nombre_completo, telefono, correo, direccion } = req.body;
    const sql = `UPDATE usuarios SET nombre_completo=?, telefono=?, correo=?, direccion=? WHERE id=?`;
    db.run(sql, [nombre_completo, telefono, correo, direccion, req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Usuario actualizado', changes: this.changes });
    });
});

// ─────────────────────────────────────────────
// PRESTAMOS
// ─────────────────────────────────────────────

// GET /api/prestamos/:id - Get loan with all installments
app.get('/api/prestamos/:id', (req, res) => {
    db.get(`SELECT p.*, u.nombre_completo, u.telefono FROM prestamos p JOIN usuarios u ON p.usuario_id = u.id WHERE p.id = ?`,
        [req.params.id], (err, prestamo) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!prestamo) return res.status(404).json({ error: 'Préstamo no encontrado' });

            db.all('SELECT * FROM cuotas WHERE prestamo_id = ? ORDER BY numero_cuota', [req.params.id], (err, cuotas) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ ...prestamo, cuotas });
            });
        });
});

// POST /api/prestamos - Create loan
app.post('/api/prestamos', (req, res) => {
    const { usuario_id, monto, tasa_interes_anual, plazo_meses, fecha_inicio } = req.body;
    if (!usuario_id || !monto || !tasa_interes_anual || !plazo_meses || !fecha_inicio) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios' });
    }

    const sqlLoan = `INSERT INTO prestamos (usuario_id, monto, tasa_interes_anual, plazo_meses, fecha_inicio) VALUES (?, ?, ?, ?, ?)`;
    db.run(sqlLoan, [usuario_id, monto, tasa_interes_anual, plazo_meses, fecha_inicio], function (err) {
        if (err) return res.status(400).json({ error: err.message });

        const prestamo_id = this.lastID;
        const planPagos = calculateAmortization(monto, tasa_interes_anual, plazo_meses, fecha_inicio);

        const placeholders = planPagos.map(() => '(?,?,?,?,?,?,?,?)').join(',');
        const values = [];
        planPagos.forEach(c => {
            values.push(prestamo_id, c.numero_cuota, c.fecha_vencimiento, c.monto_cuota, c.capital, c.interes, c.saldo, 'Pendiente');
        });

        const sqlCuotas = `INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, monto_cuota, capital, interes, saldo, estado) VALUES ${placeholders}`;
        db.run(sqlCuotas, values, (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ success: true, prestamo_id, cuotas_generadas: planPagos.length, planPagos });
        });
    });
});

// PUT /api/prestamos/:id/estado - Update loan status
app.put('/api/prestamos/:id/estado', (req, res) => {
    const { estado } = req.body;
    db.run('UPDATE prestamos SET estado=? WHERE id=?', [estado, req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Estado actualizado' });
    });
});

// ─────────────────────────────────────────────
// CUOTAS
// ─────────────────────────────────────────────

// PATCH /api/cuotas/:id/pagar - Mark installment as paid
app.patch('/api/cuotas/:id/pagar', (req, res) => {
    const sql = `UPDATE cuotas SET estado='Pagado', fecha_pago=datetime('now') WHERE id=?`;
    db.run(sql, [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Cuota no encontrada' });

        // Check if all installments are paid → update loan to 'Finalizado'
        db.get('SELECT prestamo_id FROM cuotas WHERE id=?', [req.params.id], (err, cuota) => {
            if (cuota) {
                db.get('SELECT COUNT(*) as pendientes FROM cuotas WHERE prestamo_id=? AND estado="Pendiente"',
                    [cuota.prestamo_id], (err, row) => {
                        if (row && row.pendientes === 0) {
                            db.run('UPDATE prestamos SET estado="Finalizado" WHERE id=?', [cuota.prestamo_id]);
                        }
                    });
            }
        });

        res.json({ success: true, message: 'Cuota marcada como pagada' });
    });
});

// ─────────────────────────────────────────────
// COBROS DEL DÍA
// ─────────────────────────────────────────────

// GET /api/cobros-dia - Today's pending installments
app.get('/api/cobros-dia', (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const sql = `
        SELECT c.id as cuota_id, c.numero_cuota, c.fecha_vencimiento, c.monto_cuota, c.estado,
               p.id as prestamo_id, p.monto as monto_prestamo,
               u.id as usuario_id, u.nombre_completo, u.telefono
        FROM cuotas c
        JOIN prestamos p ON c.prestamo_id = p.id
        JOIN usuarios u ON p.usuario_id = u.id
        WHERE c.fecha_vencimiento = ? AND c.estado = 'Pendiente'
        ORDER BY u.nombre_completo
    `;
    db.all(sql, [today], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        const results = rows.map(row => {
            const msg = encodeURIComponent(`Hola ${row.nombre_completo}, te recordamos que tu cuota #${row.numero_cuota} de $${row.monto_cuota} vence hoy.`);
            return {
                ...row,
                wa_link: `https://wa.me/${row.telefono.replace(/\D/g, '')}?text=${msg}`
            };
        });
        res.json(results);
    });
});

// GET /api/cobros-vencidos - Overdue installments
app.get('/api/cobros-vencidos', (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const sql = `
        SELECT c.id as cuota_id, c.numero_cuota, c.fecha_vencimiento, c.monto_cuota,
               p.id as prestamo_id,
               u.nombre_completo, u.telefono
        FROM cuotas c
        JOIN prestamos p ON c.prestamo_id = p.id
        JOIN usuarios u ON p.usuario_id = u.id
        WHERE c.fecha_vencimiento < ? AND c.estado = 'Pendiente'
        ORDER BY c.fecha_vencimiento ASC
    `;
    db.all(sql, [today], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const results = rows.map(row => {
            const msg = encodeURIComponent(`Hola ${row.nombre_completo}, tienes una cuota #${row.numero_cuota} de $${row.monto_cuota} vencida desde el ${row.fecha_vencimiento}. Por favor regulariza tu pago.`);
            return {
                ...row,
                wa_link: `https://wa.me/${row.telefono.replace(/\D/g, '')}?text=${msg}`
            };
        });
        res.json(results);
    });
});

// GET /api/calcular - Real-time amortization preview
app.get('/api/calcular', (req, res) => {
    const { monto, tasa, plazo } = req.query;
    if (!monto || !tasa || !plazo) return res.status(400).json({ error: 'Faltan parámetros' });
    res.json(calcularResumen(monto, tasa, plazo));
});

app.listen(PORT, () => {
    console.log(`\n🚀 PrestAPPr Backend ejecutándose en http://localhost:${PORT}`);
    console.log(`   API disponible en http://localhost:${PORT}/api\n`);
});
