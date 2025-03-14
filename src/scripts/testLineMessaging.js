require('dotenv').config();
const { LineMessagingService } = require('../utils/lineMessaging');
const { log } = require('../utils/logging');

/**
 * Test script for LINE Messaging API
 * This script tests sending messages to different LINE groups
 */

async function testLineMessaging() {
  try {
    log('INFO', 'Starting LINE messaging test');
    
    // Test services for different types
    const services = {
      CLASSPASS: new LineMessagingService(
        process.env.LINE_CHANNEL_ACCESS_TOKEN_CLASSPASS || process.env.LINE_CHANNEL_ACCESS_TOKEN,
        process.env.LINE_GROUP_ID_CLASSPASS || process.env.LINE_GROUP_ID,
        'CLASSPASS'
      ),
      B2B: new LineMessagingService(
        process.env.LINE_CHANNEL_ACCESS_TOKEN_B2B || process.env.LINE_CHANNEL_ACCESS_TOKEN,
        process.env.LINE_GROUP_ID_B2B || process.env.LINE_GROUP_ID,
        'B2B'
      ),
      B2C: new LineMessagingService(
        process.env.LINE_CHANNEL_ACCESS_TOKEN_B2C || process.env.LINE_CHANNEL_ACCESS_TOKEN,
        process.env.LINE_GROUP_ID_B2C || process.env.LINE_GROUP_ID,
        'B2C'
      )
    };
    
    // Test messages
    const testMessages = {
      simple: 'This is a test message from the LENGOLF Email Automation system.',
      withEmoji: '🏌️ This is a test message with emoji 🎯 from the LENGOLF Email Automation system.',
      withSpecialChars: 'Test with special characters: ทดสอบภาษาไทย, 测试中文, 日本語テスト'
    };
    
    // Test each service with different message types
    for (const [serviceType, service] of Object.entries(services)) {
      log('INFO', `Testing ${serviceType} messaging service`);
      
      // First validate the token
      const isValid = await service.validateToken();
      if (!isValid) {
        log('ERROR', `Token validation failed for ${serviceType}`);
        continue;
      }
      
      // Test simple text message
      try {
        log('INFO', `Sending simple message to ${serviceType}`);
        await service.send(testMessages.simple);
        log('SUCCESS', `Simple message sent to ${serviceType}`);
      } catch (error) {
        log('ERROR', `Failed to send simple message to ${serviceType}`, {
          error: error.message,
          status: error.response?.status,
          data: error.response?.data
        });
      }
      
      // Test message with emoji
      try {
        log('INFO', `Sending message with emoji to ${serviceType}`);
        await service.send(testMessages.withEmoji);
        log('SUCCESS', `Message with emoji sent to ${serviceType}`);
      } catch (error) {
        log('ERROR', `Failed to send message with emoji to ${serviceType}`, {
          error: error.message
        });
      }
      
      // Test message with special characters
      try {
        log('INFO', `Sending message with special characters to ${serviceType}`);
        await service.send(testMessages.withSpecialChars);
        log('SUCCESS', `Message with special characters sent to ${serviceType}`);
      } catch (error) {
        log('ERROR', `Failed to send message with special characters to ${serviceType}`, {
          error: error.message
        });
      }
      
      // Test rich message
      try {
        log('INFO', `Sending rich message to ${serviceType}`);
        await service.sendRichMessage(
          'Test Rich Message',
          'This is a test of the rich message format with buttons.',
          [
            { label: 'Visit LENGOLF', uri: 'https://lengolf.com' }
          ]
        );
        log('SUCCESS', `Rich message sent to ${serviceType}`);
      } catch (error) {
        log('ERROR', `Failed to send rich message to ${serviceType}`, {
          error: error.message
        });
      }
      
      // Add a delay between services to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    log('INFO', 'LINE messaging test completed');
  } catch (error) {
    log('ERROR', 'Error in LINE messaging test', {
      error: error.message,
      stack: error.stack
    });
  }
}

// Run the test
testLineMessaging().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});