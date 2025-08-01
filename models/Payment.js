// models/Payment.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Payment = sequelize.define('Payment', {
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
  paymentMethod: {
    type: DataTypes.ENUM('mpesa', 'paybill', 'card', 'bank_transfer', 'cash'),
    allowNull: false
  },
  transactionId: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  mpesaReceiptNumber: {
    type: DataTypes.STRING
  },
  phoneNumber: {
    type: DataTypes.STRING
  },
  invoiceId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'Invoices',
      key: 'id'
    }
  },
  invoiceIds: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  invoiceAllocations: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  status: {
    type: DataTypes.ENUM('pending', 'completed', 'failed', 'cancelled'),
    defaultValue: 'pending'
  },
  allocationStatus: {
    type: DataTypes.ENUM('unallocated', 'partially_allocated', 'fully_allocated'),
    defaultValue: 'unallocated'
  },
  allocatedAmount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
    validate: {
      min: 0
    }
  },
  remainingAmount: {
    type: DataTypes.DECIMAL(10, 2),
    validate: {
      min: 0
    }
  },
  paidAt: {
    type: DataTypes.DATE
  },
  metadata: {
    type: DataTypes.JSON,
    defaultValue: {}
  }
}, {
  timestamps: true,
  hooks: {
    beforeCreate: (payment) => {
      if (!payment.remainingAmount) {
        payment.remainingAmount = payment.amount;
      }
    }
  }
});

module.exports = Payment;
