/**
 * Telegram Bot API utilities
 */

/**
 * Escape special characters for Telegram MarkdownV2
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text
 */
function escapeMarkdownV2(text) {
  // Characters that need to be escaped in MarkdownV2: _ * [ ] ( ) ~ ` > # + - = | { } . !
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

/**
 * Send a text message via Telegram Bot API
 * @param {string} botToken - Telegram bot token
 * @param {string} chatId - Chat ID to send message to
 * @param {string} text - Message text to send
 * @returns {Promise<Response>} - Fetch response
 */
export async function sendTelegramMessage(botToken, chatId, text) {
  if (!botToken) {
    console.error('sendTelegramMessage: botToken is missing');
    throw new Error('Bot token is required');
  }
  if (!chatId) {
    console.error('sendTelegramMessage: chatId is missing');
    throw new Error('Chat ID is required');
  }
  if (!text) {
    console.error('sendTelegramMessage: text is missing');
    throw new Error('Message text is required');
  }

  // Escape text for MarkdownV2
  const escapedText = escapeMarkdownV2(text);

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const payload = {
    text: escapedText,
    chat_id: chatId,
    parse_mode: 'MarkdownV2',
  };

  console.log('sendTelegramMessage: Sending to', url);
  console.log('sendTelegramMessage: Payload', { ...payload, text: text.substring(0, 50) + '...' });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    console.log('sendTelegramMessage: Response status', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('sendTelegramMessage: API error response', errorText);
      throw new Error(`Telegram API returned ${response.status}: ${errorText}`);
    }

    return response;
  } catch (error) {
    console.error('sendTelegramMessage: Fetch error', error);
    throw error;
  }
}

/**
 * Send a photo with caption via Telegram Bot API
 * @param {string} botToken - Telegram bot token
 * @param {string} chatId - Chat ID to send photo to
 * @param {string} photoUrl - URL of the photo to send
 * @param {string} caption - Caption text (optional)
 * @returns {Promise<Response>} - Fetch response
 */
export async function sendTelegramPhoto(botToken, chatId, photoUrl, caption = '') {
  return fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      photo: photoUrl,
      caption,
      chat_id: chatId,
    })
  });
}

