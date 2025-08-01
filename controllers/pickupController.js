const { Pickup, User, Route } = require('../models');
const { Op } = require('sequelize');
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
      pickupDay,
      bags // New filter for bags count
    } = req.query;

    // Use forced status if regular status is undefined
    const finalStatus = status || req.forceStatus;

    // Build query
    const query = {};

    console.log('Raw req.query object:', req.query);
    console.log('Destructured status:', status);
    console.log('Force status from req:', req.forceStatus);
    console.log('Final status to use:', finalStatus);
    console.log('Query params:', { 
      page,
      limit,
      startDate,
      endDate,
      status: finalStatus,
      routeId,
      pickupDay,
      bags,
      userRole: req.user?.role 
    });
    
    // Drivers can see all pickups since any driver can work on any route/pickup
    
    // Date range filter - Default to current week if no dates provided
    if (startDate || endDate) {
      const dateFilter = {};
      if (startDate) dateFilter[Op.gte] = new Date(startDate);
      if (endDate) dateFilter[Op.lte] = new Date(endDate);
      query.scheduledDate = dateFilter;
    } else {
      // Default filter: current week only
      const now = new Date();
      const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay())); // Sunday
      const endOfWeek = new Date(now.setDate(now.getDate() - now.getDay() + 6)); // Saturday
      startOfWeek.setHours(0, 0, 0, 0);
      endOfWeek.setHours(23, 59, 59, 999);
      
      query.scheduledDate = {
        [Op.gte]: startOfWeek,
        [Op.lte]: endOfWeek
      };
      
      console.log('Applied current week filter:', {
        startOfWeek: startOfWeek.toISOString(),
        endOfWeek: endOfWeek.toISOString()
      });
    }
    
    // Status filter
    if (finalStatus && finalStatus !== 'all') {
      if (finalStatus === 'picked') {
        query.status = 'completed';
      } else if (finalStatus === 'unpicked') {
        query.status = {
          [Op.in]: ['pending', 'assigned', 'in_progress', 'scheduled']
        };
      } else {
        query.status = finalStatus;
      }
    }
    
    // Route filter
    if (routeId) {
      query.routeId = routeId;
    }
    

    
    // Pickup day filter
    if (pickupDay) {
      query.pickupDay = pickupDay.toLowerCase();
    }
    
    // Bags filter
    if (bags) {
      if (bags === 'collected') {
        query.bagsCollected = { [Op.gt]: 0 };
      } else if (bags === 'not_collected') {
        query[Op.or] = [
          { bagsCollected: { [Op.eq]: 0 } },
          { bagsCollected: { [Op.eq]: null } }
        ];
      }
    }

    console.log('Final Sequelize query:', JSON.stringify(query, null, 2));

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get pickups with pagination
    const pickups = await Pickup.findAll({
      where: query,
      order: [['scheduledDate', 'DESC']],
      offset: skip,
      limit: parseInt(limit),
      include: [
        { model: User, as: 'user', attributes: ['name', 'email', 'phone', 'address', 'accountNumber'] },
        { model: Route, as: 'route', attributes: ['name', 'path'] },
        { model: User, as: 'driver', attributes: ['name', 'email', 'phone'] }
      ]
    });
    
    // Get total count
    const totalPickups = await Pickup.count({ where: query });
    console.log('Total pickups:', totalPickups, 'Found:', pickups.length)
    
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
    const pickup = await Pickup.create({
      userId,
      routeId,
      scheduledDate: new Date(scheduledDate),
      pickupDay: pickupDay.toLowerCase(),
      weekOf
    });
    
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
    const { status, notes } = req.body;
    const driverId = req.user.id
    
    const pickup = await Pickup.findByPk(id, {
      include: [{ model: Route, as: 'route' }]
    });
    console.log(status, driverId, notes)

    if(!driverId){
      return res.status(400).json({"message": "driver id required"})
    }
    
    if (!pickup) {
      return res.status(404).json({
        success: false,
        error: 'Pickup not found'
      });
    }

    // Check if driver is active on this route (only for completed status)
    if (status === 'completed' && pickup.routeId) {
      const route = await Route.findByPk(pickup.routeId);
      if (!route) {
        return res.status(404).json({
          success: false,
          error: 'Route not found'
        });
      }
      
      // Only the active driver on this route can mark pickups as completed
      if (!route.activeDriverId || route.activeDriverId.toString() !== driverId.toString()) {
        return res.status(403).json({
          success: false,
          error: 'You must be the active driver on this route to mark pickups as completed',
          requiredAction: 'Please activate yourself on this route first'
        });
      }
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
    const routes = await Route.findAll({
      where: { isActive: true },
      attributes: ['id', 'name', 'path']
    });
    
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
    const drivers = await User.findAll({ 
      where: {
        role: 'driver',
        isActive: true 
      },
      attributes: ['id', 'name']
    });
    
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

// Get pickups by specific route
const getPickupsByRoute = async (req, res) => {
  try {
    const { routeId } = req.params;
    const { 
      page = 1, 
      limit = 10,
      status,
      startDate,
      endDate,
      bags
    } = req.query;

    // Build query
    const query = { routeId };
    
    // Drivers can see all pickups on any route since any driver can work anywhere
    
    // Date range filter - Default to current week if no dates provided
    if (startDate || endDate) {
      const dateFilter = {};
      if (startDate) dateFilter[Op.gte] = new Date(startDate);
      if (endDate) dateFilter[Op.lte] = new Date(endDate);
      query.scheduledDate = dateFilter;
    } else {
      // Default filter: current week only
      const now = new Date();
      const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay())); // Sunday
      const endOfWeek = new Date(now.setDate(now.getDate() - now.getDay() + 6)); // Saturday
      startOfWeek.setHours(0, 0, 0, 0);
      endOfWeek.setHours(23, 59, 59, 999);
      
      query.scheduledDate = {
        [Op.gte]: startOfWeek,
        [Op.lte]: endOfWeek
      };
      
      console.log('Applied current week filter for route pickups:', {
        startOfWeek: startOfWeek.toISOString(),
        endOfWeek: endOfWeek.toISOString()
      });
    }
    
    // Status filter
    if (status && status !== 'all') {
      if (status === 'picked') {
        query.status = 'completed';
      } else if (status === 'unpicked') {
        query.status = { [Op.in]: ['pending', 'assigned', 'in_progress', 'scheduled'] };
      } else {
        query.status = status;
      }
    }
    
    // Bags filter
    if (bags) {
      if (bags === 'collected') {
        query.bagsCollected = { [Op.gt]: 0 };
      } else if (bags === 'not_collected') {
        query[Op.or] = [
          { bagsCollected: { [Op.eq]: 0 } },
          { bagsCollected: { [Op.eq]: null } }
        ];
      }
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get pickups with pagination
    const pickups = await Pickup.findAll({
      where: query,
      order: [['scheduledDate', 'DESC']],
      offset: skip,
      limit: parseInt(limit),
      include: [
        { model: User, as: 'user', attributes: ['name', 'email', 'phone', 'address', 'accountNumber'] },
        { model: Route, as: 'route', attributes: ['name', 'path'] },
        { model: User, as: 'driver', attributes: ['name', 'email', 'phone'] }
      ]
    });
    
    // Get total count
    const totalPickups = await Pickup.count({ where: query });
    
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
    console.error('Error fetching pickups by route:', error);
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
  getDrivers,
  getPickupsByRoute
};
