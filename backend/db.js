const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, 'prestappr.db');
const schemaPath = path.resolve(__dirname, 'schema.sql');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Error opening database:', err.message);
    } else {
        console.log('✅ Connected to SQLite database.');
        db.run('PRAGMA foreign_keys = ON;', (err) => {
            if (err) console.error('PRAGMA error:', err);
        });
        const schema = fs.readFileSync(schemaPath, 'utf8');
        db.exec(schema, (err) => {
            if (err) console.error('❌ Schema error:', err.message);
            else console.log('✅ Database schema ready.');
        });
    }
});

module.exports = db;
