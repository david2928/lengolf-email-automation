require('dotenv').config();
const axios = require('axios');
const { log } = require('../utils/logging');
const { llmSpamDetector } = require('../utils/llmSpamDetection');

// Define spam detection prompt
const SPAM_DETECTION_PROMPT = `
You are an AI tasked with identifying spam/bot submissions in a form for golf experiences in Thailand.
Analyze the following details and determine if it's likely a spam/bot submission.
Consider these signals of spam:
1. Nonsensical characters appended to real names
2. Random alphanumeric strings in the name field
3. Clearly fake/temporary email addresses
4. Non-Thai phone numbers that don't match standard formats
5. Excessive repetition of characters or patterns

Return a JSON response with:
1. isSpam: boolean
2. confidence: number (0-1)
3. reasons: array of strings explaining why

User Information:
Name: {fullName}
Email: {email}
Phone: {phoneNumber}
Additional Fields: {additionalFields}
`;

// Patch the detectSpam method with more robust parsing
llmSpamDetector.detectSpam = async function(leadData) {
    if (!this.enabled || !this.isInitialized) {
        console.log('LLM detection disabled or not initialized');
        return null;
    }

    try {
        // Create the prompt with the lead data
        const additionalFields = {};
        const prompt = SPAM_DETECTION_PROMPT
            .replace('{fullName}', leadData.fullName || 'N/A')
            .replace('{email}', leadData.email || 'N/A')
            .replace('{phoneNumber}', leadData.phone || 'N/A')
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
        
        console.log(`LLM result for ${leadData.fullName}: ${jsonResponse.isSpam ? 'SPAM' : 'OK'} (${(jsonResponse.confidence * 100).toFixed(0)}%)`);
        
        return {
            isSpam: jsonResponse.isSpam,
            confidence: jsonResponse.confidence,
            reasons: jsonResponse.reasons || []
        };
    } catch (error) {
        console.error('LLM detection error:', error.message);
        return null;
    }
};

// Only test B2C New form
const B2C_NEW_FORM_ID = '625669719834512';
const LEADS_TO_FETCH = 3;

// Meta API configuration
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

async function getLeads(formId) {
    try {
        console.log(`Fetching ${LEADS_TO_FETCH} leads from B2C New form...`);
        const response = await axios.get(
            `https://graph.facebook.com/v19.0/${formId}/leads`,
            {
                params: {
                    access_token: META_ACCESS_TOKEN,
                    limit: LEADS_TO_FETCH,
                },
            }
        );
        
        if (response.data && response.data.data) {
            console.log(`Retrieved ${response.data.data.length} leads.`);
            return response.data.data || [];
        } else {
            console.error(`API response missing data`);
            return [];
        }
    } catch (error) {
        console.error(`API error:`, error.message);
        return [];
    }
}

function mapLead(lead) {
    const data = {
        leadId: lead.id,
        formId: lead.form_id,
        createdTime: lead.created_time,
        fullName: '',
        email: '',
        phone: ''
    };
    
    if (lead.field_data && Array.isArray(lead.field_data)) {
        lead.field_data.forEach(field => {
            if (field.name === 'full_name') data.fullName = field.values[0] || '';
            else if (field.name === 'email') data.email = field.values[0] || '';
            else if (field.name === 'phone_number') data.phone = field.values[0] || '';
        });
    }
    
    return data;
}

async function main() {
    console.log('Testing LLM spam detection on 3 B2C leads...');
    
    const leads = await getLeads(B2C_NEW_FORM_ID);
    if (!leads.length) {
        console.error('No leads found.');
        return;
    }
    
    console.log('\nProcessing leads:');
    console.log('-----------------');
    
    for (let i = 0; i < Math.min(leads.length, LEADS_TO_FETCH); i++) {
        const leadData = mapLead(leads[i]);
        
        console.log(`\nLead ${i+1}: ${leadData.fullName}`);
        console.log(`Email: ${leadData.email}`);
        console.log(`Phone: ${leadData.phone}`);
        
        await llmSpamDetector.detectSpam(leadData);
    }
    
    console.log('\nTesting complete!');
}

main().catch(console.error); 