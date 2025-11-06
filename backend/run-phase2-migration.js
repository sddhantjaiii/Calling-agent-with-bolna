const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function runMigration() {
    try {
        console.log('Starting Phase 2 migration...');
        
        // Step 1: Make bolna_agent_id NOT NULL
        console.log('Making bolna_agent_id NOT NULL...');
        await pool.query(`
            UPDATE agents 
            SET bolna_agent_id = 'legacy_' || id::text 
            WHERE bolna_agent_id IS NULL;
        `);
        
        await pool.query(`
            ALTER TABLE agents 
            ALTER COLUMN bolna_agent_id SET NOT NULL;
        `);
        
        // Step 2: Make bolna_execution_id NOT NULL for calls
        console.log('Making bolna_execution_id NOT NULL...');
        await pool.query(`
            UPDATE calls 
            SET bolna_execution_id = 'legacy_' || id::text 
            WHERE bolna_execution_id IS NULL;
        `);
        
        await pool.query(`
            ALTER TABLE calls 
            ALTER COLUMN bolna_execution_id SET NOT NULL;
        `);
        
        // Step 3: Add unique constraints for Bolna.ai IDs
        console.log('Adding unique constraints...');
        try {
            await pool.query(`
                ALTER TABLE agents ADD CONSTRAINT agents_user_id_bolna_agent_id_key UNIQUE(user_id, bolna_agent_id);
            `);
        } catch (error) {
            console.log('Constraint already exists or error:', error.message);
        }
        
        try {
            await pool.query(`
                ALTER TABLE calls ADD CONSTRAINT calls_bolna_execution_id_unique UNIQUE(bolna_execution_id);
            `);
        } catch (error) {
            console.log('Constraint already exists or error:', error.message);
        }
        
        // Step 4: Create migration log entry
        console.log('Creating migration log...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS migration_log (
                id SERIAL PRIMARY KEY,
                migration_name VARCHAR(255) NOT NULL,
                completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                notes TEXT
            );
        `);
        
        await pool.query(`
            INSERT INTO migration_log (migration_name, notes) 
            VALUES ('bolna_migration_phase2', 'Completed database schema transition to Bolna.ai - made bolna_agent_id NOT NULL, added constraints');
        `);
        
        // Verification
        console.log('Verifying migration...');
        const agentCheck = await pool.query(`
            SELECT 
                COUNT(*) as total_agents,
                COUNT(bolna_agent_id) as with_bolna_id,
                COUNT(elevenlabs_agent_id) as with_elevenlabs_id
            FROM agents;
        `);
        
        const callCheck = await pool.query(`
            SELECT 
                COUNT(*) as total_calls,
                COUNT(bolna_execution_id) as with_bolna_id,
                COUNT(elevenlabs_conversation_id) as with_elevenlabs_id
            FROM calls;
        `);
        
        console.log('Migration completed successfully!');
        console.log('Agent stats:', agentCheck.rows[0]);
        console.log('Call stats:', callCheck.rows[0]);
        
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await pool.end();
    }
}

runMigration();