require('dotenv').config();
const { LineMessagingService } = require('../services/lineMessagingService');
const { log } = require('../utils/logging');

async function testLineMessaging() {
  try {
    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!channelAccessToken) {
      throw new Error('LINE_CHANNEL_ACCESS_TOKEN not found in environment variables');
    }