require('dotenv').config();
const { MetaTokenManager } = require('../utils/metaTokenManager');
const { log } = require('../utils/logging');

/**
 * Script to refresh the Meta access token
 * Can be run manually or scheduled via cron
 */
async function refreshMetaToken() {
  try {
    log('INFO', 'Starting Meta access token refresh process');
    
    // Check if required environment variables are set
    if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) {
      log('ERROR', 'Missing required environment variables', {
        META_APP_ID: process.env.META_APP_ID ? 'Set' : 'Not set',
        META_APP_SECRET: process.env.META_APP_SECRET ? 'Set' : 'Not set'
      });
      throw new Error('META_APP_ID and META_APP_SECRET must be set in .env file');
    }
    
    // Initialize the token manager
    const tokenManager = new MetaTokenManager();
    
    // Check if the current token is valid
    const isValid = await tokenManager.isTokenValid();
    log('INFO', 'Token validity check result', { isValid });
    
    if (isValid) {
      log('INFO', 'Current Meta access token is valid, no refresh needed');
      return;
    }
    
    // Refresh the token
    log('INFO', 'Refreshing Meta access token');
    const newToken = await tokenManager.manageToken();
    
    log('SUCCESS', 'Meta access token refresh completed', {
      tokenPrefix: newToken.substring(0, 8) + '...'
    });
  } catch (error) {
    log('ERROR', 'Failed to refresh Meta access token', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

// Run the script
refreshMetaToken().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
}); 