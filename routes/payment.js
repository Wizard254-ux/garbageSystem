const express = require('express');
const { 
  processPayment, 
  generateMonthlyInvoices, 
  getPaymentHistory, 
  getAccountStatement,
  createManualInvoice,
  getClientPaymentInfo,
  getOrganizationStats,
  getFullPaymentHistory
} = require('../controllers/paymentController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const router = express.Router();

// Process payment (M-Pesa/Paybill)
router.post('/process', processPayment);

// Generate monthly invoices (cron job)
router.post('/generate-invoices', 
  authenticateToken,
  authorizeRoles(['admin', 'organization']),
  generateMonthlyInvoices
);

// Get payment history by account number
router.get('/history/:accountNumber', 
  authenticateToken,
  authorizeRoles(['admin', 'organization']),
  getPaymentHistory
);
router.get('/history', 
  authenticateToken,
  authorizeRoles(['admin', 'organization']),
  getFullPaymentHistory
);

// Get account statement
router.get('/statement/:accountNumber', 
  authenticateToken,
  authorizeRoles(['admin', 'organization', 'client']),
  getAccountStatement
);

// Create manual invoice for testing
router.post('/create-invoice', 
  authenticateToken,
  authorizeRoles(['admin', 'organization']),
  createManualInvoice
);

// Get client payment info
router.get('/client/:clientId', 
  authenticateToken,
  authorizeRoles(['organization']),
  getClientPaymentInfo
);

// Get organization stats
router.get('/organization/stats', 
  authenticateToken,
  authorizeRoles(['organization']),
  getOrganizationStats
);

module.exports = router;