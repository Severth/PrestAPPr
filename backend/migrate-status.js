const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.PGHOST,
    port: process.env.PGPORT,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    ssl: { rejectUnauthorized: false }
});

async function migrate() {
    try {
        console.log('🔄 Updating cuotas.estado check constraint...');
        
        // 1. First, find if there's a check constraint on cuotas Table for 'estado'
        const res = await pool.query(`
            SELECT conname 
            FROM pg_constraint 
            WHERE conrelid = 'cuotas'::regclass AND contype = 'c' AND (pg_get_constraintdef(oid) LIKE '%estado%');
        `);

        for (let row of res.rows) {
            console.log(`🗑️ Dropping existing constraint: ${row.conname}`);
            await pool.query(`ALTER TABLE cuotas DROP CONSTRAINT ${row.conname}`);
        }

        // 2. Add the new expanded constraint
        console.log('✨ Adding new expanded constraint...');
        await pool.query(`
            ALTER TABLE cuotas ADD CONSTRAINT cuotas_estado_check 
            CHECK (estado IN ('Pendiente','Pagado','Abono_interes','Abono_capital','Agregado_capital_extra'))
        `);

        console.log('✅ Migration successful!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    }
}

migrate();
