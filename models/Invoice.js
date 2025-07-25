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
  paymentStatus: {
    type: String,
    enum: ['unpaid', 'partially_paid', 'fully_paid'],
    default: 'unpaid'
  },
  dueStatus: {
    type: String,
    enum: ['due', 'overdue'],
    default: 'due'
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

// Calculate remaining balance and update statuses
invoiceSchema.methods.updateBalance = function() {
  this.remainingBalance = this.totalAmount - this.amountPaid;
  
  // Update payment status
  if (this.remainingBalance <= 0) {
    this.paymentStatus = 'fully_paid';
    this.remainingBalance = 0;
  } else if (this.amountPaid > 0) {
    this.paymentStatus = 'partially_paid';
  } else {
    this.paymentStatus = 'unpaid';
  }
  
  // Update due status
  // An invoice is 'due' when the billing period has ended but hasn't passed the grace period yet
  // An invoice is 'overdue' when the current date is past the billing period end + grace period (due date)
  if (this.paymentStatus !== 'fully_paid') {
    const now = new Date();
    const billingEnd = this.billingPeriod?.end ? new Date(this.billingPeriod.end) : null;
    
    if (billingEnd && now > billingEnd) {
      // Billing period has ended
      if (now > this.dueDate) {
        // Past grace period (overdue)
        this.dueStatus = 'overdue';
      } else {
        // Within grace period (due)
        this.dueStatus = 'due';
      }
    } else {
      // Billing period hasn't ended yet
      this.dueStatus = 'upcoming';
    }
  } else {
    // If fully paid, it's neither due nor overdue
    this.dueStatus = 'paid';
  }
  
  // For backward compatibility with existing code
  if (this.paymentStatus === 'fully_paid') {
    this.status = 'paid';
  } else if (this.dueStatus === 'overdue') {
    this.status = 'overdue';
  } else if (this.paymentStatus === 'partially_paid') {
    this.status = 'partial';
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