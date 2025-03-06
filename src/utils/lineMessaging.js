const axios = require('axios');
const { log } = require('./logging');

class LineMessagingService {
  constructor(channelAccessToken, groupId, serviceType) {
    this.serviceType = serviceType; // e.g., 'B2B', 'B2C', etc.
    
    // Check if token exists
    if (!channelAccessToken) {
      log('ERROR', 'LINE channel access token not provided', { serviceType });
      throw new Error(`LINE channel access token is required`);
    }

    // Check if group ID exists
    if (!groupId) {
      log('ERROR', 'LINE group ID not provided', { serviceType });
      throw new Error(`LINE group ID for ${serviceType} is required`);
    }

    this.channelAccessToken = channelAccessToken;
    this.groupId = groupId;
    this.client = axios.create({
      baseURL: 'https://api.line.me/v2/bot',
      headers: {
        'Authorization': `Bearer ${channelAccessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Log initialization
    log('INFO', 'Initializing LINE Messaging service', {
      serviceType,
      tokenPrefix: channelAccessToken.substring(0, 4) + '...',
      groupId: this.groupId
    });
  }

  async validateToken() {
    try {
      // There's no direct status endpoint like in LINE Notify
      // So we'll use the bot info endpoint as a validation check
      const response = await this.client.get('/info');
      log('INFO', 'LINE token validated successfully', {
        serviceType: this.serviceType,
        status: response.status
      });
      return true;
    } catch (error) {
      const errorDetails = {
        serviceType: this.serviceType,
        error: error.message,
        status: error.response?.status
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
        throw new Error(`LINE token is invalid`);
      }

      // Create a text message object
      const messageObj = {
        type: 'text',
        text: message
      };

      // Send to a specific group
      const response = await this.client.post('/message/push', {
        to: this.groupId,
        messages: [messageObj]
      });

      log('INFO', 'LINE message sent successfully', {
        serviceType: this.serviceType,
        status: response.status,
        groupId: this.groupId
      });

      return response;
    } catch (error) {
      const errorDetails = {
        serviceType: this.serviceType,
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
        groupId: this.groupId
      };

      if (error.response?.status === 401) {
        log('ERROR', 'LINE message failed - Token unauthorized or expired', errorDetails);
      } else if (error.response?.status === 400) {
        log('ERROR', 'LINE message failed - Bad request', errorDetails);
      } else {
        log('ERROR', 'LINE message failed', errorDetails);
      }

      throw error;
    }
  }

  // Helper methods for different message types
  sendTextMessage(text) {
    return this.send(text);
  }

  // Send a rich message with buttons
  async sendRichMessage(title, text, actions = []) {
    try {
      const isValid = await this.validateToken();
      if (!isValid) {
        throw new Error(`LINE token is invalid`);
      }

      // Create a flex message
      const flexMessage = {
        type: 'flex',
        altText: title,
        contents: {
          type: 'bubble',
          header: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: title,
                weight: 'bold',
                size: 'xl'
              }
            ]
          },
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: text,
                wrap: true
              }
            ]
          }
        }
      };

      // Add footer with buttons if actions are provided
      if (actions.length > 0) {
        flexMessage.contents.footer = {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: actions.map(action => ({
            type: 'button',
            style: 'primary',
            height: 'sm',
            action: {
              type: 'uri',
              label: action.label,
              uri: action.uri
            }
          }))
        };
      }

      const response = await this.client.post('/message/push', {
        to: this.groupId,
        messages: [flexMessage]
      });

      log('INFO', 'LINE rich message sent successfully', {
        serviceType: this.serviceType,
        status: response.status,
        groupId: this.groupId
      });

      return response;
    } catch (error) {
      log('ERROR', 'LINE rich message failed', {
        serviceType: this.serviceType,
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      throw error;
    }
  }
}

module.exports = { LineMessagingService }; 