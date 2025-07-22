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

    // Find oldest unpaid invoice
    const unpaidInvoice = await Invoice.findOne({
      userId: user._id,
      status: { $in: ['pending', 'partial', 'overdue'] }
    }).sort({ dueDate: 1 });

    if (!unpaidInvoice) {
      return res.status(400).json({
        success: false,
        error: 'No pending invoices found for this account'
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
      invoiceId: unpaidInvoice._id,
      status: 'completed',
      paidAt: new Date()
    });

    await payment.save();

    // Process payment against invoice
    const paymentAmount = parseFloat(amount);
    const invoiceBalance = unpaidInvoice.remainingBalance;

    if (paymentAmount >= invoiceBalance) {
      // Payment covers the invoice completely
      unpaidInvoice.amountPaid += invoiceBalance;
      unpaidInvoice.updateBalance();
      await unpaidInvoice.save();

      // Handle overpayment
      const overpaymentAmount = paymentAmount - invoiceBalance;
      if (overpaymentAmount > 0) {
        const overpayment = new Overpayment({
          userId: user._id,
          accountNumber,
          paymentId: payment._id,
          amount: overpaymentAmount,
          remainingAmount: overpaymentAmount
        });
        await overpayment.save();
      }
    } else {
      // Partial payment
      unpaidInvoice.amountPaid += paymentAmount;
      unpaidInvoice.updateBalance();
      await unpaidInvoice.save();
    }

    res.status(200).json({
      success: true,
      message: 'Payment processed successfully',
      data: {
        payment: payment,
        invoice: unpaidInvoice,
        overpayment: paymentAmount > invoiceBalance ? paymentAmount - invoiceBalance : 0
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

      if (monthsSinceStart >= 0) {
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
          // Check for available overpayments
          const availableOverpayments = await Overpayment.find({
            userId: client._id,
            status: 'available',
            remainingAmount: { $gt: 0 }
          }).sort({ createdAt: 1 });

          let totalOverpayment = availableOverpayments.reduce((sum, op) => sum + op.remainingAmount, 0);
          let invoiceAmount = client.monthlyRate;
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
            dueDate: new Date(billingEnd.getTime() + 7 * 24 * 60 * 60 * 1000)
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
      dueDate: new Date(dueDate)
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
      status: { $in: ['pending', 'partial', 'overdue'] }
    }).sort({ dueDate: 1 });

    // Get payment history
    const payments = await Payment.find({ userId: client._id })
      .populate('invoiceId')
      .sort({ createdAt: -1 })
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
      status: { $in: ['pending', 'partial', 'overdue'] }
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