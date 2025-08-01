const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PickupRecords = sequelize.define('PickupRecords', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  pickup_dates: {
    type: DataTypes.JSON,
    defaultValue: {}
  }
}, {
  timestamps: true
});

// Instance methods
PickupRecords.prototype.markAsPicked = function(date, notes = '') {
  const dateKey = new Date(date).toISOString().split('T')[0];
  const pickupDates = this.pickup_dates || {};
  
  pickupDates[dateKey] = {
    status: 'picked',
    timestamp: new Date(),
    notes: notes
  };
  
  this.pickup_dates = pickupDates;
  return this.save();
};

PickupRecords.prototype.markAsUnpicked = function(date, notes = '') {
  const dateKey = new Date(date).toISOString().split('T')[0];
  const pickupDates = this.pickup_dates || {};
  
  pickupDates[dateKey] = {
    status: 'unpicked',
    timestamp: new Date(),
    notes: notes
  };
  
  this.pickup_dates = pickupDates;
  return this.save();
};

PickupRecords.prototype.getPickupStatus = function(date) {
  const dateKey = new Date(date).toISOString().split('T')[0];
  const pickupDates = this.pickup_dates || {};
  return pickupDates[dateKey];
};

// Static methods
PickupRecords.findByUserId = function(userId) {
  return this.findOne({ where: { user_id: userId } });
};

PickupRecords.getUsersWithoutPickup = function(date) {
  const dateKey = new Date(date).toISOString().split('T')[0];
  const { Op } = require('sequelize');
  
  return this.findAll({
    where: {
      [Op.or]: [
        { pickup_dates: null },
        sequelize.literal(`JSON_EXTRACT(pickup_dates, '$."${dateKey}"') IS NULL`)
      ]
    },
    include: [{
      model: require('./User'),
      as: 'user'
    }]
  });
};

module.exports = PickupRecords;
