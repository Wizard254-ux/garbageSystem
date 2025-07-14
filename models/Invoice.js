const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  invoiceNumber: {
    type: String,
    unique: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  accountNumber: {
    type: String,
    required: true
  },
  billingPeriod: {
    start: {
      type: Date,
      required: true
    },
    end: {
      type: Date,
      required: true
    }
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  amountPaid: {
    type: Number,
    default: 0,
    min: 0
  },
  remainingBalance: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['pending', 'partial', 'paid', 'overdue'],
    default: 'pending'
  },
  dueDate: {
    type: Date,
    required: true
  },
  issuedDate: {
    type: Date,
    default: Date.now
  },
  emailSent: {
    type: Boolean,
    default: false
  },
  emailSentAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Generate invoice number
invoiceSchema.methods.generateInvoiceNumber = function() {
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `INV-${year}${month}-${randomNum}`;
};

// Calculate remaining balance
invoiceSchema.methods.updateBalance = function() {
  this.remainingBalance = this.totalAmount - this.amountPaid;
  
  if (this.remainingBalance <= 0) {
    this.status = 'paid';
    this.remainingBalance = 0;
  } else if (this.amountPaid > 0) {
    this.status = 'partial';
  } else if (new Date() > this.dueDate) {
    this.status = 'overdue';
  } else {
    this.status = 'pending';
  }
};

// Pre-save middleware
invoiceSchema.pre('save', function(next) {
  // Always generate invoice number if not present
  if (!this.invoiceNumber) {
    this.invoiceNumber = this.generateInvoiceNumber();
  }
  // Always update balance and status
  this.updateBalance();
  next();
});

module.exports = mongoose.model('Invoice', invoiceSchema);