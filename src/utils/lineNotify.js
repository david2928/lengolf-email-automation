const axios = require('axios');
const { log } = require('./logging');

class LineNotifyService {
  constructor(token) {
    if (!token) {
      log('ERROR', 'LINE token not provided', { 
        envKeys: Object.keys(process.env)
          .filter(key => key.startsWith('LINE_TOKEN'))
          .join(', ')
      });
      throw new Error('LINE token is required');
    }
    this.token = token;
    this.client = axios.create({
      baseURL: 'https://notify-api.line.me/api',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
  }

  async validateToken() {
    try {
      const response = await this.client.get('/status');
      log('INFO', 'LINE token validated successfully', {
        status: response.status,
        tokenPrefix: this.token.substring(0, 4) + '...'
      });
      return true;
    } catch (error) {
      log('ERROR', 'LINE token validation failed', {
        error: error.message,
        status: error.response?.status,
        tokenPrefix: this.token.substring(0, 4) + '...'
      });
      return false;
    }
  }

  async send(message) {
    try {
      // Validate token before sending
      const isValid = await this.validateToken();
      if (!isValid) {
        throw new Error('LINE token is invalid');
      }

      const response = await this.client.post('/notify', new URLSearchParams({
        message
      }));

      log('INFO', 'LINE notification sent successfully', {
        status: response.status
      });

      return response;
    } catch (error) {
      const errorDetails = {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
        tokenPrefix: this.token.substring(0, 4) + '...'
      };

      // Log specific error messages based on status code
      if (error.response?.status === 401) {
        log('ERROR', 'LINE notification failed - Invalid token or unauthorized', errorDetails);
      } else if (error.response?.status === 400) {
        log('ERROR', 'LINE notification failed - Bad request', errorDetails);
      } else {
        log('ERROR', 'LINE notification failed', errorDetails);
      }

      throw error;
    }
  }
}

module.exports = { LineNotifyService };