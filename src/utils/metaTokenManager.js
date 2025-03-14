const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { log } = require('./logging');

/**
 * Utility class to manage Meta (Facebook) access tokens
 * Handles extending short-lived tokens and refreshing long-lived tokens
 */
class MetaTokenManager {
  constructor(config = {}) {
    this.appId = config.appId || process.env.META_APP_ID;
    this.appSecret = config.appSecret || process.env.META_APP_SECRET;
    this.accessToken = config.accessToken || process.env.META_ACCESS_TOKEN;
    this.envPath = config.envPath || path.join(process.cwd(), '.env');
    
    // Validate required configuration
    if (!this.appId || !this.appSecret) {
      throw new Error('META_APP_ID and META_APP_SECRET are required for token management');
    }
    
    if (!this.accessToken) {
      throw new Error('META_ACCESS_TOKEN is required for token management');
    }
  }

  /**
   * Extend a short-lived token to a long-lived token (valid for ~60 days)
   * @returns {Promise<string>} The extended long-lived token
   */
  async extendToken() {
    try {
      log('INFO', 'Extending Meta access token', { tokenPrefix: this.accessToken.substring(0, 8) + '...' });
      
      const response = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: this.appId,
          client_secret: this.appSecret,
          fb_exchange_token: this.accessToken
        }
      });
      
      if (!response.data || !response.data.access_token) {
        throw new Error('Failed to extend token: Invalid response from Facebook');
      }
      
      const newToken = response.data.access_token;
      log('INFO', 'Successfully extended Meta access token', { 
        tokenPrefix: newToken.substring(0, 8) + '...',
        expiresIn: response.data.expires_in || '~60 days'
      });
      
      // Update the token in memory
      this.accessToken = newToken;
      
      return newToken;
    } catch (error) {
      log('ERROR', 'Failed to extend Meta access token', {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      throw error;
    }
  }

  /**
   * Check if the current token is valid
   * @returns {Promise<boolean>} True if the token is valid
   */
  async isTokenValid() {
    try {
      const response = await axios.get('https://graph.facebook.com/v18.0/debug_token', {
        params: {
          input_token: this.accessToken,
          access_token: `${this.appId}|${this.appSecret}`
        }
      });
      
      if (!response.data || !response.data.data) {
        return false;
      }
      
      const tokenData = response.data.data;
      
      // Check if token is valid and not expired
      if (!tokenData.is_valid) {
        log('WARN', 'Meta access token is invalid', { 
          error: tokenData.error?.message || 'Unknown error'
        });
        return false;
      }
      
      // Check expiration (if available)
      if (tokenData.expires_at) {
        const expiresAt = new Date(tokenData.expires_at * 1000);
        const now = new Date();
        const daysUntilExpiration = Math.floor((expiresAt - now) / (1000 * 60 * 60 * 24));
        
        log('INFO', 'Meta access token expiration status', { 
          expiresAt: expiresAt.toISOString(),
          daysUntilExpiration,
          isExpired: expiresAt <= now
        });
        
        // Consider token invalid if it expires in less than 7 days
        if (daysUntilExpiration < 7) {
          log('WARN', 'Meta access token will expire soon', { daysUntilExpiration });
          return false;
        }
      }
      
      log('INFO', 'Meta access token is valid', {
        appId: tokenData.app_id,
        userId: tokenData.user_id,
        scopes: tokenData.scopes?.join(', ')
      });
      
      return true;
    } catch (error) {
      log('ERROR', 'Failed to check Meta access token validity', {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      return false;
    }
  }

  /**
   * Update the META_ACCESS_TOKEN in the .env file
   * @param {string} newToken - The new token to save
   * @returns {Promise<boolean>} True if successful
   */
  async updateEnvFile(newToken) {
    try {
      // Read the current .env file
      const envContent = await fs.readFile(this.envPath, 'utf8');
      
      // Replace the META_ACCESS_TOKEN line
      const updatedContent = envContent.replace(
        /META_ACCESS_TOKEN=.*/,
        `META_ACCESS_TOKEN=${newToken}`
      );
      
      // Write the updated content back to the .env file
      await fs.writeFile(this.envPath, updatedContent, 'utf8');
      
      log('INFO', 'Updated META_ACCESS_TOKEN in .env file', {
        envPath: this.envPath,
        tokenPrefix: newToken.substring(0, 8) + '...'
      });
      
      return true;
    } catch (error) {
      log('ERROR', 'Failed to update META_ACCESS_TOKEN in .env file', {
        error: error.message,
        envPath: this.envPath
      });
      return false;
    }
  }

  /**
   * Manage the token: check validity, extend if needed, and update .env
   * @returns {Promise<string>} The current valid token
   */
  async manageToken() {
    try {
      // Check if the current token is valid
      const isValid = await this.isTokenValid();
      
      if (!isValid) {
        // Extend the token
        const newToken = await this.extendToken();
        
        // Update the .env file
        await this.updateEnvFile(newToken);
        
        return newToken;
      }
      
      return this.accessToken;
    } catch (error) {
      log('ERROR', 'Failed to manage Meta access token', {
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = { MetaTokenManager }; 