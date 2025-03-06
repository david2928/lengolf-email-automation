require('dotenv').config();
const { FacebookB2BProcessor } = require('../processors/facebookB2BProcessor');
const { log } = require('../utils/logging');

// Sample B2B lead data for testing
const sampleLead = {
  id: 'sample-lead-123',
  formId: process.env.FORM_ID_B2B_NEW || 'sample-form-id',
  createdTime: new Date().toISOString(),
  fullName: 'John Test',
  email: 'john.test@example.com',
  phoneNumber: '0812345678',
  companyName: 'Test Company Ltd.',
  eventType: 'Corporate Event',
  eventGroupType: 'Team Building',
  expectedAttendees: '15-20',
  budgetPerPerson: '2000-3000 THB',
  preferredDate: 'Next month',
  eventPlanningTimeline: 'Within 1 month',
  interestedActivities: 'Golf, Food & Beverage',
  additionalActivities: 'Would like some team building activities',
  // New form fields
  eventObjective: 'Team bonding and strategy planning',
  eventLocation: 'Bangkok',
  eventFormat: 'Half-day event',
  eventDuration: '4 hours',
  specialRequirements: 'Need vegetarian food options'
};

// Main function to test B2B notification
async function testB2BNotification() {
  try {
    log('INFO', 'Starting B2B notification test with sample lead');
    
    // Initialize the B2B processor
    const processor = new FacebookB2BProcessor();
    
    // Process the lead and send notification
    await processor.process(sampleLead);
    
    log('SUCCESS', 'B2B notification test completed successfully');
  } catch (error) {
    log('ERROR', 'B2B notification test failed', { error: error.message });
  }
}

// Run the test
testB2BNotification(); 