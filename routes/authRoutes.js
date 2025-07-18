// routes/authRoutes.js
const express = require('express');
const { register, login, logout, getProfile,manageOrganization,manageOrganizationUsers  ,changePassword} = require('../controllers/authController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { uploadSingle, uploadMultiple, uploadMixedMiddleware } = require('../middleware/multer');
const { sendVerificationCode,verifyCode } = require('../services/mail');
const {manageRoutes} =require('../controllers/routeController.js')

const router = express.Router();

// Public routes
router.post('/login', login);
router.post('/logout', logout);

// Protected routes
router.get('/profile', authenticateToken, getProfile);

// Admin can create organizations
router.post('/register/organization', 
  authenticateToken, 
  authorizeRoles(['admin']),
  uploadMultiple('documents', 5),
  register
);
router.post('/register/client', 
  authenticateToken, 
  authorizeRoles(['organization']),
  uploadMultiple('documents', 5),
  register
);

// Organizations can create drivers
router.post('/register/driver', 
  authenticateToken, 
  authorizeRoles(['organization']),
  uploadMultiple('documents', 5),
  register
);

// Admin can create any user type (for initial setup)
router.post('/register', 
      uploadMultiple('documents', 5),
      register
);


router.post('/organization/manage', 
  authenticateToken, 
  authorizeRoles(['admin']), 
  manageOrganization
);

router.post('/organization/users/manage', 
  authenticateToken, 
  authorizeRoles(['organization']), 
  manageOrganizationUsers
);

// Get clients list
router.get('/clients', 
  authenticateToken, 
  authorizeRoles(['organization']),
  (req, res, next) => {
    req.body = { action: 'list', userType: 'client' };
    next();
  },
  manageOrganizationUsers
);

// Get drivers list
router.get('/drivers', 
  authenticateToken, 
  authorizeRoles(['organization']), 
  (req, res, next) => {
    req.body = { action: 'list', userType: 'driver' };
    next();
  },
  manageOrganizationUsers
);

// Get specific client
router.get('/client/:userId', 
  authenticateToken, 
  authorizeRoles(['organization']),
  async (req, res) => {
    try {
      const User = require('../models/User');
      const client = await User.findOne({
        _id: req.params.userId,
        role: 'client',
        organizationId: req.user._id
      }).select('-password');
      
      if (!client) {
        return res.status(404).json({ success: false, error: 'Client not found' });
      }
      
      res.json({ success: true, data: client });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Server error' });
    }
  }
);

// Get specific driver
router.get('/driver/:userId', 
  authenticateToken, 
  authorizeRoles(['organization']),
  async (req, res) => {
    try {
      const User = require('../models/User');
      const driver = await User.findOne({
        _id: req.params.userId,
        role: 'driver',
        organizationId: req.user._id
      }).select('-password');
      
      if (!driver) {
        return res.status(404).json({ success: false, error: 'Driver not found' });
      }
      
      res.json({ success: true, data: driver });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Server error' });
    }
  }
);
router.post('/send-verification-code', 
  authenticateToken, 
  async(req, res, next) => {
    try{
      await sendVerificationCode(req.user)
      res.status(200).json({
        message: 'Verification code sent successfully.',
      })

  }catch(error){
      res.status(500).json({
        message: 'Failed to send verification code.',
        error: error.message
      });
    }
  }
);

// POST /api/auth/verify-code - Verify code (optional)
router.post('/verify-code',authenticateToken,   async(req, res, next) => {
    try{
     await verifyCode(req.user.email, req.body.verificationCode)
      res.status(200).json({
        message: 'Verification code sent successfully.',
      })

  }catch(error){
      res.status(500).json({
        message: 'Failed to send verification code.',
        error: error.message
      });
    }
  });

// POST /api/auth/change-password - Change password with verification
router.post('/change-password', authenticateToken,changePassword);
router.post('/routes',
  authenticateToken,
  authorizeRoles(['organization']),
  (req,res,next)=>{
    console.log('hhhggbb',req.body)
    next()
  },
  manageRoutes
)

module.exports = router;
