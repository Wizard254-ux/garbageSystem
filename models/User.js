// models/User.js
const { DataTypes, Op } = require('sequelize');
const bcrypt = require('bcryptjs');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      isEmail: true
    }
  },
  documents: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [6, 255]
    }
  },
  phone: {
    type: DataTypes.STRING
  },
  address: {
    type: DataTypes.TEXT
  },
  routeId: {
    type: DataTypes.INTEGER
  },
  clientType: {
    type: DataTypes.ENUM('residential', 'commercial')
  },
  numberOfUnits: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    validate: {
      min: 1
    }
  },
  accountNumber: {
    type: DataTypes.STRING
  },
  serviceStartDate: {
    type: DataTypes.DATE
  },
  monthlyRate: {
    type: DataTypes.DECIMAL(10, 2),
    validate: {
      min: 0
    }
  },
  gracePeriod: {
    type: DataTypes.INTEGER,
    defaultValue: 5,
    validate: {
      min: 0,
      max: 30
    }
  },
  createdBy: {
    type: DataTypes.INTEGER
  },
  paymentId: {
    type: DataTypes.INTEGER
  },
  role: {
    type: DataTypes.ENUM('admin', 'organization', 'driver', 'client'),
    allowNull: false
  },
  organizationId: {
    type: DataTypes.INTEGER
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  isSent: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['email']
    },
    {
      fields: ['phone']
    },
    {
      fields: ['accountNumber']
    },
    {
      fields: ['role', 'isActive']
    }
  ],
  hooks: {
    beforeCreate: async (user) => {
      if (user.password) {
        user.password = await bcrypt.hash(user.password, 12);
      }
      if (user.role === 'client' && !user.accountNumber) {
        user.accountNumber = user.generateAccountNumber();
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('password')) {
        user.password = await bcrypt.hash(user.password, 12);
      }
    }
  }
});

// Instance methods
User.prototype.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

User.prototype.generateAccountNumber = function() {
  const prefix = this.clientType === 'commercial' ? 'COM' : 'RES';
  const randomNum = Math.floor(100000 + Math.random() * 900000);
  return `${prefix}${randomNum}`;
};

module.exports = User;