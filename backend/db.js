const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
    host: process.env.PGHOST,
    port: process.env.PGPORT,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    ssl: {
        rejectUnauthorized: false // Required for some hosted providers like Railway/Render
    }
});

pool.on('connect', () => {
    console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
    console.error('❌ Unexpected error on idle client', err);
    process.exit(-1);
});

// Function to initialize schema
async function initSchema() {
    try {
        const schemaPath = path.resolve(__dirname, 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');
        await pool.query(schema);
        console.log('✅ Database schema verified/ready.');
    } catch (err) {
        console.error('❌ Error initializing schema:', err.message);
    }
}

// Export a wrapper that mimics the most used sqlite3 methods if possible, 
// or just export the pool and refactor the server.
// For PostgreSQL, it's better to refactor to use pool.query() directly.
module.exports = {
    query: (text, params) => pool.query(text, params),
    pool,
    initSchema
};
