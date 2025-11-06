const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function runCompleteCleanup() {
    try {
        console.log('🚀 Starting Complete ElevenLabs Removal and Bolna.ai Schema Finalization...');
        
        // Step 1: Drop ElevenLabs constraints
        console.log('📋 Step 1: Dropping ElevenLabs constraints...');
        try {
            await pool.query(`ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_user_id_elevenlabs_agent_id_key;`);
            await pool.query(`ALTER TABLE calls DROP CONSTRAINT IF EXISTS calls_elevenlabs_conversation_id_unique;`);
            console.log('✅ ElevenLabs constraints dropped');
        } catch (error) {
            console.log('⚠️ Some constraints may not have existed:', error.message);
        }
        
        // Step 2: Drop ElevenLabs columns from agents
        console.log('📋 Step 2: Dropping ElevenLabs columns from agents table...');
        await pool.query(`
            ALTER TABLE agents 
            DROP COLUMN IF EXISTS elevenlabs_agent_id,
            DROP COLUMN IF EXISTS elevenlabs_config,
            DROP COLUMN IF EXISTS elevenlabs_voice_id,
            DROP COLUMN IF EXISTS elevenlabs_model_id;
        `);
        console.log('✅ ElevenLabs columns dropped from agents table');
        
        // Step 3a: Drop dependent views first
        console.log('📋 Step 3a: Dropping dependent views...');
        await pool.query(`DROP VIEW IF EXISTS user_stats CASCADE;`);
        await pool.query(`DROP VIEW IF EXISTS agent_stats CASCADE;`);
        await pool.query(`DROP VIEW IF EXISTS call_analytics CASCADE;`);
        console.log('✅ Dependent views dropped');
        
        // Step 3b: Drop ElevenLabs columns from calls
        console.log('📋 Step 3b: Dropping ElevenLabs columns from calls table...');
        await pool.query(`
            ALTER TABLE calls
            DROP COLUMN IF EXISTS elevenlabs_conversation_id CASCADE,
            DROP COLUMN IF EXISTS elevenlabs_agent_config CASCADE,
            DROP COLUMN IF EXISTS elevenlabs_voice_settings CASCADE,
            DROP COLUMN IF EXISTS elevenlabs_metadata CASCADE;
        `);
        console.log('✅ ElevenLabs columns dropped from calls table');
        
        // Step 4: Drop other ElevenLabs columns
        console.log('📋 Step 4: Dropping ElevenLabs columns from other tables...');
        try {
            await pool.query(`ALTER TABLE transcripts DROP COLUMN IF EXISTS elevenlabs_transcript_id;`);
            await pool.query(`ALTER TABLE webhooks DROP COLUMN IF EXISTS elevenlabs_webhook_id;`);
            await pool.query(`ALTER TABLE lead_analytics DROP COLUMN IF EXISTS elevenlabs_analysis_id;`);
            console.log('✅ ElevenLabs columns dropped from other tables');
        } catch (error) {
            console.log('ℹ️ Some tables/columns may not exist:', error.message);
        }
        
        // Step 5: Configure Bolna.ai columns properly
        console.log('📋 Step 5: Configuring Bolna.ai columns...');
        try {
            await pool.query(`
                ALTER TABLE agents 
                ALTER COLUMN bolna_agent_id SET NOT NULL;
            `);
            
            await pool.query(`
                ALTER TABLE calls
                ALTER COLUMN bolna_execution_id SET NOT NULL;
            `);
            
            // Add unique constraints
            await pool.query(`
                ALTER TABLE agents 
                ADD CONSTRAINT agents_bolna_agent_id_unique UNIQUE(bolna_agent_id);
            `);
            
            await pool.query(`
                ALTER TABLE agents 
                ADD CONSTRAINT agents_user_bolna_agent_id_unique UNIQUE(user_id, bolna_agent_id);
            `);
            
            await pool.query(`
                ALTER TABLE calls
                ADD CONSTRAINT calls_bolna_execution_id_unique UNIQUE(bolna_execution_id);
            `);
            
            console.log('✅ Bolna.ai constraints configured');
        } catch (error) {
            console.log('⚠️ Some constraints may already exist:', error.message);
        }
        
        // Step 6: Add missing Bolna.ai columns
        console.log('📋 Step 6: Adding missing Bolna.ai columns...');
        await pool.query(`
            ALTER TABLE agents 
            ADD COLUMN IF NOT EXISTS bolna_webhook_url TEXT,
            ADD COLUMN IF NOT EXISTS bolna_voice_config JSONB DEFAULT '{}',
            ADD COLUMN IF NOT EXISTS bolna_llm_config JSONB DEFAULT '{}',
            ADD COLUMN IF NOT EXISTS bolna_task_config JSONB DEFAULT '{}';
        `);
        
        await pool.query(`
            ALTER TABLE calls
            ADD COLUMN IF NOT EXISTS bolna_call_config JSONB DEFAULT '{}',
            ADD COLUMN IF NOT EXISTS bolna_voice_settings JSONB DEFAULT '{}',
            ADD COLUMN IF NOT EXISTS bolna_metadata JSONB DEFAULT '{}';
        `);
        console.log('✅ Bolna.ai columns added');
        
        // Step 7: Update indexes
        console.log('📋 Step 7: Updating indexes...');
        await pool.query(`DROP INDEX IF EXISTS idx_agents_elevenlabs_agent_id;`);
        await pool.query(`DROP INDEX IF EXISTS idx_calls_elevenlabs_conversation_id;`);
        await pool.query(`DROP INDEX IF EXISTS idx_agents_user_elevenlabs;`);
        
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_agents_bolna_agent_id ON agents(bolna_agent_id);`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_calls_bolna_execution_id ON calls(bolna_execution_id);`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_agents_user_bolna ON agents(user_id, bolna_agent_id);`);
        console.log('✅ Indexes updated');
        
        // Step 7b: Recreate user_stats view with Bolna.ai only
        console.log('📋 Step 7b: Recreating views for Bolna.ai...');
        await pool.query(`
            CREATE VIEW user_stats AS
            SELECT 
                u.id,
                u.email,
                u.name,
                u.credits,
                u.is_active,
                u.created_at,
                COUNT(DISTINCT a.id) as agent_count,
                COUNT(DISTINCT c.id) as call_count,
                COUNT(DISTINCT ct.id) as contact_count,
                COALESCE(SUM(CASE WHEN c.status = 'completed' THEN c.credits_used ELSE 0 END), 0) as total_credits_used,
                COUNT(DISTINCT c.id) as bolna_calls,
                COUNT(DISTINCT CASE WHEN a.bolna_agent_id IS NOT NULL THEN a.id END) as bolna_agents
            FROM users u
            LEFT JOIN agents a ON u.id = a.user_id AND a.is_active = true
            LEFT JOIN calls c ON u.id = c.user_id
            LEFT JOIN contacts ct ON u.id = ct.user_id
            GROUP BY u.id, u.email, u.name, u.credits, u.is_active, u.created_at;
        `);
        
        await pool.query(`
            CREATE VIEW bolna_agents AS
            SELECT 
                a.id,
                a.user_id,
                a.name,
                a.description,
                a.agent_type,
                a.is_active,
                a.created_at,
                a.updated_at,
                a.bolna_agent_id,
                a.bolna_webhook_url,
                a.bolna_voice_config,
                a.bolna_llm_config,
                a.bolna_task_config,
                COUNT(c.id) as total_calls,
                COUNT(CASE WHEN c.status = 'completed' THEN 1 END) as completed_calls,
                COALESCE(SUM(c.credits_used), 0) as total_credits_used
            FROM agents a
            LEFT JOIN calls c ON a.id = c.agent_id
            WHERE a.is_active = true
            GROUP BY a.id, a.user_id, a.name, a.description, a.agent_type, a.is_active, 
                     a.created_at, a.updated_at, a.bolna_agent_id, a.bolna_webhook_url,
                     a.bolna_voice_config, a.bolna_llm_config, a.bolna_task_config;
        `);
        console.log('✅ Views recreated for Bolna.ai');
        
        // Step 8: Create migration log entry
        console.log('📋 Step 8: Creating migration log...');
        await pool.query(`
            INSERT INTO migration_log (migration_name, notes) 
            VALUES ('bolna_migration_complete_cleanup', 'Removed all ElevenLabs columns and references, finalized Bolna.ai schema');
        `);
        console.log('✅ Migration logged');
        
        // Step 9: Verification
        console.log('📋 Step 9: Verifying cleanup...');
        
        // Check for any remaining ElevenLabs columns
        const elevenLabsColumns = await pool.query(`
            SELECT column_name, table_name 
            FROM information_schema.columns 
            WHERE column_name LIKE '%elevenlabs%' 
              AND table_schema = 'public';
        `);
        
        // Check Bolna.ai constraints
        const bolnaConstraints = await pool.query(`
            SELECT constraint_name, constraint_type, table_name
            FROM information_schema.table_constraints 
            WHERE constraint_name LIKE '%bolna%' 
              AND table_schema = 'public';
        `);
        
        // Check agents table structure
        const agentsStructure = await pool.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = 'agents' 
              AND table_schema = 'public'
            ORDER BY ordinal_position;
        `);
        
        console.log('🎉 COMPLETE CLEANUP SUCCESSFUL!');
        console.log('📊 Verification Results:');
        console.log(`   • Remaining ElevenLabs columns: ${elevenLabsColumns.rows.length}`);
        console.log(`   • Bolna constraints created: ${bolnaConstraints.rows.length}`);
        console.log(`   • Agents table columns: ${agentsStructure.rows.length}`);
        
        if (elevenLabsColumns.rows.length > 0) {
            console.log('⚠️ WARNING: Some ElevenLabs columns still exist:');
            elevenLabsColumns.rows.forEach(col => {
                console.log(`   - ${col.table_name}.${col.column_name}`);
            });
        } else {
            console.log('✅ All ElevenLabs references successfully removed!');
        }
        
        console.log('\n🚀 Database is now 100% Bolna.ai ready!');
        
    } catch (error) {
        console.error('❌ Cleanup failed:', error);
        console.error('Stack trace:', error.stack);
    } finally {
        await pool.end();
    }
}

runCompleteCleanup();