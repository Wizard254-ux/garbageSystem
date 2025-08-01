// routes/authRoutes.js
const express = require('express');
const { register, login, logout, getProfile, manageOrganization, manageOrganizationUsers, changePassword, sendDriverCredentials } = require('../controllers/authController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { uploadSingle, uploadMultiple, uploadMixedMiddleware } = require('../middleware/multer');
const { sendVerificationCode, verifyCode } = require('../services/mail');
const { manageRoutes } = require('../controllers/routeController.js');
const { User, Route } = require('../models');
const { createInitialPickup } = require("../services/pickupService");

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
      const client = await User.findOne({
        where: {
          id: req.params.userId,
          role: 'client',
          organizationId: req.user.id
        },
        attributes: { exclude: ['password'] }
      });

      if (!client) {
        return res.status(404).json({ success: false, error: 'Client not found' });
      }

      // Get route details if available
      let clientData = client.toJSON();
      if (clientData.routeId) {
        const route = await Route.findByPk(clientData.routeId);
        if (route) {
          clientData.route = {
            id: route.id,
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
      const driver = await User.findOne({
        where: {
          id: req.params.userId,
          role: 'driver',
          organizationId: req.user.id
        },
        attributes: { exclude: ['password'] }
      });

      if (!driver) {
        return res.status(404).json({ success: false, error: 'Driver not found' });
      }

      // Include full document paths
      const driverData = driver.toJSON();
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

// Edit driver with document management
router.put('/driver/:userId',
  authenticateToken,
  authorizeRoles(['organization']),
  uploadMultiple('documents', 10),
  async (req, res) => {
    try {
      const fs = require('fs');
      const path = require('path');

      const driver = await User.findOne({
        where: {
          id: req.params.userId,
          role: 'driver',
          organizationId: req.user.id
        }
      });

      if (!driver) {
        return res.status(404).json({ success: false, error: 'Driver not found' });
      }

      const { name, email, phone, isActive, documentsToDelete } = req.body;
      const updateData = {};

      if (name) updateData.name = name;
      if (email) updateData.email = email;
      if (phone) updateData.phone = phone;
      if (isActive !== undefined) updateData.isActive = isActive === 'true';

      // Handle document deletion
      let currentDocuments = [...(driver.documents || [])];
      if (documentsToDelete) {
        const docsToDelete = Array.isArray(documentsToDelete) ? documentsToDelete : [documentsToDelete];

        docsToDelete.forEach(docPath => {
          // Remove from array
          currentDocuments = currentDocuments.filter(doc => doc !== docPath);

          // Delete physical file
          try {
            const fullPath = path.join(__dirname, '..', docPath);
            if (fs.existsSync(fullPath)) {
              fs.unlinkSync(fullPath);
            }
          } catch (fileError) {
            console.error('Error deleting file:', fileError);
          }
        });
      }

      // Add new documents
      if (req.filePaths && req.filePaths.length > 0) {
        currentDocuments = [...currentDocuments, ...req.filePaths];
      }

      updateData.documents = currentDocuments;

      await driver.update(updateData);
      const updatedDriver = await User.findByPk(req.params.userId, {
        attributes: { exclude: ['password'] }
      });

      // Include full document paths in response
      const driverData = updatedDriver.toJSON();
      if (driverData.documents && driverData.documents.length > 0) {
        driverData.documents = driverData.documents.map(doc =>
          doc.startsWith('http') ? doc : `${req.protocol}://${req.get('host')}/${doc}`
        );
      }

      res.json({ success: true, message: 'Driver updated successfully', user: driverData });
    } catch (error) {
      console.error('Error updating driver:', error);
      res.status(500).json({ success: false, error: 'Server error' });
    }
  }
);

// Delete specific document from driver
router.delete('/driver/:userId/document',
  authenticateToken,
  authorizeRoles(['organization']),
  async (req, res) => {
    try {
      const fs = require('fs');
      const path = require('path');

      const { documentPath } = req.body;

      if (!documentPath) {
        return res.status(400).json({ success: false, error: 'Document path is required' });
      }

      const driver = await User.findOne({
        where: {
          id: req.params.userId,
          role: 'driver',
          organizationId: req.user.id
        }
      });

      if (!driver) {
        return res.status(404).json({ success: false, error: 'Driver not found' });
      }

      // Remove document from array
      const updatedDocuments = driver.documents.filter(doc => doc !== documentPath);

      // Delete physical file
      try {
        const fullPath = path.join(__dirname, '..', documentPath);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
      } catch (fileError) {
        console.error('Error deleting file:', fileError);
      }

      // Update driver
      await driver.update({ documents: updatedDocuments });
      const updatedDriver = await User.findByPk(req.params.userId, {
        attributes: { exclude: ['password'] }
      });

      res.json({ success: true, message: 'Document deleted successfully', user: updatedDriver });
    } catch (error) {
      console.error('Error deleting document:', error);
      res.status(500).json({ success: false, error: 'Server error' });
    }
  }
);

// Edit client with document management (FIXED - removed duplicate)
router.put('/client/:userId',
  authenticateToken,
  authorizeRoles(['organization']),
  uploadMultiple('documents', 10),
  async (req, res) => {
    try {
      const fs = require('fs');
      const path = require('path');

      const client = await User.findOne({
        where: {
          id: req.params.userId,
          role: 'client',
          organizationId: req.user.id
        }
      });

      if (!client) {
        return res.status(404).json({ success: false, error: 'Client not found' });
      }

      const { name, email, phone, address, routeId, pickUpDay, monthlyRate, clientType, serviceStartDate, gracePeriod, isActive, documentsToDelete } = req.body;
      const updateData = {};

      if (name) updateData.name = name;
      if (email) updateData.email = email;
      if (phone) updateData.phone = phone;
      if (address) updateData.address = address;
      if (routeId) updateData.routeId = routeId;
      if (pickUpDay) updateData.pickUpDay = pickUpDay;
      if (monthlyRate) updateData.monthlyRate = parseFloat(monthlyRate);
      if (clientType) updateData.clientType = clientType;
      if (serviceStartDate) updateData.serviceStartDate = serviceStartDate;
      if (gracePeriod) updateData.gracePeriod = parseInt(gracePeriod);
      if (isActive !== undefined) updateData.isActive = isActive === 'true';

      // Handle document deletion
      let currentDocuments = [...(client.documents || [])];
      if (documentsToDelete) {
        const docsToDelete = Array.isArray(documentsToDelete) ? documentsToDelete : [documentsToDelete];

        docsToDelete.forEach(docPath => {
          currentDocuments = currentDocuments.filter(doc => doc !== docPath);

          try {
            const fullPath = path.join(__dirname, '..', docPath);
            if (fs.existsSync(fullPath)) {
              fs.unlinkSync(fullPath);
            }
          } catch (fileError) {
            console.error('Error deleting file:', fileError);
          }
        });
      }

      // Add new documents
      if (req.filePaths && req.filePaths.length > 0) {
        currentDocuments = [...currentDocuments, ...req.filePaths];
      }

      updateData.documents = currentDocuments;

      await client.update(updateData);
      const updatedClient = await User.findByPk(req.params.userId, {
        attributes: { exclude: ['password'] }
      });

      // Include full document paths in response
      const clientData = updatedClient.toJSON();
      if (clientData.documents && clientData.documents.length > 0) {
        clientData.documents = clientData.documents.map(doc =>
          doc.startsWith('http') ? doc : `${req.protocol}://${req.get('host')}/${doc}`
        );
      }

      res.json({ success: true, message: 'Client updated successfully', client: clientData });
    } catch (error) {
      console.error('Error updating client:', error);
      res.status(500).json({ success: false, error: 'Server error' });
    }
  }
);

// Delete specific document from client (FIXED - removed duplicate)
router.delete('/client/:userId/document',
  authenticateToken,
  authorizeRoles(['organization']),
  async (req, res) => {
    try {
      const fs = require('fs');
      const path = require('path');

      const { documentPath } = req.body;

      if (!documentPath) {
        return res.status(400).json({ success: false, error: 'Document path is required' });
      }

      const client = await User.findOne({
        where: {
          id: req.params.userId,
          role: 'client',
          organizationId: req.user.id
        }
      });

      if (!client) {
        return res.status(404).json({ success: false, error: 'Client not found' });
      }

      // Remove document from array
      const updatedDocuments = client.documents.filter(doc => doc !== documentPath);

      // Delete physical file
      try {
        const fullPath = path.join(__dirname, '..', documentPath);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
      } catch (fileError) {
        console.error('Error deleting file:', fileError);
      }

      // Update client
      await client.update({ documents: updatedDocuments });
      const updatedClient = await User.findByPk(req.params.userId, {
        attributes: { exclude: ['password'] }
      });

      res.json({ success: true, message: 'Document deleted successfully', user: updatedClient });
    } catch (error) {
      console.error('Error deleting document:', error);
      res.status(500).json({ success: false, error: 'Server error' });
    }
  }
);

// Send verification code (FIXED - removed duplicate)
router.post('/send-verification-code',
  authenticateToken,
  async (req, res, next) => {
    try {
      await sendVerificationCode(req.user);
      res.status(200).json({
        message: 'Verification code sent successfully.',
      });
    } catch (error) {
      res.status(500).json({
        message: 'Failed to send verification code.',
        error: error.message
      });
    }
  }
);

// Verify code
router.post('/verify-code',
  authenticateToken,
  async (req, res, next) => {
    try {
      await verifyCode(req.user.email, req.body.verificationCode);
      res.status(200).json({
        message: 'Verification code verified successfully.',
      });
    } catch (error) {
      res.status(500).json({
        message: 'Failed to verify code.',
        error: error.message
      });
    }
  }
);

// Change password
router.post('/change-password', authenticateToken, changePassword);

// Send driver credentials
router.post('/send-driver-credentials',
  authenticateToken,
  authorizeRoles(['organization']),
  sendDriverCredentials
);

// Driver registers a new client (inactive by default)
router.post('/register/client-by-driver',
  authenticateToken,
  authorizeRoles(['driver']),
  uploadMultiple('documents', 5),
  async (req, res) => {
    try {
      const { name, email, phone, route, address, clientType, monthlyRate, serviceStartDate } = req.body;

      // Validate required fields
      if (!name || !email || !phone || !address || !route) {
        return res.status(400).json({
          success: false,
          error: 'Name, email, phone, route, address, and pickup day are required'
        });
      }

      const validRoute = await Route.findByPk(route);
      if (!validRoute) {
        return res.status(400).json({ message: 'Invalid route.' });
      }

      // Find the driver's organization
      const driver = await User.findByPk(req.user.id);
      if (!driver || !driver.organizationId) {
        return res.status(404).json({
          success: false,
          error: 'Driver organization not found'
        });
      }

      // Generate account number for client
      const accountNumber = `ACC${Date.now()}${Math.floor(Math.random() * 1000)}`;

      // Create client (inactive by default)
      const clientData = {
        name,
        email,
        phone,
        address,
        clientType: clientType || 'individual',
        monthlyRate: parseFloat(monthlyRate) || 0,
        serviceStartDate: serviceStartDate || new Date(),
        password: 'placeholder_' + Date.now(),
        routeId: validRoute.id,
        accountNumber,
        role: 'client',
        organizationId: driver.organizationId,
        isActive: false, // Inactive by default - organization will activate
        createdBy: driver.organizationId, // Track who created this client
        documents: req.filePaths || []
      };

      const newClient = await User.create(clientData);
      await createInitialPickup(newClient.id);

      res.status(201).json({
        success: true,
        message: 'Client registered successfully. Awaiting organization approval.',
        data: {
          client: {
            id: newClient.id,
            name: newClient.name,
            email: newClient.email,
            phone: newClient.phone,
            accountNumber: newClient.accountNumber,
            isActive: newClient.isActive
          }
        }
      });
    } catch (error) {
      console.error('Error registering client by driver:', error);
      res.status(500).json({
        success: false,
        error: 'Server error'
      });
    }
  }
);

// Routes management
router.post('/routes',
  authenticateToken,
  authorizeRoles(['organization']),
  (req, res, next) => {
    console.log('Routes request:', req.body);
    next();
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
);

module.exports = router;