// models/Payment.js

const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'KES', // or 'USD', 'EUR', etc.
    required: true
  },
  paymentMethod: {
    type: String,
    enum: ['mpesa', 'card', 'paypal', 'stripe', 'bank_transfer'],
    required: true
  },
  transactionId: {
    type: String,
    required: true,
    unique: true
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  paidAt: {
    type: Date
  },
  metadata: {
    type: Object, // For storing extra data (e.g., phone number, IP, location)
    default: {}
  },
}, {
  timestamps: true // adds createdAt and updatedAt automatically
});

module.exports = mongoose.model('Payment', paymentSchema);
