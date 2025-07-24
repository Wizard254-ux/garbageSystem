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
const User = require('../models/User');
const Payment = require('../models/Payment');

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

// Get client payment info (summary)
router.get('/client/:clientId', 
  authenticateToken,
  authorizeRoles(['organization']),
  getClientPaymentInfo
);

// Get client payments (detailed list)
router.get('/client/:clientId/payments', 
  authenticateToken,
  authorizeRoles(['organization']),
  async (req, res) => {
    try {
      const { clientId } = req.params;
      const { page = 1, limit = 10, startDate, endDate } = req.query;
      
      // Verify client belongs to organization
      const client = await User.findOne({
        _id: clientId,
        role: 'client',
        organizationId: req.user._id
      });
      
      if (!client) {
        return res.status(404).json({
          success: false,
          error: 'Client not found or does not belong to your organization'
        });
      }
      
      // Build query
      const query = { userId: clientId };
      
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
      }
      
      // Calculate pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      // Get payments
      const payments = await Payment.find(query)
        .populate('invoiceId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));
      
      // Get total count
      const totalPayments = await Payment.countDocuments(query);
      
      res.json({
        success: true,
        payments,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalPayments / parseInt(limit)),
          totalPayments,
          hasNext: skip + payments.length < totalPayments,
          hasPrev: parseInt(page) > 1
        }
      });
    } catch (error) {
      console.error('Error fetching client payments:', error);
      res.status(500).json({
        success: false,
        error: 'Server error'
      });
    }
  }
);

// Get organization stats
router.get('/organization/stats', 
  authenticateToken,
  authorizeRoles(['organization']),
  getOrganizationStats
);

module.exports = router;