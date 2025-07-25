const cron = require('node-cron');
const { generateMonthlyInvoices } = require('../controllers/paymentController.js');
const pickupService = require('./pickupService');

// Run every Sunday at 11:59 PM - Mark missed pickups and create new pickups for the week
cron.schedule('59 23 * * 0', async () => {
  console.log('Running weekly batch job to mark missed pickups and create new pickups...');
  try {
    // Mark missed pickups from previous week
    const missedPickups = await pickupService.markMissedPickups();
    console.log(`Marked ${missedPickups.length} pickups as missed`);
    
    // Create pickups for the new week
    const newPickups = await pickupService.createWeeklyPickups();
    console.log(`Created ${newPickups.length} pickups for the new week`);
  } catch (error) {
    console.error('Weekly pickup job failed:', error);
  }
});

// Run every day at midnight (00:00:00) - Generate invoices and check for expired payments
cron.schedule('0 0 * * *', async () => {
  console.log('Running daily invoice generation job at midnight...');
  try {
    // Create a mock request/response for the controller
    const mockReq = {};
    const mockRes = {
      status: (code) => ({
        json: (data) => {
          console.log(`Invoice generation completed with status ${code}:`, data);
          return data;
        }
      })
    };
    
    await generateMonthlyInvoices(mockReq, mockRes);
  } catch (error) {
    console.error('Daily invoice generation failed:', error);
  }
});