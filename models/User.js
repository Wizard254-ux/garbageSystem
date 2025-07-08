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
  pickUpDay:{
    type: String,
    enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],

  },
  route:{
    type: mongoose.Schema.ObjectId,
    ref: 'Route',

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

module.exports = mongoose.model('User', userSchema);