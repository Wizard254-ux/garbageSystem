const Payment = require('../models/Payment');
const Invoice = require('../models/Invoice');
const Overpayment = require('../models/Overpayment');
const User = require('../models/User');
const { sendInvoiceEmail, sendOverpaymentNotification } = require('../services/mail');

// Process payment (M-Pesa/Paybill)
const processPayment = async (req, res) => {
  try {
    const { 
      accountNumber, 
      amount, 
      paymentMethod, 
      mpesaReceiptNumber, 
      phoneNumber,
      transactionId 
    } = req.body;

    // Find user by account number
    const user = await User.findOne({ accountNumber });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Account number not found'
      });
    }

    // Find all unpaid or partially paid invoices for this user, sorted by due date (oldest first)
    const unpaidInvoices = await Invoice.find({
      userId: user._id,
      $or: [
        { paymentStatus: { $in: ['unpaid', 'partially_paid'] } },
        // For backward compatibility with existing invoices
        { status: { $in: ['pending', 'partial', 'overdue'] }, paymentStatus: { $exists: false } }
      ]
    }).sort({ dueDate: 1 });

    if (unpaidInvoices.length === 0) {
      // Create payment record with no invoice allocation
      const payment = new Payment({
        userId: user._id,
        accountNumber,
        amount: parseFloat(amount),
        paymentMethod,
        transactionId,
        mpesaReceiptNumber,
        phoneNumber,
        status: 'completed',
        allocationStatus: 'unallocated',
        remainingAmount: parseFloat(amount),
        paidAt: new Date()
      });

      await payment.save();

      return res.status(200).json({
        success: true,
        message: 'Payment recorded successfully. No pending invoices found.',
        data: { payment }
      });
    }

    // Create payment record
    const payment = new Payment({
      userId: user._id,
      accountNumber,
      amount: parseFloat(amount),
      paymentMethod,
      transactionId,
      mpesaReceiptNumber,
      phoneNumber,
      status: 'completed',
      allocationStatus: 'unallocated',
      remainingAmount: parseFloat(amount),
      paidAt: new Date()
    });

    await payment.save();

    // Process payment against invoices
    let remainingPaymentAmount = parseFloat(amount);
    let allocatedAmount = 0;
    const updatedInvoices = [];

    // Allocate payment to invoices until payment is fully allocated or no more invoices
    for (const invoice of unpaidInvoices) {
      if (remainingPaymentAmount <= 0) break;

      const invoiceBalance = invoice.remainingBalance;
      const amountToAllocate = Math.min(remainingPaymentAmount, invoiceBalance);

      // Update invoice
      invoice.amountPaid += amountToAllocate;
      invoice.updateBalance(); // This will update status to 'paid', 'partial', or 'overdue'
      await invoice.save();
      updatedInvoices.push(invoice);

      // Update payment allocation
      remainingPaymentAmount -= amountToAllocate;
      allocatedAmount += amountToAllocate;
    }

    // Update payment allocation status
    payment.allocatedAmount = allocatedAmount;
    payment.remainingAmount = remainingPaymentAmount;
    
    if (allocatedAmount === 0) {
      payment.allocationStatus = 'unallocated';
    } else if (remainingPaymentAmount > 0) {
      payment.allocationStatus = 'partially_allocated';
    } else {
      payment.allocationStatus = 'fully_allocated';
    }

    // If first invoice was allocated to, set it as the invoiceId
    if (updatedInvoices.length > 0) {
      payment.invoiceId = updatedInvoices[0]._id;
    }

    await payment.save();

    res.status(200).json({
      success: true,
      message: 'Payment processed successfully',
      data: {
        payment: payment,
        updatedInvoices: updatedInvoices,
        remainingAmount: remainingPaymentAmount
      }
    });

  } catch (error) {
    console.error('Payment processing error:', error);
    res.status(500).json({
      success: false,
      error: 'Payment processing failed',
      details: error.message
    });
  }
};

// Generate monthly invoices (cron job)
const generateMonthlyInvoices = async (req, res) => {
  try {
    const clients = await User.find({ 
      role: 'client', 
      isActive: true,
      serviceStartDate: { $exists: true }
    });

    const invoicesCreated = [];
    const currentDate = new Date();

    for (const client of clients) {
      // Check if client should have an invoice this month
      const serviceStart = new Date(client.serviceStartDate);
      const monthsSinceStart = (currentDate.getFullYear() - serviceStart.getFullYear()) * 12 + 
                              (currentDate.getMonth() - serviceStart.getMonth());

      // Skip if client was just created (less than a month ago)
      if (monthsSinceStart <= 0) {
        continue;
      }

      // Calculate billing period
      const billingStart = new Date(serviceStart);
      billingStart.setMonth(serviceStart.getMonth() + monthsSinceStart);
      
      const billingEnd = new Date(billingStart);
      billingEnd.setMonth(billingStart.getMonth() + 1);
      billingEnd.setDate(billingEnd.getDate() - 1);

      // Check if invoice already exists for this period
      const existingInvoice = await Invoice.findOne({
        userId: client._id,
        'billingPeriod.start': billingStart,
        'billingPeriod.end': billingEnd
      });

      if (!existingInvoice) {
        // Check for available payments with remaining amounts
        const availablePayments = await Payment.find({
          userId: client._id,
          status: 'completed',
          allocationStatus: { $in: ['unallocated', 'partially_allocated'] },
          remainingAmount: { $gt: 0 }
        }).sort({ createdAt: 1 });

        let totalAvailableAmount = availablePayments.reduce((sum, payment) => sum + payment.remainingAmount, 0);
        let invoiceAmount = client.monthlyRate;
        let amountPaid = 0;

        // Apply available payment amounts one by one until invoice is paid
        if (totalAvailableAmount > 0) {
          let remainingInvoiceAmount = invoiceAmount;
          
          for (const payment of availablePayments) {
            if (remainingInvoiceAmount <= 0) break; // Invoice fully paid
            
            const amountToApply = Math.min(payment.remainingAmount, remainingInvoiceAmount);
            
            // Apply payment to invoice
            payment.allocatedAmount += amountToApply;
            payment.remainingAmount -= amountToApply;
            amountPaid += amountToApply;
            remainingInvoiceAmount -= amountToApply;
            
            // Update payment allocation status
            if (payment.remainingAmount <= 0) {
              payment.allocationStatus = 'fully_allocated';
            } else {
              payment.allocationStatus = 'partially_allocated';
            }
            
            await payment.save();
          }
        }

        // Calculate due date based on grace period
        const gracePeriod = client.gracePeriod || 5; // Default to 5 days if not set
        const dueDate = new Date(billingEnd);
        dueDate.setDate(dueDate.getDate() + gracePeriod);

        // Create new invoice
        const invoice = new Invoice({
          userId: client._id,
          accountNumber: client.accountNumber,
          billingPeriod: {
            start: billingStart,
            end: billingEnd
          },
          totalAmount: invoiceAmount,
          amountPaid: amountPaid,
          remainingBalance: invoiceAmount - amountPaid,
          dueDate: dueDate,
          paymentStatus: amountPaid >= invoiceAmount ? 'fully_paid' : amountPaid > 0 ? 'partially_paid' : 'unpaid',
          dueStatus: 'due' // Will be updated to 'overdue' by the updateBalance method if past due date
        });

        await invoice.save();
        invoicesCreated.push(invoice);

        // Send invoice email
        try {
          await sendInvoiceEmail(client, invoice);
          invoice.emailSent = true;
          invoice.emailSentAt = new Date();
          await invoice.save();
          
          // If overpayment was applied, send notification
          if (amountPaid > 0) {
            await sendOverpaymentNotification(client, invoice, amountPaid);
          }
        } catch (emailError) {
          console.error(`Failed to send invoice email to ${client.email}:`, emailError);
        }
      } else if (existingInvoice.paymentStatus !== 'fully_paid') {
        // Check if invoice is now overdue based on due date
        if (new Date() > existingInvoice.dueDate && existingInvoice.dueStatus !== 'overdue') {
          existingInvoice.dueStatus = 'overdue';
          // For backward compatibility
          if (existingInvoice.paymentStatus === 'unpaid') {
            existingInvoice.status = 'overdue';
          }
          await existingInvoice.save();
          
          // Send overdue notification
          try {
            await sendInvoiceEmail(client, existingInvoice, true); // true indicates overdue notification
            existingInvoice.emailSent = true;
            existingInvoice.emailSentAt = new Date();
            await existingInvoice.save();
          } catch (emailError) {
            console.error(`Failed to send overdue notification to ${client.email}:`, emailError);
          }
        }
      }
    }

    res.status(200).json({
      success: true,
      message: `Generated ${invoicesCreated.length} invoices`,
      invoices: invoicesCreated
    });

  } catch (error) {
    console.error('Invoice generation error:', error);
    res.status(500).json({
      success: false,
      error: 'Invoice generation failed',
      details: error.message
    });
  }
};

// Get payment history
const getPaymentHistory = async (req, res) => {
  try {
    const { accountNumber } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const user = await User.findOne({ accountNumber });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      });
    }

    const payments = await Payment.find({ userId: user._id })
      .populate('invoiceId')
      .sort({ createdAt: -1 })
      .select('_id accountNumber amount paymentMethod mpesaReceiptNumber phoneNumber status allocationStatus allocatedAmount remainingAmount createdAt invoiceId')
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const totalPayments = await Payment.countDocuments({ userId: user._id });

    res.status(200).json({
      success: true,
      data: {
        payments,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalPayments / limit),
          totalPayments,
          hasNext: page * limit < totalPayments,
          hasPrev: page > 1
        }
      }
    });

  } catch (error) {
    console.error('Payment history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payment history'
    });
  }
};
// Get payment history
const getFullPaymentHistory = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;


    const payments = await Payment.find()
      .populate('invoiceId')
      .sort({ createdAt: -1 })
      .select('_id accountNumber amount paymentMethod mpesaReceiptNumber phoneNumber status allocationStatus allocatedAmount remainingAmount createdAt invoiceId')
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const totalPayments = await Payment.countDocuments({ userId: User._id });

    res.status(200).json({
      success: true,
      data: {
        payments,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalPayments / limit),
          totalPayments,
          hasNext: page * limit < totalPayments,
          hasPrev: page > 1
        }
      }
    });

  } catch (error) {
    console.error('Payment history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payment history'
    });
  }
};

// Get account statement
const getAccountStatement = async (req, res) => {
  try {
    const { accountNumber } = req.params;
    const { startDate, endDate } = req.query;

    const user = await User.findOne({ accountNumber });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      });
    }

    let dateFilter = { userId: user._id };
    if (startDate && endDate) {
      dateFilter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const [invoices, payments, overpayments] = await Promise.all([
      Invoice.find(dateFilter).sort({ createdAt: -1 }),
      Payment.find(dateFilter).populate('invoiceId').sort({ createdAt: -1 }),
      Overpayment.find(dateFilter).sort({ createdAt: -1 })
    ]);

    const summary = {
      totalInvoiced: invoices.reduce((sum, inv) => sum + inv.totalAmount, 0),
      totalPaid: payments.reduce((sum, pay) => sum + pay.amount, 0),
      totalOverpayment: overpayments.reduce((sum, over) => sum + over.remainingAmount, 0),
      outstandingBalance: invoices.reduce((sum, inv) => sum + inv.remainingBalance, 0)
    };

    res.status(200).json({
      success: true,
      data: {
        user: {
          name: user.name,
          accountNumber: user.accountNumber,
          clientType: user.clientType
        },
        summary,
        invoices,
        payments,
        overpayments
      }
    });

  } catch (error) {
    console.error('Account statement error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate account statement'
    });
  }
};

// Create manual invoice for testing
const createManualInvoice = async (req, res) => {
  try {
    const {
      userId,
      totalAmount,
      billingPeriodStart,
      billingPeriodEnd,
      dueDate
    } = req.body;

    // Validate required fields
    if (!userId || !totalAmount || !billingPeriodStart || !billingPeriodEnd || !dueDate) {
      return res.status(400).json({
        success: false,
        error: 'userId, totalAmount, billingPeriodStart, billingPeriodEnd, and dueDate are required'
      });
    }

    // Find user
    const user = await User.findById(userId);
    if (!user || user.role !== 'client') {
      return res.status(404).json({
        success: false,
        error: 'Client not found'
      });
    }

    // Check for available overpayments
    const availableOverpayments = await Overpayment.find({
      userId: user._id,
      status: 'available',
      remainingAmount: { $gt: 0 }
    }).sort({ createdAt: 1 });

    let totalOverpayment = availableOverpayments.reduce((sum, op) => sum + op.remainingAmount, 0);
    let invoiceAmount = parseFloat(totalAmount);
    let amountPaid = 0;

    // Apply overpayments one by one until invoice is paid
    if (totalOverpayment > 0) {
      let remainingInvoiceAmount = invoiceAmount;
      
      for (const overpayment of availableOverpayments) {
        if (remainingInvoiceAmount <= 0) break; // Invoice fully paid
        
        const amountToApply = Math.min(overpayment.remainingAmount, remainingInvoiceAmount);
        
        // Apply overpayment to invoice
        overpayment.appliedAmount += amountToApply;
        overpayment.remainingAmount -= amountToApply;
        amountPaid += amountToApply;
        remainingInvoiceAmount -= amountToApply;
        
        // Update overpayment status if fully used
        if (overpayment.remainingAmount <= 0) {
          overpayment.status = 'applied';
        }
        
        await overpayment.save();
      }
    }

    // Create invoice
    const invoice = new Invoice({
      userId: user._id,
      accountNumber: user.accountNumber,
      billingPeriod: {
        start: new Date(billingPeriodStart),
        end: new Date(billingPeriodEnd)
      },
      totalAmount: invoiceAmount,
      amountPaid: amountPaid,
      remainingBalance: invoiceAmount - amountPaid,
      dueDate: new Date(dueDate),
      paymentStatus: amountPaid >= invoiceAmount ? 'fully_paid' : amountPaid > 0 ? 'partially_paid' : 'unpaid',
      dueStatus: new Date() > new Date(dueDate) ? 'overdue' : 'due'
    });

    await invoice.save();

    // Send emails
    try {
      await sendInvoiceEmail(user, invoice);
      invoice.emailSent = true;
      invoice.emailSentAt = new Date();
      await invoice.save();
      
      if (amountPaid > 0) {
        await sendOverpaymentNotification(user, invoice, amountPaid);
      }
    } catch (emailError) {
      console.error(`Failed to send emails:`, emailError);
    }

    res.status(201).json({
      success: true,
      message: 'Invoice created successfully',
      data: {
        invoice,
        overpaymentApplied: amountPaid,
        user: {
          name: user.name,
          accountNumber: user.accountNumber,
          email: user.email
        }
      }
    });

  } catch (error) {
    console.error('Manual invoice creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create invoice',
      details: error.message
    });
  }
};

// Get client payment info (Organization only)
const getClientPaymentInfo = async (req, res) => {
  try {
    const { clientId } = req.params;

    // Find client
    const client = await User.findOne({
      _id: clientId,
      role: 'client',
      organizationId: req.user._id
    });

    if (!client) {
      return res.status(404).json({
        success: false,
        error: 'Client not found or not in your organization'
      });
    }

    // Get unpaid invoices
    const unpaidInvoices = await Invoice.find({
      userId: client._id,
      $or: [
        { paymentStatus: { $in: ['unpaid', 'partially_paid'] } },
        // For backward compatibility with existing invoices
        { status: { $in: ['pending', 'partial', 'overdue'] }, paymentStatus: { $exists: false } }
      ]
    }).sort({ dueDate: 1 });

    // Get payment history
    const payments = await Payment.find({ userId: client._id })
      .populate('invoiceId')
      .sort({ createdAt: -1 })
      .select('_id accountNumber amount paymentMethod mpesaReceiptNumber phoneNumber status allocationStatus allocatedAmount remainingAmount createdAt')
      .limit(10);

    // Get overpayments
    const overpayments = await Overpayment.find({
      userId: client._id,
      status: 'available',
      remainingAmount: { $gt: 0 }
    });

    const totalUnpaidAmount = unpaidInvoices.reduce((sum, inv) => sum + inv.remainingBalance, 0);
    const totalOverpayment = overpayments.reduce((sum, op) => sum + op.remainingAmount, 0);

    res.status(200).json({
      success: true,
      data: {
        client: {
          id: client._id,
          name: client.name,
          email: client.email,
          accountNumber: client.accountNumber,
          clientType: client.clientType,
          monthlyRate: client.monthlyRate
        },
        unpaidInvoices,
        recentPayments: payments,
        overpayments,
        summary: {
          totalUnpaidAmount,
          totalOverpayment,
          netBalance: totalUnpaidAmount - totalOverpayment
        }
      }
    });

  } catch (error) {
    console.error('Client payment info error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get client payment info'
    });
  }
};

// Get organization stats
const getOrganizationStats = async (req, res) => {
  try {
    // Get all clients in organization
    const clients = await User.find({
      role: 'client',
      organizationId: req.user._id,
      isActive: true
    });

    const clientIds = clients.map(c => c._id);

    // Get unpaid invoices
    const unpaidInvoices = await Invoice.find({
      userId: { $in: clientIds },
      $or: [
        { paymentStatus: { $in: ['unpaid', 'partially_paid'] } },
        // For backward compatibility with existing invoices
        { status: { $in: ['pending', 'partial', 'overdue'] }, paymentStatus: { $exists: false } }
      ]
    }).populate('userId', 'name accountNumber');

    // Get total amounts
    const totalUnpaidAmount = unpaidInvoices.reduce((sum, inv) => sum + inv.remainingBalance, 0);
    const overdueInvoices = unpaidInvoices.filter(inv => new Date() > inv.dueDate);
    const totalOverdueAmount = overdueInvoices.reduce((sum, inv) => sum + inv.remainingBalance, 0);

    // Group by client
    const clientsWithUnpaidInvoices = unpaidInvoices.reduce((acc, invoice) => {
      const clientId = invoice.userId._id.toString();
      if (!acc[clientId]) {
        acc[clientId] = {
          client: invoice.userId,
          invoices: [],
          totalAmount: 0
        };
      }
      acc[clientId].invoices.push(invoice);
      acc[clientId].totalAmount += invoice.remainingBalance;
      return acc;
    }, {});

    res.status(200).json({
      success: true,
      data: {
        summary: {
          totalClients: clients.length,
          clientsWithUnpaidInvoices: Object.keys(clientsWithUnpaidInvoices).length,
          totalUnpaidInvoices: unpaidInvoices.length,
          totalUnpaidAmount,
          totalOverdueInvoices: overdueInvoices.length,
          totalOverdueAmount
        },
        clientsWithUnpaidInvoices: Object.values(clientsWithUnpaidInvoices)
      }
    });

  } catch (error) {
    console.error('Organization stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get organization stats'
    });
  }
};

module.exports = {
  processPayment,
  generateMonthlyInvoices,
  getPaymentHistory,
  getAccountStatement,
  createManualInvoice,
  getClientPaymentInfo,
  getOrganizationStats,
  getFullPaymentHistory
};