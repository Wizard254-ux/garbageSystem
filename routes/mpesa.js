const express = require('express');
const { 
  initiateSTKPush, 
  c2bValidation, 
  c2bConfirmation 
} = require('../controllers/mpesaController');

const router = express.Router();

// Initiate STK Push
router.post('/stk-push', initiateSTKPush);

// M-Pesa Callbacks (no authentication required)
router.post('/c2b-validation', c2bValidation);
router.post('/c2b-confirmation', c2bConfirmation);

module.exports = router;