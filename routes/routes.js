// routes/authRoutes.js
const express = require('express');
const {manageRoutes} =require('../controllers/routeController.js')
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const router = express.Router();

router.post('/',
  authenticateToken,
  authorizeRoles('organization'),
  (req,res,next)=>{
    console.log('hhhggbb',req.body)
    next()
  },
  manageRoutes
)

module.exports = router;