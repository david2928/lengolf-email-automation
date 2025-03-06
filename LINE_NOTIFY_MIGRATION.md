# Migrating from LINE Notify to LINE Messaging API

## Background

LINE has announced the discontinuation of LINE Notify, requiring services that use this API to migrate to alternative services. This guide outlines the steps to transition from LINE Notify to the LINE Messaging API, which provides more robust and feature-rich messaging capabilities.

## Key Differences

| Feature | LINE Notify | LINE Messaging API |
|---------|------------|-------------------|
| Communication | One-way notifications | Two-way interactive messaging |
| User experience | Generic notification account | Custom LINE bot account |
| Rich media | Limited (text, images, stickers) | Extensive (text, images, videos, audio, location, templates, flex messages) |
| User management | Relies on notification tokens | Uses user/group IDs |
| Authentication | Simple token-based | OAuth 2.0 with channel access tokens |

## Migration Steps

### 1. Create a LINE Developer Account and Channel

1. Visit the [LINE Developers Console](https://developers.line.biz/console/)
2. Create a new Provider (if you don't have one)
3. Create a new Messaging API channel
4. Note your Channel ID, Channel Secret, and Channel Access Token

### 2. Set Up Your LINE Bot

1. Configure your bot's basic information:
   - Set a profile image and description
   - Enable webhooks
   - Set the webhook URL to your server endpoint

2. Add the bot as a friend or to a group where you want to receive notifications

### 3. Update Your Code

#### Before (LINE Notify):

```javascript
const axios = require('axios');

async function sendNotification(message) {
  try {
    await axios({
      method: 'post',
      url: 'https://notify-api.line.me/api/notify',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${process.env.LINE_NOTIFY_TOKEN}`
      },
      data: `message=${message}`
    });
  } catch (error) {
    console.error('Failed to send LINE notification:', error);
  }
}
```

#### After (LINE Messaging API):

```javascript
const line = require('@line/bot-sdk');

// Configure LINE client
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

const client = new line.Client(config);

async function sendMessage(targetId, message) {
  try {
    await client.pushMessage(targetId, {
      type: 'text',
      text: message
    });
  } catch (error) {
    console.error('Failed to send LINE message:', error);
  }
}
```

### 4. Set Up Webhook Handling

To enable interactive capabilities, implement webhook handling:

```javascript
const express = require('express');
const line = require('@line/bot-sdk');

const app = express();

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

// LINE webhook middleware
app.post('/webhook', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then(() => res.end())
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

// Event handler
function handleEvent(event) {
  // Handle different event types (message, follow, join, etc.)
  if (event.type === 'message' && event.message.type === 'text') {
    // Handle text messages
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `Received: ${event.message.text}`
    });
  }
  
  // Return a resolved promise for non-handled events
  return Promise.resolve(null);
}

app.listen(3000);
```

### 5. Collect User/Group IDs

Before completely shutting down LINE Notify, collect the LINE IDs of users or groups that should receive messages:

1. Implement a command in your bot that returns the user/group ID:
   ```javascript
   if (event.message.text === '!id') {
     let id;
     if (event.source.type === 'user') {
       id = event.source.userId;
     } else if (event.source.type === 'group') {
       id = event.source.groupId;
     } else if (event.source.type === 'room') {
       id = event.source.roomId;
     }
     
     return client.replyMessage(event.replyToken, {
       type: 'text',
       text: `Your ID: ${id}`
     });
   }
   ```

2. Store these IDs in your database or configuration

### 6. Implement Rich Features (Optional)

Take advantage of the LINE Messaging API's rich features:

#### Flex Messages

```javascript
const flexMessage = {
  type: 'flex',
  altText: 'Inventory Update',
  contents: {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: 'Inventory Status',
          weight: 'bold',
          size: 'xl',
          color: '#ffffff'
        }
      ],
      backgroundColor: '#0367D3'
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: 'Weekly Inventory Update',
          weight: 'bold',
          size: 'md',
          margin: 'md'
        },
        {
          type: 'text',
          text: 'Items running low:',
          size: 'sm',
          color: '#555555',
          margin: 'md'
        },
        {
          type: 'text',
          text: '• Item A: 5 remaining',
          size: 'sm',
          margin: 'sm'
        },
        {
          type: 'text',
          text: '• Item B: 3 remaining',
          size: 'sm',
          margin: 'sm'
        }
      ]
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'button',
          action: {
            type: 'uri',
            label: 'View Full Report',
            uri: 'https://your-app-url.com/inventory'
          },
          style: 'primary'
        }
      ]
    }
  }
};

client.pushMessage(targetId, flexMessage);
```

## Testing and Verification

1. Send test messages with your new implementation
2. Verify receipt in all target groups/users
3. Run parallel systems (both LINE Notify and Messaging API) temporarily to ensure a smooth transition
4. Monitor for any delivery failures or issues

## Environment Variables Update

Update your environment variables in your deployment environment:

```
# Remove
LINE_NOTIFY_TOKEN=xxxxxxx

# Add
CHANNEL_ACCESS_TOKEN=xxxxxxx
CHANNEL_SECRET=xxxxxxx
LINE_GROUP_IDS=group_id1,group_id2
```

## Timeline for Migration

1. **Setup Phase (1-2 weeks)**: Create channels, implement basic messaging
2. **Parallel Operation (2-4 weeks)**: Run both systems side by side, monitor for issues
3. **Full Migration (1 week)**: Switch completely to LINE Messaging API
4. **Cleanup (1 week)**: Remove all LINE Notify code and configurations

## Conclusion

While migrating from LINE Notify to the LINE Messaging API requires upfront work, it provides significant benefits in terms of functionality, user experience, and future capabilities. The Messaging API allows for rich, interactive messages and two-way communication that can enhance your application's functionality beyond simple notifications.

## Additional Resources

- [LINE Messaging API Documentation](https://developers.line.biz/en/docs/messaging-api/)
- [LINE Bot SDK for Node.js](https://github.com/line/line-bot-sdk-nodejs)
- [Messaging API Reference](https://developers.line.biz/en/reference/messaging-api/) 