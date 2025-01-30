require('dotenv').config();
const { getAuth } = require('../utils/auth');
const { FacebookProcessor } = require('../processors/facebookProcessor');

class GmailService {
    constructor(auth) {
        this.auth = auth;
    }
}

async function testFacebookProcessor() {
    try {
        console.log('Initializing Google Auth...');
        const auth = await getAuth();
        const gmailService = new GmailService(auth);
        
        console.log('Starting Facebook Processor...');
        const facebookProcessor = new FacebookProcessor(gmailService);
        
        await facebookProcessor.processNewLeads();
    } catch (error) {
        console.error('Error running Facebook processor:', error);
        process.exit(1);
    }
}

// Run the test
testFacebookProcessor(); 