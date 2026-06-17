'use strict';

const OpenAI = require('openai').default;
const logger = require('../../config/logger');

// ─── Service Types ─────────────────────────────────────────────────────────────
const SERVICE_TYPES = [
  'برمجة', 'بحث', 'عروض', 'CV', 'رياضيات', 'واجبات',
  'اختبارات', 'مشاريع', 'تقارير', 'ترجمة', 'طب', 'تصميم',
  'سكليف', 'تدريب',
];

// ─── Request Detection Keywords ────────────────────────────────────────────────
const REQUEST_KEYWORDS = [
  'ابي مختص', 'مين يسوي', 'احتاج', 'عندي كويز', 'عندي فاينل',
  'برزنتيشن', 'عذر طبي', 'يحل لاب', 'CV', 'برمجة', 'مشروع',
  'بروجكت', 'تقرير', 'سكليف', 'تكليف', 'واجب', 'بحث', 'بوربوينت',
  'عرض تقديمي', 'ميد', 'فاينل', 'تدريب تعاوني', 'تدريب ميداني',
  'تقرير طبي', 'ابغا', 'محتاج', 'ممكن احد', 'ابحث عن',
  'يساعدني', 'كويز', 'اختبار', 'امتحان', 'assignment', 'homework',
  'project', 'report', 'lab', 'quiz', 'exam',
  'ابغى', 'ابي', 'أبي', 'أحتاج', 'أريد', 'اريد', 'مين يحل', 'مين يعرف',
  'مين يقدر', 'يسويلي', 'يحللي', 'فزعة', 'فزعه', 'مساعدة', 'مساعده',
  'مطلب', 'مطلوب شخص', 'مطلوب حل', 'شخص يحل', 'عندي اختبار', 'عندي واجب',
  'عندي مشروع', 'عندي بحث', 'بحوث', 'واجبات', 'مشاريع', 'كويزات', 'سيرة ذاتية'
];

// ─── Advertiser Detection Keywords ────────────────────────────────────────────
const ADVERTISER_KEYWORDS = [
  'نسوي', 'متوفر', 'نحل', 'نقدم خدمات', 'مكتب', 'خبراء',
  'تواصل معنا', 'واتس', 'اعلن', 'للتواصل', 'خدمات', 'نخدم',
  'نوفر', 'فريق', 'team', 'DM', 'إنجاز', 'ننجز',
  'لطلب الخدمة', 'نعطيك', 'أفضل الأسعار', 'ضمان',
];

// ─── Priority Detection Keywords ──────────────────────────────────────────────
const URGENT_KEYWORDS = [
  'عاجل', 'اليوم', 'الليلة', 'بكره', 'ضروري', 'asap', 'urgent',
  'نفس اليوم', 'خلال ساعة', 'دقائق', 'الان', 'الآن', 'بسرعة',
];

const LOW_PRIORITY_KEYWORDS = [
  'الاسبوع القادم', 'الشهر القادم', 'مفيش ضغط', 'بدون استعجال',
];

// ─── Keyword Matcher ───────────────────────────────────────────────────────────
/**
 * Checks if text contains any of the given keywords (case-insensitive).
 * @param {string} text
 * @param {string[]} keywords
 * @returns {string[]} matched keywords
 */
const findMatchingKeywords = (text, keywords) => {
  const lowerText = text.toLowerCase();
  return keywords.filter((kw) => lowerText.includes(kw.toLowerCase()));
};

/**
 * Falls back to keyword matching when OpenAI is unavailable.
 * @param {string} messageText
 * @returns {Object} Classification result
 */
const keywordFallback = (messageText) => {
  const matchedRequestKws = findMatchingKeywords(messageText, REQUEST_KEYWORDS);
  const matchedAdvertiserKws = findMatchingKeywords(messageText, ADVERTISER_KEYWORDS);

  const isAdvertiser = matchedAdvertiserKws.length > 0 && matchedRequestKws.length === 0;
  const isRequest = matchedRequestKws.length > 0 && !isAdvertiser;

  // Detect service type from message
  let serviceType = null;
  const lowerText = messageText.toLowerCase();

  if (lowerText.includes('برمجة') || lowerText.includes('code') || lowerText.includes('python') || lowerText.includes('java')) {
    serviceType = 'برمجة';
  } else if (lowerText.includes('بحث') || lowerText.includes('research')) {
    serviceType = 'بحث';
  } else if (lowerText.includes('cv') || lowerText.includes('سيرة ذاتية')) {
    serviceType = 'CV';
  } else if (lowerText.includes('تدريب')) {
    serviceType = 'تدريب';
  } else if (lowerText.includes('تقرير') || lowerText.includes('report')) {
    serviceType = 'تقارير';
  } else if (lowerText.includes('مشروع') || lowerText.includes('project') || lowerText.includes('بروجكت')) {
    serviceType = 'مشاريع';
  } else if (lowerText.includes('واجب') || lowerText.includes('تكليف') || lowerText.includes('assignment')) {
    serviceType = 'واجبات';
  } else if (lowerText.includes('اختبار') || lowerText.includes('كويز') || lowerText.includes('فاينل') || lowerText.includes('ميد') || lowerText.includes('exam') || lowerText.includes('quiz')) {
    serviceType = 'اختبارات';
  } else if (lowerText.includes('بوربوينت') || lowerText.includes('عرض') || lowerText.includes('برزنتيشن') || lowerText.includes('presentation')) {
    serviceType = 'عروض';
  } else if (lowerText.includes('رياضيات') || lowerText.includes('math') || lowerText.includes('calculus') || lowerText.includes('حسبان')) {
    serviceType = 'رياضيات';
  } else if (lowerText.includes('ترجمة') || lowerText.includes('translation')) {
    serviceType = 'ترجمة';
  } else if (lowerText.includes('تصميم') || lowerText.includes('design')) {
    serviceType = 'تصميم';
  } else if (lowerText.includes('طب') || lowerText.includes('عذر') || lowerText.includes('تقرير طبي')) {
    serviceType = 'طب';
  } else if (lowerText.includes('سكليف') || lowerText.includes('scalf')) {
    serviceType = 'سكليف';
  }

  // Priority detection
  let priority = 'NORMAL';
  if (findMatchingKeywords(messageText, URGENT_KEYWORDS).length > 0) {
    priority = 'URGENT';
  } else if (findMatchingKeywords(messageText, LOW_PRIORITY_KEYWORDS).length > 0) {
    priority = 'LOW';
  }

  const allMatchedKeywords = [...matchedRequestKws, ...matchedAdvertiserKws];
  const confidenceScore = isRequest
    ? Math.min(0.5 + matchedRequestKws.length * 0.1, 0.85)
    : isAdvertiser
    ? 0.9
    : 0.1;

  return {
    isRequest,
    isAdvertiser,
    serviceType,
    confidenceScore,
    keywords: allMatchedKeywords.slice(0, 10),
    priority,
    classifiedBy: 'keyword_fallback',
  };
};

// ─── OpenAI Client ────────────────────────────────────────────────────────────
let openaiClient = null;

const getOpenAIClient = () => {
  if (!openaiClient && process.env.OPENAI_API_KEY) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
};

// ─── System Prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `أنت محلل رسائل متخصص في منصة خدمات أكاديمية. مهمتك تحليل رسائل مجموعات تيليجرام باللغة العربية أو الإنجليزية وتصنيفها.

**أنواع الرسائل:**
1. **طلب (request)**: شخص يطلب خدمة أكاديمية (برمجة، بحث، تقارير، إلخ)
2. **إعلان (advertisement)**: شخص يعلن عن خدمات يقدمها
3. **دردشة (chat)**: محادثة عادية غير ذات صلة
4. **سبام (spam)**: رسائل مزعجة أو بلا معنى

**أنواع الخدمات الأكاديمية:**
برمجة، بحث، عروض، CV، رياضيات، واجبات، اختبارات، مشاريع، تقارير، ترجمة، طب، تصميم، سكليف، تدريب

**تعليمات:**
- حلل الرسالة وحدد نوعها بدقة
- إذا كانت طلبًا، حدد نوع الخدمة المطلوبة من القائمة أعلاه
- احسب درجة الثقة من 0.0 إلى 1.0
- استخرج الكلمات المفتاحية الرئيسية (حتى 8 كلمات)
- حدد الأولوية: URGENT (عاجل/اليوم)، NORMAL (عادي)، LOW (غير مستعجل)

**أمثلة طلبات:**
- "ابي مختص يحل واجب برمجة"
- "محتاج مساعدة في بحث"
- "مين يسوي لي CV"
- "عندي فاينل بكره"

**أمثلة إعلانات:**
- "نحل جميع الواجبات، للتواصل واتساب"
- "متوفر متخصصون في البرمجة، تواصل معنا"

أجب دائمًا بـ JSON فقط بهذا الشكل:
{
  "messageType": "request|advertisement|chat|spam",
  "isRequest": true|false,
  "isAdvertiser": true|false,
  "serviceType": "نوع الخدمة أو null",
  "confidenceScore": 0.0-1.0,
  "keywords": ["كلمة1", "كلمة2"],
  "priority": "URGENT|NORMAL|LOW",
  "reasoning": "سبب موجز للتصنيف"
}`;

// ─── Main Classifier ───────────────────────────────────────────────────────────
/**
 * Classifies a Telegram message using OpenAI GPT-4o-mini.
 * Falls back to keyword matching if OpenAI is unavailable or fails.
 *
 * @param {string} messageText - The raw message text to classify
 * @param {Object} [context] - Optional context (senderName, groupName)
 * @returns {Promise<Object>} Classification result
 */
const classifyMessage = async (messageText, context = {}) => {
  // Skip empty or very short messages
  if (!messageText || messageText.trim().length < 5) {
    return {
      isRequest: false,
      isAdvertiser: false,
      serviceType: null,
      confidenceScore: 0,
      keywords: [],
      priority: 'NORMAL',
      classifiedBy: 'skipped_short',
    };
  }

  const client = getOpenAIClient();

  if (!client) {
    logger.warn('OpenAI client not available, using keyword fallback');
    return keywordFallback(messageText);
  }

  try {
    const userContent = context.groupName
      ? `المجموعة: ${context.groupName}\nالمرسل: ${context.senderName || 'مجهول'}\n\nالرسالة:\n${messageText}`
      : messageText;

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      temperature: 0.1,
      max_tokens: 300,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Empty response from OpenAI');

    const parsed = JSON.parse(content);

    // Validate required fields
    const result = {
      isRequest: Boolean(parsed.isRequest),
      isAdvertiser: Boolean(parsed.isAdvertiser),
      serviceType: parsed.serviceType && SERVICE_TYPES.includes(parsed.serviceType)
        ? parsed.serviceType
        : null,
      confidenceScore: Math.min(Math.max(Number(parsed.confidenceScore) || 0, 0), 1),
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 8) : [],
      priority: ['URGENT', 'NORMAL', 'LOW'].includes(parsed.priority) ? parsed.priority : 'NORMAL',
      messageType: parsed.messageType || 'unknown',
      reasoning: parsed.reasoning || '',
      classifiedBy: 'openai_gpt4o_mini',
    };

    logger.debug('Message classified by OpenAI', {
      isRequest: result.isRequest,
      serviceType: result.serviceType,
      confidence: result.confidenceScore,
    });

    return result;
  } catch (err) {
    logger.error('OpenAI classification failed, falling back to keywords', {
      error: err.message,
    });
    return keywordFallback(messageText);
  }
};

module.exports = { classifyMessage, keywordFallback };
