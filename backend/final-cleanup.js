const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

(async () => {
    try {
        await pool.query('ALTER TABLE phone_numbers DROP COLUMN IF EXISTS elevenlabs_phone_number_id CASCADE;');
        console.log('✅ Last ElevenLabs column removed');
        
        const check = await pool.query(`
            SELECT column_name, table_name 
            FROM information_schema.columns 
            WHERE column_name LIKE '%elevenlabs%' 
              AND table_schema = 'public';
        `);
        
        console.log('🎉 Remaining ElevenLabs columns:', check.rows.length);
        if (check.rows.length === 0) {
            console.log('🚀 DATABASE IS 100% ELEVENLABS-FREE!');
        }
    } finally {
        await pool.end();
    }
})();