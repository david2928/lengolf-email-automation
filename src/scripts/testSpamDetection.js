require('dotenv').config();
const { calculateSpamScore } = require('../utils/fraudDetection');
const { llmSpamDetector } = require('../utils/llmSpamDetection');
const { log } = require('../utils/logging');

// Sample leads to test
const testLeads = [
  {
    id: 'test-spam-1',
    formId: 'test-form',
    createdTime: new Date().toISOString(),
    fullName: 'Test Spamuser123456789abcdefghijklmnop',
    email: 'test-spam@yandex.comabcdef',
    phone: '+1234567',
    phoneNumber: '+1234567'
  },
  {
    id: 'test-legit-1',
    formId: 'test-form',
    createdTime: new Date().toISOString(),
    fullName: 'John Smith',
    email: 'john.smith@gmail.com',
    phone: '+6681234567',
    phoneNumber: '+6681234567'
  },
  {
    id: 'test-mixed-1',
    formId: 'test-form',
    createdTime: new Date().toISOString(),
    fullName: 'สมชาย ใจดี',  // Thai name
    email: 'somchai@yandex.com',  // Suspicious email domain
    phone: '+66812345678',  // Valid Thai phone
    phoneNumber: '+66812345678'
  }
];

async function testDetectionMethods() {
  console.log('Testing Spam Detection Methods\n');
  
  // First test rule-based detection only
  console.log('==============================');
  console.log('TESTING RULE-BASED DETECTION ONLY');
  console.log('==============================\n');
  
  // Temporarily disable LLM
  const originalEnabled = llmSpamDetector.enabled;
  llmSpamDetector.enabled = false;
  
  for (const lead of testLeads) {
    console.log(`Testing lead: ${lead.fullName}`);
    console.log(`Email: ${lead.email}`);
    console.log(`Phone: ${lead.phone}`);
    console.log('--------------------------');
    
    console.log('Rule-based detection:');
    const ruleResult = await calculateSpamScore(lead);
    console.log(`Is spam: ${ruleResult.isLikelySpam ? 'YES' : 'NO'}`);
    console.log(`Score: ${ruleResult.score}`);
    console.log(`Reasons: ${ruleResult.reasons ? ruleResult.reasons.join(', ') : 'None'}`);
    console.log(`Detection type: ${ruleResult.detectionType}`);
    console.log('==============================\n');
  }
  
  // Restore LLM setting
  llmSpamDetector.enabled = originalEnabled;
  
  // Now test LLM-based detection
  console.log('==============================');
  console.log('TESTING LLM-BASED DETECTION ONLY');
  console.log('==============================\n');
  
  for (const lead of testLeads) {
    console.log(`Testing lead: ${lead.fullName}`);
    console.log(`Email: ${lead.email}`);
    console.log(`Phone: ${lead.phone}`);
    console.log('--------------------------');
    
    console.log('LLM-based detection:');
    try {
      const llmResult = await llmSpamDetector.detectSpam(lead);
      if (llmResult) {
        console.log(`Is spam: ${llmResult.isLikelySpam ? 'YES' : 'NO'}`);
        console.log(`Score: ${llmResult.spamScore}`);
        console.log(`Reasons: ${llmResult.spamReasons ? llmResult.spamReasons.join(', ') : 'None'}`);
        console.log(`Analysis: ${llmResult.llmAnalysis}`);
      } else {
        console.log('LLM detection unavailable or failed. Check logs for details.');
      }
    } catch (error) {
      console.error('Error in LLM detection:', error.message);
    }
    console.log('==============================\n');
  }
  
  // Finally, test the combined approach (normal behavior)
  console.log('==============================');
  console.log('TESTING COMBINED DETECTION (NORMAL BEHAVIOR)');
  console.log('==============================\n');
  
  for (const lead of testLeads) {
    console.log(`Testing lead: ${lead.fullName}`);
    console.log(`Email: ${lead.email}`);
    console.log(`Phone: ${lead.phone}`);
    console.log('--------------------------');
    
    console.log('Combined detection:');
    const result = await calculateSpamScore(lead);
    console.log(`Is spam: ${result.isLikelySpam ? 'YES' : 'NO'}`);
    console.log(`Score: ${result.score}`);
    console.log(`Reasons: ${result.reasons ? result.reasons.join(', ') : 'None'}`);
    console.log(`Detection type: ${result.detectionType}`);
    console.log('==============================\n');
  }
}

// Run the test
testDetectionMethods()
  .then(() => console.log('Test completed.'))
  .catch(error => console.error('Test failed:', error)); 