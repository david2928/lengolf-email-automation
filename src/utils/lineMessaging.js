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
      },
      // Add timeout to prevent hanging requests (increased to 30s for LINE API)
      timeout: 30000
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

  // Validate message content to ensure it meets LINE's requirements
  validateMessage(message) {
    if (!message) {
      throw new Error('Message content cannot be empty');
    }
    
    // LINE has a 5000 character limit for text messages
    if (message.length > 5000) {
      log('WARN', 'Message exceeds LINE character limit, truncating', {
        serviceType: this.serviceType,
        originalLength: message.length
      });
      return message.substring(0, 4997) + '...';
    }
    
    return message;
  }

  async send(message) {
    try {
      // Validate token before sending
      const isValid = await this.validateToken();
      if (!isValid) {
        throw new Error(`LINE token is invalid`);
      }

      // Validate and potentially truncate the message
      const validatedMessage = this.validateMessage(message);

      // Create a text message object
      const messageObj = {
        type: 'text',
        text: validatedMessage
      };

      // Log the request we're about to make
      log('DEBUG', 'Sending LINE message', {
        serviceType: this.serviceType,
        groupId: this.groupId,
        messageLength: validatedMessage.length
      });

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
        // Add more detailed error information for 400 errors
        log('ERROR', 'LINE message failed - Bad request', {
          ...errorDetails,
          details: error.response?.data?.details || 'No additional details available'
        });
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

      // Validate text content
      const validatedText = this.validateMessage(text);
      
      // Validate title (shorter limit for titles)
      const validatedTitle = title.length > 100 ? title.substring(0, 97) + '...' : title;

      // Create a flex message
      const flexMessage = {
        type: 'flex',
        altText: validatedTitle,
        contents: {
          type: 'bubble',
          header: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: validatedTitle,
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
                text: validatedText,
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

      // Log the request we're about to make
      log('DEBUG', 'Sending LINE rich message', {
        serviceType: this.serviceType,
        groupId: this.groupId,
        title: validatedTitle
      });

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