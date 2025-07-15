const axios = require('axios');

class MpesaService {
  constructor() {
    this.consumerKey = process.env.MPESA_CONSUMER_KEY;
    this.consumerSecret = process.env.MPESA_CONSUMER_SECRET;
    this.businessShortCode = process.env.MPESA_BUSINESS_SHORTCODE;
    this.passkey = process.env.MPESA_PASSKEY;
    this.callbackUrl = process.env.MPESA_CALLBACK_URL;
    this.confirmationUrl = process.env.MPESA_CONFIRMATION_URL;
    this.validationUrl = process.env.MPESA_VALIDATION_URL;
    this.baseUrl = process.env.MPESA_ENVIRONMENT === 'production' 
      ? 'https://api.safaricom.co.ke' 
      : 'https://sandbox.safaricom.co.ke';
  }

  // Get OAuth token
  async getAccessToken() {
    try {
      const auth = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
      
      const response = await axios.get(`${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
        headers: {
          'Authorization': `Basic ${auth}`
        }
      });

      return response.data.access_token;
    } catch (error) {
      console.error('Error getting M-Pesa access token:', error);
      throw new Error('Failed to get M-Pesa access token');
    }
  }

  // Generate timestamp
  generateTimestamp() {
    const now = new Date();
    return now.getFullYear() +
           String(now.getMonth() + 1).padStart(2, '0') +
           String(now.getDate()).padStart(2, '0') +
           String(now.getHours()).padStart(2, '0') +
           String(now.getMinutes()).padStart(2, '0') +
           String(now.getSeconds()).padStart(2, '0');
  }

  // Generate password
  generatePassword(timestamp) {
    const data = this.businessShortCode + this.passkey + timestamp;
    return Buffer.from(data).toString('base64');
  }

  // STK Push (Lipa na M-Pesa Online) - using C2B confirmation URL
  async stkPush(phoneNumber, amount, accountReference, transactionDesc) {
    try {
      const accessToken = await this.getAccessToken();
      const timestamp = this.generateTimestamp();
      const password = this.generatePassword(timestamp);

      const requestBody = {
        BusinessShortCode: this.businessShortCode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: amount,
        PartyA: phoneNumber,
        PartyB: this.businessShortCode,
        PhoneNumber: phoneNumber,
        CallBackURL: this.confirmationUrl, // Use C2B confirmation URL instead
        AccountReference: accountReference,
        TransactionDesc: transactionDesc
      };

      const response = await axios.post(
        `${this.baseUrl}/mpesa/stkpush/v1/processrequest`,
        requestBody,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('STK Push error:', error.response?.data || error.message);
      throw new Error('STK Push failed');
    }
  }

  // Register C2B URLs
  async registerC2BUrls() {
    try {
      const accessToken = await this.getAccessToken();

      const requestBody = {
        ShortCode: this.businessShortCode,
        ResponseType: 'Completed',
        ConfirmationURL: this.confirmationUrl,
        ValidationURL: this.validationUrl
      };

      const response = await axios.post(
        `${this.baseUrl}/mpesa/c2b/v1/registerurl`,
        requestBody,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('C2B URL registration error:', error.response?.data || error.message);
      throw new Error('C2B URL registration failed');
    }
  }
}

module.exports = new MpesaService();