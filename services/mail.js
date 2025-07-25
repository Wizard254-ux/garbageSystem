
const User = require('../models/User');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

// In-memory storage for verification codes (use Redis in production)
const verificationCodes = new Map();

// Email transporter setup
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Generate 6-digit verification code
const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send verification code to email
const sendVerificationCode = async (user, pickUpNotification = false, customCode = null) => {
  try {
    const email = user.email;

    if (!email) {
      return res.status(400).json({ 
        message: 'Email is required.' 
      });
    }

    // Check if this is a pickup notification
    if (pickUpNotification) {
      const currentTime = new Date().toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit', 
        hour12: true 
      });
      
      const currentDate = new Date().toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });

      // Send pickup notification email
      const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: email,
        subject: 'Garbage Collection Notification',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #28a745;">Garbage Collection Completed</h2>
            <p>Hello ${user.name},</p>
            <p>We want to inform you that your garbage has been collected today!</p>
            <div style="background-color: #d4edda; border: 1px solid #c3e6cb; padding: 20px; border-radius: 5px; margin: 20px 0;">
              <h3 style="color: #155724; margin: 0 0 10px 0;">Collection Details:</h3>
              <p style="margin: 5px 0;"><strong>Date:</strong> ${currentDate}</p>
              <p style="margin: 5px 0;"><strong>Time:</strong> ${currentTime}</p>
              <p style="margin: 5px 0;"><strong>Status:</strong> Completed</p>
            </div>
            <p>Thank you for using our waste management service. Your garbage has been successfully collected for this week.</p>
            <p>Next collection will be scheduled according to your regular pickup schedule.</p>
            <p>Best regards,<br>Your Waste Management Team</p>
          </div>
        `
      };

      await transporter.sendMail(mailOptions);

      return {
        message: 'Pickup notification sent successfully.',
        type: 'pickup_notification',
        collectionTime: currentTime,
        collectionDate: currentDate
      };
    }

    // Original verification code logic
    // Generate verification code or use custom code if provided
    const verificationCode = customCode || generateVerificationCode();
    
    // Store code with expiration (5 minutes)
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now
    verificationCodes.set(email, {
      code: verificationCode,
      expiresAt,
      userId: user._id ? user._id.toString() : null
    });

    // Send email
    let mailOptions;
    
    // Check if this is for bag distribution
    if (customCode) {
      mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: email,
        subject: 'Bag Distribution Verification Code',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #28a745;">Bag Distribution Verification</h2>
            <p>Hello,</p>
            <p>A driver is distributing garbage bags to you. Please use the verification code below to confirm receipt:</p>
            <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0;">
              <h1 style="color: #28a745; font-size: 32px; margin: 0; letter-spacing: 5px;">${verificationCode}</h1>
            </div>
            <p><strong>This code will expire in 5 minutes.</strong></p>
            <p>If you did not expect to receive garbage bags, please ignore this email.</p>
            <p>Best regards,<br>Your Waste Management Team</p>
          </div>
        `
      };
    } else {
      mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: email,
        subject: 'Password Change Verification Code',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Password Change Verification</h2>
            <p>Hello ${user.name},</p>
            <p>You have requested to change your password. Please use the verification code below:</p>
            <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0;">
              <h1 style="color: #007bff; font-size: 32px; margin: 0; letter-spacing: 5px;">${verificationCode}</h1>
            </div>
            <p><strong>This code will expire in 5 minutes.</strong></p>
            <p>If you did not request this password change, please ignore this email.</p>
            <p>Best regards,<br>Your App Team</p>
          </div>
        `
      };
    }

    await transporter.sendMail(mailOptions);

    return {
      message: 'Verification code sent to your email.',
      expiresIn: '5 minutes'
    };

  } catch (error) {
    console.error('Email sending error:', error);
    throw new Error('Failed to send verification code. ', error); 
  }
};

const verifyCode = async (email, verificationCode) => {
  try {
    if (!email || !verificationCode) {
      throw new Error('Email and verification code are required.');
    }

    const storedData = verificationCodes.get(email);
    if (!storedData) {
      throw new Error('Invalid or expired verification code.');
    }

    if (new Date() > storedData.expiresAt) {
      verificationCodes.delete(email);
      throw new Error('Verification code has expired.');
    }

    if (storedData.code !== verificationCode) {
      throw new Error('Invalid verification code.');
    }

    return {
      message: 'Verification code is valid.',
      expiresAt: storedData.expiresAt
    };

  } catch (error) {
    throw new Error(error.message || 'Failed to verify code.');
  }
};

const cleanupExpiredCodes = () => {
  const now = new Date();
  for (const [email, data] of verificationCodes.entries()) {
    if (now > data.expiresAt) {
      verificationCodes.delete(email);
    }
  }
};

// Run cleanup every minute
setInterval(cleanupExpiredCodes, 60000);


// Send invoice email
const sendInvoiceEmail = async (user, invoice, isOverdue = false) => {
  try {
    const subject = isOverdue 
      ? `OVERDUE: Invoice ${invoice.invoiceNumber} - Garbage Collection Service` 
      : `Invoice ${invoice.invoiceNumber} - Garbage Collection Service`;

    const headerColor = isOverdue ? '#dc3545' : '#333';
    const headerText = isOverdue ? 'OVERDUE INVOICE REMINDER' : 'Monthly Invoice';
    const messageText = isOverdue 
      ? 'Your invoice payment is now overdue. Please make payment as soon as possible to avoid service interruption.'
      : 'Your monthly garbage collection invoice is ready.';

    // Add overdue notification box if applicable
    const overdueBox = isOverdue ? `
      <div style="background-color: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <h4 style="color: #721c24; margin: 0 0 10px 0;">⚠️ PAYMENT OVERDUE</h4>
        <p style="margin: 5px 0;">Your payment was due on <strong>${invoice.dueDate.toLocaleDateString()}</strong> and is now overdue.</p>
        <p style="margin: 5px 0;">Please make payment immediately to avoid service interruption.</p>
      </div>
    ` : '';

    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: user.email,
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: ${headerColor};">${headerText}</h2>
          <p>Hello ${user.name},</p>
          <p>${messageText}</p>
          
          ${overdueBox}
          
          <div style="background-color: #f8f9fa; border: 1px solid #dee2e6; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3 style="color: #495057; margin: 0 0 15px 0;">Invoice Details:</h3>
            <p><strong>Invoice Number:</strong> ${invoice.invoiceNumber}</p>
            <p><strong>Account Number:</strong> ${user.accountNumber}</p>
            <p><strong>Client Type:</strong> ${user.clientType.charAt(0).toUpperCase() + user.clientType.slice(1)}</p>
            <p><strong>Billing Period:</strong> ${invoice.billingPeriod.start.toLocaleDateString()} - ${invoice.billingPeriod.end.toLocaleDateString()}</p>
            <p><strong>Due Date:</strong> ${invoice.dueDate.toLocaleDateString()}</p>
            <p><strong>Amount Due:</strong> KES ${invoice.remainingBalance.toLocaleString()}</p>
            <p><strong>Payment Status:</strong> <span style="color: ${invoice.paymentStatus === 'fully_paid' ? '#28a745' : invoice.paymentStatus === 'partially_paid' ? '#0d6efd' : '#ffc107'};">${(invoice.paymentStatus || invoice.status).toUpperCase().replace('_', ' ')}</span></p>
            <p><strong>Due Status:</strong> <span style="color: ${invoice.dueStatus === 'overdue' || invoice.status === 'overdue' ? '#dc3545' : '#ffc107'};">${(invoice.dueStatus || (invoice.status === 'overdue' ? 'overdue' : 'due')).toUpperCase()}</span></p>
          </div>
          
          <div style="background-color: #d1ecf1; border: 1px solid #bee5eb; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h4 style="color: #0c5460; margin: 0 0 10px 0;">Payment Instructions:</h4>
            <p style="margin: 5px 0;">• Pay via M-Pesa Paybill</p>
            <p style="margin: 5px 0;">• Use your account number: <strong>${user.accountNumber}</strong></p>
            <p style="margin: 5px 0;">• Amount: <strong>KES ${invoice.remainingBalance.toLocaleString()}</strong></p>
          </div>
          
          <p>Thank you for using our waste management service.</p>
          <p>Best regards,<br>Your Waste Management Team</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    return { message: 'Invoice email sent successfully' };

  } catch (error) {
    console.error('Invoice email error:', error);
    throw new Error('Failed to send invoice email');
  }
};

// Send overpayment notification email
const sendOverpaymentNotification = async (user, invoice, overpaymentUsed) => {
  try {
    const isFullyPaid = invoice.remainingBalance <= 0;
    
    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: user.email,
      subject: `Overpayment Applied - Invoice ${invoice.invoiceNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #28a745;">Overpayment Applied to Your Invoice</h2>
          <p>Hello ${user.name},</p>
          <p>We have automatically applied your available overpayment to your latest invoice.</p>
          
          <div style="background-color: #d4edda; border: 1px solid #c3e6cb; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3 style="color: #155724; margin: 0 0 15px 0;">Payment Applied:</h3>
            <p><strong>Invoice Number:</strong> ${invoice.invoiceNumber}</p>
            <p><strong>Original Amount:</strong> KES ${invoice.totalAmount.toLocaleString()}</p>
            <p><strong>Overpayment Used:</strong> KES ${overpaymentUsed.toLocaleString()}</p>
            <p><strong>Remaining Balance:</strong> KES ${invoice.remainingBalance.toLocaleString()}</p>
            <p><strong>Status:</strong> ${isFullyPaid ? 'FULLY PAID' : 'PARTIAL PAYMENT'}</p>
          </div>
          
          ${isFullyPaid ? 
            `<div style="background-color: #d1ecf1; border: 1px solid #bee5eb; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h4 style="color: #0c5460; margin: 0 0 10px 0;">✅ Invoice Fully Paid!</h4>
              <p style="margin: 0;">Your invoice has been completely paid using your overpayment. No further action required.</p>
            </div>` : 
            `<div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h4 style="color: #856404; margin: 0 0 10px 0;">⚠️ Remaining Balance</h4>
              <p style="margin: 5px 0;">You still have a remaining balance of <strong>KES ${invoice.remainingBalance.toLocaleString()}</strong></p>
              <p style="margin: 5px 0;">Please pay via M-Pesa Paybill using your account number: <strong>${user.accountNumber}</strong></p>
              <p style="margin: 5px 0;">Due Date: <strong>${invoice.dueDate.toLocaleDateString()}</strong></p>
            </div>`
          }
          
          <p>Thank you for using our waste management service.</p>
          <p>Best regards,<br>Your Waste Management Team</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    return { message: 'Overpayment notification sent successfully' };

  } catch (error) {
    console.error('Overpayment notification email error:', error);
    throw new Error('Failed to send overpayment notification email');
  }
};

// Send driver credentials email
const sendDriverCredentials = async (driver, password) => {
  try {
    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: driver.email,
      subject: 'Your Driver Account Credentials',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #28a745;">Welcome to Our Waste Management Team!</h2>
          <p>Hello ${driver.name},</p>
          <p>Your driver account has been created successfully. Below are your login credentials:</p>
          
          <div style="background-color: #f8f9fa; border: 1px solid #dee2e6; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3 style="color: #495057; margin: 0 0 15px 0;">Account Details:</h3>
            <p><strong>Email:</strong> ${driver.email}</p>
            <p><strong>Password:</strong> ${password}</p>
          </div>
          
          <div style="background-color: #d1ecf1; border: 1px solid #bee5eb; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h4 style="color: #0c5460; margin: 0 0 10px 0;">Download the Driver App:</h4>
            <p style="margin: 5px 0;">To start using our service, please download our Driver App:</p>
            <p style="margin: 10px 0;">
              <a href="#" style="display: inline-block; background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">Download Driver App</a>
            </p>
            <p style="margin: 5px 0;">Alternatively, you can visit our website and click on "Driver App" to install it.</p>
          </div>
          
          <p>Please login to the app using the email and password provided above.</p>
          <p>For security reasons, we recommend changing your password after your first login.</p>
          <p>If you have any questions or need assistance, please contact your supervisor.</p>
          <p>Best regards,<br>Your Waste Management Team</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    return { message: 'Driver credentials sent successfully' };

  } catch (error) {
    console.error('Driver credentials email error:', error);
    throw new Error('Failed to send driver credentials email');
  }
};

module.exports={
  sendVerificationCode, 
  verifyCode, 
  sendInvoiceEmail, 
  sendOverpaymentNotification, 
  sendDriverCredentials,
  verificationCodes
};