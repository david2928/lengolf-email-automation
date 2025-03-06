require('dotenv').config();
const axios = require('axios');
const { calculateSpamScore } = require('../utils/fraudDetection');
const { log } = require('../utils/logging');
const fs = require('fs');

// Import the llmSpamDetector but we'll override its detectSpam method
const { llmSpamDetector } = require('../utils/llmSpamDetection');

// Define the spam detection prompt template
const SPAM_DETECTION_PROMPT = `
You are an AI tasked with identifying spam/bot submissions in a form for golf experiences in Thailand.
Analyze the following details and determine if it's likely a spam/bot submission.
Consider these signals of spam:
1. Nonsensical characters appended to real names
2. Random alphanumeric strings in the name field
3. Clearly fake/temporary email addresses
4. Non-Thai phone numbers that don't match standard formats
5. Excessive repetition of characters or patterns
6. Inconsistencies between fields (e.g., Thai name with non-Thai phone format)

Return a JSON response with:
1. isSpam: boolean
2. confidence: number (0-1)
3. reasons: array of strings explaining why
4. analysis: brief explanation of your reasoning

User Information:
Name: {fullName}
Email: {email}
Phone: {phoneNumber}
Additional Fields: {additionalFields}
`;

// Patch the detectSpam method to handle markdown formatted responses
const originalDetectSpam = llmSpamDetector.detectSpam.bind(llmSpamDetector);
llmSpamDetector.detectSpam = async function(leadData) {
    if (!this.enabled || !this.isInitialized) {
        if (!this.enabled) {
            log('DEBUG', 'LLM Spam Detection is disabled, falling back to rule-based detection');
        } else {
            log('WARNING', 'LLM Spam Detector not initialized, falling back to rule-based detection');
        }
        return null;
    }

    try {
        // Create the prompt with the lead data
        const additionalFields = {};
            
        // Add B2B specific fields if present
        if (leadData.companyName) additionalFields.companyName = leadData.companyName;
        if (leadData.eventType) additionalFields.eventType = leadData.eventType;
            
        // Add B2C specific fields if present
        if (leadData.previousLengolfExperience) 
            additionalFields.previousExperience = leadData.previousLengolfExperience;
        if (leadData.groupSize) additionalFields.groupSize = leadData.groupSize;
            
        const prompt = SPAM_DETECTION_PROMPT
            .replace('{fullName}', leadData.fullName || 'N/A')
            .replace('{email}', leadData.email || 'N/A')
            .replace('{phoneNumber}', leadData.phone || 'N/A')  // Fixed field name to match our data
            .replace('{additionalFields}', JSON.stringify(additionalFields));

        // Call the Gemini model
        const result = await this.generativeModel.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });

        const response = result.response;
        const textResponse = response.candidates[0].content.parts[0].text;
        
        // Extract JSON from Markdown code blocks if present
        let jsonStr = textResponse;
        const jsonMatch = textResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch && jsonMatch[1]) {
            jsonStr = jsonMatch[1].trim();
        }
        
        // Parse the JSON 
        const jsonResponse = JSON.parse(jsonStr);
        
        log('INFO', 'LLM spam detection result (fixed parser)', { 
            isSpam: jsonResponse.isSpam,
            confidence: jsonResponse.confidence,
            leadName: leadData.fullName
        });

        return {
            isSpam: jsonResponse.isSpam,
            confidence: jsonResponse.confidence,
            reason: Array.isArray(jsonResponse.reasons) && jsonResponse.reasons.length > 0 
                ? jsonResponse.reasons.join(', ') 
                : (jsonResponse.analysis || 'No specific reason provided')
        };
    } catch (error) {
        log('ERROR', 'Enhanced LLM spam detection failed', { 
            error: error.message, 
            leadName: leadData.fullName 
        });
        return null;
    }
};

// Only test B2C New form
const B2C_NEW_FORM_ID = '625669719834512';
const LEADS_TO_FETCH = 5;

// Meta API configuration
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

async function getLeads(formId, limit = LEADS_TO_FETCH) {
    try {
        console.log(`Fetching ${limit} leads for B2C New form (ID: ${formId})...`);
        const response = await axios.get(
            `https://graph.facebook.com/v19.0/${formId}/leads`,
            {
                params: {
                    access_token: META_ACCESS_TOKEN,
                    limit: limit,
                },
            }
        );
        
        if (response.data && response.data.data) {
            console.log(`Successfully retrieved ${response.data.data.length} leads.`);
            return response.data.data || [];
        } else {
            console.error(`Error: Response from Facebook API is missing data`);
            return [];
        }
    } catch (error) {
        console.error(`Error fetching leads:`, error.message);
        if (error.response) {
            console.error('API Response:', error.response.data);
        }
        return [];
    }
}

function mapLeadFieldsToData(lead) {
    // Extract basic info
    const data = {
        leadId: lead.id,
        formId: lead.form_id,
        createdTime: lead.created_time,
        fullName: '',
        email: '',
        phone: ''
    };
    
    // Parse field_data array
    if (lead.field_data && Array.isArray(lead.field_data)) {
        lead.field_data.forEach(field => {
            if (field.name === 'full_name') {
                data.fullName = field.values[0] || '';
            } else if (field.name === 'email') {
                data.email = field.values[0] || '';
            } else if (field.name === 'phone_number') {
                data.phone = field.values[0] || '';
            }
        });
    }
    
    return data;
}

async function analyzeLeads() {
    console.log('Starting concise analysis of B2C New leads...\n');
    
    // Get the leads
    const leads = await getLeads(B2C_NEW_FORM_ID);
    if (!leads.length) {
        console.error('No leads found to analyze.');
        return;
    }
    
    // Analyze each lead
    console.log('\nANALYZING LEADS:\n----------------');
    
    const results = [];
    for (let i = 0; i < leads.length; i++) {
        const lead = leads[i];
        const leadData = mapLeadFieldsToData(lead);
        
        console.log(`\n[${i+1}/${leads.length}] Analyzing lead ${leadData.leadId}:`);
        console.log(`Name: ${leadData.fullName}`);
        console.log(`Email: ${leadData.email}`);
        console.log(`Phone: ${leadData.phone}`);
        
        // First try LLM detection
        console.log('Checking with LLM...');
        const llmResult = await llmSpamDetector.detectSpam(leadData);
        
        if (llmResult) {
            console.log(`LLM Result: ${llmResult.isSpam ? '⚠️ SPAM' : '✅ LEGITIMATE'} (${(llmResult.confidence * 100).toFixed(0)}% confidence)`);
            console.log(`Reason: ${llmResult.reason}`);
            
            results.push({
                leadId: leadData.leadId,
                name: leadData.fullName,
                email: leadData.email,
                phone: leadData.phone,
                isSpam: llmResult.isSpam,
                confidence: llmResult.confidence,
                reason: llmResult.reason,
                detectionMethod: 'llm'
            });
        } else {
            // Fall back to rule-based
            console.log('LLM detection failed, falling back to rule-based...');
            const ruleBasedResult = calculateSpamScore(leadData);
            
            console.log(`Rule-Based Result: ${ruleBasedResult.isSpam ? '⚠️ SPAM' : '✅ LEGITIMATE'} (Score: ${ruleBasedResult.score})`);
            console.log(`Reasons: ${ruleBasedResult.reasons.join(', ')}`);
            
            results.push({
                leadId: leadData.leadId,
                name: leadData.fullName,
                email: leadData.email,
                phone: leadData.phone,
                isSpam: ruleBasedResult.isSpam,
                score: ruleBasedResult.score,
                reasons: ruleBasedResult.reasons,
                detectionMethod: 'rule-based'
            });
        }
    }
    
    // Save results to file
    const timestamp = new Date().toISOString();
    fs.writeFileSync(
        `b2c-analysis-${timestamp}.json`, 
        JSON.stringify(results, null, 2)
    );
    
    console.log(`\n\nSummary:`);
    console.log(`--------`);
    console.log(`Analyzed ${leads.length} leads from B2C New form`);
    
    const spamCount = results.filter(r => r.isSpam).length;
    console.log(`${spamCount} spam leads detected (${(spamCount/leads.length*100).toFixed(1)}%)`);
    
    const llmCount = results.filter(r => r.detectionMethod === 'llm').length;
    console.log(`${llmCount} leads analyzed with LLM`);
    
    console.log(`\nFull results saved to b2c-analysis-${timestamp}.json`);
}

// Run the analysis
analyzeLeads().catch(err => {
    console.error('Error in main process:', err);
}); 