/**
 * Gemini API utilities for image analysis
 */

/**
 * Fetches an image from a URL and converts it to a GenerativePart for the Gemini API.
 * @param {string} url - The public URL of the image.
 * @param {string} mimeType - The MIME type of the image (e.g., 'image/jpeg').
 * @returns {Promise<{inlineData: {data: string, mimeType: string}}>}
 */
export async function urlToGenerativePart(url, mimeType) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image from ${url}: ${response.statusText}`);
  }

  // Get ArrayBuffer from the image fetch
  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  // Convert to base64 in chunks to avoid call stack size exceeded error
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.slice(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  const base64Data = btoa(binary);

  return {
    inlineData: {
      data: base64Data,
      mimeType: mimeType,
    },
  };
}

/**
 * Analyzes multiple images using Google Gemini API
 * @param {Object} options - Configuration options
 * @param {string} options.apiKey - Gemini API key
 * @param {string} options.imageUrl - Image URL to analyze
 * @param {string} options.prompt - Custom prompt for the analysis (optional)
 * @param {string} options.mimeType - Image MIME type (default: 'image/jpeg')
 * @returns {Promise<Object>} - Parsed JSON response from Gemini
 */
export async function analyzeImageWithGemini({ apiKey, imageUrl, prompt = null, mimeType = 'image/jpeg' }) {
  try {
    // Fetch and convert all images to Base64 Parts concurrently
    const imageParts = await urlToGenerativePart(imageUrl, mimeType);

    // Construct the dynamic prompt for multiple images
    const dynamicPrompt = prompt || `
Analyze the following image URL and extract the power outage schedule data from each one.
Assign the extracted structured data to the 'groups' key.
Use Group ID like 1.1, 1.2, 1.3, etc. from orange blocks.
Use date from the top left corner of the image (orange block).
Use this exact structure for the data:
{
  "groups": [
    {
      "id": "Group ID (e.g., 1.1)",
      'date': "Date (e.g., 31.10.2025)",
      "status": "Power status (e.g., Електроенергії немає or Електроенергія є)",
      "schedule": "Time range(s) or empty string (e.g., 14:00-15:30 or '')"
    }
  ]
}
    `.trim();

    const payload = {
      contents: [
        {
          parts: [
            imageParts,
            { text: dynamicPrompt }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.0 // Set to 0.0 for reliable data extraction
      },
      systemInstruction: {
        parts: [{
          text: "You are an expert OCR and data extraction tool. \n\
          Your only task is to analyze the images based on the user's prompt and return a single, \
          valid JSON object containing the data for all images. \n\
          Do not include any text outside of the final JSON object."
        }]
      }
    };

    // Call the Gemini API REST endpoint
    const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

    const geminiResponse = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(payload)
    });

    if (!geminiResponse.ok) {
      const errorBody = await geminiResponse.text();
      console.error('Gemini API Error:', errorBody);
      throw new Error(`Gemini API call failed: ${errorBody}`);
    }

    const geminiData = await geminiResponse.json();

    // Extract the JSON response text
    const jsonText = geminiData.candidates[0].content.parts[0].text.trim();

    // Parse and return the JSON
    const parsedData = JSON.parse(jsonText);

    return {
      success: true,
      data: parsedData,
      modelUsed: 'gemini-2.5-flash',
      imagesProcessed: 1
    };

  } catch (error) {
    console.error('Error analyzing images with Gemini:', error);
    return {
      success: false,
      error: error.message,
      modelUsed: 'gemini-2.5-flash'
    };
  }
}
