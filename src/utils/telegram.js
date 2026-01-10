/**
 * Telegram Bot API utilities
 */

/**
 * Send a text message via Telegram Bot API
 * @param {string} botToken - Telegram bot token
 * @param {string} chatId - Chat ID to send message to
 * @param {string} text - Message text to send
 * @returns {Promise<Response>} - Fetch response
 */
export async function sendTelegramMessage(botToken, chatId, text) {
  return fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      text,
      chat_id: chatId,
      parse_mode: 'MarkdownV2',
    })
  });
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

