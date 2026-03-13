const bcrypt = require('bcryptjs');
const db = require('./db');

async function createAdmin() {
    try {
        const admins = [
            { email: 'admin@test.com', rawPassword: 'admin' },
            { email: 'merlyhernandez217@gmail.com', rawPassword: 'Susan12345' }
        ];
        
        for (const admin of admins) {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(admin.rawPassword, salt);
            
            await db.query(
                'INSERT INTO admins (email, password_hash) VALUES ($1, $2) ON CONFLICT (email) DO UPDATE SET password_hash = $2',
                [admin.email, hashedPassword]
            );
            
            console.log(`✅ Admin user ${admin.email} created or updated successfully.`);
        }
    } catch (err) {
        console.error('❌ Error creating admin user:', err);
    } finally {
        process.exit();
    }
}

createAdmin();
