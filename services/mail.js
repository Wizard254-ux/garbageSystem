
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
const sendVerificationCode = async (user, pickUpNotification = false) => {
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
    // Generate verification code
    const verificationCode = generateVerificationCode();
    
    // Store code with expiration (5 minutes)
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now
    verificationCodes.set(email, {
      code: verificationCode,
      expiresAt,
      userId: user._id.toString()
    });

    // Send email
    const mailOptions = {
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
const sendInvoiceEmail = async (user, invoice) => {
  try {
    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: user.email,
      subject: `Invoice ${invoice.invoiceNumber} - Garbage Collection Service`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Monthly Invoice</h2>
          <p>Hello ${user.name},</p>
          <p>Your monthly garbage collection invoice is ready.</p>
          
          <div style="background-color: #f8f9fa; border: 1px solid #dee2e6; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3 style="color: #495057; margin: 0 0 15px 0;">Invoice Details:</h3>
            <p><strong>Invoice Number:</strong> ${invoice.invoiceNumber}</p>
            <p><strong>Account Number:</strong> ${user.accountNumber}</p>
            <p><strong>Client Type:</strong> ${user.clientType.charAt(0).toUpperCase() + user.clientType.slice(1)}</p>
            <p><strong>Billing Period:</strong> ${invoice.billingPeriod.start.toLocaleDateString()} - ${invoice.billingPeriod.end.toLocaleDateString()}</p>
            <p><strong>Due Date:</strong> ${invoice.dueDate.toLocaleDateString()}</p>
            <p><strong>Amount Due:</strong> KES ${invoice.totalAmount.toLocaleString()}</p>
          </div>
          
          <div style="background-color: #d1ecf1; border: 1px solid #bee5eb; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h4 style="color: #0c5460; margin: 0 0 10px 0;">Payment Instructions:</h4>
            <p style="margin: 5px 0;">• Pay via M-Pesa Paybill</p>
            <p style="margin: 5px 0;">• Use your account number: <strong>${user.accountNumber}</strong></p>
            <p style="margin: 5px 0;">• Amount: <strong>KES ${invoice.totalAmount.toLocaleString()}</strong></p>
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

module.exports={sendVerificationCode, verifyCode, sendInvoiceEmail, sendOverpaymentNotification, verificationCodes};