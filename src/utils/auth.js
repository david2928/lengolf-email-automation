const { GoogleAuth } = require('google-auth-library');
const path = require('path');
const fs = require('fs');

const SCOPES = [
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/spreadsheets'
];

async function getAuth() {
    const isCloudRun = process.env.K_SERVICE !== undefined;
    
    try {
        if (isCloudRun) {
            // In Cloud Run, use ADC (Application Default Credentials)
            const auth = new GoogleAuth({
                scopes: SCOPES,
                projectId: process.env.PROJECT_ID
            });
            const client = await auth.getClient();
            return client;
        } else {
            // Local development - use OAuth credentials
            const credPath = path.join(process.cwd(), 'credentials.json');
            const content = fs.readFileSync(credPath);
            const keys = JSON.parse(content);
            const client = keys.installed || keys.web;
            
            const { OAuth2Client } = require('google-auth-library');
            const oauth2Client = new OAuth2Client({
                clientId: client.client_id,
                clientSecret: client.client_secret,
                redirectUri: client.redirect_uris[0]
            });

            // Load saved token
            const tokenPath = path.join(process.cwd(), 'token.json');
            const tokenContent = fs.readFileSync(tokenPath);
            const tokens = JSON.parse(tokenContent);
            
            oauth2Client.setCredentials(tokens);
            
            // Set up token refresh callback
            oauth2Client.on('tokens', (tokens) => {
                if (tokens.refresh_token) {
                    fs.writeFileSync(tokenPath, JSON.stringify(tokens));
                }
            });

            return oauth2Client;
        }
    } catch (error) {
        console.error('Error getting auth:', error);
        throw error;
    }
}

module.exports = { getAuth };