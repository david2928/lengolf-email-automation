const { OAuth2Client } = require('google-auth-library');
const path = require('path');
const fs = require('fs');

const SCOPES = [
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/spreadsheets'
];

async function saveCredentials(tokens) {
    const tokenPath = path.join(process.cwd(), 'token.json');
    fs.writeFileSync(tokenPath, JSON.stringify(tokens));
}

async function loadSavedCredentialsIfExist() {
    try {
        const tokenPath = path.join(process.cwd(), 'token.json');
        const content = fs.readFileSync(tokenPath);
        const credentials = JSON.parse(content);
        return credentials;
    } catch (err) {
        return null;
    }
}

async function getAuth() {
    try {
        const isCloudRun = process.env.K_SERVICE !== undefined;
        
        if (isCloudRun) {
            // In Cloud Run, use built-in service account
            const auth = new OAuth2Client();
            return auth;
        } else {
            // Local development - use OAuth credentials
            const credPath = path.join(process.cwd(), 'credentials.json');
            const content = fs.readFileSync(credPath);
            const keys = JSON.parse(content);
            const client = keys.installed || keys.web;

            const oauth2Client = new OAuth2Client({
                clientId: client.client_id,
                clientSecret: client.client_secret,
                redirectUri: client.redirect_uris[0]
            });

            // Check if we have previously stored a token.
            const tokens = await loadSavedCredentialsIfExist();
            if (tokens) {
                oauth2Client.setCredentials(tokens);
                
                // Set up token refresh callback
                oauth2Client.on('tokens', async (tokens) => {
                    if (tokens.refresh_token) {
                        await saveCredentials(tokens);
                    }
                });

                // Force token refresh if expired
                if (Date.now() > tokens.expiry_date) {
                    await oauth2Client.getAccessToken();
                }
                
                return oauth2Client;
            }

            throw new Error('No token found - please run auth script first');
        }
    } catch (error) {
        console.error('Error reading credentials or getting auth:', error);
        throw error;
    }
}

module.exports = { getAuth };