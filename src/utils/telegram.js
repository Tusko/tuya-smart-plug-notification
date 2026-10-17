/**
 * Telegram Bot API utilities
 *
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
 * @param {object} [options]
 * @param {string} [options.parseMode] - 'MarkdownV2' | 'HTML' | 'Markdown'. When set, text is sent as-is (caller escapes).
 *   When omitted, text is auto-escaped and sent as MarkdownV2.
 * @param {boolean} [options.silent] - Deliver without notification sound
 * @returns {Promise<Response>} - Fetch response
 */
export async function sendTelegramMessage(botToken, chatId, text, { parseMode, silent = false } = {}) {
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

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const payload = {
    text: parseMode ? text : escapeMarkdownV2(text),
    chat_id: chatId,
    parse_mode: parseMode || 'MarkdownV2',
    disable_notification: silent,
  };

  console.log('sendTelegramMessage: Sending to', url);
  console.log('sendTelegramMessage: Payload', { ...payload, text: text.substring(0, 50) + '...' });

  // Add timeout to prevent hanging requests
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    console.log('sendTelegramMessage: Response status', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('sendTelegramMessage: API error response', errorText);
      throw new Error(`Telegram API returned ${response.status}: ${errorText}`);
    }

    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      console.error('sendTelegramMessage: Request timed out');
      throw new Error('Telegram API request timed out after 15 seconds');
    }
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
 * @param {object} [options]
 * @param {boolean} [options.silent] - Deliver without notification sound
 * @returns {Promise<Response>} - Fetch response
 */
export async function sendTelegramPhoto(botToken, chatId, photoUrl, caption = '', { silent = false } = {}) {
  // Add timeout to prevent hanging requests
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 second timeout for photo uploads

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        photo: photoUrl,
        caption,
        chat_id: chatId,
        disable_notification: silent,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Telegram API returned ${response.status}: ${errorText}`);
    }

    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Telegram photo upload timed out after 20 seconds');
    }
    throw error;
  }
}


/**
 * Send to every chat; one broken chat (e.g. "chat not found") must not block the rest
 * or the state saves that follow. Throws only if every chat failed.
 * @param {Array<string>} chatIds
 * @param {(chatId: string) => Promise<Response>} send
 * @param {{ error: Function }} [logger]
 */
export async function sendToChats(chatIds, send, logger = console) {
  const results = await Promise.allSettled(chatIds.map(send));
  const failed = results.filter((r, i) => {
    if (r.status !== 'rejected') return false;
    logger.error(`Telegram send to chat ${chatIds[i]} failed:`, r.reason?.message || r.reason);
    return true;
  });
  if (failed.length === results.length && failed.length > 0) {
    throw failed[0].reason;
  }
  return results;
}
