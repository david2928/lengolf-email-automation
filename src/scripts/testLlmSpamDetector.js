require('dotenv').config();
const { llmSpamDetector } = require('../utils/llmSpamDetection');
const { log } = require('../utils/logging');

// Test data that should be detected as spam
const testSpamLead = {
    leadId: 'test-1',
    formId: 'test-form',
    createdTime: new Date().toISOString(),
    fullName: 'Test Spamuser123456789abcdefghijklmnop',
    email: 'test-spam@yandex.comabcdef',
    phone: '+1234567'
};

// Test data that should be legitimate
const testLegitLead = {
    leadId: 'test-2',
    formId: 'test-form',
    createdTime: new Date().toISOString(),
    fullName: 'John Smith',
    email: 'john.smith@gmail.com',
    phone: '+6681234567'
};

async function testLlmSpamDetection() {
    console.log('Testing LLM Spam Detection...\n');
    
    try {
        console.log('Testing with spam lead:');
        console.log('---------------------');
        console.log(JSON.stringify(testSpamLead, null, 2));
        
        console.log('\nSubmitting to LLM for analysis...');
        const spamResult = await llmSpamDetector.detectSpam(testSpamLead);
        
        if (spamResult) {
            console.log('\nLLM Detection Result:');
            console.log('---------------------');
            console.log(`Is Spam: ${spamResult.isSpam}`);
            console.log(`Confidence: ${spamResult.confidence}`);
            console.log(`Reason: ${spamResult.reason}`);
        } else {
            console.log('\nLLM Detection failed or returned null. Check logs for details.');
        }
        
        console.log('\n\nTesting with legitimate lead:');
        console.log('---------------------');
        console.log(JSON.stringify(testLegitLead, null, 2));
        
        console.log('\nSubmitting to LLM for analysis...');
        const legitResult = await llmSpamDetector.detectSpam(testLegitLead);
        
        if (legitResult) {
            console.log('\nLLM Detection Result:');
            console.log('---------------------');
            console.log(`Is Spam: ${legitResult.isSpam}`);
            console.log(`Confidence: ${legitResult.confidence}`);
            console.log(`Reason: ${legitResult.reason}`);
        } else {
            console.log('\nLLM Detection failed or returned null. Check logs for details.');
        }
        
    } catch (error) {
        console.error('Error during LLM spam detection test:', error);
    }
}

// Run the test
testLlmSpamDetection(); 