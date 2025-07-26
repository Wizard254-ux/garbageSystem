const express = require('express');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const Invoice = require('../models/Invoice');
const User = require('../models/User');

const router = express.Router();

// Get all invoices for organization's clients
router.get('/', authenticateToken, authorizeRoles(['organization']), async (req, res) => {
  try {
    const { page = 1, limit = 10, status, startDate, endDate } = req.query;
    
    // Find all clients belonging to this organization
    const clients = await User.find({ 
      createdBy: req.user._id,
      role: 'client'
    }).select('_id');

    console.log('clien tfor this org ',clients)
    
    const clientIds = clients.map(client => client._id);
    
    // Build query to find invoices for these clients
    const query = {
      userId: { $in: clientIds }
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
          query.$or = [
            { paymentStatus: 'fully_paid' },
            { status: 'paid', paymentStatus: { $exists: false } }
          ];
        } else if (status === 'partially_paid') {
          query.$or = [
            { paymentStatus: 'partially_paid' },
            { status: 'partial', paymentStatus: { $exists: false } }
          ];
        } else if (status === 'unpaid') {
          query.$or = [
            { paymentStatus: 'unpaid' },
            { status: 'pending', paymentStatus: { $exists: false } }
          ];
        }
      } else {
        // For backward compatibility
        query.status = status;
      }
    }
    
    if (startDate || endDate) {
      query.issuedDate = {};
      if (startDate) query.issuedDate.$gte = new Date(startDate);
      if (endDate) query.issuedDate.$lte = new Date(endDate);
    }

    console.log('query ',query)
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get invoices with pagination
    const invoices = await Invoice.find(query)
      .sort({ issuedDate: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('userId', 'name email phone address');
    
    // Get total count
    const totalInvoices = await Invoice.countDocuments(query);
    
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
    const { userId, totalAmount, dueDate, billingPeriod } = req.body;
    
    // Verify client belongs to organization
    const client = await User.findOne({
      _id: userId,
      role: 'client',
      organizationId: req.user._id
    });
    
    if (!client) {
      return res.status(404).json({
        success: false,
        error: 'Client not found or does not belong to your organization'
      });
    }
    
    // Create invoice
    const invoice = new Invoice({
      userId,
      accountNumber: client.accountNumber || `ACC-${userId.toString().slice(-6)}`,
      totalAmount,
      remainingBalance: totalAmount, // Will be recalculated in pre-save hook
      dueDate,
      billingPeriod
    });
    
    await invoice.save();
    
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

// Get aging summary - unpaid and partially paid invoices
router.get('/aging-summary', authenticateToken, authorizeRoles(['organization']), async (req, res) => {
  try {
    const { page = 1, limit = 10, paymentStatus, dueStatus, startDate, endDate, accountNumber } = req.query;
    
    // Find all clients belonging to this organization
    const clients = await User.find({ 
      createdBy: req.user._id,
      role: 'client'
    }).select('_id');
    
    const clientIds = clients.map(client => client._id);
    
    // Build query for unpaid and partially paid invoices only
    const query = {
      userId: { $in: clientIds },
      $or: [
        { paymentStatus: { $in: ['unpaid', 'partially_paid'] } },
        { status: { $in: ['pending', 'partial', 'overdue'] }, paymentStatus: { $exists: false } }
      ]
    };
    
    // Add filters
    if (paymentStatus && paymentStatus !== '') {
      if (paymentStatus === 'unpaid') {
        query.$or = [
          { paymentStatus: 'unpaid' },
          { status: 'pending', paymentStatus: { $exists: false } }
        ];
      } else if (paymentStatus === 'partially_paid') {
        query.$or = [
          { paymentStatus: 'partially_paid' },
          { status: 'partial', paymentStatus: { $exists: false } }
        ];
      }
    }
    
    if (dueStatus && dueStatus !== '') {
      if (dueStatus === 'overdue') {
        query.$and = query.$and || [];
        query.$and.push({
          $or: [
            { dueStatus: 'overdue' },
            { status: 'overdue', dueStatus: { $exists: false } }
          ]
        });
      } else if (dueStatus === 'due') {
        query.$and = query.$and || [];
        query.$and.push({ dueStatus: 'due' });
      }
    }
    
    if (accountNumber && accountNumber !== '') {
      query.accountNumber = { $regex: accountNumber, $options: 'i' };
    }
    
    if (startDate || endDate) {
      query.dueDate = {};
      if (startDate) query.dueDate.$gte = new Date(startDate);
      if (endDate) query.dueDate.$lte = new Date(endDate);
    }
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get invoices with client details
    const invoices = await Invoice.find(query)
      .sort({ dueDate: 1, issuedDate: -1 }) // Sort by due date first, then by issued date
      .skip(skip)
      .limit(parseInt(limit))
      .populate('userId', 'name email phone address accountNumber');
    
    // Get total count
    const totalInvoices = await Invoice.countDocuments(query);
    
    // Calculate aging summary statistics
    const agingSummary = await Invoice.aggregate([
      { $match: { userId: { $in: clientIds } } },
      {
        $match: {
          $or: [
            { paymentStatus: { $in: ['unpaid', 'partially_paid'] } },
            { status: { $in: ['pending', 'partial', 'overdue'] }, paymentStatus: { $exists: false } }
          ]
        }
      },
      {
        $group: {
          _id: null,
          totalUnpaidAmount: { $sum: '$remainingBalance' },
          totalInvoices: { $sum: 1 },
          overdueCount: {
            $sum: {
              $cond: [
                {
                  $or: [
                    { $eq: ['$dueStatus', 'overdue'] },
                    { $eq: ['$status', 'overdue'] }
                  ]
                },
                1,
                0
              ]
            }
          },
          overdueAmount: {
            $sum: {
              $cond: [
                {
                  $or: [
                    { $eq: ['$dueStatus', 'overdue'] },
                    { $eq: ['$status', 'overdue'] }
                  ]
                },
                '$remainingBalance',
                0
              ]
            }
          },
          dueCount: {
            $sum: {
              $cond: [
                { $eq: ['$dueStatus', 'due'] },
                1,
                0
              ]
            }
          },
          dueAmount: {
            $sum: {
              $cond: [
                { $eq: ['$dueStatus', 'due'] },
                '$remainingBalance',
                0
              ]
            }
          }
        }
      }
    ]);
    
    res.json({
      success: true,
      data: invoices,
      summary: agingSummary[0] || {
        totalUnpaidAmount: 0,
        totalInvoices: 0,
        overdueCount: 0,
        overdueAmount: 0,
        dueCount: 0,
        dueAmount: 0
      },
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
    const clients = await User.find({ 
      createdBy: req.user._id,
      role: 'client'
    }).select('_id');
    
    const clientIds = clients.map(client => client._id);
    
    // Find invoice and verify it belongs to a client of this organization
    const invoice = await Invoice.findOne({
      _id: id,
      userId: { $in: clientIds }
    }).populate('userId', 'name email phone address');
    
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
    const clients = await User.find({ 
      organizationId: req.user._id,
      role: 'client'
    }).select('_id');
    
    const clientIds = clients.map(client => client._id);
    
    // Find invoice and verify it belongs to a client of this organization
    const invoice = await Invoice.findOne({
      _id: id,
      userId: { $in: clientIds }
    });
    
    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found or does not belong to your organization\'s clients'
      });
    }
    
    // Delete invoice
    await Invoice.findByIdAndDelete(id);
    
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
          query.$or = [
            { paymentStatus: 'fully_paid' },
            { status: 'paid', paymentStatus: { $exists: false } }
          ];
        } else if (status === 'partially_paid') {
          query.$or = [
            { paymentStatus: 'partially_paid' },
            { status: 'partial', paymentStatus: { $exists: false } }
          ];
        } else if (status === 'unpaid') {
          query.$or = [
            { paymentStatus: 'unpaid' },
            { status: 'pending', paymentStatus: { $exists: false } }
          ];
        }
      } else {
        // For backward compatibility
        query.status = status;
      }
    }
    
    if (startDate || endDate) {
      query.issuedDate = {};
      if (startDate) query.issuedDate.$gte = new Date(startDate);
      if (endDate) query.issuedDate.$lte = new Date(endDate);
    }
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get invoices
    const invoices = await Invoice.find(query)
      .sort({ issuedDate: -1 })
      .select('_id invoiceNumber accountNumber totalAmount amountPaid remainingBalance status paymentStatus dueStatus dueDate issuedDate createdAt emailSent emailSentAt billingPeriod')
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count
    const totalInvoices = await Invoice.countDocuments(query);
    
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