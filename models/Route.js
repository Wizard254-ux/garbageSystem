const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Route = sequelize.define('Route', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  path: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  activeDriverId: {
    type: DataTypes.INTEGER,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  driverActivatedAt: {
    type: DataTypes.DATE
  }
}, {
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['path']
    },
    {
      fields: ['name']
    },
    {
      fields: ['isActive']
    }
  ]
});

// Instance methods
Route.prototype.activate = function() {
  this.isActive = true;
  return this.save();
};

Route.prototype.deactivate = function() {
  this.isActive = false;
  return this.save();
};

Route.prototype.activateDriver = function(driverId) {
  this.activeDriverId = driverId;
  this.driverActivatedAt = new Date();
  return this.save();
};

Route.prototype.deactivateDriver = function() {
  this.activeDriverId = null;
  this.driverActivatedAt = null;
  return this.save();
};

// Static methods
Route.findByPath = function(path) {
  return this.findAll({ where: { path: path, isActive: true } });
};

module.exports = Route;
