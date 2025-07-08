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
  authorizeRoles('admin'), 
  uploadMultiple('documents', 5),
  register
);
router.post('/register/client', 
  authenticateToken, 
  authorizeRoles('organization'), 
  uploadMultiple('documents', 5),
  register
);

// Organizations can create drivers
router.post('/register/driver', 
  authenticateToken, 
  authorizeRoles('organization'), 
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
  authorizeRoles('admin'), 
  manageOrganization
);

router.post('/organization/users/manage', 
  authenticateToken, 
  authorizeRoles('organization'), 
  manageOrganizationUsers
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
  authorizeRoles('organization'),
  (req,res,next)=>{
    console.log('hhhggbb',req.body)
    next()
  },
  manageRoutes
)

module.exports = { authRoutes: router };
