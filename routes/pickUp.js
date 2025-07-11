// routes/authRoutes.js
const express = require('express');
const {batchMarkUnpicked,markPicked,getUsersByPickupStatus} =require('../controllers/PickUpController.js')
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const router = express.Router();

router.post('/mark-picked',
  authenticateToken,
    authorizeRoles('organization', 'driver'),
    markPicked
)
router.get('/:routeId/:pickStatus',
  authenticateToken,
    authorizeRoles('organization', 'driver'),
    getUsersByPickupStatus
)

router.post('/batch-mark-unpicked', async (req, res) => {
  try {
    await batchMarkUnpicked();
    return res.status(200).json({
      success: true,
      message: 'Batch job completed successfully'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Batch job failed'
    });
  }
});


module.exports = router;