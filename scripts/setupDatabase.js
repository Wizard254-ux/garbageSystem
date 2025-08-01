const { sequelize } = require('../models');

/**
 * Database setup script
 * This will properly initialize the database with all tables
 */

async function setupDatabase() {
  try {
    console.log('🔄 Testing database connection...');
    
    // Test the connection
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully');
    
    console.log('🔄 Synchronizing database models...');
    
    // First, sync without force to check if we need to recreate
    try {
      await sequelize.sync({ alter: false, force: false });
      console.log('✅ Database sync completed successfully');
    } catch (error) {
      if (error.message.includes('Too many keys') || error.message.includes('ER_TOO_MANY_KEYS')) {
        console.log('⚠️  Too many keys error detected. Recreating tables...');
        
        // Drop and recreate all tables
        await sequelize.sync({ force: true });
        console.log('✅ Database recreated successfully');
      } else {
        throw error;
      }
    }
    
    // Add unique constraints manually if needed
    try {
      const queryInterface = sequelize.getQueryInterface();
      
      // Add unique constraint for phone (if not null)
      await queryInterface.addConstraint('Users', {
        fields: ['phone'],
        type: 'unique',
        name: 'unique_phone',
        where: {
          phone: {
            [sequelize.Op.ne]: null
          }
        }
      });
      console.log('✅ Added unique constraint for phone');
      
      // Add unique constraint for accountNumber (if not null)
      await queryInterface.addConstraint('Users', {
        fields: ['accountNumber'],
        type: 'unique',
        name: 'unique_account_number',
        where: {
          accountNumber: {
            [sequelize.Op.ne]: null
          }
        }
      });
      console.log('✅ Added unique constraint for accountNumber');
      
    } catch (constraintError) {
      // Constraints might already exist, that's okay
      console.log('ℹ️  Unique constraints may already exist');
    }
    
    console.log('🎉 Database setup completed successfully!');
    
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    throw error;
  }
}

// Run if this script is executed directly
if (require.main === module) {
  setupDatabase()
    .then(() => {
      console.log('✅ Setup script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Setup script failed:', error);
      process.exit(1);
    });
}

module.exports = { setupDatabase };