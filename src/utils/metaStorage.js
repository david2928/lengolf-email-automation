const { supabase } = require('../lib/supabase');

class MetaStorage {
    async initialize() {
        // No initialization needed for Supabase table
        return true;
    }

    async getStoredData() {
        try {
            const { data: b2bLeads, error: b2bError } = await supabase
                .from('processed_leads')
                .select('lead_id')
                .eq('lead_type', 'b2b');

            const { data: b2cLeads, error: b2cError } = await supabase
                .from('processed_leads')
                .select('lead_id')
                .eq('lead_type', 'b2c');

            if (b2bError || b2cError) throw b2bError || b2cError;

            return {
                b2b: { 
                    leads: b2bLeads.map(l => l.lead_id),
                    lastProcessed: ''
                },
                b2c: { 
                    leads: b2cLeads.map(l => l.lead_id),
                    lastProcessed: ''
                }
            };
        } catch (error) {
            console.error('Error reading stored data:', error);
            return {
                b2b: { leads: [], lastProcessed: '' },
                b2c: { leads: [], lastProcessed: '' }
            };
        }
    }

    async markLeadAsProcessed(leadId, type, metaSubmittedAt = null) {
        try {
            const { error } = await supabase
                .from('processed_leads')
                .insert([{ 
                    lead_id: leadId,
                    lead_type: type,
                    meta_submitted_at: metaSubmittedAt
                }]);

            if (error) throw error;
        } catch (error) {
            console.error('Error marking lead as processed:', error);
            throw error;
        }
    }
}

module.exports = { MetaStorage };