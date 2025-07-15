const mongoose = require('mongoose');

const overpaymentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  accountNumber: {
    type: String,
    required: true
  },
  paymentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment',
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
  status: {
    type: String,
    enum: ['available', 'applied', 'refunded'],
    default: 'available'
  },
  appliedToInvoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice'
  },
  appliedAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  remainingAmount: {
    type: Number,
    required: true,
    min: 0
  },
  notes: {
    type: String
  }
}, {
  timestamps: true
});

// Update remaining amount when applied
overpaymentSchema.methods.applyToInvoice = function(invoiceId, amount) {
  this.appliedToInvoiceId = invoiceId;
  this.appliedAmount += amount;
  this.remainingAmount -= amount;
  
  if (this.remainingAmount <= 0) {
    this.status = 'applied';
    this.remainingAmount = 0;
  }
};

// Pre-save middleware
overpaymentSchema.pre('save', function(next) {
  if (!this.remainingAmount) {
    this.remainingAmount = this.amount;
  }
  next();
});

module.exports = mongoose.model('Overpayment', overpaymentSchema);