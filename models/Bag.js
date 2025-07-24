const mongoose = require('mongoose');

const bagSchema = new mongoose.Schema({
  client_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipient_email: {
    type: String,
    required: true
  },
  number_of_bags: {
    type: Number,
    required: true,
    min: 1
  },
  verification_code: {
    type: String,
    required: true
  },
  is_verified: {
    type: Boolean,
    default: false
  },
  verification_timestamp: {
    type: Date
  },
  distribution_timestamp: {
    type: Date,
    default: Date.now
  },
  driver_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  notes: {
    type: String
  }
}, { timestamps: true });

const Bag = mongoose.model('Bag', bagSchema);

module.exports = Bag;