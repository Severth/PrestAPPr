const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const db = require('./db');
const { calculateAmortization } = require('./utils/amortization');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// 1. POST /usuarios - Create user
app.post('/usuarios', (req, res) => {
    const { nombre_completo, dni, telefono, correo, direccion } = req.body;
    const sql = `INSERT INTO usuarios (nombre_completo, dni, telefono, correo, direccion) VALUES (?, ?, ?, ?, ?)`;

    db.run(sql, [nombre_completo, dni, telefono, correo, direccion], function (err) {
        if (err) {
            return res.status(400).json({ error: err.message });
        }
        res.status(201).json({ id: this.lastID, message: 'Usuario creado exitosamente' });
    });
});

// 2. POST /prestamos - Create loan and generate installments
app.post('/prestamos', (req, res) => {
    const { usuario_id, monto, tasa_interes_anual, plazo_meses, fecha_inicio } = req.body;

    const sqlLoan = `INSERT INTO prestamos (usuario_id, monto, tasa_interes_anual, plazo_meses, fecha_inicio) VALUES (?, ?, ?, ?, ?)`;

    db.run(sqlLoan, [usuario_id, monto, tasa_interes_anual, plazo_meses, fecha_inicio], function (err) {
        if (err) {
            return res.status(400).json({ error: err.message });
        }

        const prestamo_id = this.lastID;
        const planPagos = calculateAmortization(monto, tasa_interes_anual, plazo_meses, fecha_inicio);

        const placeholders = planPagos.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(',');
        const values = [];
        planPagos.forEach(cuota => {
            values.push(
                prestamo_id,
                cuota.numero_cuota,
                cuota.fecha_vencimiento,
                cuota.monto_cuota,
                cuota.capital,
                cuota.interes,
                cuota.saldo,
                'Pendiente'
            );
        });

        const sqlCuotas = `INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, monto_cuota, capital, interes, saldo, estado) VALUES ${placeholders}`;

        db.run(sqlCuotas, values, (err) => {
            if (err) {
                return res.status(400).json({ error: err.message });
            }
            res.status(201).json({ prestamo_id, planPagos });
        });
    });
});

// 3. GET /cobros-dia - Get installments due today
app.get('/cobros-dia', (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const sql = `
        SELECT c.*, u.nombre_completo, u.telefono 
        FROM cuotas c
        JOIN prestamos p ON c.prestamo_id = p.id
        JOIN usuarios u ON p.usuario_id = u.id
        WHERE c.fecha_vencimiento = ? AND c.estado = 'Pendiente'
    `;

    db.all(sql, [today], (err, rows) => {
        if (err) {
            return res.status(400).json({ error: err.message });
        }

        // Generate WhatsApp links
        const results = rows.map(row => {
            const message = `Hola ${row.nombre_completo}, te recordamos que tu cuota de ${row.monto_cuota} vence el ${row.fecha_vencimiento}.`;
            const waLink = `https://wa.me/${row.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
            return { ...row, wa_link: waLink };
        });

        res.json(results);
    });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
