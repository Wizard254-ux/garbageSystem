const cron = require('node-cron');
const {batchMarkUnpicked} = require('../controllers/PickUpController.js');
const {generateMonthlyInvoices} = require('../controllers/paymentController.js');

// Run every Sunday at 11:59 PM - Mark unpicked garbage
cron.schedule('59 23 * * 0', () => {
  console.log('Running weekly batch job to mark unpicked garbage...');
  batchMarkUnpicked();
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