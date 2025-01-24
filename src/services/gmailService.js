const { google } = require('googleapis');
const { log } = require('../utils/logging');

class GmailService {
  constructor(auth) {
    this.auth = auth;
    this.gmail = google.gmail({ version: 'v1', auth });
  }

  async getLabelId(labelName) {
    try {
      const response = await this.gmail.users.labels.list({
        userId: 'me'
      });
      
      const label = response.data.labels.find(l => l.name === labelName);
      if (!label) {
        log('WARNING', 'Label not found', { labelName });
        return null;
      }
      return label.id;
    } catch (error) {
      log('ERROR', 'Error getting label ID', {
        labelName,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async listThreads(labelName) {
    try {
      const labelId = await this.getLabelId(labelName);
      if (!labelId) {
        return [];
      }

      const response = await this.gmail.users.threads.list({
        userId: 'me',
        labelIds: [labelId],
        maxResults: 100
      });

      const threads = response.data.threads || [];
      log('INFO', 'Listed threads for label', {
        labelName,
        count: threads.length
      });
      return threads;
    } catch (error) {
      log('ERROR', 'Error listing threads', {
        labelName,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async getThreadMessages(threadId) {
    try {
      const response = await this.gmail.users.threads.get({
        userId: 'me',
        id: threadId
      });
      const messages = response.data.messages || [];
      log('DEBUG', 'Retrieved thread messages', {
        threadId,
        messageCount: messages.length
      });
      return messages;
    } catch (error) {
      log('ERROR', 'Error getting thread messages', {
        threadId,
        error: error.message,
        stack: error.stack
      });
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

      log('WARNING', 'No message body found', { messageId });
      return '';
    } catch (error) {
      log('ERROR', 'Error getting message body', {
        messageId,
        error: error.message,
        stack: error.stack
      });
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
      
      log('INFO', 'Thread moved successfully', {
        threadId,
        from: sourceLabel,
        to: targetLabel
      });
    } catch (error) {
      log('ERROR', 'Error moving thread', {
        threadId,
        sourceLabel,
        targetLabel,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
}

module.exports = { GmailService };