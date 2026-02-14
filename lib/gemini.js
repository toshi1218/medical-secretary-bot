import { GoogleGenerativeAI } from '@google/generative-ai';

let genAI = null;

/**
 * Gemini API クライアントを取得
 */
function getGeminiClient() {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not set');
    }
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

/**
 * 画像からテキストを抽出（OCR）
 */
export async function extractTextFromImage(imageBuffer, mimeType = 'image/jpeg') {
  try {
    const genAI = getGeminiClient();
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    const prompt = `
You are an OCR assistant for medical students. Extract ALL text from this image accurately.

Focus on:
- Subject name (e.g., Surgery, Internal Medicine, Pediatrics)
- Module number or section
- Due dates or deadlines
- Task descriptions
- Any important medical terminology

Return ONLY the extracted text, preserving the original formatting as much as possible.
`;

    const imagePart = {
      inlineData: {
        data: Buffer.from(imageBuffer).toString('base64'),
        mimeType
      }
    };

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const text = response.text();

    return text.trim();
  } catch (error) {
    console.error('Gemini OCR failed:', error);
    throw error;
  }
}

/**
 * OCRテキストから科目名を抽出
 */
export function extractSubjectFromOCR(ocrText) {
  const subjects = [
    'Surgery', 'Internal Medicine', 'Pediatrics', 'Obstetrics',
    'Gynecology', 'Psychiatry', 'Radiology', 'Pathology',
    'Anatomy', 'Physiology', 'Biochemistry', 'Pharmacology',
    'Community Medicine', 'Forensic Medicine', 'Anesthesiology'
  ];

  for (const subject of subjects) {
    const regex = new RegExp(subject, 'i');
    if (regex.test(ocrText)) {
      return subject;
    }
  }

  return null;
}

/**
 * OCRテキストから期限を抽出
 */
export function extractDeadlineFromOCR(ocrText) {
  // 日付パターン: "Feb 15", "February 15, 2024", "15/02/2024", etc.
  const datePatterns = [
    /(\w+ \d{1,2},? \d{4})/i,  // "February 15, 2024"
    /(\w+ \d{1,2})/i,          // "Feb 15"
    /(\d{1,2}\/\d{1,2}\/\d{4})/,  // "15/02/2024"
    /(\d{4}-\d{2}-\d{2})/      // "2024-02-15"
  ];

  for (const pattern of datePatterns) {
    const match = ocrText.match(pattern);
    if (match) {
      try {
        const date = new Date(match[1]);
        if (!isNaN(date.getTime())) {
          return date.toISOString();
        }
      } catch (e) {
        // Invalid date, continue
      }
    }
  }

  return null;
}

/**
 * OCRテキストからモジュール番号を抽出
 */
export function extractModuleFromOCR(ocrText) {
  const modulePattern = /Module\s+(\d+)/i;
  const match = ocrText.match(modulePattern);
  return match ? match[1] : null;
}
