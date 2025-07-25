// models/Payment.js

const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  accountNumber: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'KES',
    required: true
  },
  paymentMethod: {
    type: String,
    enum: ['mpesa', 'paybill', 'card', 'bank_transfer', 'cash'],
    required: true
  },
  transactionId: {
    type: String,
    required: true,
    unique: true
  },
  mpesaReceiptNumber: {
    type: String,
    required: function() {
      return this.paymentMethod === 'mpesa' || this.paymentMethod === 'paybill';
    }
  },
  phoneNumber: {
    type: String,
    required: function() {
      return this.paymentMethod === 'mpesa' || this.paymentMethod === 'paybill';
    }
  },
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice',
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  allocationStatus: {
    type: String,
    enum: ['unallocated', 'partially_allocated', 'fully_allocated'],
    default: 'unallocated'
  },
  allocatedAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  remainingAmount: {
    type: Number,
    default: function() {
      return this.amount;
    },
    min: 0
  },
  paidAt: {
    type: Date
  },
  metadata: {
    type: Object,
    default: {}
  },
}, {
  timestamps: true
});

module.exports = mongoose.model('Payment', paymentSchema);
