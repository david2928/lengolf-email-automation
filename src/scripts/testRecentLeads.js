require('dotenv').config();
const axios = require('axios');
const { calculateSpamScore } = require('../utils/fraudDetection');
const { supabase } = require('../lib/supabase');
const { log } = require('../utils/logging');
const fs = require('fs');

// Facebook form IDs
const FORM_IDS = {
    'B2B (New)': '562422893450533',
    'B2B (Old)': '905376497889703',
    'B2C (New)': '625669719834512',
    'B2C (Old)': '1067700894958557'
};

// Meta API configuration
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const META_PAGE_ID = process.env.META_PAGE_ID;

// Number of leads to fetch per form
const LEADS_PER_FORM = 25; // 25 leads per form = approximately 100 leads total

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
    // Extract field data from lead
    const fieldData = lead.field_data || [];
    
    // Map to structured object
    const leadData = {
        id: lead.id,
        createdTime: lead.created_time,
        formId: lead.form_id,
        platform: lead.platform,
        adId: lead.ad_id,
        adsetId: lead.adset_id,
        campaignId: lead.campaign_id,
        fullName: '',
        email: '',
        phoneNumber: '',
        fieldData: fieldData
    };

    // Extract specific fields from field_data
    for (const field of fieldData) {
        const name = field.name?.toLowerCase();
        const values = field.values || [];
        const value = values[0] || '';

        if (name === 'full_name' || name === 'fullname') {
            leadData.fullName = value;
        } else if (name === 'email') {
            leadData.email = value;
        } else if (name === 'phone_number' || name === 'phone') {
            leadData.phoneNumber = value;
        } else if (name === 'company_name' || name === 'company') {
            leadData.companyName = value;
        } else if (name === 'event_type') {
            leadData.eventType = value;
        } else if (name === 'group_size') {
            leadData.groupSize = value;
        }
    }

    return leadData;
}

function getFormTypeById(formId) {
    for (const [type, id] of Object.entries(FORM_IDS)) {
        if (id === formId) return type;
    }
    return 'Unknown';
}

async function analyzeRecentLeads() {
    console.log('Analyzing recent Facebook leads for spam detection...');
    
    const results = {
        total: 0,
        spam: 0,
        byForm: {},
        detectionMethods: {
            llm: 0,
            ruleBased: 0
        },
        spamDetails: []
    };

    // Initialize results counters for each form type
    for (const formType of Object.keys(FORM_IDS)) {
        results.byForm[formType] = {
            total: 0,
            spam: 0,
            spamPercentage: 0
        };
    }

    // Process each form
    for (const [formType, formId] of Object.entries(FORM_IDS)) {
        console.log(`\nFetching leads for ${formType} (Form ID: ${formId})...`);
        
        const leads = await getLeads(formId);
        console.log(`Retrieved ${leads.length} leads.`);
        
        results.byForm[formType].total = leads.length;
        results.total += leads.length;
        
        // Process each lead
        for (const lead of leads) {
            const leadData = mapLeadFieldsToData(lead);
            
            try {
                // Analyze for spam
                const spamResult = await calculateSpamScore(leadData);
                
                if (spamResult.isLikelySpam) {
                    results.spam++;
                    results.byForm[formType].spam++;
                    
                    // Count by detection method
                    if (spamResult.detectionType === 'llm') {
                        results.detectionMethods.llm++;
                    } else {
                        results.detectionMethods.ruleBased++;
                    }
                    
                    // Store details for spam leads
                    results.spamDetails.push({
                        id: lead.id,
                        formType,
                        fullName: leadData.fullName,
                        email: leadData.email,
                        phoneNumber: leadData.phoneNumber,
                        score: spamResult.score,
                        reasons: spamResult.reasons,
                        detectionType: spamResult.detectionType,
                        analysis: spamResult.llmAnalysis || 'N/A'
                    });
                }
                
            } catch (error) {
                console.error(`Error analyzing lead ${lead.id}:`, error.message);
            }
        }

        // Calculate spam percentage
        if (results.byForm[formType].total > 0) {
            results.byForm[formType].spamPercentage = 
                (results.byForm[formType].spam / results.byForm[formType].total * 100).toFixed(2);
        }
    }

    // Calculate overall spam percentage
    if (results.total > 0) {
        results.spamPercentage = (results.spam / results.total * 100).toFixed(2);
    }

    return results;
}

function displayResults(results) {
    console.log('\n=============================================');
    console.log('       FACEBOOK LEAD SPAM ANALYSIS REPORT    ');
    console.log('=============================================\n');
    
    console.log(`Total Leads Analyzed: ${results.total}`);
    console.log(`Total Spam Detected: ${results.spam} (${results.spamPercentage}%)\n`);
    
    console.log('RESULTS BY FORM:');
    console.log('-----------------');
    for (const [formType, data] of Object.entries(results.byForm)) {
        if (data.total > 0) {
            console.log(`${formType}:`);
            console.log(`  Total: ${data.total}`);
            console.log(`  Spam: ${data.spam} (${data.spamPercentage}%)`);
            console.log('');
        }
    }
    
    console.log('DETECTION METHODS:');
    console.log('-----------------');
    console.log(`LLM Detection: ${results.detectionMethods.llm} (${((results.detectionMethods.llm / results.spam) * 100 || 0).toFixed(2)}%)`);
    console.log(`Rule-Based Detection: ${results.detectionMethods.ruleBased} (${((results.detectionMethods.ruleBased / results.spam) * 100 || 0).toFixed(2)}%)`);
    
    console.log('\nDETAILED SPAM LEADS:');
    console.log('-----------------');
    for (const spam of results.spamDetails) {
        console.log(`ID: ${spam.id} (${spam.formType})`);
        console.log(`Name: ${spam.fullName}`);
        console.log(`Email: ${spam.email}`);
        console.log(`Phone: ${spam.phoneNumber}`);
        console.log(`Score: ${spam.score} (via ${spam.detectionType})`);
        console.log(`Reasons: ${spam.reasons.join(', ')}`);
        if (spam.detectionType === 'llm' && spam.analysis !== 'N/A') {
            console.log(`Analysis: ${spam.analysis}`);
        }
        console.log('-----------------');
    }
    
    // Write results to a JSON file for reference
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    fs.writeFileSync(
        `spam-analysis-${timestamp}.json`, 
        JSON.stringify(results, null, 2)
    );
    console.log(`\nFull results saved to spam-analysis-${timestamp}.json`);
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