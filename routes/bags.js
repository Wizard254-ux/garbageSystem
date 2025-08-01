const { Op } = require('sequelize');
const express = require('express');
const { initiateBagDistribution, verifyBagDistribution, getBagDistributionHistory, getCurrentWeekBagHistory } = require('../controllers/BagController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const router = express.Router();

// Initiate bag distribution
router.post('/distribute',
  authenticateToken,
  authorizeRoles(['driver']),
  initiateBagDistribution
);

// Verify bag distribution with code
router.post('/verify',
  authenticateToken,
  authorizeRoles(['driver']),
  verifyBagDistribution
);

// Get all bag distribution history (for organization)
router.get('/history',
  authenticateToken,
  authorizeRoles(['organization']),
  async (req, res) => {
    try {
      const { page = 1, limit = 20, startDate, endDate, clientId } = req.query;

      // Build query with date filters
      const { Op } = require('sequelize');
      const query = {};
      
      if (clientId) {
        query.client_id = parseInt(clientId);
      }
      
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt[Op.gte] = new Date(startDate);
        if (endDate) query.createdAt[Op.lte] = new Date(endDate);
      }

      // Calculate pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const Bag = require('../models/Bag');
      const User = require('../models/User');

      // Find all bag distributions
      const bagDistributions = await Bag.findAll({
        where: query,
        include: [
          { model: User, as: 'driver', attributes: ['id', 'name', 'email'] },
          { model: User, as: 'client', attributes: ['id', 'name', 'email', 'phone', 'address', 'accountNumber'] }
        ],
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
      console.error('Error fetching all bag distribution history:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

// Get bag distribution history for a client
router.get('/history/:client_id',
  authenticateToken,
  authorizeRoles(['organization', 'driver']),
  getBagDistributionHistory
);

// Get current week's bag distribution history with search
router.get('/current-week',
  authenticateToken,
  authorizeRoles(['driver']),
  getCurrentWeekBagHistory
);

// Get clients eligible for bag distribution (haven't received bags this week)
router.get('/eligible-clients',
  authenticateToken,
  authorizeRoles(['driver']),
  async (req, res) => {
    try {
      const { route_id } = req.query;
      const User = require('../models/User');
      const Bag = require('../models/Bag');
      
      // Calculate current week dates
      const now = new Date();
      const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay())); // Sunday
      const endOfWeek = new Date(now.setDate(now.getDate() - now.getDay() + 6)); // Saturday
      startOfWeek.setHours(0, 0, 0, 0);
      endOfWeek.setHours(23, 59, 59, 999);

      // Get all clients that have received bags this week
      const bagsThisWeek = await Bag.findAll({ 
        where: {
          createdAt: {
            [Op.gte]: startOfWeek,
            [Op.lte]: endOfWeek
          },
          is_verified: true
        },
        attributes: ['client_id'],
        group: ['client_id']
      });
      const clientsWithBags = bagsThisWeek.map(bag => bag.client_id);

      // Build query for clients without bags this week
      const clientQuery = {
        role: 'client',
        isActive: true,
        id: { [Op.notIn]: clientsWithBags } // Exclude clients who already got bags
      };

      // Filter by route if specified
      if (route_id) {
        clientQuery.routeId = route_id;
      }

      // Find eligible clients
      const eligibleClients = await User.findAll({
        where: clientQuery,
        include: [{ model: require('../models/Route'), as: 'route', attributes: ['id', 'name', 'path'] }],
        attributes: ['id', 'name', 'email', 'phone', 'address', 'routeId', 'accountNumber'],
        order: [['name', 'ASC']]
      });

      return res.status(200).json({
        success: true,
        data: eligibleClients,
        summary: {
          total_eligible: eligibleClients.length,
          route_filter: route_id ? true : false,
          week_period: {
            start: startOfWeek.toISOString(),
            end: endOfWeek.toISOString()
          }
        }
      });

    } catch (error) {
      console.error('Error fetching eligible clients:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

module.exports = router;