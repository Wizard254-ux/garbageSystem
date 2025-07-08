const cron = require('node-cron');
const {batchMarkUnpicked} =require('../controllers/PickUpController.js')

// Run every Sunday at 11:59 PM
cron.schedule('59 23 * * 0', () => {
  console.log('Running weekly batch job...');
  batchMarkUnpicked();
});