const { sequelize } = require('../models');

/**
 * Database initialization script
 * This script will create all tables and relationships
 */

async function initializeDatabase() {
  try {
    console.log('🔄 Connecting to MySQL database...');
    
    // Test connection
    await sequelize.authenticate();
    console.log('✅ Connection to MySQL established successfully');
    
    console.log('🔄 Creating/updating database tables...');
    
    // Sync all models (creates tables if they don't exist, updates if needed)
    await sequelize.sync({ 
      alter: true, // This will alter existing tables to match model definitions
      // force: true  // WARNING: This will drop and recreate all tables - use only for development
    });
    
    console.log('✅ All tables have been created/updated successfully');
    
    // Log all created tables
    const tableNames = await sequelize.getQueryInterface().showAllTables();
    console.log('📋 Created tables:', tableNames);
    
    console.log('🎉 Database initialization completed successfully!');
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
}

// Run if this script is executed directly
if (require.main === module) {
  initializeDatabase()
    .then(() => {
      console.log('✅ Initialization script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Initialization script failed:', error);
      process.exit(1);
    });
}

module.exports = { initializeDatabase };