const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Invoice = sequelize.define('Invoice', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  invoiceNumber: {
    type: DataTypes.STRING,
    unique: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  accountNumber: {
    type: DataTypes.STRING,
    allowNull: false
  },
  billingPeriodStart: {
    type: DataTypes.DATE,
    allowNull: false
  },
  billingPeriodEnd: {
    type: DataTypes.DATE,
    allowNull: false
  },
  totalAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    validate: {
      min: 0
    }
  },
  amountPaid: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
    validate: {
      min: 0
    }
  },
  remainingBalance: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    validate: {
      min: 0
    }
  },
  paymentStatus: {
    type: DataTypes.ENUM('unpaid', 'partially_paid', 'fully_paid'),
    defaultValue: 'unpaid'
  },
  dueStatus: {
    type: DataTypes.ENUM('due', 'overdue', 'upcoming', 'paid'),
    defaultValue: 'due'
  },
  dueDate: {
    type: DataTypes.DATE,
    allowNull: false
  },
  issuedDate: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  emailSent: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  emailSentAt: {
    type: DataTypes.DATE
  },
  status: {
    type: DataTypes.STRING
  }
}, {
  timestamps: true,
  hooks: {
    beforeCreate: (invoice) => {
     if (!invoice.invoiceNumber) {
        const year = String(new Date().getFullYear()).slice(-2); // '24' instead of '2024'
        const month = String(new Date().getMonth() + 1).padStart(2, '0'); // '07'
        const randomNum = Math.floor(100 + Math.random() * 900); // 3-digit random number
        invoice.invoiceNumber = `INV${year}${month}-${randomNum}`; // e.g., "I2407-738"
      }

      
      // Update balance logic
      invoice.remainingBalance = invoice.totalAmount - (invoice.amountPaid || 0);
      
      if (invoice.remainingBalance <= 0) {
        invoice.paymentStatus = 'fully_paid';
        invoice.remainingBalance = 0;
      } else if ((invoice.amountPaid || 0) > 0) {
        invoice.paymentStatus = 'partially_paid';
      } else {
        invoice.paymentStatus = 'unpaid';
      }
      
      if (invoice.paymentStatus !== 'fully_paid') {
        const now = new Date();
        const billingEnd = invoice.billingPeriodEnd ? new Date(invoice.billingPeriodEnd) : null;
        
        if (billingEnd && now > billingEnd) {
          if (now > invoice.dueDate) {
            invoice.dueStatus = 'overdue';
          } else {
            invoice.dueStatus = 'due';
          }
        } else {
          invoice.dueStatus = 'upcoming';
        }
      } else {
        invoice.dueStatus = 'paid';
      }
      
      if (invoice.paymentStatus === 'fully_paid') {
        invoice.status = 'paid';
      } else if (invoice.dueStatus === 'overdue') {
        invoice.status = 'overdue';
      } else if (invoice.paymentStatus === 'partially_paid') {
        invoice.status = 'partial';
      } else {
        invoice.status = 'pending';
      }
    },
    beforeUpdate: (invoice) => {
      // Update balance logic
      invoice.remainingBalance = invoice.totalAmount - (invoice.amountPaid || 0);
      
      if (invoice.remainingBalance <= 0) {
        invoice.paymentStatus = 'fully_paid';
        invoice.remainingBalance = 0;
      } else if ((invoice.amountPaid || 0) > 0) {
        invoice.paymentStatus = 'partially_paid';
      } else {
        invoice.paymentStatus = 'unpaid';
      }
      
      if (invoice.paymentStatus !== 'fully_paid') {
        const now = new Date();
        const billingEnd = invoice.billingPeriodEnd ? new Date(invoice.billingPeriodEnd) : null;
        
        if (billingEnd && now > billingEnd) {
          if (now > invoice.dueDate) {
            invoice.dueStatus = 'overdue';
          } else {
            invoice.dueStatus = 'due';
          }
        } else {
          invoice.dueStatus = 'upcoming';
        }
      } else {
        invoice.dueStatus = 'paid';
      }
      
      if (invoice.paymentStatus === 'fully_paid') {
        invoice.status = 'paid';
      } else if (invoice.dueStatus === 'overdue') {
        invoice.status = 'overdue';
      } else if (invoice.paymentStatus === 'partially_paid') {
        invoice.status = 'partial';
      } else {
        invoice.status = 'pending';
      }
    }
  }
});

// Instance methods
Invoice.prototype.generateInvoiceNumber = function() {
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `INV-${year}${month}-${randomNum}`;
};

Invoice.prototype.updateBalance = function() {
  this.remainingBalance = this.totalAmount - this.amountPaid;
  
  if (this.remainingBalance <= 0) {
    this.paymentStatus = 'fully_paid';
    this.remainingBalance = 0;
  } else if (this.amountPaid > 0) {
    this.paymentStatus = 'partially_paid';
  } else {
    this.paymentStatus = 'unpaid';
  }
  
  if (this.paymentStatus !== 'fully_paid') {
    const now = new Date();
    const billingEnd = this.billingPeriodEnd ? new Date(this.billingPeriodEnd) : null;
    
    if (billingEnd && now > billingEnd) {
      if (now > this.dueDate) {
        this.dueStatus = 'overdue';
      } else {
        this.dueStatus = 'due';
      }
    } else {
      this.dueStatus = 'upcoming';
    }
  } else {
    this.dueStatus = 'paid';
  }
  
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

module.exports = Invoice;