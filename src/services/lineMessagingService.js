const axios = require('axios');
const { log } = require('../utils/logging');

class LineMessagingService {
  constructor(channelAccessToken) {
    this.channelAccessToken = channelAccessToken;
    this.baseUrl = 'https://api.line.me/v2/bot';
  }

  async send(messages) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/message/broadcast`,
        { messages },
        {
          headers: {
            'Authorization': `Bearer ${this.channelAccessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      log('INFO', 'LINE message sent successfully', { 
        status: response.status,
        messageCount: messages.length 
      });
      
      return response.data;
    } catch (error) {
      log('ERROR', 'Error sending LINE message', {
        error: error.response?.data || error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  // Helper methods for different message types
  createTextMessage(text) {
    return {
      type: 'text',
      text: text
    };
  }

  createFlexMessage(altText, contents) {
    return {
      type: 'flex',
      altText: altText,
      contents: contents
    };
  }
}

module.exports = { LineMessagingService };