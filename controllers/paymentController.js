const { Op } = require('sequelize');
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

    // Find user by account number - FIXED: removed double "where"
    const user = await User.findOne({
      where: { accountNumber }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Account number not found'
      });
    }

    // Find all unpaid or partially paid invoices for this user, sorted by due date (oldest first)
    const unpaidInvoices = await Invoice.findAll({
      where: {
        userId: user.id,
        [Op.or]: [
          { paymentStatus: { [Op.in]: ['unpaid', 'partially_paid'] } },
          // For backward compatibility with existing invoices
          { status: { [Op.in]: ['pending', 'partial', 'overdue'] }, paymentStatus: { [Op.eq]: null } }
        ]
      },
      order: [['dueDate', 'ASC']]
    });

    if (unpaidInvoices.length === 0) {
      // Create payment record with no invoice allocation
      const payment = await Payment.create({
        userId: user.id,
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

      return res.status(200).json({
        success: true,
        message: 'Payment recorded successfully. No pending invoices found.',
        data: { payment }
      });
    }

    // Create payment record
    const payment = await Payment.create({
      userId: user.id,
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

    // Process payment against invoices
    let remainingPaymentAmount = parseFloat(amount);
    let allocatedAmount = 0;
    const updatedInvoices = [];
    const invoiceAllocations = [];
    const invoiceIds = [];

    // Allocate payment to invoices until payment is fully allocated or no more invoices
    for (const invoice of unpaidInvoices) {
      if (remainingPaymentAmount <= 0) break;

      const invoiceBalance = invoice.remainingBalance;
      const amountToAllocate = Math.min(remainingPaymentAmount, invoiceBalance);

      // Update invoice - FIXED: use Sequelize update method
      const newAmountPaid = (invoice.amountPaid || 0) + amountToAllocate;
      const newRemainingBalance = invoice.totalAmount - newAmountPaid;

      // Determine payment status
      let paymentStatus = 'unpaid';
      if (newAmountPaid >= invoice.totalAmount) {
        paymentStatus = 'fully_paid';
      } else if (newAmountPaid > 0) {
        paymentStatus = 'partially_paid';
      }

      await invoice.update({
        amountPaid: newAmountPaid,
        remainingBalance: newRemainingBalance,
        paymentStatus: paymentStatus
      });

      updatedInvoices.push(invoice);

      // Track invoice allocations
      invoiceAllocations.push({
        invoiceId: invoice.id,
        amount: amountToAllocate
      });
      invoiceIds.push(invoice.id);

      // Update payment allocation
      remainingPaymentAmount -= amountToAllocate;
      allocatedAmount += amountToAllocate;
    }

    // Update payment allocation status - FIXED: use Sequelize update
    const paymentUpdateData = {
      allocatedAmount: allocatedAmount,
      remainingAmount: remainingPaymentAmount,
      invoiceAllocations: invoiceAllocations,
      invoiceIds: invoiceIds
    };

    if (allocatedAmount === 0) {
      paymentUpdateData.allocationStatus = 'unallocated';
    } else if (remainingPaymentAmount > 0) {
      paymentUpdateData.allocationStatus = 'partially_allocated'; // Payment has remaining amount, so partially allocated
    } else {
      paymentUpdateData.allocationStatus = 'fully_allocated'; // All payment amount was allocated to invoices
    }

    // Keep backward compatibility - set first invoice as invoiceId
    if (invoiceIds.length > 0) {
      paymentUpdateData.invoiceId = invoiceIds[0];
    }

    await payment.update(paymentUpdateData);

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
    const clients = await User.findAll({
      where: {
        role: 'client',
        isActive: true,
        serviceStartDate: { [Op.ne]: null }
      }
    });

    const invoicesCreated = [];
    const currentDate = new Date();

    for (const client of clients) {
      // Check if client should have an invoice this month
      const serviceStart = new Date(client.serviceStartDate);
      const monthsSinceStart = (currentDate.getFullYear() - serviceStart.getFullYear()) * 12 +
                              (currentDate.getMonth() - serviceStart.getMonth());

      // Calculate billing period
      const billingStart = new Date(serviceStart);
      billingStart.setMonth(serviceStart.getMonth() + monthsSinceStart);

      const billingEnd = new Date(billingStart);
      billingEnd.setMonth(billingStart.getMonth() + 1);
      billingEnd.setDate(billingEnd.getDate() - 1);

      // Check if invoice already exists for this period - FIXED: removed triple "where"
      const existingInvoice = await Invoice.findOne({
        where: {
          userId: client.id,
          billingPeriodStart: billingStart,
          billingPeriodEnd: billingEnd
        }
      });

      if (!existingInvoice) {
        // Check for available payments with remaining amounts AND overpayments
        const availablePayments = await Payment.findAll({
          where: {
            userId: client.id,
            status: 'completed',
            allocationStatus: { [Op.in]: ['unallocated', 'partially_allocated'] },
            remainingAmount: { [Op.gt]: 0 }
          },
          order: [['createdAt', 'ASC']]
        });

        const availableOverpayments = await Overpayment.findAll({
          where: {
            userId: client.id,
            remainingAmount: { [Op.gt]: 0 }
          },
          order: [['createdAt', 'ASC']]
        });

        let invoiceAmount = client.monthlyRate;
        let amountPaid = 0;
        let remainingInvoiceAmount = invoiceAmount;

        // Create the invoice first to get the ID for payment linking
        const invoice = await Invoice.create({
          userId: client.id,
          accountNumber: client.accountNumber,
          billingPeriodStart: billingStart,
          billingPeriodEnd: billingEnd,
          totalAmount: invoiceAmount,
          amountPaid: 0, // Start with 0, will be updated
          remainingBalance: invoiceAmount,
          dueDate: new Date(billingEnd.getTime() + (client.gracePeriod || 5) * 24 * 60 * 60 * 1000),
          paymentStatus: 'unpaid',
          dueStatus: 'due'
        });

        // First, apply available payments
        for (const payment of availablePayments) {
          if (remainingInvoiceAmount <= 0) break; // Invoice fully paid

          const amountToApply = Math.min(payment.remainingAmount, remainingInvoiceAmount);

          // Apply payment to invoice - FIXED: use Sequelize update
          const currentAllocated = payment.allocatedAmount || 0;
          const currentRemaining = payment.remainingAmount || 0;
          const currentAllocations = payment.invoiceAllocations || [];
          const currentIds = payment.invoiceIds || [];

          await payment.update({
            allocatedAmount: currentAllocated + amountToApply,
            remainingAmount: currentRemaining - amountToApply,
            invoiceAllocations: [
              ...currentAllocations,
              { invoiceId: invoice.id, amount: amountToApply }
            ],
            invoiceIds: [...currentIds, invoice.id],
            allocationStatus: (currentRemaining - amountToApply) <= 0 ? 'fully_allocated' : 'partially_allocated'
          });

          amountPaid += amountToApply;
          remainingInvoiceAmount -= amountToApply;
        }

        // Then, apply available overpayments if invoice is still not fully paid
        for (const overpayment of availableOverpayments) {
          if (remainingInvoiceAmount <= 0) break; // Invoice fully paid

          const amountToApply = Math.min(overpayment.remainingAmount, remainingInvoiceAmount);

          // Update overpayment - FIXED: use Sequelize update instead of model method
          await overpayment.update({
            remainingAmount: overpayment.remainingAmount - amountToApply,
            appliedAmount: (overpayment.appliedAmount || 0) + amountToApply,
            appliedInvoices: [
              ...(overpayment.appliedInvoices || []),
              { invoiceId: invoice.id, amount: amountToApply }
            ]
          });

          amountPaid += amountToApply;
          remainingInvoiceAmount -= amountToApply;
        }

        // Update the invoice with final payment amounts
        await invoice.update({
          amountPaid: amountPaid,
          remainingBalance: remainingInvoiceAmount,
          paymentStatus: amountPaid >= invoiceAmount ? 'fully_paid' : amountPaid > 0 ? 'partially_paid' : 'unpaid',
          dueStatus: amountPaid >= invoiceAmount ? 'paid' : 'due'
        });

        invoicesCreated.push(invoice);

        // Send invoice email
        try {
          await sendInvoiceEmail(client, invoice);
          await invoice.update({
            emailSent: true,
            emailSentAt: new Date()
          });

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
          await existingInvoice.update({
            dueStatus: 'overdue',
            // For backward compatibility
            status: existingInvoice.paymentStatus === 'unpaid' ? 'overdue' : existingInvoice.status
          });

          // Send overdue notification
          try {
            await sendInvoiceEmail(client, existingInvoice, true); // true indicates overdue notification
            await existingInvoice.update({
              emailSent: true,
              emailSentAt: new Date()
            });
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

    // FIXED: removed double "where"
    const user = await User.findOne({
      where: { accountNumber }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      });
    }

    const payments = await Payment.findAll({
      where: { userId: user.id },
      include: [{ model: Invoice, as: 'invoice', attributes: ['invoiceNumber'] }],
      attributes: ['id', 'accountNumber', 'amount', 'paymentMethod', 'mpesaReceiptNumber', 'phoneNumber', 'status', 'allocationStatus', 'allocatedAmount', 'remainingAmount', 'createdAt', 'invoiceId'],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });

    const totalPayments = await Payment.count({ where: { userId: user.id } });

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

// Get full payment history
const getFullPaymentHistory = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const payments = await Payment.findAll({
      include: [{ model: Invoice, as: 'invoice', attributes: ['invoiceNumber'] }],
      attributes: ['id', 'accountNumber', 'amount', 'paymentMethod', 'mpesaReceiptNumber', 'phoneNumber', 'status', 'allocationStatus', 'allocatedAmount', 'remainingAmount', 'createdAt', 'invoiceId'],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });

    const totalPayments = await Payment.count();

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

    // FIXED: removed double "where"
    const user = await User.findOne({
      where: { accountNumber }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      });
    }

    let dateFilter = { userId: user.id };
    if (startDate && endDate) {
      dateFilter.createdAt = {
        [Op.gte]: new Date(startDate),
        [Op.lte]: new Date(endDate)
      };
    }

    const [invoices, payments, overpayments] = await Promise.all([
      Invoice.findAll({ where: dateFilter, order: [['createdAt', 'DESC']] }),
      Payment.findAll({ where: dateFilter, include: [{ model: Invoice, as: 'invoice' }], order: [['createdAt', 'DESC']] }),
      Overpayment.findAll({ where: dateFilter, order: [['createdAt', 'DESC']] })
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
    const user = await User.findByPk(userId);
    if (!user || user.role !== 'client') {
      return res.status(404).json({
        success: false,
        error: 'Client not found'
      });
    }

    // Check for available payments with remaining amounts AND overpayments
    const availablePayments = await Payment.findAll({
      where: {
        userId: user.id,
        status: 'completed',
        allocationStatus: { [Op.in]: ['unallocated', 'partially_allocated'] },
        remainingAmount: { [Op.gt]: 0 }
      },
      order: [['createdAt', 'ASC']]
    });

    const availableOverpayments = await Overpayment.findAll({
      where: {
        userId: user.id,
        remainingAmount: { [Op.gt]: 0 }
      },
      order: [['createdAt', 'ASC']]
    });

    let invoiceAmount = parseFloat(totalAmount);
    let amountPaid = 0;
    let remainingInvoiceAmount = invoiceAmount;

    // Create invoice first to get the ID for payment linking
    const invoice = await Invoice.create({
      userId: user.id,
      accountNumber: user.accountNumber,
      billingPeriodStart: new Date(billingPeriodStart),
      billingPeriodEnd: new Date(billingPeriodEnd),
      totalAmount: invoiceAmount,
      amountPaid: 0, // Start with 0, will be updated
      remainingBalance: invoiceAmount,
      dueDate: new Date(dueDate),
      paymentStatus: 'unpaid',
      dueStatus: new Date() > new Date(dueDate) ? 'overdue' : 'due'
    });

    // First, apply available payments
    for (const payment of availablePayments) {
      if (remainingInvoiceAmount <= 0) break; // Invoice fully paid

      const amountToApply = Math.min(payment.remainingAmount, remainingInvoiceAmount);

      // Apply payment to invoice - FIXED: use Sequelize update
      const currentAllocated = payment.allocatedAmount || 0;
      const currentRemaining = payment.remainingAmount || 0;
      const currentAllocations = payment.invoiceAllocations || [];
      const currentIds = payment.invoiceIds || [];

      await payment.update({
        allocatedAmount: currentAllocated + amountToApply,
        remainingAmount: currentRemaining - amountToApply,
        invoiceAllocations: [
          ...currentAllocations,
          { invoiceId: invoice.id, amount: amountToApply }
        ],
        invoiceIds: [...currentIds, invoice.id],
        allocationStatus: (currentRemaining - amountToApply) <= 0 ? 'fully_allocated' : 'partially_allocated'
      });

      amountPaid += amountToApply;
      remainingInvoiceAmount -= amountToApply;
    }

    // Then, apply available overpayments if invoice is still not fully paid
    for (const overpayment of availableOverpayments) {
      if (remainingInvoiceAmount <= 0) break; // Invoice fully paid

      const amountToApply = Math.min(overpayment.remainingAmount, remainingInvoiceAmount);

      // Update overpayment - FIXED: use Sequelize update instead of model method
      await overpayment.update({
        remainingAmount: overpayment.remainingAmount - amountToApply,
        appliedAmount: (overpayment.appliedAmount || 0) + amountToApply,
        appliedInvoices: [
          ...(overpayment.appliedInvoices || []),
          { invoiceId: invoice.id, amount: amountToApply }
        ]
      });

      amountPaid += amountToApply;
      remainingInvoiceAmount -= amountToApply;
    }

    // Update the invoice with final payment amounts
    await invoice.update({
      amountPaid: amountPaid,
      remainingBalance: remainingInvoiceAmount,
      paymentStatus: amountPaid >= invoiceAmount ? 'fully_paid' : amountPaid > 0 ? 'partially_paid' : 'unpaid',
      dueStatus: amountPaid >= invoiceAmount ? 'paid' : (new Date() > new Date(dueDate) ? 'overdue' : 'due')
    });

    // Send emails
    try {
      await sendInvoiceEmail(user, invoice);
      await invoice.update({
        emailSent: true,
        emailSentAt: new Date()
      });

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

    // Find client - FIXED: removed triple "where"
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
        error: 'Client not found or not in your organization'
      });
    }

    // Get unpaid invoices
    const unpaidInvoices = await Invoice.findAll({
      where: {
        userId: client.id,
        [Op.or]: [
          { paymentStatus: { [Op.in]: ['unpaid', 'partially_paid'] } },
          // For backward compatibility with existing invoices
          { status: { [Op.in]: ['pending', 'partial', 'overdue'] }, paymentStatus: { [Op.eq]: null } }
        ]
      },
      order: [['dueDate', 'ASC']]
    });

    // Get payment history
    const payments = await Payment.findAll({
      where: { userId: client.id },
      include: [{ model: Invoice, as: 'invoice', attributes: ['invoiceNumber'] }],
      attributes: ['id', 'accountNumber', 'amount', 'paymentMethod', 'mpesaReceiptNumber', 'phoneNumber', 'status', 'allocationStatus', 'allocatedAmount', 'remainingAmount', 'createdAt', 'invoiceId'],
      order: [['createdAt', 'DESC']],
      limit: 10
    });

    // Get overpayments
    const overpayments = await Overpayment.findAll({
      where: {
        userId: client.id,
        status: 'available',
        remainingAmount: { [Op.gt]: 0 }
      }
    });

    const totalUnpaidAmount = unpaidInvoices.reduce((sum, inv) => sum + inv.remainingBalance, 0);
    const totalOverpayment = overpayments.reduce((sum, op) => sum + op.remainingAmount, 0);

    res.status(200).json({
      success: true,
      data: {
        client: {
          id: client.id,
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
    const clients = await User.findAll({
      where: {
        role: 'client',
        organizationId: req.user.id,
        isActive: true
      }
    });

    const clientIds = clients.map(c => c.id);

    // Get unpaid invoices
    const unpaidInvoices = await Invoice.findAll({ 
      where: {
        userId: { [Op.in]: clientIds },
        [Op.or]: [
          { paymentStatus: { [Op.in]: ['unpaid', 'partially_paid'] } },
          // For backward compatibility with existing invoices
          { status: { [Op.in]: ['pending', 'partial', 'overdue'] }, paymentStatus: { [Op.eq]: null } }
        ]
      },
      include: [{ model: User, as: 'user', attributes: ['name', 'accountNumber'] }] 
    });

    // Get total amounts
    const totalUnpaidAmount = unpaidInvoices.reduce((sum, inv) => sum + inv.remainingBalance, 0);
    const overdueInvoices = unpaidInvoices.filter(inv => new Date() > inv.dueDate);
    const totalOverdueAmount = overdueInvoices.reduce((sum, inv) => sum + inv.remainingBalance, 0);

    // Group by client
    const clientsWithUnpaidInvoices = unpaidInvoices.reduce((acc, invoice) => {
      const clientId = invoice.userId.toString();
      if (!acc[clientId]) {
        acc[clientId] = {
          client: invoice.user,
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