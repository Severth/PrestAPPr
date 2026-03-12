-- PrestAPPr - Schema PostgreSQL

CREATE TABLE IF NOT EXISTS configuracion (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    capital_base NUMERIC(15,2) NOT NULL DEFAULT 100000.00
);

INSERT INTO configuracion (id, capital_base)
VALUES (1, 100000.00)
ON CONFLICT (id) DO NOTHING;


CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre_completo TEXT NOT NULL,
    dni TEXT UNIQUE NOT NULL,
    telefono TEXT NOT NULL,
    correo TEXT,
    direccion TEXT,
    estado TEXT DEFAULT 'Activo'
        CHECK (estado IN ('Activo','Pendiente','Rechazado')),
    monto_solicitado NUMERIC(15,2),
    plazo_meses_solicitado INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS prestamos (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id INTEGER NOT NULL,
    monto NUMERIC(15,2) NOT NULL,
    tasa_interes_anual NUMERIC(5,2) NOT NULL,
    tasa_interes_mensual NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    plazo_meses INTEGER NOT NULL,
    fecha_inicio DATE NOT NULL,
    metodo_desembolso TEXT,
    cuenta_origen TEXT,
    estado TEXT DEFAULT 'Activo'
        CHECK (estado IN ('Activo','Finalizado','Mora')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_usuario
        FOREIGN KEY (usuario_id)
        REFERENCES usuarios(id)
        ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS admins (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS cuotas (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    prestamo_id INTEGER NOT NULL,
    numero_cuota INTEGER NOT NULL,
    fecha_vencimiento DATE NOT NULL,
    monto_cuota NUMERIC(15,2) NOT NULL,
    capital NUMERIC(15,2) NOT NULL,
    interes NUMERIC(15,2) NOT NULL,
    saldo NUMERIC(15,2) NOT NULL,
    estado TEXT DEFAULT 'Pendiente'
        CHECK (estado IN ('Pendiente','Pagado','Abono_interes','Abono_capital','Agregado_capital_extra')),
    fecha_pago TIMESTAMP,
    tipo_pago TEXT,
    metodo_pago TEXT,
    cuenta_origen TEXT,
    cuenta_destino TEXT,
    cobrador TEXT,

    CONSTRAINT fk_prestamo
        FOREIGN KEY (prestamo_id)
        REFERENCES prestamos(id)
        ON DELETE CASCADE
);