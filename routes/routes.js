// routes/authRoutes.js
const express = require('express');
const {manageRoutes} =require('../controllers/routeController.js')
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const router = express.Router();

router.post('/',
  authenticateToken,
  authorizeRoles(["organization", "driver", "admin"]),
  (req,res,next)=>{
    console.log('Routes request:', req.body)
    next()
  },
  manageRoutes
)

module.exports = router;