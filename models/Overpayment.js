const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Overpayment = sequelize.define('Overpayment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
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
  paymentId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Payments',
      key: 'id'
    }
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    validate: {
      min: 0
    }
  },
  currency: {
    type: DataTypes.STRING,
    defaultValue: 'KES',
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('available', 'applied', 'refunded'),
    defaultValue: 'available'
  },
  appliedToInvoiceId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'Invoices',
      key: 'id'
    }
  },
  appliedAmount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
    validate: {
      min: 0
    }
  },
  remainingAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    validate: {
      min: 0
    }
  },
  notes: {
    type: DataTypes.TEXT
  }
}, {
  timestamps: true,
  hooks: {
    beforeCreate: (overpayment) => {
      if (!overpayment.remainingAmount) {
        overpayment.remainingAmount = overpayment.amount;
      }
    }
  }
});

// Instance method
Overpayment.prototype.applyToInvoice = function(invoiceId, amount) {
  this.appliedToInvoiceId = invoiceId;
  this.appliedAmount += amount;
  this.remainingAmount -= amount;
  
  if (this.remainingAmount <= 0) {
    this.status = 'applied';
    this.remainingAmount = 0;
  }
};

module.exports = Overpayment;