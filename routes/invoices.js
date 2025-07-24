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
    if (status && status !=='') {
      query.status = status;
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

module.exports = router;