const { OAuth2Client } = require('google-auth-library');

async function getAuth() {
    try {
        // When running in Cloud Run, this will use workload identity
        const auth = new OAuth2Client();
        await auth.getAccessToken();
        return auth;
    } catch (error) {
        console.error('Error getting auth:', error);
        throw error;
    }
}

module.exports = { getAuth };