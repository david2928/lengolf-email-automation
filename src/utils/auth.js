const fs = require('fs').promises;
const path = require('path');
const { google } = require('googleapis');

const SCOPES = [
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.labels',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.file'
];

async function getLocalCredentials() {
    try {
        const credPath = path.join(process.cwd(), 'credentials.json');
        const tokenPath = path.join(process.cwd(), 'token.json');
        
        const credentials = await fs.readFile(credPath);
        const token = await fs.readFile(tokenPath);
        
        return [credentials, token];
    } catch (error) {
        console.error('Error reading local credentials:', error);
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
    try {
        const [credentials, token] = await getLocalCredentials();

        const credentialsData = JSON.parse(credentials);
        const { client_secret, client_id, redirect_uris } = credentialsData.installed;
        
        const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
        oAuth2Client.setCredentials(JSON.parse(token));

        if (await verifyAuth(oAuth2Client)) {
            return oAuth2Client;
        } else {
            throw new Error('Token validation failed');
        }
    } catch (error) {
        console.error('Auth error:', error);
        throw error;
    }
}

module.exports = { getAuth, verifyAuth };