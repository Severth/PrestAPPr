const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const db = require('./db');
const { calculateAmortization, calcularResumen } = require('./utils/amortization');
const dotenv = require('dotenv')


const env = dotenv.config()





const app = express();
const PORT = process.env.PORT || 3001;



// CORS: allow frontend (served separately or via file://) to call this API
app.use(cors({ origin: '*' }));
app.use(bodyParser.json());

// ─────────────────────────────────────────────
// CONFIGURACIÓN (CAPITAL BASE)
// ─────────────────────────────────────────────

// GET /api/capital
app.get('/api/capital', (req, res) => {
    db.get('SELECT capital_base FROM configuracion WHERE id = 1', (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ capital_base: row ? row.capital_base : 0 });
    });
});

// PUT /api/capital
app.put('/api/capital', (req, res) => {
    const { capital_base } = req.body;
    db.run('UPDATE configuracion SET capital_base = ? WHERE id = 1', [capital_base], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Capital base actualizado' });
    });
});

// ─────────────────────────────────────────────
// USUARIOS
// ─────────────────────────────────────────────

// GET /api/usuarios - List all users (only Active ones by default here)
app.get('/api/usuarios', (req, res) => {
    const search = req.query.q ? `%${req.query.q}%` : '%';
    const sql = `
        SELECT u.*, 
               (SELECT COUNT(id) FROM prestamos p WHERE p.usuario_id = u.id AND p.tasa_interes_anual > 0) as creditos_con_interes
        FROM usuarios u
        WHERE u.estado='Activo' AND (u.nombre_completo LIKE ? OR u.dni LIKE ?) 
        ORDER BY u.nombre_completo
    `;
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
// SOLICITUDES DE CRÉDITO EXTERNAS
// ─────────────────────────────────────────────

// GET /api/solicitudes - List pending requests
app.get('/api/solicitudes', (req, res) => {
    const sql = `SELECT * FROM usuarios WHERE estado = 'Pendiente' ORDER BY created_at DESC`;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// POST /api/solicitudes - Create pending user from public form
app.post('/api/solicitudes', (req, res) => {
    const { nombre_completo, dni, telefono, direccion, monto_solicitado, plazo_meses_solicitado } = req.body;
    if (!nombre_completo || !dni || !telefono || !monto_solicitado || !plazo_meses_solicitado) {
        return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    // Check if DNI already exists
    db.get('SELECT id FROM usuarios WHERE dni = ?', [dni], (err, row) => {
        if (row) return res.status(400).json({ error: 'Ya existe un usuario con este DNI.' });

        const sql = `INSERT INTO usuarios (nombre_completo, dni, telefono, direccion, estado, monto_solicitado, plazo_meses_solicitado) VALUES (?, ?, ?, ?, 'Pendiente', ?, ?)`;
        db.run(sql, [nombre_completo, dni, telefono, direccion, monto_solicitado, plazo_meses_solicitado], function (err) {
            if (err) return res.status(400).json({ error: err.message });
            res.status(201).json({ id: this.lastID, message: 'Solicitud enviada exitosamente' });
        });
    });
});

// POST /api/solicitudes/:id/accion - Approve or Reject request
app.post('/api/solicitudes/:id/accion', (req, res) => {
    const { accion } = req.body; // 'aprobar' o 'rechazar'
    const id = req.params.id;

    if (accion === 'rechazar') {
        db.run(`UPDATE usuarios SET estado='Rechazado' WHERE id=?`, [id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            return res.json({ success: true, message: 'Solicitud rechazada' });
        });
    } else if (accion === 'aprobar') {
        db.run(`UPDATE usuarios SET estado='Activo' WHERE id=?`, [id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            return res.json({ success: true, message: 'Usuario aprobado. Ahora puedes generarle su crédito.' });
        });
    } else {
        return res.status(400).json({ error: 'Acción no válida' });
    }
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
    const { usuario_id, monto, tasa_interes_mensual, plazo_meses, fecha_inicio, metodo_desembolso, cuenta_origen } = req.body;
    if (!usuario_id || !monto || !tasa_interes_mensual || !plazo_meses || !fecha_inicio) {
        return res.status(400).json({ error: 'Todos los campos base son obligatorios' });
    }

    db.get('SELECT capital_base FROM configuracion WHERE id = 1', (err, conf) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!conf || conf.capital_base < monto) {
            return res.status(400).json({ error: 'Capital insuficiente para este préstamo' });
        }

        db.run('UPDATE configuracion SET capital_base = capital_base - ? WHERE id = 1', [monto], (err) => {
            if (err) return res.status(500).json({ error: err.message });

            const sqlLoan = `INSERT INTO prestamos (usuario_id, monto, tasa_interes_anual, tasa_interes_mensual, plazo_meses, fecha_inicio, metodo_desembolso, cuenta_origen) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
            const tasaAnual = parseFloat((tasa_interes_mensual * 12).toFixed(2));
            db.run(sqlLoan, [usuario_id, monto, tasaAnual, tasa_interes_mensual, plazo_meses, fecha_inicio, metodo_desembolso || 'Efectivo', cuenta_origen || ''], function (err) {
                if (err) return res.status(400).json({ error: err.message });

                const prestamo_id = this.lastID;
                const planPagos = calculateAmortization(monto, tasa_interes_mensual, plazo_meses, fecha_inicio);

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

// PATCH /api/cuotas/:id/pagar - Mark installment as paid or partial payment
app.patch('/api/cuotas/:id/pagar', (req, res) => {
    const { tipo, metodo, cuenta_origen, cuenta_destino, cobrador, capital_abonado } = req.body;
    // tipo: 'completo', 'interes', 'capital' (abono extra)

    db.get('SELECT * FROM cuotas WHERE id=?', [req.params.id], (err, cuota) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!cuota || cuota.estado === 'Pagado') return res.status(400).json({ error: 'Cuota no encontrada o ya pagada' });

        db.get('SELECT * FROM prestamos WHERE id=?', [cuota.prestamo_id], (err, prestamo) => {
            if (err) return res.status(500).json({ error: err.message });

            let montoAdeudado = cuota.monto_cuota;
            let nuevoEstado = 'Pagado';
            let abonoAdicionalCapital = 0;

            if (tipo === 'interes') {
                montoAdeudado = cuota.interes;
                nuevoEstado = 'Abono_interes'; // Pagó solo el interés, se añade un mes más al final.
            } else if (tipo === 'capital') {
                // Validación para cuando mandan un capital personalizado. El pago será el interés + ese capital personalizado
                abonoAdicionalCapital = parseFloat(capital_abonado || cuota.capital);
                if (isNaN(abonoAdicionalCapital) || abonoAdicionalCapital <= 0) {
                    return res.status(400).json({ error: 'Monto de capital inválido' });
                }
                montoAdeudado = cuota.interes + abonoAdicionalCapital;
                nuevoEstado = 'Agregado_capital_extra'; // Paga el interés y da un capital distinto
            }

            const sqlUpdateCuota = `UPDATE cuotas SET estado=?, fecha_pago=datetime('now'), tipo_pago=?, metodo_pago=?, cuenta_origen=?, cuenta_destino=?, cobrador=?, capital=?, monto_cuota=?, saldo=? WHERE id=?`;
            
            // Actualizamos la cuota actual. Si fue pago de capital, el capital abonado real cambia, y el saldo residual a ese momento queda como estaba previo al pago pero disminuido por el nuevo abono.
            let updatedCapital = (tipo === 'completo') ? cuota.capital : ((tipo === 'capital') ? abonoAdicionalCapital : 0);
            let updatedMonto = (tipo === 'completo') ? cuota.monto_cuota : montoAdeudado;
            // Para el historial, el saldo luego de esta cuota sería:
            let lastSaldo = cuota.saldo + cuota.capital - updatedCapital; // Revertir el capital hipotético anterior y restar el nuevo

            db.run(sqlUpdateCuota, [nuevoEstado, tipo || 'completo', metodo || 'Efectivo', cuenta_origen || '', cuenta_destino || '', cobrador || '', updatedCapital, updatedMonto, lastSaldo, req.params.id], function (err) {
                if (err) return res.status(500).json({ error: err.message });

                // Registrar ganancia/retorno al capital base
                db.run('UPDATE configuracion SET capital_base = capital_base + ? WHERE id = 1', [montoAdeudado]);

                // ─────────────────────────────────────────────
                // RECALCULO DE CUOTAS RESTANTES
                // ─────────────────────────────────────────────
                if (tipo === 'interes' || tipo === 'capital') {
                    // Borrar las cuotas futuras pendientes
                    db.run('DELETE FROM cuotas WHERE prestamo_id = ? AND estado = "Pendiente" AND numero_cuota > ?', [cuota.prestamo_id, cuota.numero_cuota], (err) => {
                        if (err) console.error("Error al borrar cuotas futuras", err);

                        db.get('SELECT COUNT(*) as cuotasRestantes Originales FROM cuotas WHERE prestamo_id = ? AND estado="Pendiente"', [cuota.prestamo_id], (err, row) => {
                             // Si pagó solo intereses, las cuotas restantes (prestamo.plazo_meses - cuota.numero_cuota) siguen siendo las mismas,
                             // Por lo que el plazo real se alarga 1 mes (porque esta cuota que se pagó no amortizó nada).
                             let remainingN = prestamo.plazo_meses - cuota.numero_cuota;
                             if (tipo === 'interes') {
                                 remainingN += 1; // Alarga el plazo 1 mes porque solo pagó interés
                             }
                             // OJO: Si pagó interés+capital distinto (tipo capital), recalculamos sobre lo que queda vivo.
                             
                             if (remainingN > 0 && lastSaldo > 0.01) {
                                  // Generar nuevo plan con lastSaldo
                                  const i = prestamo.tasa_interes_mensual / 100;
                                  let nuevaCuotaMensual = lastSaldo * (i * Math.pow(1 + i, remainingN)) / (Math.pow(1 + i, remainingN) - 1);
                                  
                                  const placeholders = [];
                                  const values = [];
                                  let nuevoSaldoTracker = lastSaldo;
                                  let startVencimiento = new Date(cuota.fecha_vencimiento + 'T12:00:00');

                                  for (let n = 1; n <= remainingN; n++) {
                                      const interesN = nuevoSaldoTracker * i;
                                      const capitalN = nuevaCuotaMensual - interesN;
                                      nuevoSaldoTracker -= capitalN;
                                      
                                      startVencimiento.setMonth(startVencimiento.getMonth() + 1);

                                      placeholders.push('(?,?,?,?,?,?,?,?)');
                                      values.push(
                                          prestamo.id, 
                                          cuota.numero_cuota + n, 
                                          startVencimiento.toISOString().split('T')[0], 
                                          parseFloat(nuevaCuotaMensual.toFixed(2)), 
                                          parseFloat(capitalN.toFixed(2)), 
                                          parseFloat(interesN.toFixed(2)), 
                                          parseFloat(Math.max(0, nuevoSaldoTracker).toFixed(2)), 
                                          'Pendiente'
                                      );
                                  }

                                  if (values.length > 0) {
                                      const sqlRepopulate = `INSERT INTO cuotas (prestamo_id, numero_cuota, fecha_vencimiento, monto_cuota, capital, interes, saldo, estado) VALUES ${placeholders.join(',')}`;
                                      db.run(sqlRepopulate, values, (err) => {
                                          if (err) console.error("Error al repoblar cuotas", err);
                                          checkFinalizacion(cuota.prestamo_id, res, tipo);
                                      });
                                  } else {
                                      checkFinalizacion(cuota.prestamo_id, res, tipo);
                                  }
                             } else {
                                 // El saldo es <= 0, finalizado
                                 checkFinalizacion(cuota.prestamo_id, res, tipo);
                             }
                        });
                    });
                } else {
                    checkFinalizacion(cuota.prestamo_id, res, tipo);
                }
            });
        });
    });
});

function checkFinalizacion(prestamo_id, res, tipo) {
    db.get('SELECT COUNT(*) as pendientes FROM cuotas WHERE prestamo_id=? AND estado = "Pendiente"',
        [prestamo_id], (err, row) => {
            if (row && row.pendientes === 0) {
                // Asegurarse también de que el saldo de la última cuota pagada sea ~0
                db.run('UPDATE prestamos SET estado="Finalizado" WHERE id=?', [prestamo_id]);
            }
            res.json({ success: true, message: `Pago registrado (${tipo || 'completo'}). ${tipo !== 'completo' ? 'Plan recalculado.' : ''}` });
        });
}

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
                es_mora: false,
                wa_link: `https://wa.me/57${row.telefono.replace(/\D/g, '')}?text=${msg}`
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
            const msg = encodeURIComponent(`⚠️ Hola ${row.nombre_completo}, tienes una cuota #${row.numero_cuota} de $${row.monto_cuota} VENCIDA desde el ${row.fecha_vencimiento}. Por favor regulariza tu pago lo antes posible.`);
            return {
                ...row,
                es_mora: true,
                wa_link: `https://wa.me/57${row.telefono.replace(/\D/g, '')}?text=${msg}`
            };
        });
        res.json(results);
    });
});

// GET /api/cartera-activa - All active loans mapping
app.get('/api/cartera-activa', (req, res) => {
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
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const results = rows.map(r => {
            // Si el prestamo no tiene un "ultimo saldo" pagado, el saldo activo es el monto original
            r.saldo_activo = r.ultimo_saldo !== null ? r.ultimo_saldo : r.monto;
            return r;
        });
        res.json(results);
    });
});

// GET /api/transacciones - Latest Payments
app.get('/api/transacciones', (req, res) => {
    const sql = `
        SELECT c.id, c.monto_cuota as monto, c.tipo_pago, c.metodo_pago, c.fecha_pago, c.cuenta_destino,
               p.id as prestamo_id, u.nombre_completo 
        FROM cuotas c
        JOIN prestamos p ON c.prestamo_id = p.id
        JOIN usuarios u ON p.usuario_id = u.id
        WHERE c.estado IN ('Pagado', 'Abono_interes', 'Abono_capital')
        ORDER BY c.fecha_pago DESC LIMIT 15
    `;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});


// GET /api/reportes - General Dashboard statistics
app.get('/api/reportes', (req, res) => {
    db.get('SELECT capital_base FROM configuracion WHERE id=1', (err, conf) => {
        const stats = { capital_base: conf ? conf.capital_base : 0, interes_ganado: 0, dinero_en_calle: 0 };

        db.get(`SELECT SUM(interes) as ganancia FROM cuotas WHERE estado IN ('Pagado', 'Abono_interes')`, (err, row) => {
            if (row && row.ganancia) stats.interes_ganado = row.ganancia;

            db.get(`SELECT SUM(saldo) as calle FROM cuotas WHERE estado = 'Pendiente'`, (err, row) => {
                if (row && row.calle) stats.dinero_en_calle = row.calle;
                res.json(stats);
            });
        });
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
