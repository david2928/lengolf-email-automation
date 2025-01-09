const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

// Define scopes for authentication
const SCOPES = [
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.labels',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.file'
];

async function accessSecret(secretName) {
    const client = new SecretManagerServiceClient();
    const projectId = process.env.PROJECT_ID;
    const name = `projects/${projectId}/secrets/${secretName}/versions/latest`;
    
    try {
        const [version] = await client.accessSecretVersion({ name });
        return version.payload.data.toString('utf8');
    } catch (error) {
        console.error(`Error accessing secret ${secretName}:`, error);
        throw error;
    }
}

async function verifyAuth(auth) {
    try {
        const gmail = google.gmail({ version: 'v1', auth });
        await gmail.users.labels.list({ userId: 'me' });
        console.log('Authentication verified successfully');
        return true;
    } catch (error) {
        console.error('Auth verification failed:', error);
        return false;
    }
}

async function getAuth() {
    const isCloudRun = process.env.K_SERVICE !== undefined;

    try {
        if (isCloudRun) {
            // Get credentials and token from Secret Manager
            const [credentials, token] = await Promise.all([
                accessSecret('gmail-credentials'),
                accessSecret('gmail-token')
            ]);
            const credentialsData = JSON.parse(credentials);
            const { client_secret, client_id, redirect_uris } = credentialsData.installed || credentialsData.web;
            const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
            
            // Set credentials from token
            const tokenData = JSON.parse(token);
            oAuth2Client.setCredentials(tokenData);
            
            // Verify if the token is still valid
            if (await verifyAuth(oAuth2Client)) {
                console.log('Using existing token');
                return oAuth2Client;
            } else {
                throw new Error('Token validation failed');
            }
        } else {
            // Local development - use OAuth credentials from files
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
        console.error('Auth error:', error);
        throw error;
    }
}

module.exports = { getAuth, verifyAuth };