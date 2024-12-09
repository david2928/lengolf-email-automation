require('dotenv').config();
const { google } = require('googleapis');
const { getAuth, verifyAuth } = require('../src/utils/auth');
const { GmailService } = require('../src/services/gmailService');
const { ClassPassProcessor } = require('../src/processors/classPassProcessor');
const { WebResosProcessor } = require('../src/processors/webResosProcessor');
const { FacebookProcessor } = require('../src/processors/facebookProcessor');

async function runTest() {
    console.log('Starting test run...');
    
    try {
        // Get OAuth2 authentication
        console.log('Authenticating...');
        const auth = await getAuth();
        
        // Verify authentication before proceeding
        if (!await verifyAuth(auth)) {
            throw new Error('Authentication verification failed');
        }
        
        console.log('Initializing Gmail service...');
        const gmailService = new GmailService(auth);

        // Test processors
        const processors = {
            classPass: new ClassPassProcessor(gmailService),
            webResos: new WebResosProcessor(gmailService),
            facebook: new FacebookProcessor(gmailService)
        };

        // Add some error handling and logging
        try {
            console.log('\nTesting ClassPass processor...');
            await processors.classPass.processEmails();
            console.log('ClassPass processing complete');
        } catch (error) {
            console.error('ClassPass processor error:', error.message);
        }

        try {
            console.log('\nTesting WebResos processor...');
            await processors.webResos.processEmails();
            console.log('WebResos processing complete');
        } catch (error) {
            console.error('WebResos processor error:', error.message);
        }

        try {
            console.log('\nTesting Facebook processor...');
            await processors.facebook.processEmails();
            console.log('Facebook processing complete');
        } catch (error) {
            console.error('Facebook processor error:', error.message);
        }

        console.log('\nAll processors completed!');
    } catch (error) {
        console.error('Test failed:', error);
    }
}

runTest();