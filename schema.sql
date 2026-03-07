-- Script SQL para PrestAPPr

-- Tabla Usuarios
CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre_completo TEXT NOT NULL,
    dni TEXT UNIQUE NOT NULL,
    telefono TEXT NOT NULL,
    correo TEXT,
    direccion TEXT
);

-- Tabla Prestamos
CREATE TABLE IF NOT EXISTS prestamos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    monto DECIMAL(15, 2) NOT NULL,
    tasa_interes_anual DECIMAL(5, 2) NOT NULL,
    plazo_meses INTEGER NOT NULL,
    fecha_inicio DATE NOT NULL,
    estado TEXT DEFAULT 'Activo' CHECK(estado IN ('Activo', 'Finalizado', 'Mora')),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- Tabla Cuotas
CREATE TABLE IF NOT EXISTS cuotas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prestamo_id INTEGER NOT NULL,
    numero_cuota INTEGER NOT NULL,
    fecha_vencimiento DATE NOT NULL,
    monto_cuota DECIMAL(15, 2) NOT NULL,
    capital DECIMAL(15, 2) NOT NULL,
    interes DECIMAL(15, 2) NOT NULL,
    saldo DECIMAL(15, 2) NOT NULL,
    estado TEXT DEFAULT 'Pendiente' CHECK(estado IN ('Pendiente', 'Pagado')),
    FOREIGN KEY (prestamo_id) REFERENCES prestamos(id)
);
