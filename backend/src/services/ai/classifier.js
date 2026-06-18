'use strict';

const OpenAI = require('openai').default;
const logger = require('../../config/logger');

// ─── Service Types ─────────────────────────────────────────────────────────────
const SERVICE_TYPES = [
  'برمجة', 'بحث', 'عروض', 'CV', 'رياضيات', 'واجبات',
  'اختبارات', 'مشاريع', 'تقارير', 'ترجمة', 'طب', 'تصميم',
  'سكليف', 'تدريب',
];

// ─── Pre-filter: Quick reject patterns ─────────────────────────────────────────
/**
 * Quick pre-filter to reject messages that are obviously NOT requests.
 * This saves API calls by filtering out greetings, short replies, etc.
 * @param {string} text
 * @returns {boolean} true if the message should be skipped
 */
const shouldSkipMessage = (text) => {
  const trimmed = text.trim();

  // Too short to be a meaningful request
  if (trimmed.length < 10) return true;

  // Pure greetings / reactions
  const greetingPatterns = /^(السلام عليكم|وعليكم السلام|مرحبا|هلا|اهلا|حياكم|صباح الخير|مساء الخير|شكرا|الله يعطيك العافيه|جزاك الله خير|الحمد لله|ان شاء الله|ماشاء الله|تبارك الله|سبحان الله|الله اكبر|هههه|لا اله الا الله|استغفر الله|اللهم صل|آمين|امين|الله يوفقكم|موفق|بالتوفيق|تمام|اوكي|ok|okay|hi|hello|good morning|thanks)\s*[!.؟]*$/i;
  if (greetingPatterns.test(trimmed)) return true;

  // Messages that are just emojis
  const emojiOnly = /^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2702}-\u{27B0}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\s❤👍🤣😂]+$/u;
  if (emojiOnly.test(trimmed)) return true;

  // Very short single-word or two-word messages (unlikely to be requests)
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount <= 2 && trimmed.length < 20) return true;

  return false;
};

// ─── Advertiser Detection Keywords ────────────────────────────────────────────
const ADVERTISER_KEYWORDS = [
  'تواصل معنا', 'لطلب الخدمة', 'أفضل الأسعار', 'خصم', 'ضمان',
  'نقدم خدمات', 'نوفر لكم', 'متوفر لدينا', 'فريقنا', 'نحل واجبات',
  'نكتب بحوث', 'مضمون', 'سعر مناسب', 'كادر أكاديمي', 'خدماتنا',
  'واتس للتواصل', 'تواصل عبر الواتس', 'للتواصل واتس', 'نسوي بحوث',
  'نسوي واجبات', 'نقدم المساعدة', 'مكتب إنجاز', 'نوفر كادر',
  'اسعار مناسبه', 'اسعار مناسبة', 'ارخص الاسعار', 'عرض خاص',
  'خصومات', 'تخفيضات', 'للحجز', 'للطلب تواصل', 'واتساب',
  'فريق متخصص', 'فريق أكاديمي', 'خدمة مميزة', 'جودة عالية',
  'نضمن لكم', 'ضمان النجاح', 'متخصصون في', 'نقدم لكم',
];

// ─── Intent Keywords (person ASKING for help) ─────────────────────────────────
const INTENT_KEYWORDS = [
  'ابي', 'ابغا', 'ابغى', 'أبي', 'أبغا', 'أبغى', 'احتاج', 'أحتاج',
  'اريد', 'أريد', 'ابي احد', 'ابغى احد', 'محتاج', 'أحتاج أحد',
  'مين يحل', 'مين يسوي', 'مين يقدر', 'مين يعرف يسوي', 'شخص يحل',
  'مطلوب', 'مطلب', 'مساعدة', 'مساعده', 'يساعدني', 'ساعدوني',
  'فزعة', 'فزعه', 'فزعتكم', 'يحللي', 'يسويلي', 'يجهزلي', 'يجهز لي',
  'ممكن احد', 'ابحث عن', 'ابحث عن شخص', 'مطلوب شخص', 'مطلوب حل',
  'يحل', 'يسوي', 'يكتب', 'يبرمج', 'يصمم', 'يترجم', 'يساعد',
  'مين شاطر', 'مين فاهم', 'مين يعرف', 'مين يقدر', 'مين يترجم', 'مين يصمم', 'مين يبرمج',
  'عندي', 'مين عنده', 'تكفون', 'تكفى',
  'كيف', 'شلون', 'وش', 'وشو', 'شنو', 'طريقة', 'طريقه', 'استفسار',
  'سؤال', 'سوال', 'اسال', 'أسأل', 'استفسر', 'أسئلة', 'اسئلة',
  'احد يعرف', 'أحد يعرف', 'احد عنده', 'أحد عنده', 'مين قد', 'مين جرب',
  'هل في', 'هل فيه', 'من يعرف', 'من عنده', 'يفيدني', 'افيدوني', 'أفيدوني',
  'need help', 'need someone', 'looking for', 'can someone', 'anyone can',
  'do my', 'solve my', 'help me with', 'anyone knows'
];

// ─── Academic Subject Keywords ────────────────────────────────────────────────
const ACADEMIC_KEYWORDS = [
  'واجب', 'تكليف', 'بحث', 'مشروع', 'بروجكت', 'تقرير', 'سكليف', 'سيكليف',
  'برزنتيشن', 'بوربوينت', 'عرض تقديمي', 'كويز', 'اختبار', 'فاينل',
  'ميد', 'لاب', 'برمجة', 'cv', 'سيرة ذاتية', 'سيره ذاتيه', 'ترجمة', 'تصميم',
  'رياضيات', 'تدريب تعاوني', 'تدريب ميداني', 'عذر طبي', 'تقرير طبي',
  'مشروع تخرج', 'حل مادة', 'حل ماده', 'مادة', 'ماده', 'فيزياء', 'كيمياء',
  'احصاء', 'إحصاء', 'حسبان', 'جبر', 'حاسب', 'شبكات', 'قواعد بيانات', 'ويب',
  'جافا', 'بايثون', 'قانون', 'ادارة', 'محاسبة', 'اقتصاد', 'مالية',
  'انجليزي', 'ترجمه', 'كتابة', 'مقال', 'تعبير', 'تدريب', 'تطبيقي',
  'بحوث', 'واجبات', 'مشاريع', 'كويزات', 'تقارير', 'امتحان', 'اختبارات',
  'جامعة', 'جامعه', 'كلية', 'كليه', 'تخصص', 'تحويل', 'احول', 'أحول',
  'تسجيل', 'سجل', 'شعبة', 'شعبه', 'جدول', 'جداول', 'معدل', 'درجات',
  'قبول', 'حذف', 'اضافه', 'إضافة', 'دكتور', 'دكتورة', 'دكتوره', 'استاذ',
  'محاضرة', 'محاضره', 'محاضرات', 'تمهير', 'شروط', 'شروط التحويل', 'شروط القبول',
  'متطلب', 'متطلبات', 'معادلة', 'معادله', 'وثيقة', 'وثيقه', 'شهادة', 'شهاده',
  'تخرج', 'خريج', 'خريجة', 'شعب',
  'assignment', 'homework', 'project', 'report', 'lab', 'quiz',
  'exam', 'presentation', 'thesis', 'research', 'essay', 'calculus', 'math'
];


// ─── Priority Detection Keywords ──────────────────────────────────────────────
const URGENT_KEYWORDS = [
  'عاجل', 'اليوم', 'الليلة', 'بكره', 'بكرة', 'ضروري', 'asap', 'urgent',
  'نفس اليوم', 'خلال ساعة', 'دقائق', 'الان', 'الآن', 'بسرعة',
  'قبل بكرة', 'لازم اليوم',
];

const LOW_PRIORITY_KEYWORDS = [
  'الاسبوع القادم', 'الشهر القادم', 'مفيش ضغط', 'بدون استعجال',
  'مو مستعجل', 'الاسبوع الجاي',
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
 * Detects the academic service type from message text.
 * @param {string} text
 * @returns {string|null}
 */
const detectServiceType = (text) => {
  const lowerText = text.toLowerCase();

  if (lowerText.includes('برمجة') || lowerText.includes('code') || lowerText.includes('python') || lowerText.includes('java') || lowerText.includes('حاسب')) {
    return 'برمجة';
  } else if (lowerText.includes('بحث') || lowerText.includes('بحوث') || lowerText.includes('research')) {
    return 'بحث';
  } else if (lowerText.includes('cv') || lowerText.includes('سيرة ذاتية')) {
    return 'CV';
  } else if (lowerText.includes('تدريب')) {
    return 'تدريب';
  } else if (lowerText.includes('تقرير') || lowerText.includes('report') || lowerText.includes('تقارير')) {
    return 'تقارير';
  } else if (lowerText.includes('مشروع') || lowerText.includes('project') || lowerText.includes('بروجكت') || lowerText.includes('مشروع تخرج')) {
    return 'مشاريع';
  } else if (lowerText.includes('واجب') || lowerText.includes('تكليف') || lowerText.includes('assignment') || lowerText.includes('homework')) {
    return 'واجبات';
  } else if (lowerText.includes('اختبار') || lowerText.includes('كويز') || lowerText.includes('فاينل') || lowerText.includes('ميد') || lowerText.includes('exam') || lowerText.includes('quiz') || lowerText.includes('امتحان')) {
    return 'اختبارات';
  } else if (lowerText.includes('بوربوينت') || lowerText.includes('عرض تقديمي') || lowerText.includes('برزنتيشن') || lowerText.includes('presentation') || lowerText.includes('عرض')) {
    return 'عروض';
  } else if (lowerText.includes('رياضيات') || lowerText.includes('math') || lowerText.includes('calculus') || lowerText.includes('حسبان') || lowerText.includes('احصاء')) {
    return 'رياضيات';
  } else if (lowerText.includes('ترجمة') || lowerText.includes('translation')) {
    return 'ترجمة';
  } else if (lowerText.includes('تصميم') || lowerText.includes('design')) {
    return 'تصميم';
  } else if (lowerText.includes('طب') || lowerText.includes('عذر') || lowerText.includes('تقرير طبي')) {
    return 'طب';
  } else if (lowerText.includes('سكليف') || lowerText.includes('scalf')) {
    return 'سكليف';
  }

  return null;
};

/**
 * Enhanced keyword-based fallback classifier.
 * Requires BOTH an intent keyword AND an academic keyword to classify as a request.
 * @param {string} messageText
 * @returns {Object} Classification result
 */
const keywordFallback = (messageText) => {
  const matchedAdvertiserKws = findMatchingKeywords(messageText, ADVERTISER_KEYWORDS);
  const matchedIntentKws = findMatchingKeywords(messageText, INTENT_KEYWORDS);
  const matchedAcademicKws = findMatchingKeywords(messageText, ACADEMIC_KEYWORDS);

  const isAdvertiser = matchedAdvertiserKws.length >= 2; // Need at least 2 ad keywords
  // Must have intent + academic topic, and NOT be an advertiser
  const isRequest = matchedIntentKws.length > 0 && matchedAcademicKws.length > 0 && !isAdvertiser;

  const serviceType = isRequest ? detectServiceType(messageText) : null;

  // Priority detection
  let priority = 'NORMAL';
  if (findMatchingKeywords(messageText, URGENT_KEYWORDS).length > 0) {
    priority = 'URGENT';
  } else if (findMatchingKeywords(messageText, LOW_PRIORITY_KEYWORDS).length > 0) {
    priority = 'LOW';
  }

  const allMatchedKeywords = [...matchedIntentKws, ...matchedAcademicKws].slice(0, 10);
  const confidenceScore = isRequest
    ? Math.min(0.5 + (matchedIntentKws.length * 0.1) + (matchedAcademicKws.length * 0.08), 0.85)
    : isAdvertiser
    ? 0.9
    : 0.1;

  return {
    isRequest,
    isAdvertiser,
    serviceType,
    confidenceScore,
    keywords: allMatchedKeywords,
    priority,
    classifiedBy: 'keyword_fallback',
  };
};

// ─── OpenAI Client ────────────────────────────────────────────────────────────
let openaiClient = null;

const getOpenAIClient = () => {
  if (!openaiClient && process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'sk-placeholder') {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
};

// ─── Enhanced System Prompt ───────────────────────────────────────────────────
const SYSTEM_PROMPT = `أنت محلل رسائل ذكي متخصص في اكتشاف الطلبات التعليمية والأكاديمية في مجموعات تيليجرام.

## مهمتك الأساسية:
تحديد ما إذا كانت الرسالة تحتوي على **طلب حقيقي من طالب يبحث عن مساعدة أكاديمية أو تعليمية**.

## ما يُعتبر "طلب حقيقي" (isRequest = true):
- شخص يطلب من أحد أن يعمل/يحل/يجهز له شيء أكاديمي
- طلب عمل بحث، حل واجب، إعداد مشروع، تقرير، عرض تقديمي، برزنتيشن
- طلب كتابة سكليف، تقرير طبي أو أكاديمي
- طلب شخص متخصص يساعد في إنجاز مهمة تعليمية
- أي صياغة تدل أن صاحب الرسالة يريد من شخص آخر تنفيذ عمل أكاديمي

### أمثلة طلبات حقيقية:
- "مين يعرف يسوي لي مشروع التخرج؟"
- "احتاج شخص يجهز لي عرض بكرة"
- "أبغى مساعدة في حل الواجب"
- "عندي مادة صعبة وأحتاج أحد يساعدني فيها"
- "ابي مختص يحل واجب برمجة"
- "محتاج مساعدة في بحث"
- "مين يسوي لي CV"
- "عندي فاينل بكره احتاج احد يساعدني"
- "فزعتكم يا شباب عندي تكليف لازم يتسلم اليوم"
- "ابغى احد يترجم لي بحث"
- "مطلوب شخص يسوي لي بوربوينت"
- "احد يقدر يحل لي لاب فيزياء"

## ما لا يُعتبر طلب (isRequest = false):
1. **الإعلانات**: شخص يعرض خدماته (نحل واجبات، تواصل معنا، أفضل الأسعار)
2. **الدردشة العادية**: سلام، شكر، نقاش، سؤال عام
3. **الأسئلة المعرفية**: "من يعرف الدكتور؟"، "وش رأيكم بالمادة؟"
4. **الروابط الترويجية**: روابط تسويق، عروض خدمات
5. **الرسائل الآلية**: رسائل بوتات أو رسائل منسوخة
6. **الردود القصيرة**: "تمام"، "اوكي"، "شكراً"
7. **النقاشات الأكاديمية**: مناقشة مادة بدون طلب مساعدة

### أمثلة رسائل مرفوضة:
- "من يعرف الدكتور؟" → سؤال عام وليس طلب
- "نحل جميع الواجبات تواصل واتساب" → إعلان
- "السلام عليكم" → تحية
- "وش رأيكم بالمادة؟" → نقاش
- "الله يوفقكم" → دعاء
- "متى موعد الاختبار؟" → سؤال معلوماتي
- "هل أحد أخذ هذي المادة؟" → سؤال عام
- "فريقنا المتخصص يقدم لكم خدمات أكاديمية" → إعلان

## القاعدة الذهبية:
**افهم نية الشخص وليس الكلمات فقط**. الشخص يجب أن يكون يطلب من شخص آخر أن ينفذ له عمل أكاديمي محدد.

## أنواع الخدمات:
برمجة، بحث، عروض، CV، رياضيات، واجبات، اختبارات، مشاريع، تقارير، ترجمة، طب، تصميم، سكليف، تدريب

## الأولوية:
- URGENT: يحتاج اليوم/بكرة/عاجل/ضروري
- NORMAL: عادي بدون وقت محدد
- LOW: الأسبوع القادم/غير مستعجل

أجب دائمًا بـ JSON فقط:
{
  "isRequest": true|false,
  "isAdvertiser": true|false,
  "serviceType": "نوع الخدمة أو null",
  "confidenceScore": 0.0-1.0,
  "keywords": ["كلمة1", "كلمة2"],
  "priority": "URGENT|NORMAL|LOW",
  "reasoning": "سبب موجز للتصنيف بالعربي"
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

  // Pre-filter: quickly reject obvious non-requests
  if (shouldSkipMessage(messageText)) {
    logger.debug('Message pre-filtered (greeting/reaction/too short)');
    return {
      isRequest: false,
      isAdvertiser: false,
      serviceType: null,
      confidenceScore: 0,
      keywords: [],
      priority: 'NORMAL',
      classifiedBy: 'pre_filter',
    };
  }

  // Fast-pass: Check keywords first for speed and direct handling of clear requests
  const kResult = keywordFallback(messageText);
  if (kResult.isRequest) {
    kResult.classifiedBy = 'keyword_fastpass';
    logger.debug('Message classified via fast-pass keywords', {
      serviceType: kResult.serviceType,
      confidence: kResult.confidenceScore,
      keywords: kResult.keywords,
    });
    return kResult;
  }

  const client = getOpenAIClient();

  if (!client) {
    logger.warn('OpenAI client not available, using keyword fallback');
    return kResult;
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
      temperature: 0.05,
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
      reasoning: parsed.reasoning || '',
      classifiedBy: 'openai_gpt4o_mini',
    };

    logger.debug('Message classified by OpenAI', {
      isRequest: result.isRequest,
      serviceType: result.serviceType,
      confidence: result.confidenceScore,
      reasoning: result.reasoning,
    });

    return result;
  } catch (err) {
    logger.error('OpenAI classification failed, falling back to keywords', {
      error: err.message,
    });
    return keywordFallback(messageText);
  }
};

module.exports = { classifyMessage, keywordFallback, shouldSkipMessage };
