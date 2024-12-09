const { google } = require('googleapis');

class GmailService {
  constructor(auth) {
    this.auth = auth; // Store the auth object
    this.gmail = google.gmail({ version: 'v1', auth });
  }

  async getLabelId(labelName) {
    try {
      const response = await this.gmail.users.labels.list({
        userId: 'me'
      });
      
      const label = response.data.labels.find(l => l.name === labelName);
      return label ? label.id : null;
    } catch (error) {
      console.error('Error getting label ID:', error);
      throw error;
    }
  }

  async listThreads(labelName) {
    try {
      const labelId = await this.getLabelId(labelName);
      if (!labelId) {
        console.warn(`Label not found: ${labelName}`);
        return [];
      }

      const response = await this.gmail.users.threads.list({
        userId: 'me',
        labelIds: [labelId],
        maxResults: 100
      });

      return response.data.threads || [];
    } catch (error) {
      console.error('Error listing threads:', error);
      throw error;
    }
  }

  async getThreadMessages(threadId) {
    try {
      const response = await this.gmail.users.threads.get({
        userId: 'me',
        id: threadId
      });
      return response.data.messages || [];
    } catch (error) {
      console.error('Error getting thread messages:', error);
      throw error;
    }
  }

  async getMessageBody(messageId) {
    try {
      const response = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full'
      });

      const payload = response.data.payload;
      const parts = payload.parts || [payload];
      
      for (const part of parts) {
        if (part.mimeType === 'text/html') {
          return Buffer.from(part.body.data, 'base64').toString();
        }
      }

      // Fallback to plain text if HTML not found
      for (const part of parts) {
        if (part.mimeType === 'text/plain') {
          return Buffer.from(part.body.data, 'base64').toString();
        }
      }

      return '';
    } catch (error) {
      console.error('Error getting message body:', error);
      throw error;
    }
  }

  async moveThread(threadId, sourceLabel, targetLabel) {
    try {
      const sourceLabelId = await this.getLabelId(sourceLabel);
      const targetLabelId = await this.getLabelId(targetLabel);

      await this.gmail.users.threads.modify({
        userId: 'me',
        id: threadId,
        requestBody: {
          removeLabelIds: [sourceLabelId],
          addLabelIds: [targetLabelId]
        }
      });
    } catch (error) {
      console.error('Error moving thread:', error);
      throw error;
    }
  }
}

module.exports = { GmailService };