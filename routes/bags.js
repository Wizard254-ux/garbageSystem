const express = require('express');
const { initiateBagDistribution, verifyBagDistribution, getBagDistributionHistory } = require('../controllers/BagController');
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

// Get bag distribution history for a client
router.get('/history/:client_id',
  authenticateToken,
  authorizeRoles(['organization', 'driver']),
  getBagDistributionHistory
);

module.exports = router;