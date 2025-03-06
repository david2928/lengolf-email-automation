const axios = require('axios');
const { log } = require('./logging');

class LineNotifyService {
  constructor(token, tokenType) {
    this.tokenType = tokenType; // e.g., 'B2B', 'B2C', etc.
    
    // Check if token exists
    if (!token) {
      const availableTokens = Object.entries(process.env)
        .filter(([key]) => key.startsWith('LINE_TOKEN'))
        .map(([key, value]) => ({
          key,
          prefix: value ? value.substring(0, 4) + '...' : 'undefined'
        }));

      log('ERROR', 'LINE token not provided', { 
        tokenType,
        availableTokens
      });
      throw new Error(`LINE token for ${tokenType} is required`);
    }

    this.token = token;
    this.client = axios.create({
      baseURL: 'https://notify-api.line.me/api',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    // Log token info on initialization
    log('INFO', 'Initializing LINE service', {
      tokenType,
      tokenPrefix: token.substring(0, 4) + '...',
      envKey: Object.keys(process.env)
        .find(key => process.env[key] === token)
    });
  }

  async validateToken() {
    try {
      const response = await this.client.get('/status');
      log('INFO', 'LINE token validated successfully', {
        tokenType: this.tokenType,
        status: response.status,
        tokenPrefix: this.token.substring(0, 4) + '...'
      });
      return true;
    } catch (error) {
      const errorDetails = {
        tokenType: this.tokenType,
        error: error.message,
        status: error.response?.status,
        tokenPrefix: this.token.substring(0, 4) + '...',
        envKey: Object.keys(process.env)
          .find(key => process.env[key] === this.token)
      };

      if (error.response?.status === 401) {
        log('ERROR', 'LINE token is unauthorized or expired', errorDetails);
      } else {
        log('ERROR', 'LINE token validation failed', errorDetails);
      }
      return false;
    }
  }

  async send(message) {
    try {
      // Validate token before sending
      const isValid = await this.validateToken();
      if (!isValid) {
        throw new Error(`LINE token for ${this.tokenType} is invalid`);
      }

      const response = await this.client.post('/notify', new URLSearchParams({
        message
      }));

      log('INFO', 'LINE notification sent successfully', {
        tokenType: this.tokenType,
        status: response.status,
        tokenPrefix: this.token.substring(0, 4) + '...'
      });

      return response;
    } catch (error) {
      const errorDetails = {
        tokenType: this.tokenType,
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
        tokenPrefix: this.token.substring(0, 4) + '...',
        envKey: Object.keys(process.env)
          .find(key => process.env[key] === this.token)
      };

      if (error.response?.status === 401) {
        log('ERROR', 'LINE notification failed - Token unauthorized or expired', errorDetails);
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