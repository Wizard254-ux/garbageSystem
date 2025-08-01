const Bag = require('../models/Bag');
const User = require('../models/User');
const Route = require('../models/Route');
const { sendVerificationCode } = require('../services/mail');

// Generate a 6-digit verification code
const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Initiate bag distribution
const initiateBagDistribution = async (req, res) => {
  try {
    console.log('Bag distribution request received:', {
      body: req.body,
      user: req.user
    });
    
    const { client_id, recipient_email, number_of_bags, notes } = req.body;
    
    // Check if user is authenticated
    if (!req.user || !req.user.id) {
      console.log('Authentication failed - no user or user ID');
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    const driver_id = req.user.id;

    console.log('Extracted data:', {
      client_id,
      recipient_email,
      number_of_bags,
      notes,
      driver_id
    });

    // Validate required fields
    if (!client_id || !recipient_email || !number_of_bags) {
      console.log('Validation failed - missing required fields');
      return res.status(400).json({
        success: false,
        error: 'Client ID, recipient email, and number of bags are required'
      });
    }

    // Validate data types
    if (typeof client_id !== 'string' && typeof client_id !== 'number') {
      console.log('Invalid client_id type:', typeof client_id);
      return res.status(400).json({
        success: false,
        error: 'Invalid client ID format'
      });
    }

    if (typeof number_of_bags !== 'number' || number_of_bags <= 0) {
      console.log('Invalid number_of_bags:', number_of_bags, typeof number_of_bags);
      return res.status(400).json({
        success: false,
        error: 'Number of bags must be a positive number'
      });
    }

    // Check if client exists
    const client = await User.findByPk(client_id);
    if (!client) {
      return res.status(404).json({
        success: false,
        error: 'Client not found'
      });
    }

    // Generate verification code
    const verificationCode = generateVerificationCode();

    // Create bag distribution record
    const bagDistribution = await Bag.create({
      client_id,
      recipient_email,
      number_of_bags,
      verification_code: verificationCode,
      driver_id,
      notes
    });

    console.log('Bag distribution record created:', bagDistribution.id);

    // Send verification code to recipient email (with timeout)
    let emailSent = false;
    try {
      // Add timeout wrapper for email sending
      const emailPromise = sendVerificationCode({ email: recipient_email }, false, verificationCode);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Email timeout')), 10000) // 10 second timeout
      );
      
      await Promise.race([emailPromise, timeoutPromise]);
      emailSent = true;
      console.log(`Verification code sent to ${recipient_email}`);
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      // Don't fail the entire request if email fails, just log it
      emailSent = false;
    }

    // Always return success response if bag distribution was created
    return res.status(200).json({
      success: true,
      message: emailSent 
        ? 'Bag distribution initiated and verification code sent'
        : 'Bag distribution initiated (email sending failed)',
      data: {
        distribution_id: bagDistribution.id,
        client_id,
        recipient_email,
        number_of_bags,
        verification_code: verificationCode,
        email_sent: emailSent
      }
    });

  } catch (error) {
    console.error('Error initiating bag distribution:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
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
    const bagDistribution = await Bag.findByPk(distribution_id);
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
    await bagDistribution.update({
      is_verified: true,
      verification_timestamp: new Date()
    });

    return res.status(200).json({
      success: true,
      message: 'Bag distribution verified successfully',
      data: {
        distribution_id: bagDistribution.id,
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
    const { page = 1, limit = 10, startDate, endDate } = req.query;

    // Validate client ID
    if (!client_id) {
      return res.status(400).json({
        success: false,
        error: 'Client ID is required'
      });
    }

    // Build query with date filters
    const { Op } = require('sequelize');
    const query = { client_id: parseInt(client_id) };
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt[Op.gte] = new Date(startDate);
      if (endDate) query.createdAt[Op.lte] = new Date(endDate);
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Find bag distributions for the client
    const bagDistributions = await Bag.findAll({
      where: query,
      include: [{ model: User, as: 'driver', attributes: ['name', 'email'] }],
      order: [['createdAt', 'DESC']],
      offset: skip,
      limit: parseInt(limit)
    });

    // Get total count
    const totalBags = await Bag.count({ where: query });

    return res.status(200).json({
      success: true,
      data: bagDistributions,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalBags / parseInt(limit)),
        totalBags,
        hasNext: skip + bagDistributions.length < totalBags,
        hasPrev: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Error fetching bag distribution history:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// Get current week's bag distribution history with search
const getCurrentWeekBagHistory = async (req, res) => {
  try {
    const { search, route_id } = req.query;
    const driver_id = req.user.id;

    // Calculate current week dates
    const now = new Date();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay())); // Sunday
    const endOfWeek = new Date(now.setDate(now.getDate() - now.getDay() + 6)); // Saturday
    startOfWeek.setHours(0, 0, 0, 0);
    endOfWeek.setHours(23, 59, 59, 999);

    // Build query for current week
    const { Op } = require('sequelize');
    const query = {
      createdAt: {
        [Op.gte]: startOfWeek,
        [Op.lte]: endOfWeek
      },
      is_verified: true // Only show verified distributions
    };

    // Add driver filter - drivers can see distributions they made
    if (req.user.role === 'driver') {
      query.driver_id = driver_id;
    }

    console.log('Bag history query:', query);

    // Find bag distributions with population
    let bagDistributions = await Bag.findAll({
      where: query,
      include: [
        { model: User, as: 'driver', attributes: ['name', 'email'] },
        { 
          model: User, 
          as: 'client', 
          attributes: ['name', 'email', 'phone', 'address', 'routeId'],
          include: [{ model: Route, as: 'route', attributes: ['name', 'path'] }]
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Filter by route if specified
    if (route_id) {
      bagDistributions = bagDistributions.filter(dist => 
        dist.client?.routeId?.toString() === route_id
      );
    }

    // Filter by search term if provided
    if (search) {
      const searchLower = search.toLowerCase();
      bagDistributions = bagDistributions.filter(dist => {
        const clientName = dist.client?.name?.toLowerCase() || '';
        const clientEmail = dist.client?.email?.toLowerCase() || '';
        const recipientEmail = dist.recipient_email?.toLowerCase() || '';
        const routeName = dist.client?.route?.name?.toLowerCase() || '';
        
        return clientName.includes(searchLower) || 
               clientEmail.includes(searchLower) || 
               recipientEmail.includes(searchLower) ||
               routeName.includes(searchLower);
      });
    }

    return res.status(200).json({
      success: true,
      data: bagDistributions,
      summary: {
        total_distributions: bagDistributions.length,
        total_bags: bagDistributions.reduce((sum, dist) => sum + dist.number_of_bags, 0),
        week_period: {
          start: startOfWeek.toISOString(),
          end: endOfWeek.toISOString()
        }
      }
    });

  } catch (error) {
    console.error('Error fetching current week bag history:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

module.exports = {
  initiateBagDistribution,
  verifyBagDistribution,
  getBagDistributionHistory,
  getCurrentWeekBagHistory
};