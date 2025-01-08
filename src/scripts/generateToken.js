const fs = require('fs').promises;
const path = require('path');
const { google } = require('googleapis');
const readline = require('readline');
const http = require('http');
const url = require('url');

const SCOPES = [
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.labels',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.file'
];

const PORT = 3000;

async function startLocalServer() {
    return new Promise((resolve) => {
        const server = http.createServer(async (req, res) => {
            const parsedUrl = url.parse(req.url, true);
            const code = parsedUrl.query.code;

            if (code) {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end('Authentication successful! You can close this window.');
                server.close();
                resolve(code);
            }
        });

        server.listen(PORT, () => {
            console.log(`Local server listening on port ${PORT}`);
        });
    });
}

async function getCredentials() {
    const credPath = path.join(process.cwd(), 'credentials.json');
    const content = await fs.readFile(credPath);
    return JSON.parse(content);
}

async function saveToken(token) {
    const tokenPath = path.join(process.cwd(), 'token.json');
    await fs.writeFile(tokenPath, JSON.stringify(token));
    console.log('Token stored to', tokenPath);
}

async function generateToken() {
    try {
        const credentials = await getCredentials();
        const { client_secret, client_id } = credentials.installed;
        const redirectUri = `http://localhost:${PORT}`;
        
        const oAuth2Client = new google.auth.OAuth2(
            client_id,
            client_secret,
            redirectUri
        );

        const authUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
            prompt: 'consent'
        });

        console.log('Please visit this URL to authorize this application:');
        console.log(authUrl);
        console.log('\nWaiting for authorization...');

        const code = await startLocalServer();
        const { tokens } = await oAuth2Client.getToken(code);
        await saveToken(tokens);
        console.log('Authentication successful!');
        process.exit(0);
    } catch (error) {
        console.error('Error during authentication:', error);
        process.exit(1);
    }
}

generateToken();