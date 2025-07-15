const Payment = require('../models/Payment');
const Invoice = require('../models/Invoice');
const Overpayment = require('../models/Overpayment');
const User = require('../models/User');
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

    // Find user by account number
    const user = await User.findOne({ accountNumber });
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

// STK Push now uses C2B confirmation - no separate callback needed

// C2B Validation
const c2bValidation = async (req, res) => {
  try {
    console.log('C2B Validation:', JSON.stringify(req.body, null, 2));

    const { BillRefNumber, MSISDN, FirstName, LastName } = req.body;

    // // Validate account number exists
    // const user = await User.findOne({ accountNumber: BillRefNumber });
    
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

      const user = await User.findOne({ accountNumber: BillRefNumber });
    
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
      accountNumber: BillRefNumber,
      transactionDate: TransTime,
      payerName: `${FirstName} ${LastName}`
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
      payerName
    } = paymentData;

    // Find user by account number
    const user = await User.findOne({ accountNumber });
    if (!user) {
      console.error('User not found for account:', accountNumber);
      return;
    }

    // Find oldest unpaid invoice
    const unpaidInvoice = await Invoice.findOne({
      userId: user._id,
      status: { $in: ['pending', 'partial', 'overdue'] }
    }).sort({ dueDate: 1 });

    // Create payment record
    const payment = new Payment({
      userId: user._id,
      accountNumber,
      amount: parseFloat(amount),
      paymentMethod: 'mpesa',
      transactionId: mpesaReceiptNumber,
      mpesaReceiptNumber,
      phoneNumber,
      invoiceId: unpaidInvoice?._id || null,
      status: 'completed',
      paidAt: new Date(),
      metadata: {
        payerName
      }
    });

    await payment.save();
    const paymentAmount = parseFloat(amount);

    if (!unpaidInvoice) {
      // No pending invoice - save entire amount as overpayment
      const overpayment = new Overpayment({
        userId: user._id,
        accountNumber,
        paymentId: payment._id,
        amount: paymentAmount,
        remainingAmount: paymentAmount,
        notes: 'Payment received without pending invoice'
      });
      await overpayment.save();
      console.log(`No invoice found - saved KES ${amount} as overpayment for account ${accountNumber}`);
      return;
    }

    // Process payment against invoice
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