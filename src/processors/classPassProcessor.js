const { LineNotifyService } = require('../utils/lineNotify');
const { extractPlainText, formatDate } = require('../utils/emailUtils');
const { log } = require('../utils/logging');

class ClassPassProcessor {
  constructor(gmailService) {
    this.gmail = gmailService;
    this.lineNotify = new LineNotifyService(process.env.LINE_TOKEN_CLASSPASS);
    this.sourceLabel = process.env.LABEL_CLASSPASS;
    this.completedLabel = process.env.LABEL_COMPLETED;
  }

  extractReservationDetails(bodyText) {
    const dateTimeMatch = bodyText.match(/at LenGolf\s*(\w+ \d{1,2}, \d{4}) @ (\d{1,2}:\d{2} [APM]{2})/i);
    if (!dateTimeMatch) return null;

    const [, reservationDate, reservationTime] = dateTimeMatch;
    
    const nameMatch = bodyText.match(/Reservation made by:\s*Name:\s*([^\r\n]+?)(?:\s+Email:|$)/i);
    if (!nameMatch) return null;

    const customerName = nameMatch[1].trim();
    
    const emailMatch = bodyText.match(/Email:\s*([^\s\r\n]+@[^\s\r\n]+)/i);
    const email = emailMatch ? emailMatch[1].trim() : '';
    
    const endTime = this.calculateEndTime(reservationTime);
    const date = new Date(reservationDate);
    const weekday = date.toLocaleDateString("en-US", { weekday: 'long' });

    return {
      date: reservationDate,
      weekday,
      startTime: reservationTime,
      endTime,
      customerName: email ? `${customerName} Email: ${email}` : customerName
    };
  }

  calculateEndTime(startTime) {
    const [time, period] = startTime.split(' ');
    let [hours, minutes] = time.split(':').map(Number);
    
    if (period === 'PM' && hours < 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    
    hours = (hours + 1) % 24;
    const newPeriod = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${newPeriod}`;
  }

  createLineMessage(details) {
    return `[ClassPass Booking] ` +
           `Date: ${details.weekday}, ${details.date}, ` +
           `Time: ${details.startTime} - ${details.endTime}, ` +
           `Customer: ${details.customerName}. ` +
           `Please check bay availability and submit booking form. ` +
           `This is a ClassPass booking, no payment required at the location.`;
  }

  async processEmails() {
    try {
      const threads = await this.gmail.listThreads(this.sourceLabel);
      log('INFO', 'Processing ClassPass threads', { count: threads.length });

      for (const thread of threads) {
        const messages = await this.gmail.getThreadMessages(thread.id);
        
        for (const message of messages) {
          const bodyHtml = await this.gmail.getMessageBody(message.id);
          const bodyText = extractPlainText(bodyHtml);
          
          const details = this.extractReservationDetails(bodyText);
          if (details) {
            const lineMessage = this.createLineMessage(details);
            await this.lineNotify.send(lineMessage);
            await this.gmail.moveThread(thread.id, this.sourceLabel, this.completedLabel);
            log('INFO', 'Processed ClassPass booking', { 
              customer: details.customerName,
              date: details.date,
              time: details.startTime
            });
          }
        }
      }
    } catch (error) {
      log('ERROR', 'Error processing ClassPass emails', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
}

module.exports = { ClassPassProcessor };