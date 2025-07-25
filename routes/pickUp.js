const express = require('express');
const { 
  getPickups, 
  createPickup, 
  createWeeklyPickups,
  markMissedPickups,
  updatePickupStatus,
  getRoutes,
  getDrivers
} = require('../controllers/pickupController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

const router = express.Router();

// Get all pickups with filtering
router.get('/', 
  authenticateToken,
  authorizeRoles(['admin', 'organization']),
  getPickups
);

// Create pickup
router.post('/', 
  authenticateToken,
  authorizeRoles(['admin', 'organization']),
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
  authorizeRoles(['admin', 'organization']),
  getRoutes
);

// Get drivers for dropdown
router.get('/drivers', 
  authenticateToken,
  authorizeRoles(['admin', 'organization']),
  getDrivers
);

module.exports = router;