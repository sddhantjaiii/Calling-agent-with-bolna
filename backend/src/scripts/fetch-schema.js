const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://postgres.square-pine-52224220:KfOE7X9TyMhb@aws-0-ap-south-1.pooler.supabase.com:6543/postgres",
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function fetchCompleteSchema() {
  try {
    console.log('🔍 Fetching complete database schema...');
    
    // Read the SQL file
    const sqlFilePath = path.join(__dirname, 'fetch-complete-schema.sql');
    const sql = fs.readFileSync(sqlFilePath, 'utf8');
    
    // Execute the query
    const result = await pool.query(sql);
    
    // Group results by query type
    const schemas = {};
    result.rows.forEach(row => {
      const queryType = row.query_type;
      if (!schemas[queryType]) {
        schemas[queryType] = [];
      }
      schemas[queryType].push(row);
    });
    
    // Generate markdown output
    let markdown = `# Complete Database Schema Structure\n`;
    markdown += `Generated on: ${new Date().toISOString()}\n\n`;
    
    // 1. Tables and Columns
    if (schemas.TABLE_STRUCTURE) {
      markdown += `## 📋 Tables and Columns\n\n`;
      const tables = {};
      schemas.TABLE_STRUCTURE.forEach(row => {
        if (!tables[row.table_name]) {
          tables[row.table_name] = [];
        }
        tables[row.table_name].push(row);
      });
      
      Object.keys(tables).sort().forEach(tableName => {
        markdown += `### \`${tableName}\`\n\n`;
        markdown += `| Column | Type | Length | Nullable | Default | PK |\n`;
        markdown += `|--------|------|--------|----------|---------|----|\n`;
        
        tables[tableName].forEach(col => {
          const length = col.character_maximum_length ? `(${col.character_maximum_length})` : '';
          const nullable = col.is_nullable === 'YES' ? '✓' : '✗';
          const pk = col.is_primary_key === 'YES' ? '🔑' : '';
          const defaultVal = col.column_default ? col.column_default.substring(0, 20) + '...' : '';
          
          markdown += `| ${col.column_name} | ${col.data_type}${length} | ${col.character_maximum_length || ''} | ${nullable} | ${defaultVal} | ${pk} |\n`;
        });
        markdown += `\n`;
      });
    }
    
    // 2. Primary Keys
    if (schemas.PRIMARY_KEYS) {
      markdown += `## 🔑 Primary Keys\n\n`;
      markdown += `| Table | Constraint Name | Columns |\n`;
      markdown += `|-------|-----------------|----------|\n`;
      schemas.PRIMARY_KEYS.forEach(pk => {
        markdown += `| ${pk.table_name} | ${pk.constraint_name} | ${pk.columns} |\n`;
      });
      markdown += `\n`;
    }
    
    // 3. Foreign Keys
    if (schemas.FOREIGN_KEYS) {
      markdown += `## 🔗 Foreign Keys\n\n`;
      markdown += `| From Table | From Column | To Table | To Column | Constraint Name | Delete Rule | Update Rule |\n`;
      markdown += `|------------|-------------|----------|-----------|-----------------|-------------|-------------|\n`;
      schemas.FOREIGN_KEYS.forEach(fk => {
        markdown += `| ${fk.from_table} | ${fk.from_column} | ${fk.to_table} | ${fk.to_column} | ${fk.constraint_name} | ${fk.delete_rule} | ${fk.update_rule} |\n`;
      });
      markdown += `\n`;
    }
    
    // 4. Unique Constraints
    if (schemas.UNIQUE_CONSTRAINTS) {
      markdown += `## 🎯 Unique Constraints\n\n`;
      markdown += `| Table | Constraint Name | Columns |\n`;
      markdown += `|-------|-----------------|----------|\n`;
      schemas.UNIQUE_CONSTRAINTS.forEach(uc => {
        markdown += `| ${uc.table_name} | ${uc.constraint_name} | ${uc.columns} |\n`;
      });
      markdown += `\n`;
    }
    
    // 5. Check Constraints
    if (schemas.CHECK_CONSTRAINTS) {
      markdown += `## ✅ Check Constraints\n\n`;
      markdown += `| Table | Constraint Name | Check Clause |\n`;
      markdown += `|-------|-----------------|---------------|\n`;
      schemas.CHECK_CONSTRAINTS.forEach(cc => {
        const clause = cc.check_clause.length > 50 ? cc.check_clause.substring(0, 50) + '...' : cc.check_clause;
        markdown += `| ${cc.table_name} | ${cc.constraint_name} | \`${clause}\` |\n`;
      });
      markdown += `\n`;
    }
    
    // 6. Indexes
    if (schemas.INDEXES) {
      markdown += `## 📊 Indexes\n\n`;
      const indexesByTable = {};
      schemas.INDEXES.forEach(idx => {
        if (!indexesByTable[idx.tablename]) {
          indexesByTable[idx.tablename] = [];
        }
        indexesByTable[idx.tablename].push(idx);
      });
      
      Object.keys(indexesByTable).sort().forEach(tableName => {
        markdown += `### \`${tableName}\` Indexes\n\n`;
        markdown += `| Index Name | Definition |\n`;
        markdown += `|------------|------------|\n`;
        indexesByTable[tableName].forEach(idx => {
          const def = idx.indexdef.length > 80 ? idx.indexdef.substring(0, 80) + '...' : idx.indexdef;
          markdown += `| ${idx.indexname} | \`${def}\` |\n`;
        });
        markdown += `\n`;
      });
    }
    
    // 7. Triggers
    if (schemas.TRIGGERS) {
      markdown += `## ⚡ Triggers\n\n`;
      markdown += `| Table | Trigger Name | Timing | Event | Orientation | Statement |\n`;
      markdown += `|-------|--------------|--------|-------|-------------|------------|\n`;
      schemas.TRIGGERS.forEach(trigger => {
        const stmt = trigger.action_statement.length > 40 ? trigger.action_statement.substring(0, 40) + '...' : trigger.action_statement;
        markdown += `| ${trigger.table_name} | ${trigger.trigger_name} | ${trigger.action_timing} | ${trigger.event_manipulation} | ${trigger.action_orientation} | \`${stmt}\` |\n`;
      });
      markdown += `\n`;
    }
    
    // 8. Views
    if (schemas.VIEWS) {
      markdown += `## 👁️ Views\n\n`;
      schemas.VIEWS.forEach(view => {
        markdown += `### \`${view.view_name}\`\n\n`;
        markdown += `\`\`\`sql\n${view.view_definition}\n\`\`\`\n\n`;
      });
    }
    
    // 9. Functions
    if (schemas.FUNCTIONS) {
      markdown += `## 🔧 Functions and Procedures\n\n`;
      markdown += `| Name | Type | Return Type | Definition |\n`;
      markdown += `|------|------|-------------|------------|\n`;
      schemas.FUNCTIONS.forEach(func => {
        const def = func.routine_definition ? (func.routine_definition.length > 50 ? func.routine_definition.substring(0, 50) + '...' : func.routine_definition) : 'N/A';
        markdown += `| ${func.routine_name} | ${func.routine_type} | ${func.return_type || 'N/A'} | \`${def}\` |\n`;
      });
      markdown += `\n`;
    }
    
    // 10. Table Sizes
    if (schemas.TABLE_SIZES) {
      markdown += `## 📏 Table Sizes\n\n`;
      markdown += `| Schema | Table | Total Size | Table Size | Index Size |\n`;
      markdown += `|--------|-------|------------|------------|------------|\n`;
      schemas.TABLE_SIZES.forEach(size => {
        markdown += `| ${size.schemaname} | ${size.tablename} | ${size.total_size} | ${size.table_size} | ${size.index_size} |\n`;
      });
      markdown += `\n`;
    }
    
    // Write to file
    const outputPath = path.join(__dirname, '..', '..', '..', 'current-database-schema.md');
    fs.writeFileSync(outputPath, markdown);
    
    console.log(`✅ Complete schema exported to: ${outputPath}`);
    console.log(`📊 Found ${Object.keys(schemas).length} different schema components`);
    
    // Summary stats
    const tableCount = schemas.TABLE_STRUCTURE ? new Set(schemas.TABLE_STRUCTURE.map(r => r.table_name)).size : 0;
    const columnCount = schemas.TABLE_STRUCTURE ? schemas.TABLE_STRUCTURE.length : 0;
    const indexCount = schemas.INDEXES ? schemas.INDEXES.length : 0;
    const triggerCount = schemas.TRIGGERS ? schemas.TRIGGERS.length : 0;
    const viewCount = schemas.VIEWS ? schemas.VIEWS.length : 0;
    const functionCount = schemas.FUNCTIONS ? schemas.FUNCTIONS.length : 0;
    
    console.log(`📈 Schema Statistics:`);
    console.log(`   - Tables: ${tableCount}`);
    console.log(`   - Columns: ${columnCount}`);
    console.log(`   - Indexes: ${indexCount}`);
    console.log(`   - Triggers: ${triggerCount}`);
    console.log(`   - Views: ${viewCount}`);
    console.log(`   - Functions: ${functionCount}`);
    
    return {
      tables: tableCount,
      columns: columnCount,
      indexes: indexCount,
      triggers: triggerCount,
      views: viewCount,
      functions: functionCount
    };
    
  } catch (error) {
    console.error('❌ Error fetching schema:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the script
if (require.main === module) {
  fetchCompleteSchema()
    .then(stats => {
      console.log('🎉 Schema export completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Schema export failed:', error);
      process.exit(1);
    });
}

module.exports = { fetchCompleteSchema };