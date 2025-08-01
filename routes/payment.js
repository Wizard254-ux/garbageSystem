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

      // Verify client belongs to organization - FIXED: removed double "where"
      const client = await User.findOne({
        where: {
          id: clientId,
          role: 'client',
          organizationId: req.user.id
        }
      });
      
      if (!client) {
        return res.status(404).json({
          success: false,
          error: 'Client not found or does not belong to your organization'
        });
      }
      
      // Build query
      const { Op } = require('sequelize');
      const whereClause = { userId: clientId };
      
      if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate) whereClause.createdAt[Op.gte] = new Date(startDate);
        if (endDate) whereClause.createdAt[Op.lte] = new Date(endDate);
      }
      
      // Calculate pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      // Get payments
      const payments = await Payment.findAll({
        where: whereClause,
        include: [{ model: require('../models/Invoice'), as: 'invoice' }],
        order: [['createdAt', 'DESC']],
        attributes: ['id', 'accountNumber', 'amount', 'paymentMethod', 'mpesaReceiptNumber', 'phoneNumber', 'status', 'allocationStatus', 'allocatedAmount', 'remainingAmount', 'createdAt', 'invoiceId'],
        offset: skip,
        limit: parseInt(limit)
      });
      
      // Get total count
      const totalPayments = await Payment.count({ where: whereClause });
      
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

// Export payments
router.get('/export', 
  authenticateToken,
  authorizeRoles(['organization']),
  async (req, res) => {
    try {
      const { format = 'csv', startDate, endDate, accountNumber } = req.query;
      
      // Build query
      const { Op } = require('sequelize');
      const whereClause = {};
      
      if (accountNumber) {
        whereClause.accountNumber = accountNumber;
      }
      
      if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate) whereClause.createdAt[Op.gte] = new Date(startDate);
        if (endDate) whereClause.createdAt[Op.lte] = new Date(endDate);
      }
      
      // Get payments
      const payments = await Payment.findAll({
        where: whereClause,
        include: [{ model: require('../models/Invoice'), as: 'invoice' }],
        attributes: ['id', 'accountNumber', 'amount', 'paymentMethod', 'mpesaReceiptNumber', 'phoneNumber', 'status', 'allocationStatus', 'allocatedAmount', 'remainingAmount', 'createdAt', 'invoiceId'],
        order: [['createdAt', 'DESC']]
      });
      
      // Format data based on requested format
      let data;
      let contentType;
      let filename;
      
      if (format === 'csv') {
        // CSV format
        const csvRows = [];
        
        // Add headers
        csvRows.push(['Date', 'Account Number', 'Amount', 'Method', 'Receipt', 'Phone', 'Status', 'Allocation Status', 'Allocated Amount', 'Remaining Amount'].join(','));
        
        // Add data rows
        payments.forEach(payment => {
          const row = [
            new Date(payment.createdAt).toISOString().split('T')[0],
            payment.accountNumber,
            payment.amount,
            payment.paymentMethod,
            payment.mpesaReceiptNumber || payment.transactionId || '',
            payment.phoneNumber,
            payment.status,
            payment.allocationStatus || 'unallocated',
            payment.allocatedAmount || 0,
            payment.remainingAmount || payment.amount || 0
          ];
          
          csvRows.push(row.join(','));
        });
        
        data = csvRows.join('\n');
        contentType = 'text/csv';
        filename = 'payments-export.csv';
      } else if (format === 'excel') {
        // For Excel, we'll just send CSV with a different content type
        // In a real app, you'd use a library like exceljs to create a proper Excel file
        const csvRows = [];
        
        // Add headers
        csvRows.push(['Date', 'Account Number', 'Amount', 'Method', 'Receipt', 'Phone', 'Status', 'Allocation Status', 'Allocated Amount', 'Remaining Amount'].join(','));
        
        // Add data rows
        payments.forEach(payment => {
          const row = [
            new Date(payment.createdAt).toISOString().split('T')[0],
            payment.accountNumber,
            payment.amount,
            payment.paymentMethod,
            payment.mpesaReceiptNumber || payment.transactionId || '',
            payment.phoneNumber,
            payment.status,
            payment.allocationStatus || 'unallocated',
            payment.allocatedAmount || 0,
            payment.remainingAmount || payment.amount || 0
          ];
          
          csvRows.push(row.join(','));
        });
        
        data = csvRows.join('\n');
        contentType = 'application/vnd.ms-excel';
        filename = 'payments-export.xls';
      } else if (format === 'pdf') {
        // For PDF, we'll just send a simple text representation
        // In a real app, you'd use a library like PDFKit to create a proper PDF
        const textRows = [];
        
        textRows.push('Payment Export');
        textRows.push('=============');
        textRows.push('');
        
        payments.forEach(payment => {
          textRows.push(`Date: ${new Date(payment.createdAt).toISOString().split('T')[0]}`);
          textRows.push(`Account: ${payment.accountNumber}`);
          textRows.push(`Amount: ${payment.amount}`);
          textRows.push(`Method: ${payment.paymentMethod}`);
          textRows.push(`Receipt: ${payment.mpesaReceiptNumber || payment.transactionId || 'N/A'}`);
          textRows.push(`Phone: ${payment.phoneNumber}`);
          textRows.push(`Status: ${payment.status}`);
          textRows.push(`Allocation Status: ${payment.allocationStatus || 'unallocated'}`);
          textRows.push(`Allocated Amount: ${payment.allocatedAmount || 0}`);
          textRows.push(`Remaining Amount: ${payment.remainingAmount || payment.amount || 0}`);
          textRows.push('-------------------');
        });
        
        data = textRows.join('\n');
        contentType = 'text/plain';
        filename = 'payments-export.txt';
      } else {
        return res.status(400).json({
          success: false,
          error: 'Invalid format. Supported formats: csv, excel, pdf'
        });
      }
      
      // Set headers and send response
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      res.send(data);
      
    } catch (error) {
      console.error('Export payments error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to export payments'
      });
    }
  }
);

module.exports = router;