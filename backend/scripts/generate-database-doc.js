const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function generateDatabaseDoc() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Connected to database, extracting schema information...\n');
    
    // Get all tables
    const tablesResult = await client.query(`
      SELECT 
        schemaname,
        tablename,
        tableowner
      FROM pg_tables 
      WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
      ORDER BY schemaname, tablename;
    `);

    let markdown = `# Complete Database Schema Documentation\n\n`;
    markdown += `*Generated on: ${new Date().toISOString()}*\n`;
    markdown += `*Database: Neon PostgreSQL*\n\n`;
    markdown += `## Table of Contents\n\n`;
    
    // Generate TOC
    for (const table of tablesResult.rows) {
      markdown += `- [${table.schemaname}.${table.tablename}](#${table.schemaname}${table.tablename})\n`;
    }
    markdown += `\n---\n\n`;

    // Get details for each table
    for (const table of tablesResult.rows) {
      const schemaName = table.schemaname;
      const tableName = table.tablename;
      
      console.log(`📊 Processing table: ${schemaName}.${tableName}`);
      
      markdown += `## ${schemaName}.${tableName}\n\n`;

      // Get table comment/description
      const tableCommentResult = await client.query(`
        SELECT obj_description(oid) as description
        FROM pg_class
        WHERE relname = $1 AND relkind = 'r';
      `, [tableName]);
      
      if (tableCommentResult.rows[0]?.description) {
        markdown += `**Description**: ${tableCommentResult.rows[0].description}\n\n`;
      }

      // Get columns information
      const columnsResult = await client.query(`
        SELECT 
          a.attname AS column_name,
          pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
          a.attnotnull AS not_null,
          pg_get_expr(d.adbin, d.adrelid) AS default_value,
          col_description(a.attrelid, a.attnum) AS column_comment,
          (SELECT COUNT(*) FROM pg_index i WHERE i.indrelid = a.attrelid AND a.attnum = ANY(i.indkey) AND i.indisprimary) > 0 AS is_primary_key,
          (SELECT COUNT(*) FROM pg_index i WHERE i.indrelid = a.attrelid AND a.attnum = ANY(i.indkey) AND i.indisunique) > 0 AS is_unique
        FROM pg_attribute a
        LEFT JOIN pg_attrdef d ON a.attrelid = d.adrelid AND a.attnum = d.adnum
        WHERE a.attrelid = $1::regclass
          AND a.attnum > 0
          AND NOT a.attisdropped
        ORDER BY a.attnum;
      `, [`${schemaName}.${tableName}`]);

      markdown += `### Columns\n\n`;
      markdown += `| Column Name | Data Type | Nullable | Default | Primary Key | Unique | Description |\n`;
      markdown += `|-------------|-----------|----------|---------|-------------|--------|-------------|\n`;
      
      for (const col of columnsResult.rows) {
        const nullable = col.not_null ? 'NO' : 'YES';
        const defaultVal = col.default_value || '-';
        const pk = col.is_primary_key ? '✓' : '';
        const unique = col.is_unique ? '✓' : '';
        const desc = col.column_comment || '';
        markdown += `| \`${col.column_name}\` | ${col.data_type} | ${nullable} | ${defaultVal} | ${pk} | ${unique} | ${desc} |\n`;
      }
      markdown += `\n`;

      // Get constraints
      const constraintsResult = await client.query(`
        SELECT
          con.conname AS constraint_name,
          con.contype AS constraint_type,
          CASE con.contype
            WHEN 'p' THEN 'PRIMARY KEY'
            WHEN 'u' THEN 'UNIQUE'
            WHEN 'c' THEN 'CHECK'
            WHEN 'f' THEN 'FOREIGN KEY'
            WHEN 'x' THEN 'EXCLUDE'
          END AS constraint_type_label,
          pg_get_constraintdef(con.oid) AS constraint_definition
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = $1
          AND rel.relname = $2
        ORDER BY con.contype, con.conname;
      `, [schemaName, tableName]);

      if (constraintsResult.rows.length > 0) {
        markdown += `### Constraints\n\n`;
        markdown += `| Constraint Name | Type | Definition |\n`;
        markdown += `|-----------------|------|------------|\n`;
        
        for (const constraint of constraintsResult.rows) {
          markdown += `| \`${constraint.constraint_name}\` | ${constraint.constraint_type_label} | ${constraint.constraint_definition} |\n`;
        }
        markdown += `\n`;
      }

      // Get indexes
      const indexesResult = await client.query(`
        SELECT
          indexname,
          indexdef
        FROM pg_indexes
        WHERE schemaname = $1
          AND tablename = $2
        ORDER BY indexname;
      `, [schemaName, tableName]);

      if (indexesResult.rows.length > 0) {
        markdown += `### Indexes\n\n`;
        markdown += `| Index Name | Definition |\n`;
        markdown += `|------------|------------|\n`;
        
        for (const index of indexesResult.rows) {
          markdown += `| \`${index.indexname}\` | ${index.indexdef} |\n`;
        }
        markdown += `\n`;
      }

      // Get foreign key relationships
      const fkResult = await client.query(`
        SELECT
          tc.constraint_name,
          kcu.column_name,
          ccu.table_schema AS foreign_table_schema,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name,
          rc.update_rule,
          rc.delete_rule
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        JOIN information_schema.referential_constraints AS rc
          ON rc.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = $1
          AND tc.table_name = $2;
      `, [schemaName, tableName]);

      if (fkResult.rows.length > 0) {
        markdown += `### Foreign Keys\n\n`;
        markdown += `| Column | References | On Update | On Delete |\n`;
        markdown += `|--------|------------|-----------|------------|\n`;
        
        for (const fk of fkResult.rows) {
          markdown += `| \`${fk.column_name}\` | \`${fk.foreign_table_schema}.${fk.foreign_table_name}(${fk.foreign_column_name})\` | ${fk.update_rule} | ${fk.delete_rule} |\n`;
        }
        markdown += `\n`;
      }

      // Get triggers
      const triggersResult = await client.query(`
        SELECT
          t.tgname AS trigger_name,
          pg_get_triggerdef(t.oid) AS trigger_definition,
          CASE t.tgtype::integer & 66
            WHEN 2 THEN 'BEFORE'
            WHEN 64 THEN 'INSTEAD OF'
            ELSE 'AFTER'
          END AS trigger_timing,
          CASE t.tgtype::integer & 28
            WHEN 4 THEN 'INSERT'
            WHEN 8 THEN 'DELETE'
            WHEN 16 THEN 'UPDATE'
            WHEN 12 THEN 'INSERT OR DELETE'
            WHEN 20 THEN 'INSERT OR UPDATE'
            WHEN 24 THEN 'DELETE OR UPDATE'
            WHEN 28 THEN 'INSERT OR UPDATE OR DELETE'
          END AS trigger_event
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1
          AND c.relname = $2
          AND NOT t.tgisinternal
        ORDER BY t.tgname;
      `, [schemaName, tableName]);

      if (triggersResult.rows.length > 0) {
        markdown += `### Triggers\n\n`;
        
        for (const trigger of triggersResult.rows) {
          markdown += `#### ${trigger.trigger_name}\n\n`;
          markdown += `- **Timing**: ${trigger.trigger_timing}\n`;
          markdown += `- **Event**: ${trigger.trigger_event}\n`;
          markdown += `- **Definition**:\n\`\`\`sql\n${trigger.trigger_definition}\n\`\`\`\n\n`;
        }
      }

      // Get row count
      try {
        const countResult = await client.query(`SELECT COUNT(*) as count FROM ${schemaName}.${tableName}`);
        markdown += `**Current Row Count**: ${countResult.rows[0].count}\n\n`;
      } catch (err) {
        markdown += `**Current Row Count**: Unable to determine\n\n`;
      }

      markdown += `---\n\n`;
    }

    // Get all views
    const viewsResult = await client.query(`
      SELECT 
        schemaname,
        viewname,
        definition
      FROM pg_views 
      WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
      ORDER BY schemaname, viewname;
    `);

    if (viewsResult.rows.length > 0) {
      markdown += `## Views\n\n`;
      
      for (const view of viewsResult.rows) {
        console.log(`👁️  Processing view: ${view.schemaname}.${view.viewname}`);
        markdown += `### ${view.schemaname}.${view.viewname}\n\n`;
        markdown += `\`\`\`sql\n${view.definition}\`\`\`\n\n`;
        markdown += `---\n\n`;
      }
    }

    // Get all materialized views
    const matViewsResult = await client.query(`
      SELECT 
        schemaname,
        matviewname,
        definition
      FROM pg_matviews 
      WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
      ORDER BY schemaname, matviewname;
    `);

    if (matViewsResult.rows.length > 0) {
      markdown += `## Materialized Views\n\n`;
      
      for (const matView of matViewsResult.rows) {
        console.log(`📊 Processing materialized view: ${matView.schemaname}.${matView.matviewname}`);
        markdown += `### ${matView.schemaname}.${matView.matviewname}\n\n`;
        markdown += `\`\`\`sql\n${matView.definition}\`\`\`\n\n`;

        // Get indexes on materialized view
        const mvIndexesResult = await client.query(`
          SELECT indexname, indexdef
          FROM pg_indexes
          WHERE schemaname = $1 AND tablename = $2
          ORDER BY indexname;
        `, [matView.schemaname, matView.matviewname]);

        if (mvIndexesResult.rows.length > 0) {
          markdown += `#### Indexes\n\n`;
          for (const index of mvIndexesResult.rows) {
            markdown += `- \`${index.indexname}\`: ${index.indexdef}\n`;
          }
          markdown += `\n`;
        }

        markdown += `---\n\n`;
      }
    }

    // Get all functions
    const functionsResult = await client.query(`
      SELECT 
        n.nspname AS schema_name,
        p.proname AS function_name,
        pg_get_functiondef(p.oid) AS function_definition,
        pg_get_function_arguments(p.oid) AS arguments,
        pg_get_function_result(p.oid) AS return_type
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND p.prokind = 'f'
      ORDER BY n.nspname, p.proname;
    `);

    if (functionsResult.rows.length > 0) {
      markdown += `## Functions\n\n`;
      
      for (const func of functionsResult.rows) {
        console.log(`⚙️  Processing function: ${func.schema_name}.${func.function_name}`);
        markdown += `### ${func.schema_name}.${func.function_name}\n\n`;
        markdown += `- **Arguments**: ${func.arguments || 'None'}\n`;
        markdown += `- **Returns**: ${func.return_type}\n\n`;
        markdown += `\`\`\`sql\n${func.function_definition}\n\`\`\`\n\n`;
        markdown += `---\n\n`;
      }
    }

    // Get all sequences
    const sequencesResult = await client.query(`
      SELECT 
        schemaname,
        sequencename,
        start_value,
        min_value,
        max_value,
        increment_by,
        cycle
      FROM pg_sequences
      WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
      ORDER BY schemaname, sequencename;
    `);

    if (sequencesResult.rows.length > 0) {
      markdown += `## Sequences\n\n`;
      markdown += `| Schema | Sequence Name | Start Value | Min Value | Max Value | Increment | Cycle |\n`;
      markdown += `|--------|---------------|-------------|-----------|-----------|-----------|-------|\n`;
      
      for (const seq of sequencesResult.rows) {
        markdown += `| ${seq.schemaname} | \`${seq.sequencename}\` | ${seq.start_value} | ${seq.min_value} | ${seq.max_value} | ${seq.increment_by} | ${seq.cycle} |\n`;
      }
      markdown += `\n---\n\n`;
    }

    // Get all enums
    const enumsResult = await client.query(`
      SELECT 
        n.nspname AS schema_name,
        t.typname AS enum_name,
        array_agg(e.enumlabel ORDER BY e.enumsortorder) AS enum_values
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
      GROUP BY n.nspname, t.typname
      ORDER BY n.nspname, t.typname;
    `);

    if (enumsResult.rows.length > 0) {
      markdown += `## Enum Types\n\n`;
      
      for (const enumType of enumsResult.rows) {
        markdown += `### ${enumType.schema_name}.${enumType.enum_name}\n\n`;
        markdown += `**Values**: ${enumType.enum_values.join(', ')}\n\n`;
      }
      markdown += `---\n\n`;
    }

    // Get database statistics
    const dbStatsResult = await client.query(`
      SELECT 
        pg_database_size(current_database()) AS database_size,
        current_database() AS database_name,
        version() AS postgres_version;
    `);

    markdown += `## Database Statistics\n\n`;
    if (dbStatsResult.rows[0]) {
      const stats = dbStatsResult.rows[0];
      const sizeInMB = (parseInt(stats.database_size) / 1024 / 1024).toFixed(2);
      markdown += `- **Database Name**: ${stats.database_name}\n`;
      markdown += `- **Database Size**: ${sizeInMB} MB\n`;
      markdown += `- **PostgreSQL Version**: ${stats.postgres_version}\n`;
    }

    markdown += `\n---\n\n`;
    markdown += `*End of Database Schema Documentation*\n`;

    // Write to file
    const outputPath = path.join(__dirname, '..', '..', 'database.md');
    fs.writeFileSync(outputPath, markdown);
    
    console.log('\n✅ Database documentation generated successfully!');
    console.log(`📄 File location: ${outputPath}`);
    console.log(`📊 Total tables documented: ${tablesResult.rows.length}`);
    console.log(`👁️  Total views documented: ${viewsResult.rows.length}`);
    console.log(`📊 Total materialized views documented: ${matViewsResult.rows.length}`);
    console.log(`⚙️  Total functions documented: ${functionsResult.rows.length}`);
    
  } catch (error) {
    console.error('❌ Error generating documentation:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

generateDatabaseDoc()
  .then(() => {
    console.log('\n🎉 Documentation generation complete!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n💥 Fatal error:', err);
    process.exit(1);
  });
