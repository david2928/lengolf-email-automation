const { LineNotifyService } = require('../utils/lineNotify');
const { extractPlainText, formatDate, parseTime } = require('../utils/emailUtils');
const { log } = require('../utils/logging');

class WebResosProcessor {
  constructor(gmailService) {
    this.gmail = gmailService;
    this.lineNotify = new LineNotifyService(process.env.LINE_TOKEN_WEBRESOS);
    this.sourceLabels = [process.env.LABEL_WEB, process.env.LABEL_RESOS];
    this.completedLabel = process.env.LABEL_COMPLETED;
  }

  extractWebBookingData(bodyText) {
    try {
      const phoneMatch = bodyText.match(/Phone Number:\s*(\+?\d[\d\s-]*)/i);
      const nameMatch = bodyText.match(/From:\s*(.*?)\s*Phone Number:/i);
      const timeMatch = bodyText.match(/Preferred Start Time:\s*(\d{4}-\d{2}-\d{2})\s(\d{2}:\d{2})\s*(AM|PM)/i);
      const playersMatch = bodyText.match(/Number of Players:\s*(\d+)/i);
      const hoursMatch = bodyText.match(/Number of Hours:\s*(\d+)/i);

      if (!phoneMatch || !nameMatch || !timeMatch || !playersMatch || !hoursMatch) {
        log('WARNING', 'Missing required fields in web booking', {
          hasPhone: !!phoneMatch,
          hasName: !!nameMatch,
          hasTime: !!timeMatch,
          hasPlayers: !!playersMatch,
          hasHours: !!hoursMatch
        });
        return null;
      }

      const date = new Date(timeMatch[1]);
      const startTime = `${timeMatch[2]} ${timeMatch[3]}`;
      const endTime = this.calculateEndTime(timeMatch[1], timeMatch[2], timeMatch[3], hoursMatch[1]);

      return {
        phoneNumber: phoneMatch[1].trim(),
        customerName: nameMatch[1].trim(),
        date: this.formatDate(date),
        startTime,
        endTime,
        numberOfPlayers: playersMatch[1]
      };
    } catch (error) {
      log('ERROR', 'Error extracting web booking data', {
        error: error.message,
        stack: error.stack
      });
      return null;
    }
  }

  extractResOSData(bodyText) {
    try {
      log('DEBUG', 'Processing ResOS email body text', { bodyText });
      
      const dateMatch = bodyText.match(/Date\s*(.*?\d{4})/i);
      const timeMatch = bodyText.match(/Time\s(\d{2}:\d{2}) - (\d{2}:\d{2})/i);
      const peopleMatch = bodyText.match(/People\s*(\d+)/i);
      const nameMatch = bodyText.match(/Name\s*(.*?)(?=\s+(?:Phone|Email))/i);
      const phoneMatch = bodyText.match(/Phone\s*(\+\d+\s*\d+\s*\d+\s*\d+)/i);

      if (!dateMatch || !timeMatch || !peopleMatch || !nameMatch || !phoneMatch) {
        log('WARNING', 'Missing required fields in ResOS booking', {
          hasDate: !!dateMatch,
          hasTime: !!timeMatch,
          hasPeople: !!peopleMatch,
          hasName: !!nameMatch,
          hasPhone: !!phoneMatch
        });
        return null;
      }

      const dateParts = dateMatch[1].match(/([^,]+), (\d+) ([^ ]+) (\d{4})/);
      const date = `${dateParts[1]}, ${dateParts[2]} ${dateParts[3]}`;

      return {
        phoneNumber: phoneMatch[1].trim(),
        customerName: nameMatch[1].trim(),
        date: date,
        startTime: timeMatch[1],
        endTime: timeMatch[2],
        numberOfPlayers: peopleMatch[1]
      };
    } catch (error) {
      log('ERROR', 'Error extracting ResOS data', {
        error: error.message,
        stack: error.stack
      });
      return null;
    }
  }

  formatDate(date) {
    const dayOfWeek = date.toLocaleDateString("en-US", { weekday: 'long' });
    const day = date.getDate();
    const month = date.toLocaleDateString("en-US", { month: 'long' });
    return `${dayOfWeek}, ${day} ${month}`;
  }

  convertTo24Hour(time, amPm) {
    const [hours, minutes] = time.split(':');
    let hrs = parseInt(hours);
    if (amPm.toLowerCase() === 'pm' && hrs < 12) {
      hrs += 12;
    }
    if (amPm.toLowerCase() === 'am' && hrs === 12) {
      hrs = 0;
    }
    return `${String(hrs).padStart(2, '0')}:${minutes}`;
  }

  calculateEndTime(startDate, startTime, amPm, durationHours) {
    const timeIn24 = this.convertTo24Hour(startTime, amPm);
    const startDateTime = new Date(`${startDate}T${timeIn24}`);
    const endTime = new Date(startDateTime.getTime() + parseInt(durationHours) * 3600000);
    return endTime.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  }

  createLineMessage(bookingData, source) {
    return `[New ${source} Booking] ` +
           `Customer ${bookingData.customerName} ` +
           `(${bookingData.phoneNumber}), ` +
           `${bookingData.numberOfPlayers} PAX on ` +
           `${bookingData.date} from ` +
           `${bookingData.startTime} - ${bookingData.endTime}. ` +
           `Please check bay availability and call back customer to confirm and submit booking form.`;
  }

  async processEmails() {
    try {
      for (const sourceLabel of this.sourceLabels) {
        const threads = await this.gmail.listThreads(sourceLabel);
        log('INFO', `Processing threads from ${sourceLabel}`, { count: threads.length });

        for (const thread of threads) {
          try {
            const messages = await this.gmail.getThreadMessages(thread.id);
            
            for (const message of messages) {
              const bodyHtml = await this.gmail.getMessageBody(message.id);
              const bodyText = extractPlainText(bodyHtml);
              log('DEBUG', 'Processing message body', { 
                messageId: message.id,
                bodyText
              });
              
              const isResOS = sourceLabel === process.env.LABEL_RESOS;
              const bookingData = isResOS ? 
                this.extractResOSData(bodyText) : 
                this.extractWebBookingData(bodyText);

              if (bookingData) {
                const source = isResOS ? 'ResOS' : 'Website';
                const lineMessage = this.createLineMessage(bookingData, source);
                log('DEBUG', 'Sending LINE message', { message: lineMessage });
                
                await this.lineNotify.send(lineMessage);
                await this.gmail.moveThread(thread.id, sourceLabel, this.completedLabel);
                log('INFO', `Processed ${source} booking`, {
                  customer: bookingData.customerName,
                  date: bookingData.date,
                  time: bookingData.startTime,
                  players: bookingData.numberOfPlayers
                });
              } else {
                log('WARNING', 'Could not extract booking data from message', {
                  messageId: message.id
                });
              }
            }
          } catch (threadError) {
            log('ERROR', `Error processing thread ${thread.id}`, {
              error: threadError.message,
              stack: threadError.stack
            });
          }
        }
      }
    } catch (error) {
      log('ERROR', 'Error processing Web/ResOS emails', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
}

module.exports = { WebResosProcessor };