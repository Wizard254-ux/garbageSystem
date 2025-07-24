const Bag = require('../models/Bag');
const User = require('../models/User');
const { sendVerificationCode } = require('../services/mail');

// Generate a 6-digit verification code
const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Initiate bag distribution
const initiateBagDistribution = async (req, res) => {
  try {
    const { client_id, recipient_email, number_of_bags, notes } = req.body;
    const driver_id = req.user._id;

    // Validate required fields
    if (!client_id || !recipient_email || !number_of_bags) {
      return res.status(400).json({
        success: false,
        error: 'Client ID, recipient email, and number of bags are required'
      });
    }

    // Check if client exists
    const client = await User.findById(client_id);
    if (!client) {
      return res.status(404).json({
        success: false,
        error: 'Client not found'
      });
    }

    // Generate verification code
    const verificationCode = generateVerificationCode();

    // Create bag distribution record
    const bagDistribution = new Bag({
      client_id,
      recipient_email,
      number_of_bags,
      verification_code: verificationCode,
      driver_id,
      notes
    });

    await bagDistribution.save();

    // Send verification code to recipient email
    try {
      await sendVerificationCode({ email: recipient_email }, false, verificationCode);
      console.log(`Verification code sent to ${recipient_email}`);
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      return res.status(500).json({
        success: false,
        error: 'Failed to send verification code email'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Bag distribution initiated and verification code sent',
      data: {
        distribution_id: bagDistribution._id,
        client_id,
        recipient_email,
        number_of_bags
      }
    });

  } catch (error) {
    console.error('Error initiating bag distribution:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// Verify bag distribution with code
const verifyBagDistribution = async (req, res) => {
  try {
    const { distribution_id, verification_code } = req.body;

    // Validate required fields
    if (!distribution_id || !verification_code) {
      return res.status(400).json({
        success: false,
        error: 'Distribution ID and verification code are required'
      });
    }

    // Find the bag distribution record
    const bagDistribution = await Bag.findById(distribution_id);
    if (!bagDistribution) {
      return res.status(404).json({
        success: false,
        error: 'Bag distribution record not found'
      });
    }

    // Check if already verified
    if (bagDistribution.is_verified) {
      return res.status(400).json({
        success: false,
        error: 'This bag distribution has already been verified'
      });
    }

    // Verify the code
    if (bagDistribution.verification_code !== verification_code) {
      return res.status(400).json({
        success: false,
        error: 'Invalid verification code'
      });
    }

    // Mark as verified
    bagDistribution.is_verified = true;
    bagDistribution.verification_timestamp = new Date();
    await bagDistribution.save();

    return res.status(200).json({
      success: true,
      message: 'Bag distribution verified successfully',
      data: {
        distribution_id: bagDistribution._id,
        client_id: bagDistribution.client_id,
        recipient_email: bagDistribution.recipient_email,
        number_of_bags: bagDistribution.number_of_bags,
        verification_timestamp: bagDistribution.verification_timestamp
      }
    });

  } catch (error) {
    console.error('Error verifying bag distribution:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// Get bag distribution history for a client
const getBagDistributionHistory = async (req, res) => {
  try {
    const { client_id } = req.params;

    // Validate client ID
    if (!client_id) {
      return res.status(400).json({
        success: false,
        error: 'Client ID is required'
      });
    }

    // Find bag distributions for the client
    const bagDistributions = await Bag.find({ client_id })
      .populate('driver_id', 'name email')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: bagDistributions
    });

  } catch (error) {
    console.error('Error fetching bag distribution history:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

module.exports = {
  initiateBagDistribution,
  verifyBagDistribution,
  getBagDistributionHistory
};