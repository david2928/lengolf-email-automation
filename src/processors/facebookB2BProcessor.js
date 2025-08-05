const { LineMessagingService } = require('../utils/lineMessaging');
const { calculateSpamScore } = require('../utils/fraudDetection');
const { log } = require('../utils/logging');

class FacebookB2BProcessor {
    constructor(gmailService) {
        this.gmailService = gmailService;
        this.lineMessaging = new LineMessagingService(
            process.env.LINE_CHANNEL_ACCESS_TOKEN_B2B || process.env.LINE_CHANNEL_ACCESS_TOKEN,
            process.env.LINE_GROUP_ID_B2B || process.env.LINE_GROUP_ID,
            'B2B'
        );
        this.b2bSheetId = process.env.FACEBOOK_B2B_SHEET_ID;
    }

    validateLead(lead) {
        return (
            lead.fullName &&
            lead.email &&
            lead.phoneNumber &&
            lead.companyName
        );
    }

    createLineMessage(data, spamInfo) {
        let message = `[Facebook B2B Lead] New business lead received.\n\n`;
        
        // Basic Information
        message += `📋 Basic Information\n`;
        message += `Company: ${data.companyName}\n`;
        message += `Contact: ${data.fullName}\n`;
        message += `Phone: ${data.phoneNumber}\n`;
        message += `Email: ${data.email}\n`;
        message += `Created: ${data.createdTime}\n\n`;

        // Event Details
        message += `🎯 Event Details\n`;
        if (data.eventType) message += `Event Type: ${data.eventType}\n`;
        if (data.eventGroupType) message += `Group Type: ${data.eventGroupType}\n`;
        if (data.expectedAttendees) message += `Expected Attendees: ${data.expectedAttendees}\n`;
        if (data.budgetPerPerson) message += `Budget per Person: ${data.budgetPerPerson}\n`;
        if (data.preferredDate) message += `Preferred Date: ${data.preferredDate}\n`;
        if (data.eventPlanningTimeline) message += `Planning Timeline: ${data.eventPlanningTimeline}\n`;

        // Activities
        if (data.additionalActivities || data.interestedActivities) {
            message += `\n🎮 Activities\n`;
            if (data.interestedActivities) message += `Interested In: ${data.interestedActivities}\n`;
            if (data.additionalActivities) message += `Additional Activities: ${data.additionalActivities}\n`;
        }

        // Form-specific fields for new form
        if (data.eventObjective) message += `Event Objective: ${data.eventObjective}\n`;
        if (data.eventLocation) message += `Preferred Location: ${data.eventLocation}\n`;
        if (data.eventFormat) message += `Event Format: ${data.eventFormat}\n`;
        if (data.eventDuration) message += `Event Duration: ${data.eventDuration}\n`;
        if (data.specialRequirements) message += `Special Requirements: ${data.specialRequirements}\n`;


        return message;
    }

    async sendNotification(data, processedLead) {
        try {
            const message = this.createLineMessage(data, processedLead);
            await this.lineMessaging.send(message);
            log('INFO', 'Sent B2B LINE notification', { 
                fullName: data.fullName,
                companyName: data.companyName
            });
        } catch (error) {
            log('ERROR', 'Error sending B2B LINE notification', {
                error: error.message,
                fullName: data.fullName
            });
            throw error;
        }
    }

    async process(data, skipNotification = false) {
        try {
            if (!this.validateLead(data)) {
                log('ERROR', 'Invalid B2B lead data', { 
                    fullName: data.fullName,
                    hasEmail: !!data.email,
                    hasPhone: !!data.phoneNumber,
                    hasCompany: !!data.companyName
                });
                throw new Error('Invalid B2B lead data');
            }

            const spamInfo = await calculateSpamScore(data);
            
            // Only send notification if not skipping and not spam
            if (!skipNotification && !spamInfo.isLikelySpam) {
                await this.sendNotification(data, spamInfo);
            }

            return {
                success: true,
                type: 'B2B',
                isLikelySpam: spamInfo.isLikelySpam,
                spamScore: spamInfo.score,
                spamReasons: spamInfo.reasons,
                detectionType: spamInfo.detectionType || 'rule-based',
                eventType: data.eventType,
                expectedAttendees: data.expectedAttendees,
                budgetPerPerson: data.budgetPerPerson
            };
        } catch (error) {
            log('ERROR', 'Error processing B2B lead', {
                error: error.message,
                fullName: data.fullName
            });
            throw error;
        }
    }
}

module.exports = { FacebookB2BProcessor };