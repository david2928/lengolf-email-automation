require('dotenv').config();
const { MetaLeadService } = require('../services/metaLeadService');
const { MetaStorage } = require('../utils/metaStorage');

async function loadHistoricalLeads() {
    const storage = new MetaStorage();
    const metaService = new MetaLeadService();

    try {
        await storage.initialize();
        
        console.log('Loading historical B2B leads...');
        const b2bLeads = await metaService.getNewLeads(process.env.META_B2B_FORM_ID);
        console.log('B2B leads count:', b2bLeads.length);
        
        console.log('\nLoading historical B2C leads...');
        const b2cLeads = await metaService.getNewLeads(process.env.META_B2C_FORM_ID);
        console.log('B2C leads count:', b2cLeads.length);

        const timestamp = new Date().toISOString();
        
        for (const lead of b2bLeads) {
            await storage.markLeadAsProcessed(lead.id, 'b2b', timestamp);
        }
        
        for (const lead of b2cLeads) {
            await storage.markLeadAsProcessed(lead.id, 'b2c', timestamp);
        }
        
        console.log('Historical leads loaded successfully');
        process.exit(0);
    } catch (error) {
        console.error('Error loading historical leads:', error);
        console.error('Error details:', error.response?.data || error);
        process.exit(1);
    }
}

// Run only if directly executed
if (require.main === module) {
    loadHistoricalLeads();
}