const mongoose = require('mongoose');
const express = require('express');
const router = express.Router();

// Define the Route schema
const routeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  path: {
    type: String,
    required: true,
    trim: true
  },

  description: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },


}, {
  timestamps: true
});

// Create indexes for better performance
routeSchema.index({ path: 1, method: 1 }, { unique: true });
routeSchema.index({ name: 1 });
routeSchema.index({ isActive: 1 });

// Instance methods
routeSchema.methods.activate = function() {
  this.isActive = true;
  return this.save();
};

routeSchema.methods.deactivate = function() {
  this.isActive = false;
  return this.save();
};

// Static methods
routeSchema.statics.findByPath = function(path) {
  return this.find({ path: path, isActive: true });
};


const Route = mongoose.model('Route', routeSchema);
module.exports = Route;
