// routes/authRoutes.js
const express = require('express');
const { register, login, logout, getProfile, manageOrganization, manageOrganizationUsers, changePassword, sendDriverCredentials } = require('../controllers/authController');
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
  uploadMultiple('documents', 10),
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
      const Route = require('../models/Route');
      
      const client = await User.findOne({
        _id: req.params.userId,
        role: 'client',
        organizationId: req.user._id
      }).select('-password');
      
      if (!client) {
        return res.status(404).json({ success: false, error: 'Client not found' });
      }
      
      // Get route details if available
      let clientData = client.toObject();
      if (clientData.route) {
        const route = await Route.findById(clientData.route);
        if (route) {
          clientData.route = {
            _id: route._id,
            name: route.name,
            path: route.path
          };
        }
      }
      
      // Include full document paths
      if (clientData.documents && clientData.documents.length > 0) {
        clientData.documents = clientData.documents.map(doc => 
          doc.startsWith('http') ? doc : `${req.protocol}://${req.get('host')}/${doc}`
        );
      }
      
      res.json({ success: true, client: clientData });
    } catch (error) {
      console.error('Error fetching client details:', error);
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
      
      // Include full document paths
      const driverData = driver.toObject();
      if (driverData.documents && driverData.documents.length > 0) {
        driverData.documents = driverData.documents.map(doc => 
          doc.startsWith('http') ? doc : `${req.protocol}://${req.get('host')}/${doc}`
        );
      }
      
      res.json({ success: true, user: driverData });
    } catch (error) {
      console.error('Error fetching driver details:', error);
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
router.post('/change-password', authenticateToken, changePassword);

// Send driver credentials
router.post('/send-driver-credentials', 
  authenticateToken, 
  authorizeRoles(['organization']), 
  sendDriverCredentials
);

router.post('/routes',
  authenticateToken,
  authorizeRoles(['organization']),
  (req,res,next)=>{
    console.log('Routes request:', req.body)
    next()
  },
  manageRoutes
);

// Get organization invoices - shortcut route
router.get('/invoices', 
  authenticateToken, 
  authorizeRoles(['organization']),
  (req, res, next) => {
    // Forward to the invoices route
    res.redirect(307, `/api/invoices${req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''}`);
  }
)

module.exports = router;
