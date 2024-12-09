const { LineNotifyService } = require('../utils/lineNotify');

class FacebookB2CProcessor {
    constructor(gmailService) {
        this.gmailService = gmailService;
        this.lineNotify = new LineNotifyService(process.env.LINE_TOKEN_B2C || process.env.LINE_TOKEN_FACEBOOK);
    }

    validateLead(lead) {
        return (
            lead.fullName &&
            lead.email &&
            lead.phoneNumber
        );
    }

    createLineMessage(data) {
        let message = `[Facebook Lead] New individual lead received.\n`;
        message += `Name: ${data.fullName}\n` +
                  `Phone: ${data.phoneNumber}\n` +
                  `Email: ${data.email}\n` +
                  `Created: ${data.createdTime}\n`;

        if (data.eventsDescription) message += `Interests: ${data.eventsDescription}\n`;

        message += `Please call back this lead and follow up.\n` +
                  `Status and outcome should be logged via ` +
                  `https://docs.google.com/spreadsheets/d/${process.env.FACEBOOK_SHEET_ID}/edit?usp=sharing`;

        return message;
    }

    async process(data) {
        try {
            if (!this.validateLead(data)) {
                throw new Error('Invalid B2C lead data');
            }

            const message = this.createLineMessage(data);
            await this.lineNotify.send(message);

            return {
                success: true,
                message: message,
                type: 'B2C'
            };
        } catch (error) {
            console.error('Error processing B2C lead:', error);
            throw error;
        }
    }
}

module.exports = { FacebookB2CProcessor };