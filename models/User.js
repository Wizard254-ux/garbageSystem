// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  documents: [{ type: String }],
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  phone: {
    type: String,
    unique: true,
    trim: true
  },
  address: {
    type: String,
    trim: true
  },
  // pickUpDay is now calculated from serviceStartDate
  routeId:{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Route',
  },
  // Client-specific fields
  clientType: {
    type: String,
    enum: ['residential', 'commercial'],
    required: function() {
      return this.role === 'client';
    }
  },
  numberOfUnits: {
    type: Number,
    default: 1,
    min: 1,
    required: function() {
      return this.role === 'client' && this.clientType === 'commercial';
    }
  },
  accountNumber: {
    type: String,
    unique: true,
    sparse: true // Only enforces uniqueness for non-null values
  },
  serviceStartDate: {
    type: Date,
    required: function() {
      return this.role === 'client';
    }
  },
  monthlyRate: {
    type: Number,
    required: function() {
      return this.role === 'client';
    },
    min: 0
  },
  gracePeriod: {
    type: Number,
    default: 5,
    min: 0,
    max: 30
  },
  createdBy:{
    type: mongoose.Schema.ObjectId,
    ref: 'User',
  },
  payment:{
    type:mongoose.Schema.ObjectId,
    ref:'Payment'
  },
  role: {
    type: String,
    enum: ['admin', 'organization', 'driver','client'],
    required: true
  },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function() {
      return this.role === 'driver';
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isSent: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate account number for clients
userSchema.methods.generateAccountNumber = function() {
  const prefix = this.clientType === 'commercial' ? 'COM' : 'RES';
  const randomNum = Math.floor(100000 + Math.random() * 900000); // 6-digit random number
  return `${prefix}${randomNum}`;
};

// Pre-save middleware to generate account number for clients
userSchema.pre('save', function(next) {
  if (this.role === 'client' && !this.accountNumber) {
    this.accountNumber = this.generateAccountNumber();
  }
  next();
});

module.exports = mongoose.model('User', userSchema);