// Import required modules
const https = require('https');

// Environment variables (set in Vercel)
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const MONDAY_API_TOKEN = process.env.MONDAY_API_TOKEN;

// Store for tracking seen items
let seenItems = new Set();

// Function to send Telegram message
function sendTelegramMessage(message) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'HTML'
    });

    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => resolve(JSON.parse(body)));
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Function to get Monday.com items
function getMondayItems() {
  return new Promise((resolve, reject) => {
    const query = JSON.stringify({
      query: `{
        boards {
          id
          name
          items_page {
            items {
              id
              name
              column_values {
                id
                text
              }
            }
          }
        }
      }`
    });

    const options = {
      hostname: 'api.monday.com',
      path: '/v2',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': MONDAY_API_TOKEN,
        'Content-Length': query.length
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => resolve(JSON.parse(body)));
    });

    req.on('error', reject);
    req.write(query);
    req.end();
  });
}

// Main serverless function
module.exports = async (req, res) => {
  try {
    // Get items from Monday.com
    const mondayData = await getMondayItems();
    
    if (!mondayData.data || !mondayData.data.boards) {
      return res.status(200).json({ message: 'No boards found' });
    }

    const newItems = [];
    
    // Check each board for new items
    for (const board of mondayData.data.boards) {
      const items = board.items_page?.items || [];
      
      for (const item of items) {
        // If this is a new item we haven't seen
        if (!seenItems.has(item.id)) {
          seenItems.add(item.id);
          
          // Get status from column values
          let status = 'No status';
          if (item.column_values && item.column_values.length > 0) {
            const statusCol = item.column_values.find(col => col.text);
            if (statusCol) status = statusCol.text;
          }
          
          newItems.push({
            board: board.name,
            name: item.name,
            status: status
          });
        }
      }
    }

    // Send notifications for new items
    for (const item of newItems) {
      const message = `🔔 <b>New Item in Monday.com</b>\n\n📋 Board: ${item.board}\n📝 Item: ${item.name}\n✅ Status: ${item.status}`;
      await sendTelegramMessage(message);
    }

    res.status(200).json({ 
      message: 'Check completed', 
      newItems: newItems.length,
      totalTracked: seenItems.size
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
};
