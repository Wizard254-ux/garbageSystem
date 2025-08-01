const express = require('express');
const { 
  getPickups, 
  createPickup, 
  createWeeklyPickups,
  markMissedPickups,
  updatePickupStatus,
  getRoutes,
  getDrivers,
  getPickupsByRoute
} = require('../controllers/pickupController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const router = express.Router();

// Get all pickups with filtering
router.get('/', 
  authenticateToken,
  authorizeRoles(['admin', 'organization','driver']),
  getPickups
);

// Routes specifically for the Android driver app
router.get('/all/picked', 
  authenticateToken,
  authorizeRoles(['driver']),
  (req, res, next) => {
    console.log('Before setting - req.query:', req.query);
    // Try both approaches
    req.query.status = 'picked';
    req.forceStatus = 'picked';
    console.log('After setting - req.query:', req.query);
    console.log('Force status:', req.forceStatus);
    next();
  },
  getPickups
);

router.get('/all/unpicked', 
  authenticateToken,
  authorizeRoles(['driver']),
  (req, res, next) => {
    console.log('Before setting - req.query:', req.query);
    // Try both approaches
    req.query.status = 'unpicked';
    req.forceStatus = 'unpicked';
    console.log('After setting - req.query:', req.query);
    console.log('Force status:', req.forceStatus);
    next();
  },
  getPickups
);

// Get pickups with bags collected
router.get('/all/bags', 
  authenticateToken,
  authorizeRoles(['driver']),
  (req, res, next) => {
    req.query.bags = 'collected';
    next();
  },
  getPickups
);

// Get all pickups (without status filter)
router.get('/all', 
  authenticateToken,
  authorizeRoles(['driver']),
  getPickups
);

// Create pickup
router.post('/', 
  authenticateToken,
  authorizeRoles(['admin', 'organization','driver']),
  createPickup
);

// Create weekly pickups
router.post('/weekly', 
  authenticateToken,
  authorizeRoles(['admin', 'organization']),
  createWeeklyPickups
);

// Mark missed pickups
router.post('/mark-missed', 
  authenticateToken,
  authorizeRoles(['admin', 'organization']),
  markMissedPickups
);

// Update pickup status
router.put('/:id', 
  authenticateToken,
  authorizeRoles(['admin', 'organization', 'driver']),
  updatePickupStatus
);

// Get routes for dropdown
router.get('/routes', 
  authenticateToken,
  authorizeRoles(['admin', 'organization','driver']),
  getRoutes
);

// Get drivers for dropdown
router.get('/drivers', 
  authenticateToken,
  authorizeRoles(['admin', 'organization']),
  getDrivers
);

// Get pickups by specific route (for drivers)
router.get('/route/:routeId', 
  authenticateToken,
  authorizeRoles(['admin', 'organization', 'driver']),
  getPickupsByRoute
);

module.exports = router;