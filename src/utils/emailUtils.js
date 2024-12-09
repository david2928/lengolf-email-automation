function extractPlainText(htmlBody) {
    // Remove style and script sections
    let text = htmlBody.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    
    // Convert <br> to spaces
    text = text.replace(/<br\s*\/?>/gi, ' ');
    
    // Remove all HTML tags
    text = text.replace(/<[^>]+>/g, '');
    
    // Decode HTML entities
    text = text.replace(/&nbsp;/g, ' ')
               .replace(/&amp;/g, '&')
               .replace(/&lt;/g, '<')
               .replace(/&gt;/g, '>')
               .replace(/&quot;/g, '"');
    
    // Remove excessive whitespace
    text = text.replace(/\s+/g, ' ').trim();
    
    return text;
  }
  
  function formatDate(date) {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });
  }
  
  function parseTime(timeStr) {
    const [time, period] = timeStr.split(' ');
    let [hours, minutes] = time.split(':').map(Number);
    
    if (period === 'PM' && hours < 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    
    return { hours, minutes };
  }
  
  module.exports = {
    extractPlainText,
    formatDate,
    parseTime
  };