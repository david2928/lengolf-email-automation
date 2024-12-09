const express = require('express');
const { getAuth } = require('./utils/auth');
const { GmailService } = require('./services/gmailService');
const { FacebookProcessor } = require('./processors/facebookProcessor');
const { ClassPassProcessor } = require('./processors/classPassProcessor');
const { WebResosProcessor } = require('./processors/webResosProcessor');

const app = express();
const port = process.env.PORT || 8080;

// Middleware to parse JSON bodies
app.use(express.json());

async function processEmails() {
    console.log('Starting email processing...');
    try {
        // Get OAuth2 authentication
        const auth = await getAuth();
        console.log('Authentication successful');
        
        console.log('Initializing Gmail service...');
        const gmailService = new GmailService(auth);

        // Initialize processors
        const processors = {
            classPass: new ClassPassProcessor(gmailService),
            webResos: new WebResosProcessor(gmailService),
            facebook: new FacebookProcessor(gmailService)
        };

        const results = {
            successes: [],
            failures: []
        };

        // Process each type
        for (const [type, processor] of Object.entries(processors)) {
            try {
                console.log(`\nProcessing ${type} emails...`);
                await processor.processEmails();
                console.log(`${type} processing complete`);
                results.successes.push(type);
            } catch (error) {
                console.error(`Error in ${type} processor:`, error.message);
                results.failures.push({
                    type,
                    error: error.message
                });
            }
        }

        return {
            success: results.failures.length === 0,
            message: 'Email processing completed',
            details: {
                successful: results.successes,
                failed: results.failures
            }
        };
    } catch (error) {
        console.error('Processing failed:', error);
        return {
            success: false,
            error: error.message,
            details: error.stack
        };
    }
}

// Health check endpoint
app.get('/', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        message: 'Email processor service is running',
        version: '1.0.0'
    });
});

// Process emails endpoint
app.post('/process', async (req, res) => {
    console.log('Received process request');
    try {
        const result = await processEmails();
        console.log('Process result:', result);
        res.status(result.success ? 200 : 500).json(result);
    } catch (error) {
        console.error('Error processing request:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message,
            details: error.stack
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: err.message,
        details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

// Start server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log('Environment:', {
        PROJECT_ID: process.env.PROJECT_ID,
        REGION: process.env.REGION,
        NODE_ENV: process.env.NODE_ENV
    });
});