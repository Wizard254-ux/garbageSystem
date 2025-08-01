const { Op } = require('sequelize');
const { Payment, Invoice, Overpayment, User } = require('../models');
const mpesaService = require('../services/mpesa');

// Initiate STK Push
const initiateSTKPush = async (req, res) => {
  try {
    const { phoneNumber, amount, accountNumber } = req.body;

    // Validate input
    if (!phoneNumber || !amount || !accountNumber) {
      return res.status(400).json({
        success: false,
        error: 'Phone number, amount, and account number are required'
      });
    }

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

    // Format phone number (remove + and ensure it starts with 254)
    let formattedPhone = phoneNumber.replace(/\+/g, '');
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '254' + formattedPhone.substring(1);
    }
    if (!formattedPhone.startsWith('254')) {
      formattedPhone = '254' + formattedPhone;
    }

    // Initiate STK Push
    const stkResponse = await mpesaService.stkPush(
      formattedPhone,
      amount,
      accountNumber,
      `Payment for account ${accountNumber}`
    );

    res.status(200).json({
      success: true,
      message: 'STK Push initiated successfully',
      data: {
        CheckoutRequestID: stkResponse.CheckoutRequestID,
        ResponseCode: stkResponse.ResponseCode,
        ResponseDescription: stkResponse.ResponseDescription,
        CustomerMessage: stkResponse.CustomerMessage
      }
    });

  } catch (error) {
    console.error('STK Push initiation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initiate STK Push',
      details: error.message
    });
  }
};

// C2B Validation
const c2bValidation = async (req, res) => {
  try {
    console.log('C2B Validation:', JSON.stringify(req.body, null, 2));

    const { BillRefNumber, MSISDN, FirstName, LastName } = req.body;

    // Uncomment and fix if you want to validate account number
    // const user = await User.findOne({
    //   where: { accountNumber: BillRefNumber }
    // });

    // if (!user) {
    //   return res.status(200).json({
    //     ResultCode: 'C2B00012',
    //     ResultDesc: 'Invalid account number'
    //   });
    // }

    // Validation passed
    res.status(200).json({
      ResultCode: '0',
      ResultDesc: 'Success'
    });

  } catch (error) {
    console.error('C2B Validation error:', error);
    res.status(200).json({
      ResultCode: 'C2B00013',
      ResultDesc: 'System error'
    });
  }
};

// C2B Confirmation
const c2bConfirmation = async (req, res) => {
  try {
    console.log('C2B Confirmation:', JSON.stringify(req.body, null, 2));

    const {
      TransAmount,
      MSISDN,
      BillRefNumber,
      TransID,
      TransTime,
      FirstName,
      LastName
    } = req.body;

    // FIXED: removed double "where"
    const user = await User.findOne({
      where: { accountNumber: BillRefNumber }
    });

    if (!user) {
      return res.status(200).json({
        ResultCode: '0',
        ResultDesc: 'User is not on account database'
      });
    }

    // Process the payment
    await processSuccessfulPayment({
      amount: TransAmount,
      mpesaReceiptNumber: TransID,
      phoneNumber: MSISDN,
      accountNumber: BillRefNumber,
      transactionDate: TransTime,
      payerName: `${FirstName} ${LastName}`,
    });

    res.status(200).json({
      ResultCode: '0',
      ResultDesc: 'Success'
    });

  } catch (error) {
    console.error('C2B Confirmation error:', error);
    res.status(200).json({
      ResultCode: '0',
      ResultDesc: 'Success'
    });
  }
};

// Helper function to process successful payments
const processSuccessfulPayment = async (paymentData) => {
  try {
    const {
      amount,
      mpesaReceiptNumber,
      phoneNumber,
      accountNumber,
      transactionDate,
      checkoutRequestID,
      payerName,
    } = paymentData;

    console.log('Processing payment with amount:', amount, 'type:', typeof amount);
    console.log('Parsed amount:', parseFloat(amount));

    // Find user by account number - FIXED: removed double "where"
    const user = await User.findOne({
      where: { accountNumber }
    });

    if (!user) {
      console.error('User not found for account:', accountNumber);
      return;
    }

    // Find all unpaid invoices - FIXED: converted to Sequelize syntax
    const unpaidInvoices = await Invoice.findAll({
      where: {
        userId: user.id,
        [Op.or]: [
          { paymentStatus: { [Op.in]: ['unpaid', 'partially_paid'] } },
          // For backward compatibility with existing invoices
          { status: { [Op.in]: ['pending', 'due', 'partial', 'overdue', 'upcoming'] }, paymentStatus: { [Op.eq]: null } }
        ]
      },
      order: [['dueDate', 'ASC']] // FIXED: converted from MongoDB .sort() to Sequelize order
    });

    // Create payment record - FIXED: converted from MongoDB to Sequelize
    const paymentRecord = {
      userId: user.id,
      accountNumber,
      amount: parseFloat(amount),
      paymentMethod: 'mpesa',
      transactionId: mpesaReceiptNumber,
      mpesaReceiptNumber,
      phoneNumber,
      invoiceId: unpaidInvoices.length > 0 ? unpaidInvoices[0].id : null,
      status: 'completed',
      allocationStatus: 'unallocated',
      allocatedAmount: 0,
      remainingAmount: parseFloat(amount),
      paidAt: new Date(),
      metadata: {
        payerName
      }
    };

    const payment = await Payment.create(paymentRecord);
    const paymentAmount = parseFloat(amount);
    
    console.log('Payment amount after parsing:', paymentAmount);
    console.log('Found unpaid invoices:', unpaidInvoices.length);
    if (unpaidInvoices.length > 0) {
      console.log('First invoice balance:', unpaidInvoices[0].remainingBalance);
    }

    if (unpaidInvoices.length === 0) {
      // No pending invoice - mark payment as unallocated and save as overpayment
      await payment.update({
        allocationStatus: 'unallocated',
        allocatedAmount: 0,
        remainingAmount: paymentAmount
      });

      const overpaymentData = {
        userId: user.id,
        accountNumber,
        paymentId: payment.id,
        amount: paymentAmount,
        remainingAmount: paymentAmount,
        notes: 'Payment received without pending invoice'
      };

      await Overpayment.create(overpaymentData);
      console.log(`No invoice found - saved KES ${amount} as overpayment for account ${accountNumber}`);
      return;
    }

    // Process payment against invoices (similar to paymentController logic)
    let remainingPaymentAmount = paymentAmount;
    let allocatedAmount = 0;
    const updatedInvoices = [];
    const invoiceAllocations = [];
    const invoiceIds = [];

    // Allocate payment to invoices until payment is fully allocated or no more invoices
    for (const invoice of unpaidInvoices) {
      if (remainingPaymentAmount <= 0) break;

      const invoiceBalance = parseFloat(invoice.remainingBalance);
      const amountToAllocate = Math.min(remainingPaymentAmount, invoiceBalance);
      
      console.log(`Invoice ${invoice.id}: balance=${invoiceBalance}, allocating=${amountToAllocate}`);

      // Update invoice - FIXED: use Sequelize update method
      const newAmountPaid = parseFloat(invoice.amountPaid || 0) + amountToAllocate;
      const newRemainingBalance = parseFloat(invoice.totalAmount) - newAmountPaid;

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

    // Update payment with multiple invoice tracking
    const paymentUpdateData = {
      allocatedAmount: allocatedAmount,
      remainingAmount: remainingPaymentAmount,
      invoiceAllocations: invoiceAllocations,
      invoiceIds: invoiceIds
    };

    // Keep the old invoiceId field for backward compatibility (first invoice)
    if (invoiceIds.length > 0) {
      paymentUpdateData.invoiceId = invoiceIds[0];
    }

    if (allocatedAmount === 0) {
      paymentUpdateData.allocationStatus = 'unallocated';
    } else if (remainingPaymentAmount > 0) {
      paymentUpdateData.allocationStatus = 'partially_allocated'; // Payment has remaining amount, so partially allocated

      // Handle overpayment - FIXED: use Sequelize create
      const overpaymentData = {
        userId: user.id,
        accountNumber,
        paymentId: payment.id,
        amount: remainingPaymentAmount,
        remainingAmount: remainingPaymentAmount,
        notes: 'Overpayment after invoice allocation'
      };

      await Overpayment.create(overpaymentData);
    } else {
      paymentUpdateData.allocationStatus = 'fully_allocated'; // All payment amount was allocated to invoices
    }

    await payment.update(paymentUpdateData);

    console.log(`Payment processed successfully for account ${accountNumber}: KES ${amount}`);

  } catch (error) {
    console.error('Error processing successful payment:', error);
  }
};

module.exports = {
  initiateSTKPush,
  c2bValidation,
  c2bConfirmation
};