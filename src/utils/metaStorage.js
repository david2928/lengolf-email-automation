const fs = require('fs').promises;
const path = require('path');

class MetaStorage {
    constructor() {
        this.storagePath = path.join(process.cwd(), 'data', 'processed_leads.json');
    }

    async initialize() {
        try {
            await fs.mkdir(path.dirname(this.storagePath), { recursive: true });
            try {
                await fs.access(this.storagePath);
            } catch {
                await fs.writeFile(this.storagePath, JSON.stringify({
                    b2b: { leads: [], lastProcessed: '' },
                    b2c: { leads: [], lastProcessed: '' }
                }));
            }
        } catch (error) {
            console.error('Error initializing storage:', error);
            throw error;
        }
    }

    async getStoredData() {
        try {
            const data = await fs.readFile(this.storagePath, 'utf8');
            const parsed = JSON.parse(data);
            if (!parsed.b2b || !parsed.b2c) {
                return {
                    b2b: { leads: [], lastProcessed: '' },
                    b2c: { leads: [], lastProcessed: '' }
                };
            }
            return parsed;
        } catch (error) {
            console.error('Error reading stored data:', error);
            return {
                b2b: { leads: [], lastProcessed: '' },
                b2c: { leads: [], lastProcessed: '' }
            };
        }
    }

    async markLeadAsProcessed(leadId, type, timestamp = new Date().toISOString()) {
        try {
            const data = await this.getStoredData();
            if (!data[type].leads.includes(leadId)) {
                data[type].leads.push(leadId);
                data[type].lastProcessed = timestamp;
                await fs.writeFile(this.storagePath, JSON.stringify(data, null, 2));
            }
        } catch (error) {
            console.error('Error marking lead as processed:', error);
            throw error;
        }
    }
}

module.exports = { MetaStorage };