require('dotenv').config();
const { getAuth } = require('./utils/auth');
const { GmailService } = require('./services/gmailService');
const { ClassPassProcessor } = require('./processors/classPassProcessor');
const { WebResosProcessor } = require('./processors/webResosProcessor');
const { FacebookProcessor } = require('./processors/facebookProcessor');

const MAX_RETRIES = 3;
const RETRY_DELAY = 60 * 1000;
const INTERVAL = 15 * 60 * 1000;

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function initializeServices(retryCount = 0) {
    try {
        const auth = await getAuth();
        return new GmailService(auth);
    } catch (error) {
        if (retryCount < MAX_RETRIES) {
            console.error(`Auth attempt ${retryCount + 1} failed, retrying in 1 minute...`);
            await sleep(RETRY_DELAY);
            return initializeServices(retryCount + 1);
        }
        throw new Error('Authentication failed after max retries');
    }
}

async function processLeadsWithRetry(processors, retryCount = 0) {
    try {
        await Promise.all([
            processors.classPass.processEmails(),
            processors.webResos.processEmails()
        ]);
        await processors.facebook.processNewLeads();
        return true;
    } catch (error) {
        if (retryCount < MAX_RETRIES) {
            console.error(`Processing attempt ${retryCount + 1} failed:`, error);
            console.log('Retrying in 1 minute...');
            await sleep(RETRY_DELAY);
            return processLeadsWithRetry(processors, retryCount + 1);
        }
        throw error;
    }
}

async function processLeads() {
    try {
        const gmailService = await initializeServices();
        const processors = {
            classPass: new ClassPassProcessor(gmailService),
            webResos: new WebResosProcessor(gmailService),
            facebook: new FacebookProcessor(gmailService)
        };

        console.log('Starting lead processing...');
        await processLeadsWithRetry(processors);
        console.log('Lead processing completed successfully');
        return true;
    } catch (error) {
        console.error('Error processing leads:', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
        return false;
    }
}

async function startProcessing() {
    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_FAILURES = 5;

    while (true) {
        console.log('Starting processing cycle at:', new Date().toISOString());
        const success = await processLeads();
        
        if (success) {
            consecutiveFailures = 0;
        } else {
            consecutiveFailures++;
            console.warn(`Consecutive failures: ${consecutiveFailures}`);
            
            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                throw new Error('Too many consecutive failures');
            }
        }

        console.log('Waiting for next cycle...');
        await sleep(INTERVAL);
    }
}

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled rejection:', error);
    process.exit(1);
});

startProcessing().catch(error => {
    console.error('Fatal error in processing:', error);
    process.exit(1);
});