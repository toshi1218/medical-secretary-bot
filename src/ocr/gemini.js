'use strict';

const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI = null;

function getGenAI() {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

/**
 * 画像ファイルからテキストをOCR抽出（Gemini 2.0 Flash）
 * @param {string} imagePath - 画像ファイルの絶対パス
 * @returns {Promise<string>} 抽出されたテキスト
 */
async function processImage(imagePath) {
  if (!fs.existsSync(imagePath)) {
    throw new Error(`Image file not found: ${imagePath}`);
  }

  const model = getGenAI().getGenerativeModel({ model: 'gemini-2.0-flash' });

  const imageData = fs.readFileSync(imagePath);
  const base64 = imageData.toString('base64');
  const mimeType = imagePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';

  const result = await model.generateContent([
    {
      inlineData: { data: base64, mimeType },
    },
    'Extract ALL text from this image. This is a medical school document. ' +
      'Include handwritten notes, printed text, table contents, and any annotations. ' +
      'Preserve the structure (headings, lists, tables) as much as possible. ' +
      'Output only the extracted text, no commentary.',
  ]);

  const text = result.response.text();
  return text.trim();
}

module.exports = { processImage };
