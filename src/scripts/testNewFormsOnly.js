require('dotenv').config();
const axios = require('axios');
const { calculateSpamScore } = require('../utils/fraudDetection');
const { supabase } = require('../lib/supabase');
const { log } = require('../utils/logging');
const { llmSpamDetector } = require('../utils/llmSpamDetection');
const fs = require('fs');

// Only new Facebook form IDs
const FORM_IDS = {
    'B2B (New)': '562422893450533',
    'B2C (New)': '625669719834512'
};

// Meta API configuration
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const META_PAGE_ID = process.env.META_PAGE_ID;

// Number of leads to fetch per form - reduced to 10
const LEADS_PER_FORM = 10;

async function getLeads(formId, limit = LEADS_PER_FORM) {
    try {
        console.log(`Fetching leads for form ID ${formId}...`);
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
            console.error(`Error: Response from Facebook API is missing data: ${JSON.stringify(response.data)}`);
            return [];
        }
    } catch (error) {
        console.error(`Error fetching leads for form ${formId}:`, error.message);
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

function getFormTypeById(formId) {
    for (const [formType, id] of Object.entries(FORM_IDS)) {
        if (id === formId) {
            return formType;
        }
    }
    return 'Unknown';
}

async function analyzeRecentLeads() {
    console.log('Analyzing recent Facebook leads for spam detection...\n');
    
    const results = {
        totalLeads: 0,
        totalSpam: 0,
        llmDetections: 0,
        ruleBasedDetections: 0,
        byForm: {},
        spamLeads: []
    };
    
    // Initialize statistics for each form
    for (const formType in FORM_IDS) {
        results.byForm[formType] = {
            total: 0,
            spam: 0,
            percentage: 0
        };
    }

    // Process each form
    for (const [formType, formId] of Object.entries(FORM_IDS)) {
        console.log(`\nFetching leads for ${formType} (Form ID: ${formId})...`);
        const leads = await getLeads(formId);
        console.log(`Retrieved ${leads.length} leads.`);
        
        for (const lead of leads) {
            const leadData = mapLeadFieldsToData(lead);
            
            // First, try LLM detection if enabled
            let llmResult = null;
            try {
                llmResult = await llmSpamDetector.detectSpam(leadData);
            } catch (error) {
                console.error(`LLM detection error for lead ${leadData.leadId}:`, error.message);
            }
            
            // If LLM detection failed or is disabled, fall back to rule-based
            let spamScore = null;
            let detectionMethod = null;
            
            if (llmResult) {
                spamScore = {
                    isSpam: llmResult.isSpam,
                    score: llmResult.confidence,
                    reasons: [llmResult.reason]
                };
                detectionMethod = 'llm';
                results.llmDetections++;
            } else {
                // Fall back to rule-based detection
                spamScore = calculateSpamScore(leadData);
                detectionMethod = 'rule-based';
                if (spamScore.isSpam) {
                    results.ruleBasedDetections++;
                }
            }
            
            // Increment total count for this form
            results.byForm[formType].total++;
            results.totalLeads++;
            
            // Handle spam detection
            if (spamScore.isSpam) {
                results.totalSpam++;
                results.byForm[formType].spam++;
                
                // Add detailed spam info
                results.spamLeads.push({
                    id: leadData.leadId,
                    formType: formType,
                    name: leadData.fullName,
                    email: leadData.email,
                    phone: leadData.phone,
                    score: spamScore.score,
                    detectionMethod: detectionMethod,
                    reasons: spamScore.reasons
                });
            }
        }
        
        // Calculate percentage for this form
        if (results.byForm[formType].total > 0) {
            results.byForm[formType].percentage = 
                (results.byForm[formType].spam / results.byForm[formType].total) * 100;
        }
    }
    
    // Calculate overall percentage
    if (results.totalLeads > 0) {
        results.spamPercentage = (results.totalSpam / results.totalLeads) * 100;
    }
    
    // Save full results to file
    const timestamp = new Date().toISOString();
    fs.writeFileSync(
        `spam-analysis-new-forms-${timestamp}.json`, 
        JSON.stringify(results, null, 2)
    );
    
    return results;
}

function displayResults(results) {
    console.log('\n=============================================');
    console.log('       FACEBOOK LEAD SPAM ANALYSIS REPORT');
    console.log('=============================================\n');
    
    console.log(`Total Leads Analyzed: ${results.totalLeads}`);
    console.log(`Total Spam Detected: ${results.totalSpam} (${results.spamPercentage.toFixed(2)}%)\n`);
    
    console.log('RESULTS BY FORM:');
    console.log('-----------------');
    for (const [formType, stats] of Object.entries(results.byForm)) {
        console.log(`${formType}:`);
        console.log(`  Total: ${stats.total}`);
        console.log(`  Spam: ${stats.spam} (${stats.percentage.toFixed(2)}%)\n`);
    }
    
    console.log('DETECTION METHODS:');
    console.log('-----------------');
    console.log(`LLM Detection: ${results.llmDetections} (${(results.llmDetections / results.totalSpam * 100 || 0).toFixed(2)}%)`);
    console.log(`Rule-Based Detection: ${results.ruleBasedDetections} (${(results.ruleBasedDetections / results.totalSpam * 100 || 0).toFixed(2)}%)\n`);
    
    console.log('DETAILED SPAM LEADS:');
    console.log('-----------------');
    results.spamLeads.forEach(lead => {
        console.log(`ID: ${lead.id} (${lead.formType})`);
        console.log(`Name: ${lead.name}`);
        console.log(`Email: ${lead.email}`);
        console.log(`Phone: ${lead.phone}`);
        console.log(`Score: ${lead.score} (via ${lead.detectionMethod})`);
        console.log(`Reasons: ${lead.reasons.join(', ')}`);
        console.log('-----------------');
    });
    
    console.log(`\nFull results saved to spam-analysis-new-forms-${new Date().toISOString()}.json`);
}

async function main() {
    try {
        const results = await analyzeRecentLeads();
        displayResults(results);
    } catch (error) {
        console.error('Error in analysis:', error);
    }
}

// Run the analysis
main(); 