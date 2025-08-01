const { Op } = require('sequelize');
const express = require('express');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { Invoice, User } = require('../models');

const router = express.Router();

// Get all invoices for organization's clients
router.get('/', authenticateToken, authorizeRoles(['organization']), async (req, res) => {
  try {
    const { page = 1, limit = 10, status, startDate, endDate } = req.query;
    
    // Find all clients belonging to this organization
    const clients = await User.findAll({ 
      where: { 
        createdBy: req.user.id,
        role: 'client'
      },
      attributes: ['id']
    });

    console.log('clients for this org:', clients);

    const clientIds = clients.map(client => client.id);

    // Build query to find invoices for these clients
    const query = {
      userId: { [Op.in]: clientIds }
    };

    // Add filters if provided
    if (status && status !== '') {
      // Due status filters
      if (status === 'overdue') {
        query.dueStatus = 'overdue';
      } else if (status === 'due') {
        query.dueStatus = 'due';
      } else if (status === 'upcoming') {
        query.dueStatus = 'upcoming';
      }
      // Payment status filters
      else if (['fully_paid', 'partially_paid', 'unpaid'].includes(status)) {
        // For payment status, check paymentStatus field
        if (status === 'fully_paid') {
          query[Op.or] = [
            { paymentStatus: 'fully_paid' },
            { status: 'paid', paymentStatus: { [Op.eq]: null } }
          ];
        } else if (status === 'partially_paid') {
          query[Op.or] = [
            { paymentStatus: 'partially_paid' },
            { status: 'partial', paymentStatus: { [Op.eq]: null } }
          ];
        } else if (status === 'unpaid') {
          query[Op.or] = [
            { paymentStatus: 'unpaid' },
            { status: 'pending', paymentStatus: { [Op.eq]: null } }
          ];
        }
      } else {
        // For backward compatibility
        query.status = status;
      }
    }

    if (startDate || endDate) {
      query.issuedDate = {};
      if (startDate) query.issuedDate[Op.gte] = new Date(startDate);
      if (endDate) query.issuedDate[Op.lte] = new Date(endDate);
    }

    console.log('query:', query);

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get invoices with pagination
    const invoices = await Invoice.findAll({
      where: query,
      include: [{ model: User, as: 'user', attributes: ['name', 'email', 'phone', 'address'] }],
      order: [['issuedDate', 'DESC']],
      offset: skip,
      limit: parseInt(limit)
    });

    // Get total count
    const totalInvoices = await Invoice.count({ where: query });

    res.json({
      success: true,
      data: invoices,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalInvoices / parseInt(limit)),
        totalInvoices,
        hasNext: skip + invoices.length < totalInvoices,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

// Create new invoice
router.post('/', authenticateToken, authorizeRoles(['organization']), async (req, res) => {
  try {
    const { userId, totalAmount, dueDate, billingPeriodStart, billingPeriodEnd } = req.body;

    // Verify client belongs to organization - FIXED: removed triple "where"
    const client = await User.findOne({
      where: {
        id: userId,
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

    // Create invoice
    const invoiceData = {
      userId,
      accountNumber: client.accountNumber || `ACC-${userId.toString().slice(-6)}`,
      totalAmount,
      remainingBalance: totalAmount, // Will be recalculated in pre-save hook
      dueDate,
      billingPeriodStart,
      billingPeriodEnd
    };

    const invoice = await Invoice.create(invoiceData);

    res.status(201).json({
      success: true,
      data: invoice
    });
  } catch (error) {
    console.error('Error creating invoice:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

// Export invoices
router.get('/export', authenticateToken, authorizeRoles(['organization']), async (req, res) => {
  try {
    const { format = 'csv', status, startDate, endDate, accountNumber } = req.query;
    
    // Find all clients belonging to this organization
    const clients = await User.findAll({
      where: {
        createdBy: req.user.id,
        role: 'client'
      },
      attributes: ['id']
    });
    
    const clientIds = clients.map(client => client.id);
    
    // Build where clause
    const whereClause = {
      userId: { [Op.in]: clientIds }
    };
    
    // Add filters
    if (status && status !== '') {
      if (['fully_paid', 'partially_paid', 'unpaid'].includes(status)) {
        whereClause.paymentStatus = status;
      } else if (['due', 'overdue', 'upcoming', 'paid'].includes(status)) {
        whereClause.dueStatus = status;
      } else {
        whereClause.status = status;
      }
    }
    
    if (accountNumber && accountNumber !== '') {
      whereClause.accountNumber = { [Op.like]: `%${accountNumber}%` };
    }
    
    if (startDate || endDate) {
      whereClause.issuedDate = {};
      if (startDate) whereClause.issuedDate[Op.gte] = new Date(startDate);
      if (endDate) whereClause.issuedDate[Op.lte] = new Date(endDate);
    }
    
    // Get invoices with user data
    const invoices = await Invoice.findAll({
      where: whereClause,
      include: [{
        model: User,
        as: 'user',
        attributes: ['name', 'email', 'phone', 'address']
      }],
      order: [['issuedDate', 'DESC']]
    });
    
    // Generate CSV
    const csvHeaders = [
      'Invoice Number',
      'Client Name',
      'Account Number',
      'Email',
      'Phone',
      'Total Amount',
      'Amount Paid',
      'Remaining Balance',
      'Payment Status',
      'Due Status',
      'Issue Date',
      'Due Date',
      'Billing Period Start',
      'Billing Period End'
    ];
    
    const csvRows = invoices.map(invoice => [
      invoice.invoiceNumber,
      invoice.user?.name || 'N/A',
      invoice.accountNumber,
      invoice.user?.email || 'N/A',
      invoice.user?.phone || 'N/A',
      invoice.totalAmount,
      invoice.amountPaid,
      invoice.remainingBalance,
      invoice.paymentStatus,
      invoice.dueStatus,
      new Date(invoice.issuedDate).toLocaleDateString(),
      new Date(invoice.dueDate).toLocaleDateString(),
      new Date(invoice.billingPeriodStart).toLocaleDateString(),
      new Date(invoice.billingPeriodEnd).toLocaleDateString()
    ]);
    
    const csvContent = [csvHeaders, ...csvRows]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="invoices_${new Date().getTime()}.csv"`);
    res.send(csvContent);
  } catch (error) {
    console.error('Error exporting invoices:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

// Export aging summary
router.get('/aging-summary/export', authenticateToken, authorizeRoles(['organization']), async (req, res) => {
  try {
    const { format = 'csv', paymentStatus, dueStatus, startDate, endDate, accountNumber } = req.query;
    
    // Find all clients belonging to this organization
    const clients = await User.findAll({
      where: {
        createdBy: req.user.id,
        role: 'client'
      },
      attributes: ['id']
    });
    
    const clientIds = clients.map(client => client.id);
    
    // Build where clause for unpaid and partially paid invoices only
    const whereClause = {
      userId: { [Op.in]: clientIds },
      paymentStatus: { [Op.in]: ['unpaid', 'partially_paid'] }
    };
    
    // Add filters
    if (paymentStatus && paymentStatus !== '') {
      whereClause.paymentStatus = paymentStatus;
    }
    
    if (dueStatus && dueStatus !== '') {
      whereClause.dueStatus = dueStatus;
    }
    
    if (accountNumber && accountNumber !== '') {
      whereClause.accountNumber = { [Op.like]: `%${accountNumber}%` };
    }
    
    if (startDate || endDate) {
      whereClause.dueDate = {};
      if (startDate) whereClause.dueDate[Op.gte] = new Date(startDate);
      if (endDate) whereClause.dueDate[Op.lte] = new Date(endDate);
    }
    
    // Get invoices with user data
    const invoices = await Invoice.findAll({
      where: whereClause,
      include: [{
        model: User,
        as: 'user',
        attributes: ['name', 'email', 'phone', 'address', 'accountNumber']
      }],
      order: [['dueDate', 'ASC'], ['issuedDate', 'DESC']]
    });
    
    // Generate CSV
    const csvHeaders = [
      'Invoice Number',
      'Client Name',
      'Account Number',
      'Email',
      'Phone',
      'Total Amount',
      'Amount Paid',
      'Outstanding Balance',
      'Payment Status',
      'Due Status',
      'Days Overdue',
      'Issue Date',
      'Due Date',
      'Billing Period Start',
      'Billing Period End'
    ];
    
    const csvRows = invoices.map(invoice => {
      const dueDate = new Date(invoice.dueDate);
      const today = new Date();
      const diffTime = today.getTime() - dueDate.getTime();
      const daysOverdue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      return [
        invoice.invoiceNumber,
        invoice.user?.name || 'N/A',
        invoice.accountNumber,
        invoice.user?.email || 'N/A',
        invoice.user?.phone || 'N/A',
        invoice.totalAmount,
        invoice.amountPaid,
        invoice.remainingBalance,
        invoice.paymentStatus,
        invoice.dueStatus,
        daysOverdue > 0 ? daysOverdue : 0,
        new Date(invoice.issuedDate).toLocaleDateString(),
        new Date(invoice.dueDate).toLocaleDateString(),
        new Date(invoice.billingPeriodStart).toLocaleDateString(),
        new Date(invoice.billingPeriodEnd).toLocaleDateString()
      ];
    });
    
    const csvContent = [csvHeaders, ...csvRows]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="aging_summary_${new Date().getTime()}.csv"`);
    res.send(csvContent);
  } catch (error) {
    console.error('Error exporting aging summary:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

// Get aging summary - unpaid and partially paid invoices
router.get('/aging-summary', authenticateToken, authorizeRoles(['organization']), async (req, res) => {
  try {
    const { page = 1, limit = 10, paymentStatus, dueStatus, startDate, endDate, accountNumber } = req.query;

    // Find all clients belonging to this organization
    const clients = await User.findAll({
      where: {
        createdBy: req.user.id,
        role: 'client'
      },
      attributes: ['id']
    });

    const clientIds = clients.map(client => client.id);

    // Build query for unpaid and partially paid invoices only
    const query = {
      userId: { [Op.in]: clientIds },
      [Op.or]: [
        { paymentStatus: { [Op.in]: ['unpaid', 'partially_paid'] } },
        { status: { [Op.in]: ['pending', 'partial', 'overdue'] }, paymentStatus: { [Op.eq]: null } }
      ]
    };

    // Add filters
    if (paymentStatus && paymentStatus !== '') {
      if (paymentStatus === 'unpaid') {
        query[Op.or] = [
          { paymentStatus: 'unpaid' },
          { status: 'pending', paymentStatus: { [Op.eq]: null } }
        ];
      } else if (paymentStatus === 'partially_paid') {
        query[Op.or] = [
          { paymentStatus: 'partially_paid' },
          { status: 'partial', paymentStatus: { [Op.eq]: null } }
        ];
      }
    }

    if (dueStatus && dueStatus !== '') {
      if (dueStatus === 'overdue') {
        query[Op.and] = query[Op.and] || [];
        query[Op.and].push({
          [Op.or]: [
            { dueStatus: 'overdue' },
            { status: 'overdue', dueStatus: { [Op.eq]: null } }
          ]
        });
      } else if (dueStatus === 'due') {
        query[Op.and] = query[Op.and] || [];
        query[Op.and].push({ dueStatus: 'due' });
      }
    }

    if (accountNumber && accountNumber !== '') {
      query.accountNumber = { [Op.iLike]: `%${accountNumber}%` };
    }

    if (startDate || endDate) {
      query.dueDate = {};
      if (startDate) query.dueDate[Op.gte] = new Date(startDate);
      if (endDate) query.dueDate[Op.lte] = new Date(endDate);
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get invoices with client details
    const invoices = await Invoice.findAll({
      where: query,
      include: [{ model: User, as: 'user', attributes: ['name', 'email', 'phone', 'address', 'accountNumber'] }],
      order: [['dueDate', 'ASC'], ['issuedDate', 'DESC']],
      offset: skip,
      limit: parseInt(limit)
    });

    // Get total count
    const totalInvoices = await Invoice.count({ where: query });

    // Calculate aging summary statistics with proper age buckets
    const summaryQuery = {
      userId: { [Op.in]: clientIds },
      [Op.or]: [
        { paymentStatus: { [Op.in]: ['unpaid', 'partially_paid'] } },
        { status: { [Op.in]: ['pending', 'partial', 'overdue'] }, paymentStatus: { [Op.eq]: null } }
      ]
    };

    const summaryInvoices = await Invoice.findAll({
      where: summaryQuery,
      include: [{ 
        model: User, 
        as: 'user', 
        attributes: ['gracePeriod'] 
      }],
      attributes: ['remainingBalance', 'dueStatus', 'status', 'dueDate', 'createdAt']
    });

    // Initialize aging buckets
    const agingBuckets = [
      { range: '0-30 days', count: 0, totalAmount: 0, percentage: 0 },
      { range: '31-60 days', count: 0, totalAmount: 0, percentage: 0 },
      { range: '61-90 days', count: 0, totalAmount: 0, percentage: 0 },
      { range: '90+ days', count: 0, totalAmount: 0, percentage: 0 }
    ];

    // Calculate summary with individual client grace periods
    const today = new Date();
    let totalOutstanding = 0;
    let avgGracePeriod = 0;
    let gracePeriodCount = 0;

    summaryInvoices.forEach(invoice => {
      const amount = parseFloat(invoice.remainingBalance) || 0;
      const dueDate = new Date(invoice.dueDate);
      
      // Use client's individual grace period, fallback to 5 days default
      const clientGracePeriod = invoice.user?.gracePeriod || 5;
      avgGracePeriod += clientGracePeriod;
      gracePeriodCount++;
      
      // Add grace period to due date
      const effectiveDueDate = new Date(dueDate.getTime() + (clientGracePeriod * 24 * 60 * 60 * 1000));
      
      // Calculate days past the effective due date (due date + grace period)
      const daysPastDue = Math.floor((today.getTime() - effectiveDueDate.getTime()) / (1000 * 60 * 60 * 24));
      
      // Only include invoices that are actually overdue (past grace period)
      if (daysPastDue > 0) {
        totalOutstanding += amount;
        
        // Categorize by age bucket
        if (daysPastDue <= 30) {
          agingBuckets[0].count++;
          agingBuckets[0].totalAmount += amount;
        } else if (daysPastDue <= 60) {
          agingBuckets[1].count++;
          agingBuckets[1].totalAmount += amount;
        } else if (daysPastDue <= 90) {
          agingBuckets[2].count++;
          agingBuckets[2].totalAmount += amount;
        } else {
          agingBuckets[3].count++;
          agingBuckets[3].totalAmount += amount;
        }
      }
    });

    // Calculate percentages
    agingBuckets.forEach(bucket => {
      bucket.percentage = totalOutstanding > 0 ? (bucket.totalAmount / totalOutstanding) * 100 : 0;
    });

    // Calculate average grace period
    const averageGracePeriod = gracePeriodCount > 0 ? Math.round(avgGracePeriod / gracePeriodCount) : 5;

    // Legacy summary for backward compatibility
    const agingSummary = {
      totalUnpaidAmount: totalOutstanding,
      totalInvoices: agingBuckets.reduce((sum, bucket) => sum + bucket.count, 0),
      overdueCount: agingBuckets.reduce((sum, bucket) => sum + bucket.count, 0),
      overdueAmount: totalOutstanding,
      dueCount: 0,
      dueAmount: 0,
      // New aging buckets
      agingBuckets: agingBuckets,
      gracePeriodDays: averageGracePeriod,
      message: gracePeriodCount > 1 ? `Average grace period: ${averageGracePeriod} days (varies by client)` : `Grace period: ${averageGracePeriod} days`
    };

    res.json({
      success: true,
      data: invoices,
      summary: agingSummary,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalInvoices / parseInt(limit)),
        totalInvoices,
        hasNext: skip + invoices.length < totalInvoices,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Error fetching aging summary:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

// Get invoice by ID
router.get('/:id', authenticateToken, authorizeRoles(['organization']), async (req, res) => {
  try {
    const { id } = req.params;

    // Find all clients belonging to this organization
    const clients = await User.findAll({
      where: {
        createdBy: req.user.id,
        role: 'client'
      },
      attributes: ['id']
    });

    const clientIds = clients.map(client => client.id);

    // Find invoice and verify it belongs to a client of this organization - FIXED
    const invoice = await Invoice.findOne({
      where: {
        id: id,
        userId: { [Op.in]: clientIds }
      },
      include: [
        { 
          model: User, 
          as: 'user', 
          attributes: ['name', 'email', 'phone', 'address'] 
        },
        {
          model: require('../models/Payment'),
          as: 'payments',
          attributes: [
            'id', 'amount', 'paymentMethod', 'transactionId', 'mpesaReceiptNumber', 
            'phoneNumber', 'status', 'allocatedAmount', 'paidAt', 'createdAt',
            'invoiceAllocations', 'invoiceIds'
          ]
        }
      ]
    });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found or does not belong to your organization\'s clients'
      });
    }

    res.json({
      success: true,
      data: invoice
    });
  } catch (error) {
    console.error('Error fetching invoice:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

// Delete invoice
router.delete('/:id', authenticateToken, authorizeRoles(['organization']), async (req, res) => {
  try {
    const { id } = req.params;

    // Find all clients belonging to this organization
    const clients = await User.findAll({
      where: {
        organizationId: req.user.id,
        role: 'client'
      },
      attributes: ['id']
    });

    const clientIds = clients.map(client => client.id);

    // Find invoice and verify it belongs to a client of this organization - FIXED
    const invoice = await Invoice.findOne({
      where: {
        id: id,
        userId: { [Op.in]: clientIds }
      }
    });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found or does not belong to your organization\'s clients'
      });
    }

    // Delete invoice - FIXED
    await Invoice.destroy({ where: { id: id } });

    res.json({
      success: true,
      message: 'Invoice deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting invoice:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});



// Get client invoices
router.get('/client/:clientId', authenticateToken, authorizeRoles(['organization']), async (req, res) => {
  try {
    const { clientId } = req.params;
    const { page = 1, limit = 10, status, startDate, endDate } = req.query;

    // Verify client belongs to organization - FIXED
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
    const query = { userId: clientId };

    if (status && status !== '') {
      // Due status filters
      if (status === 'overdue') {
        query.dueStatus = 'overdue';
      } else if (status === 'due') {
        query.dueStatus = 'due';
      } else if (status === 'upcoming') {
        query.dueStatus = 'upcoming';
      }
      // Payment status filters
      else if (['fully_paid', 'partially_paid', 'unpaid'].includes(status)) {
        // For payment status, check paymentStatus field
        if (status === 'fully_paid') {
          query[Op.or] = [
            { paymentStatus: 'fully_paid' },
            { status: 'paid', paymentStatus: { [Op.eq]: null } }
          ];
        } else if (status === 'partially_paid') {
          query[Op.or] = [
            { paymentStatus: 'partially_paid' },
            { status: 'partial', paymentStatus: { [Op.eq]: null } }
          ];
        } else if (status === 'unpaid') {
          query[Op.or] = [
            { paymentStatus: 'unpaid' },
            { status: 'pending', paymentStatus: { [Op.eq]: null } }
          ];
        }
      } else {
        // For backward compatibility
        query.status = status;
      }
    }

    if (startDate || endDate) {
      query.issuedDate = {};
      if (startDate) query.issuedDate[Op.gte] = new Date(startDate);
      if (endDate) query.issuedDate[Op.lte] = new Date(endDate);
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get invoices - FIXED to use Sequelize syntax and correct column names
    const invoices = await Invoice.findAll({
      where: query,
      attributes: ['id', 'invoiceNumber', 'accountNumber', 'totalAmount', 'amountPaid', 'remainingBalance', 'status', 'paymentStatus', 'dueStatus', 'dueDate', 'issuedDate', 'createdAt', 'emailSent', 'emailSentAt', 'billingPeriodStart', 'billingPeriodEnd'],
      order: [['issuedDate', 'DESC']],
      offset: skip,
      limit: parseInt(limit)
    });

    // Get total count
    const totalInvoices = await Invoice.count({ where: query });
    
    res.json({
      success: true,
      invoices,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalInvoices / parseInt(limit)),
        totalInvoices,
        hasNext: skip + invoices.length < totalInvoices,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Error fetching client invoices:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

module.exports = router;