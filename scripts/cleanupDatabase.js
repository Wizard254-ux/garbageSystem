const mysql = require('mysql2/promise');
require('dotenv').config();

/**
 * Database cleanup script to remove all tables and start fresh
 * This helps resolve the "too many keys" issue
 */

async function cleanupDatabase() {
  let connection;
  
  try {
    console.log('🔄 Connecting to MySQL...');
    
    // Create connection
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    });
    
    console.log('✅ Connected to MySQL');
    
    // Disable foreign key checks
    await connection.execute('SET FOREIGN_KEY_CHECKS = 0');
    console.log('🔄 Disabled foreign key checks');
    
    // Get all tables
    const [tables] = await connection.execute('SHOW TABLES');
    
    if (tables.length > 0) {
      console.log(`🔄 Found ${tables.length} tables to drop`);
      
      // Drop all tables
      for (const table of tables) {
        const tableName = Object.values(table)[0];
        await connection.execute(`DROP TABLE IF EXISTS \`${tableName}\``);
        console.log(`✅ Dropped table: ${tableName}`);
      }
    } else {
      console.log('ℹ️  No tables found to drop');
    }
    
    // Re-enable foreign key checks
    await connection.execute('SET FOREIGN_KEY_CHECKS = 1');
    console.log('✅ Re-enabled foreign key checks');
    
    console.log('🎉 Database cleanup completed successfully!');
    
  } catch (error) {
    console.error('❌ Database cleanup failed:', error);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Database connection closed');
    }
  }
}

// Run if this script is executed directly
if (require.main === module) {
  cleanupDatabase()
    .then(() => {
      console.log('✅ Cleanup script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Cleanup script failed:', error);
      process.exit(1);
    });
}

module.exports = { cleanupDatabase };