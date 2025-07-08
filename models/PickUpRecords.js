
const mongoose = require('mongoose');
const express = require('express');
const router = express.Router();

// PickupRecords Schema
const pickupRecordsSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true // Ensure one record per user
  },
  pickup_dates: {
    type: Map,
    of: {
      status: {
        type: String,
        enum: ['picked', 'unpicked'],
        required: true
      },
      timestamp: {
        type: Date,
        default: Date.now
      },
      notes: String
    },
    default: new Map()
  }
}, {
  timestamps: true
});


// Instance methods
pickupRecordsSchema.methods.markAsPicked = function(date, notes = '') {
  const dateKey = new Date(date).toISOString().split('T')[0]; // Format: YYYY-MM-DD
  
  this.pickup_dates.set(dateKey, {
    status: 'picked',
    timestamp: new Date(),
    notes: notes
  });
  
  return this.save();
};

pickupRecordsSchema.methods.markAsUnpicked = function(date, notes = '') {
  const dateKey = new Date(date).toISOString().split('T')[0];
  
  this.pickup_dates.set(dateKey, {
    status: 'unpicked',
    timestamp: new Date(),
    notes: notes
  });
  
  return this.save();
};

pickupRecordsSchema.methods.getPickupStatus = function(date) {
  const dateKey = new Date(date).toISOString().split('T')[0];
  return this.pickup_dates.get(dateKey);
};

// Static methods
pickupRecordsSchema.statics.findByUserId = function(userId) {
  return this.findOne({ user_id: userId });
};

pickupRecordsSchema.statics.getUsersWithoutPickup = function(date) {
  const dateKey = new Date(date).toISOString().split('T')[0];
  return this.find({
    [`pickup_dates.${dateKey}`]: { $exists: false }
  }).populate('user_id');
};

const PickupRecords = mongoose.model('PickupRecords', pickupRecordsSchema);
module.exports = PickupRecords;
