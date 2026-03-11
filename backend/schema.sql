-- PrestAPPr - Schema SQLite

CREATE TABLE IF NOT EXISTS configuracion (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    capital_base DECIMAL(15, 2) NOT NULL DEFAULT 100000.00
);

INSERT OR IGNORE INTO configuracion (id, capital_base) VALUES (1, 100000.00);

CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre_completo TEXT NOT NULL,
    dni TEXT UNIQUE NOT NULL,
    telefono TEXT NOT NULL,
    correo TEXT,
    direccion TEXT,
    estado TEXT DEFAULT 'Activo' CHECK(estado IN ('Activo', 'Pendiente', 'Rechazado')),
    monto_solicitado DECIMAL(15,2),
    plazo_meses_solicitado INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS prestamos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    monto DECIMAL(15, 2) NOT NULL,
    tasa_interes_anual DECIMAL(5, 2) NOT NULL,
    tasa_interes_mensual DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
    plazo_meses INTEGER NOT NULL,
    fecha_inicio DATE NOT NULL,
    metodo_desembolso TEXT,
    cuenta_origen TEXT,
    estado TEXT DEFAULT 'Activo' CHECK(estado IN ('Activo', 'Finalizado', 'Mora')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS cuotas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prestamo_id INTEGER NOT NULL,
    numero_cuota INTEGER NOT NULL,
    fecha_vencimiento DATE NOT NULL,
    monto_cuota DECIMAL(15, 2) NOT NULL,
    capital DECIMAL(15, 2) NOT NULL,
    interes DECIMAL(15, 2) NOT NULL,
    saldo DECIMAL(15, 2) NOT NULL,
    estado TEXT DEFAULT 'Pendiente' CHECK(estado IN ('Pendiente', 'Pagado', 'Abono_interes', 'Abono_capital')),
    fecha_pago DATETIME,
    tipo_pago TEXT,
    metodo_pago TEXT,
    cuenta_origen TEXT,
    cuenta_destino TEXT,
    cobrador TEXT,
    FOREIGN KEY (prestamo_id) REFERENCES prestamos(id)
);
