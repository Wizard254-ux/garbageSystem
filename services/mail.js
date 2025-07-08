
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


module.exports={sendVerificationCode, verifyCode ,verificationCodes};