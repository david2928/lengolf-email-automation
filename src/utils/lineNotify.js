const axios = require('axios');

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
      console.log('LINE Notify sent successfully:', response.status);
      return response.data;
    } catch (error) {
      console.error('Error sending LINE notification:', error.response?.data || error.message);
      throw error;
    }
  }
}

module.exports = { LineNotifyService };