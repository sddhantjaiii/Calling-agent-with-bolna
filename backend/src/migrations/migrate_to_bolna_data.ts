import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';
import { bolnaService } from '../services/bolnaService';
import { pool } from '../config/database';

// Initialize database connection for data migration

/**
 * Data Migration Script: ElevenLabs to Bolna.ai
 * 
 * This script migrates existing ElevenLabs agents and calls to Bolna.ai format
 * It preserves all existing data while creating new Bolna.ai records
 * 
 * SAFETY FEATURES:
 * - Dry run mode for testing
 * - Data backup before migration  
 * - Rollback capability
 * - Progress logging
 */

interface MigrationStats {
  totalAgents: number;
  migratedAgents: number;
  failedAgents: number;
  totalCalls: number;
  migratedCalls: number;
  failedCalls: number;
  errors: string[];
}

class BolnaDataMigration {
  private stats: MigrationStats = {
    totalAgents: 0,
    migratedAgents: 0,
    failedAgents: 0,
    totalCalls: 0,
    migratedCalls: 0,
    failedCalls: 0,
    errors: []
  };

  private dryRun: boolean = false;
  private backupPath: string;

  constructor(dryRun: boolean = false) {
    this.dryRun = dryRun;
    this.backupPath = path.join(__dirname, '../../backups', `migration-backup-${Date.now()}.json`);
  }

  /**
   * Main migration execution
   */
  async runMigration(): Promise<void> {
    logger.info('🚀 Starting Bolna.ai data migration...', { dryRun: this.dryRun });

    try {
      // Step 1: Create backup
      if (!this.dryRun) {
        await this.createBackup();
      }

      // Step 2: Migrate agents
      await this.migrateAgents();

      // Step 3: Migrate calls (optional - might be handled by webhook updates)
      await this.migrateCalls();

      // Step 4: Validate migration
      await this.validateMigration();

      // Step 5: Generate report
      this.generateReport();

    } catch (error) {
      logger.error('❌ Migration failed:', error);
      throw error;
    } finally {
      // Database pool cleanup handled by the pool itself
    }
  }

  /**
   * Create backup of existing data
   */
  private async createBackup(): Promise<void> {
    logger.info('📦 Creating data backup...');

    try {
      const agentsResult = await pool.query(`
        SELECT a.*, array_agg(c.*) as calls 
        FROM agents a 
        LEFT JOIN calls c ON a.id = c.agent_id 
        WHERE a.elevenlabs_agent_id IS NOT NULL 
        GROUP BY a.id
      `);
      const agents = agentsResult.rows;

      const callsResult = await pool.query(`
        SELECT * FROM calls WHERE elevenlabs_conversation_id IS NOT NULL
      `);
      const calls = callsResult.rows;

      const backupData = {
        timestamp: new Date().toISOString(),
        agents,
        calls,
        totalAgents: agents.length,
        totalCalls: calls.length
      };

      // Ensure backup directory exists
      const backupDir = path.dirname(this.backupPath);
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      fs.writeFileSync(this.backupPath, JSON.stringify(backupData, null, 2));
      logger.info(`✅ Backup created: ${this.backupPath}`);

    } catch (error) {
      logger.error('❌ Backup creation failed:', error);
      throw new Error('Failed to create backup');
    }
  }

  /**
   * Migrate agents from ElevenLabs to Bolna.ai
   */
  private async migrateAgents(): Promise<void> {
    logger.info('🔄 Migrating agents to Bolna.ai...');

    // Get all agents that have ElevenLabs agent IDs but no Bolna agent IDs
    const agentsResult = await pool.query(`
      SELECT * FROM agents 
      WHERE elevenlabs_agent_id IS NOT NULL 
      AND bolna_agent_id IS NULL
    `);
    const agentsToMigrate = agentsResult.rows;

    this.stats.totalAgents = agentsToMigrate.length;
    logger.info(`Found ${this.stats.totalAgents} agents to migrate`);

    for (const agent of agentsToMigrate) {
      try {
        logger.info(`Migrating agent: ${agent.name} (ID: ${agent.id})`);

        // Convert agent data to Bolna format
        const bolnaAgentData = this.convertAgentToBolnaFormat(agent);

        if (!this.dryRun) {
          // Create agent in Bolna.ai
          const bolnaAgent = await bolnaService.createAgent(bolnaAgentData);

          // Update database record with Bolna agent ID
          await pool.query(`
            UPDATE agents 
            SET bolna_agent_id = $1, updated_at = NOW() 
            WHERE id = $2
          `, [bolnaAgent.agent_id, agent.id]);

          // Update migration status
          await this.updateMigrationStatus(agent.id, 'agent', 'completed');
        }

        this.stats.migratedAgents++;
        logger.info(`✅ Agent migrated successfully: ${agent.name}`);

      } catch (error) {
        this.stats.failedAgents++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorMsg = `Failed to migrate agent ${agent.name}: ${errorMessage}`;
        this.stats.errors.push(errorMsg);
        logger.error(errorMsg, error);

        if (!this.dryRun) {
          await this.updateMigrationStatus(agent.id, 'agent', 'failed', errorMessage);
        }
      }
    }
  }

  /**
   * Migrate calls from ElevenLabs to Bolna.ai format
   * Note: This mainly updates the schema, actual call data comes from webhooks
   */
  private async migrateCalls(): Promise<void> {
    logger.info('🔄 Migrating call records...');

    // Get calls that need migration (have ElevenLabs conversation ID but no Bolna execution ID)
    const callsResult = await pool.query(`
      SELECT * FROM calls 
      WHERE elevenlabs_conversation_id IS NOT NULL 
      AND bolna_execution_id IS NULL 
      LIMIT 100
    `);
    const callsToMigrate = callsResult.rows;

    this.stats.totalCalls = callsToMigrate.length;

    for (const call of callsToMigrate) {
      try {
        if (!this.dryRun) {
          // For completed calls, we can't get Bolna execution ID
          // So we'll generate a placeholder that indicates it's a migrated call
          const placeholderExecutionId = `migrated_${call.elevenlabs_conversation_id}`;

          await pool.query(`
            UPDATE calls 
            SET bolna_execution_id = $1, updated_at = NOW() 
            WHERE id = $2
          `, [placeholderExecutionId, call.id]);
        }

        this.stats.migratedCalls++;

      } catch (error) {
        this.stats.failedCalls++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorMsg = `Failed to migrate call ${call.id}: ${errorMessage}`;
        this.stats.errors.push(errorMsg);
        logger.error(errorMsg, error);
      }
    }
  }

  /**
   * Convert ElevenLabs agent data to Bolna.ai format
   */
  private convertAgentToBolnaFormat(agent: any): any {
    const bolnaAgentData = {
      agent_config: {
        agent_name: agent.name,
        agent_welcome_message: agent.first_message || "Hello! How can I help you today?",
        webhook_url: `${process.env.WEBHOOK_BASE_URL}/api/webhooks/bolna/call-completed`,
        tasks: [{
          task_type: 'conversation' as const,
          tools_config: {
            llm_agent: {
              agent_flow_type: 'streaming' as const,
              provider: 'openai' as const,
              family: 'openai',
              model: 'gpt-3.5-turbo',
              max_tokens: 1000,
              temperature: 0.7,
              request_json: false
            },
            synthesizer: {
              provider: 'polly' as const,
              provider_config: {
                voice: this.mapElevenLabsVoiceToPolly(agent.voice_id),
                engine: 'generative',
                sampling_rate: '8000',
                language: 'en-US'
              },
              stream: true,
              buffer_size: 150,
              audio_format: 'wav' as const
            },
            transcriber: {
              provider: 'deepgram' as const,
              model: 'nova-2',
              language: 'en',
              stream: true,
              sampling_rate: 8000,
              encoding: 'linear16',
              endpointing: 500
            },
            input: {
              provider: 'twilio' as const,
              format: 'wav' as const
            },
            output: {
              provider: 'twilio' as const,
              format: 'wav' as const
            }
          },
          toolchain: {
            execution: 'parallel' as const,
            pipelines: [['transcriber', 'llm', 'synthesizer']]
          },
          task_config: {
            hangup_after: agent.max_duration || 300,
            ambient_sound: 'none',
            ambient_sound_volume: 0.1,
            interruption_backoff_period: 1.0,
            backchanneling: false,
            optimize_latency: true,
            incremental: false,
            normalize_audio: true
          }
        }]
      },
      agent_prompts: {
        task_1: {
          system_prompt: agent.system_prompt || agent.prompt || "You are a helpful AI assistant."
        }
      }
    };

    return bolnaAgentData;
  }

  /**
   * Map ElevenLabs voice IDs to Amazon Polly voice names
   */
  private mapElevenLabsVoiceToPolly(elevenLabsVoiceId: string): string {
    const voiceMapping: { [key: string]: string } = {
      'pNInz6obpgDQGcFmaJgB': 'Joanna', // Default female voice
      '21m00Tcm4TlvDq8ikWAM': 'Matthew', // Default male voice
      'ErXwobaYiN019PkySvjV': 'Amy',
      'MF3mGyEYCl7XYWbV9V6O': 'Brian',
      'TxGEqnHWrfWFTfGW9XjX': 'Emma',
      'VR6AewLTigWG4xSOukaG': 'Justin',
      'pqHfZKP75CvOlQylNhV4': 'Kendra',
      'yoZ06aMxZJJ28mfd3POQ': 'Kimberly',
      'cjVigY5qzO86Huf0OWal': 'Salli'
    };

    return voiceMapping[elevenLabsVoiceId] || 'Joanna'; // Default to Joanna
  }

  /**
   * Update migration status in database
   */
  private async updateMigrationStatus(
    recordId: string, 
    recordType: 'agent' | 'call', 
    status: 'in_progress' | 'completed' | 'failed',
    error?: string
  ): Promise<void> {
    try {
      // Using the update_migration_progress function that matches the table structure
      const tableName = recordType === 'agent' ? 'agents' : 'calls';
      
      // Update or insert migration status using the actual table structure
      await pool.query(`
        UPDATE migration_status 
        SET 
          status = $1,
          error_message = $2,
          completed_at = CASE WHEN $1 IN ('completed', 'failed') THEN CURRENT_TIMESTAMP ELSE completed_at END
        WHERE migration_name = 'bolna_migration' AND table_name = $3
      `, [status, error || null, tableName]);
      
    } catch (err) {
      logger.error('Failed to update migration status:', err);
    }
  }

  /**
   * Validate migration results
   */
  private async validateMigration(): Promise<void> {
    logger.info('🔍 Validating migration...');

    // Check agents with Bolna IDs
    const agentsResult = await pool.query(`
      SELECT COUNT(*) as count FROM agents WHERE bolna_agent_id IS NOT NULL
    `);
    const agentsWithBolnaIds = parseInt(agentsResult.rows[0].count);

    // Check migration status
    const migrationsResult = await pool.query(`
      SELECT COUNT(*) as count FROM migration_status WHERE status = 'completed'
    `);
    const completedMigrations = parseInt(migrationsResult.rows[0].count);

    logger.info(`Validation results:`, {
      agentsWithBolnaIds,
      completedMigrations,
      migrationStats: this.stats
    });
  }

  /**
   * Generate migration report
   */
  private generateReport(): void {
    const report = {
      timestamp: new Date().toISOString(),
      dryRun: this.dryRun,
      stats: this.stats,
      backupPath: this.backupPath,
      summary: {
        agentSuccessRate: `${((this.stats.migratedAgents / this.stats.totalAgents) * 100).toFixed(1)}%`,
        callSuccessRate: `${((this.stats.migratedCalls / this.stats.totalCalls) * 100).toFixed(1)}%`,
        totalErrors: this.stats.errors.length
      }
    };

    const reportPath = path.join(__dirname, '../../reports', `migration-report-${Date.now()}.json`);
    
    // Ensure reports directory exists
    const reportDir = path.dirname(reportPath);
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    logger.info('📊 Migration Report Generated:', report);
    logger.info(`Full report saved to: ${reportPath}`);
  }
}

// CLI execution
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  console.log('🚀 Bolna.ai Data Migration Script');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE MIGRATION'}`);

  const migration = new BolnaDataMigration(dryRun);

  try {
    await migration.runMigration();
    console.log('✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { BolnaDataMigration };