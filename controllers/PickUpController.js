const Pickup = require('../models/Pickup');
const User = require('../models/User');
const Route = require('../models/Route');
const pickupService = require('../services/pickupService');

// Get all pickups with filtering
const getPickups = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      startDate, 
      endDate, 
      status, 
      routeId,
      driverId,
      pickupDay 
    } = req.query;

    // Build query
    const query = {};
    
    // Date range filter
    if (startDate || endDate) {
      query.scheduledDate = {};
      if (startDate) query.scheduledDate.$gte = new Date(startDate);
      if (endDate) query.scheduledDate.$lte = new Date(endDate);
    }
    
    // Status filter
    if (status && status !== 'all') {
      query.status = status;
    }
    
    // Route filter
    if (routeId) {
      query.routeId = routeId;
    }
    
    // Driver filter
    if (driverId) {
      if (driverId === 'unassigned') {
        query.driverId = null;
      } else {
        query.driverId = driverId;
      }
    }
    
    // Pickup day filter
    if (pickupDay) {
      query.pickupDay = pickupDay.toLowerCase();
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get pickups with pagination
    const pickups = await Pickup.find(query)
      .sort({ scheduledDate: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('userId', 'name email phone address accountNumber')
      .populate('routeId', 'name path')
      .populate('driverId', 'name email phone');
    
    // Get total count
    const totalPickups = await Pickup.countDocuments(query);
    
    res.status(200).json({
      success: true,
      data: pickups,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalPickups / parseInt(limit)),
        totalPickups,
        hasNext: skip + pickups.length < totalPickups,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Error fetching pickups:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// Create pickup
const createPickup = async (req, res) => {
  try {
    const { userId, routeId, scheduledDate, pickupDay } = req.body;
    
    // Validate required fields
    if (!userId || !routeId || !scheduledDate || !pickupDay) {
      return res.status(400).json({
        success: false,
        error: 'userId, routeId, scheduledDate, and pickupDay are required'
      });
    }
    
    // Get the week of the scheduled date
    const weekOf = pickupService.getStartOfWeek(new Date(scheduledDate));
    
    // Create pickup
    const pickup = new Pickup({
      userId,
      routeId,
      scheduledDate: new Date(scheduledDate),
      pickupDay: pickupDay.toLowerCase(),
      weekOf
    });
    
    await pickup.save();
    
    res.status(201).json({
      success: true,
      data: pickup
    });
  } catch (error) {
    console.error('Error creating pickup:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// Create weekly pickups for all active clients
const createWeeklyPickups = async (req, res) => {
  try {
    const pickups = await pickupService.createWeeklyPickups();
    
    res.status(201).json({
      success: true,
      message: `Created ${pickups.length} pickups for the current week`,
      data: pickups
    });
  } catch (error) {
    console.error('Error creating weekly pickups:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// Mark missed pickups from previous week
const markMissedPickups = async (req, res) => {
  try {
    const missedPickups = await pickupService.markMissedPickups();
    
    res.status(200).json({
      success: true,
      message: `Marked ${missedPickups.length} pickups as missed`,
      data: missedPickups
    });
  } catch (error) {
    console.error('Error marking missed pickups:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// Update pickup status
const updatePickupStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, driverId, notes } = req.body;
    
    const pickup = await Pickup.findById(id);
    
    if (!pickup) {
      return res.status(404).json({
        success: false,
        error: 'Pickup not found'
      });
    }
    
    // Update fields
    if (status) {
      pickup.status = status;
      if (status === 'completed') {
        pickup.completedAt = new Date();
      }
    }
    
    if (driverId) {
      pickup.driverId = driverId;
    }
    
    if (notes) {
      pickup.notes = notes;
    }
    
    await pickup.save();
    
    res.status(200).json({
      success: true,
      data: pickup
    });
  } catch (error) {
    console.error('Error updating pickup:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// Get routes for dropdown
const getRoutes = async (req, res) => {
  try {
    const routes = await Route.find({ isActive: true }).select('_id name path');
    
    res.status(200).json({
      success: true,
      data: routes
    });
  } catch (error) {
    console.error('Error fetching routes:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// Get drivers for dropdown
const getDrivers = async (req, res) => {
  try {
    const drivers = await User.find({ 
      role: 'driver',
      isActive: true 
    }).select('_id name');
    
    res.status(200).json({
      success: true,
      data: drivers
    });
  } catch (error) {
    console.error('Error fetching drivers:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

module.exports = {
  getPickups,
  createPickup,
  createWeeklyPickups,
  markMissedPickups,
  updatePickupStatus,
  getRoutes,
  getDrivers
};