require('dotenv').config();
const { MetaLeadService } = require('../services/metaLeadService');

async function checkFormFields() {
    const metaService = new MetaLeadService();
    const forms = [
        { id: process.env.META_B2C_FORM_ID, type: 'B2C' },
        { id: process.env.META_B2B_FORM_ID, type: 'B2B' }
    ];

    const formFields = {};

    try {
        for (const form of forms) {
            console.log(`\nFetching leads from ${form.type} form (ID: ${form.id})`);
            const leads = await metaService.getNewLeads(form.id);
            
            if (leads.length === 0) {
                console.log(`No leads found for ${form.type} form.`);
                continue;
            }

            // Get the first lead's details to examine the field structure
            const leadDetails = await metaService.getLeadDetails(leads[0].id);
            formFields[form.type] = leadDetails.rawFields;
            
            console.log(`\n${form.type} Form Fields:`);
            console.log('============================');
            console.log(JSON.stringify(leadDetails.rawFields, null, 2));
        }

        // Create a combined set of all field names
        const allFields = new Set([
            ...Object.keys(formFields.B2C || {}),
            ...Object.keys(formFields.B2B || {})
        ]);

        // Display comparison table
        console.log('\nField Comparison Table:');
        console.log('============================');
        console.log('Field Name'.padEnd(50) + '| B2C Form | B2B Form');
        console.log('-'.repeat(80));

        allFields.forEach(field => {
            const b2cValue = formFields.B2C?.[field] ? '✓' : '-';
            const b2bValue = formFields.B2B?.[field] ? '✓' : '-';
            console.log(`${field.padEnd(50)}| ${b2cValue.padEnd(9)}| ${b2bValue}`);
        });

    } catch (error) {
        console.error('Error checking form fields:', error.message);
        if (error.response?.data) {
            console.error('API Error Details:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

// Run the check for both forms
checkFormFields(); 