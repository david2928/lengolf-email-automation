const axios = require('axios');
const { log } = require('./logging');

class LineNotifyService {
  constructor(token) {
    this.token = token;
  }

  async send(message) {
    try {
      const response = await axios.post(
        'https://notify-api.line.me/api/notify',
        `message=${encodeURIComponent(message)}`,
        {
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );
      log('INFO', 'LINE Notify sent successfully', { status: response.status });
      return response.data;
    } catch (error) {
      log('ERROR', 'Error sending LINE notification', {
        error: error.response?.data || error.message,
        stack: error.stack
      });
      throw error;
    }
  }
}

module.exports = { LineNotifyService };