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
            // First try Application Default Credentials
            try {
                const auth = new GoogleAuth({
                    scopes: SCOPES
                });
                return auth.getClient();
            } catch (adcError) {
                console.log('Falling back to GCP_SA_KEY for deployment:', adcError.message);
                // Fallback to GCP_SA_KEY if ADC fails
                const credentials = JSON.parse(process.env.GCP_SA_KEY);
                const auth = new GoogleAuth({
                    credentials,
                    scopes: SCOPES
                });
                return auth.getClient();
            }
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