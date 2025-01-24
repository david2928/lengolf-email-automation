const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const { log } = require('./logging');

const SCOPES = [
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.labels',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.file'
];

async function accessSecret(secretName) {
    try {
        const client = new SecretManagerServiceClient();
        const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.PROJECT_ID;
        
        if (!projectId) {
            throw new Error('PROJECT_ID environment variable is not set');
        }

        log('INFO', 'Accessing secret', { 
            secretName,
            projectId 
        });
        
        const name = `projects/${projectId}/secrets/${secretName}/versions/latest`;
        const [version] = await client.accessSecretVersion({ name });
        return version.payload.data.toString('utf8');
    } catch (error) {
        log('ERROR', `Error accessing secret ${secretName}`, {
            error: error.message,
            details: error.details,
            code: error.code,
            projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.PROJECT_ID
        });
        throw error;
    }
}

async function verifyAuth(auth) {
    try {
        const gmail = google.gmail({ version: 'v1', auth });
        await gmail.users.labels.list({ userId: 'me' });
        log('INFO', 'Authentication verified successfully');
        return true;
    } catch (error) {
        log('ERROR', 'Auth verification failed', {
            error: error.message,
            stack: error.stack
        });
        return false;
    }
}

async function getAuth() {
    const isCloudRun = process.env.K_SERVICE !== undefined;

    try {
        if (isCloudRun) {
            log('INFO', 'Running in Cloud Run, using Secret Manager');
            const [credentials, token] = await Promise.all([
                accessSecret('gmail-credentials'),
                accessSecret('gmail-token')
            ]);
            
            const credentialsData = JSON.parse(credentials);
            const { client_secret, client_id, redirect_uris } = credentialsData.installed || credentialsData.web;
            const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
            
            const tokenData = JSON.parse(token);
            oAuth2Client.setCredentials(tokenData);
            
            if (await verifyAuth(oAuth2Client)) {
                log('INFO', 'Using existing token');
                return oAuth2Client;
            } else {
                throw new Error('Token validation failed');
            }
        } else {
            log('INFO', 'Running locally, using credential files');
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

            const tokenPath = path.join(process.cwd(), 'token.json');
            const tokenContent = fs.readFileSync(tokenPath);
            const tokens = JSON.parse(tokenContent);
            
            oauth2Client.setCredentials(tokens);
            
            oauth2Client.on('tokens', (tokens) => {
                if (tokens.refresh_token) {
                    fs.writeFileSync(tokenPath, JSON.stringify(tokens));
                    log('INFO', 'Token refreshed and saved');
                }
            });

            return oauth2Client;
        }
    } catch (error) {
        log('ERROR', 'Authentication error', {
            error: error.message,
            stack: error.stack,
            isCloudRun,
            projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.PROJECT_ID
        });
        throw error;
    }
}

module.exports = { getAuth, verifyAuth };