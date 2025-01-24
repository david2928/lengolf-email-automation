require('dotenv').config();
const { MetaLeadService } = require('../services/metaLeadService');
const fs = require('fs').promises;
const path = require('path');
const XLSX = require('xlsx');
const iconv = require('iconv-lite');

async function exportLeadsToCSV() {
    const metaService = new MetaLeadService();
    const outputDir = path.join(__dirname, '..', '..', 'output');

    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });

    try {
        console.log('Fetching B2B leads...');
        const b2bLeads = await metaService.getNewLeads(process.env.META_B2B_FORM_ID);
        console.log(`Found ${b2bLeads.length} B2B leads`);

        console.log('Fetching B2C leads...');
        const b2cLeads = await metaService.getNewLeads(process.env.META_B2C_FORM_ID);
        console.log(`Found ${b2cLeads.length} B2C leads`);

        // Transform leads data
        const transformedLeads = [
            ...b2bLeads.map(lead => ({
                'Lead ID': lead.id,
                'Created Time': lead.created_time,
                'Form ID': process.env.META_B2B_FORM_ID,
                'Ad ID': lead.ad_id || '',
                'Campaign ID': lead.campaign_id || '',
                'Ad Set ID': lead.adset_id || '',
                'Type': 'B2B',
                'Email': decodeThaiText(extractFieldValue(lead, 'email')),
                'Full Name': decodeThaiText(extractFieldValue(lead, 'full_name')),
                'Phone': decodeThaiText(extractFieldValue(lead, 'phone_number')),
                'Platform': lead.platform || '',
                'Created Time (Local)': new Date(lead.created_time).toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })
            })),
            ...b2cLeads.map(lead => ({
                'Lead ID': lead.id,
                'Created Time': lead.created_time,
                'Form ID': process.env.META_B2C_FORM_ID,
                'Ad ID': lead.ad_id || '',
                'Campaign ID': lead.campaign_id || '',
                'Ad Set ID': lead.adset_id || '',
                'Type': 'B2C',
                'Email': decodeThaiText(extractFieldValue(lead, 'email')),
                'Full Name': decodeThaiText(extractFieldValue(lead, 'full_name')),
                'Phone': decodeThaiText(extractFieldValue(lead, 'phone_number')),
                'Platform': lead.platform || '',
                'Created Time (Local)': new Date(lead.created_time).toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })
            }))
        ];

        // Create workbook and worksheet
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(transformedLeads);

        // Add worksheet to workbook
        XLSX.utils.book_append_sheet(wb, ws, "Leads");

        // Write to file
        const filename = `leads_export_${new Date().toISOString().split('T')[0]}.xlsx`;
        const filepath = path.join(outputDir, filename);
        XLSX.writeFile(wb, filepath);

        console.log(`Successfully exported ${transformedLeads.length} leads to Excel file: ${filename}`);

        // Log a sample lead for debugging
        if (transformedLeads.length > 0) {
            console.log('\nSample lead data (first record):');
            console.log(JSON.stringify(transformedLeads[0], null, 2));
        }

        process.exit(0);
    } catch (error) {
        console.error('Error exporting leads:', error);
        console.error('Error details:', error.response?.data || error);
        process.exit(1);
    }
}

function extractFieldValue(lead, fieldName) {
    const field = lead.field_data?.find(field => field.name === fieldName);
    return field?.values?.[0] || '';
}

function decodeThaiText(text) {
    if (!text) return '';
    
    // If the text is already in correct Thai encoding, return as is
    if (/[\u0E00-\u0E7F]/.test(text)) {
        return text;
    }
    
    try {
        // Convert incorrectly encoded Thai text
        const isoBytes = iconv.encode(text, 'iso-8859-1');
        return iconv.decode(isoBytes, 'utf-8');
    } catch (error) {
        console.warn(`Warning: Could not decode text "${text}":`, error);
        return text;
    }
}

// Run only if directly executed
if (require.main === module) {
    exportLeadsToCSV();
}