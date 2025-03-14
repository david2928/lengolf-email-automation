require('dotenv').config();
const express = require('express');
const { getAuth } = require('./utils/auth');
const { GmailService } = require('./services/gmailService');
const { ClassPassProcessor } = require('./processors/classPassProcessor');
const { WebResosProcessor } = require('./processors/webResosProcessor');
const { FacebookProcessor } = require('./processors/facebookProcessor');
const { MetaTokenManager } = require('./utils/metaTokenManager');

const app = express();
const port = process.env.PORT || 8080;

const MAX_RETRIES = 3;
const RETRY_DELAY = 60 * 1000;
const PROCESSING_INTERVAL = 15 * 60 * 1000;

const log = (severity, message, metadata = {}) => {
    console.log(JSON.stringify({
        severity,
        message,
        timestamp: new Date().toISOString(),
        ...metadata
    }));
};

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check and refresh Meta access token if needed
 */
async function checkMetaAccessToken() {
    try {
        // Only attempt token management if app credentials are available
        if (process.env.META_APP_ID && process.env.META_APP_SECRET) {
            log('INFO', 'Checking Meta access token validity');
            const tokenManager = new MetaTokenManager();
            const isValid = await tokenManager.isTokenValid();
            
            if (!isValid) {
                log('WARN', 'Meta access token is invalid or expiring soon, refreshing');
                await tokenManager.manageToken();
                log('INFO', 'Meta access token refreshed successfully');
            } else {
                log('INFO', 'Meta access token is valid');
            }
        } else {
            log('WARN', 'Meta app credentials not found, skipping token validation');
        }
    } catch (error) {
        log('ERROR', 'Failed to check/refresh Meta access token', {
            error: error.message
        });
        // Continue execution even if token refresh fails
    }
}

async function initializeServices(retryCount = 0) {
    try {
        // Check Meta access token before initializing services
        await checkMetaAccessToken();
        
        const auth = await getAuth();
        return new GmailService(auth);
    } catch (error) {
        if (retryCount < MAX_RETRIES) {
            log('WARNING', 'Authentication failed, retrying', {
                attempt: retryCount + 1,
                error: error.message
            });
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
            processors.webResos.processEmails(),
            processors.facebook.processNewLeads()
        ]);
        return true;
    } catch (error) {
        if (retryCount < MAX_RETRIES) {
            log('WARNING', 'Processing attempt failed', {
                attempt: retryCount + 1,
                error: error.message
            });
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

        log('INFO', 'Starting lead processing');
        await processLeadsWithRetry(processors);
        log('INFO', 'Lead processing completed successfully');
        return true;
    } catch (error) {
        log('ERROR', 'Error processing leads', {
            error: error.message,
            stack: error.stack
        });
        return false;
    }
}

let processingLoop;
async function startProcessing() {
    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_FAILURES = 5;

    while (true) {
        try {
            log('INFO', 'Starting processing cycle');
            const success = await processLeads();
            
            if (success) {
                consecutiveFailures = 0;
            } else {
                consecutiveFailures++;
                log('WARNING', 'Processing cycle failed', {
                    consecutiveFailures,
                    maxFailures: MAX_CONSECUTIVE_FAILURES
                });
                
                if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                    throw new Error('Too many consecutive failures');
                }
            }

            log('DEBUG', 'Waiting for next cycle');
            await sleep(PROCESSING_INTERVAL);
        } catch (error) {
            log('ERROR', 'Error in processing loop', {
                error: error.message,
                stack: error.stack
            });
            await sleep(RETRY_DELAY);
        }
    }
}

app.get('/', (req, res) => {
    res.status(200).send('OK');
});

const server = app.listen(port, () => {
    log('INFO', 'Server started', { port });
    processingLoop = startProcessing().catch(error => {
        log('CRITICAL', 'Fatal error in processing', {
            error: error.message,
            stack: error.stack
        });
        process.exit(1);
    });
});

async function shutdown() {
    log('INFO', 'Shutting down gracefully');
    server.close(() => {
        log('INFO', 'Server closed');
        process.exit(0);
    });

    setTimeout(() => {
        log('ERROR', 'Could not close connections in time, forcing shutdown');
        process.exit(1);
    }, 10000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

process.on('uncaughtException', (error) => {
    log('CRITICAL', 'Uncaught exception', {
        error: error.message,
        stack: error.stack
    });
    shutdown();
});

process.on('unhandledRejection', (error) => {
    log('CRITICAL', 'Unhandled rejection', {
        error: error.message,
        stack: error.stack
    });
    shutdown();
});