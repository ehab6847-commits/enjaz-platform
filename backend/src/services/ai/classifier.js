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
  // Advertiser patterns for sick leave / medical services
  'نسوي سكاليف', 'نسوي سكليف', 'نوفر سكاليف', 'نوفر سكليف',
  'نسوي اعذار', 'نسوي أعذار', 'نوفر اعذار', 'نوفر أعذار',
  'نسوي تقارير طبية', 'نوفر تقارير طبية', 'نسوي عذر طبي',
  'عندنا سكاليف', 'عندنا سكليف', 'متوفر سكاليف', 'متوفر سكليف',
  'لعمل سكليف', 'skاليف بسعر', 'سكاليف بسعر', 'سكليف بسعر', 'سكاليف مضمون',
  'سكليف مضمون', 'اعذار مضمونه', 'أعذار مضمونة',
  'نسوي لك', 'نجهز لك', 'نوفر لك', 'نعمل لك',
  // Expanded Advertiser Patterns from screenshots
  'تحويل بعد الانجاز', 'تحويل بعد الإنجاز', 'سعر ممتاز', 'انجاز فوري',
  'إنجاز فوري', 'مستشفى تبي', 'عذر طبي جاهز', 'مضمونه', 'مضمونة',
  'الاجوبه مضمونه', 'الأجوبة مضمونة', 'لجميع المواد', 'لجميع الصفوف',
  'ارتق بمجالك', 'ارتق بمسيرتك', 'فرصاً محدودة', 'فرصا محدودة',
  'للمشاركة في', 'خبرة عالية', 'خبره عاليه', 'للاستفسار',
  'احجز عندي', 'يحجز عندي', 'تواصل خاص', 'راسلني خاص', 'يرمسني خاص',
  'نوفر للأطباء', 'نوفر للاطباء', 'مجلات النخبة',
];

// ─── Intent Keywords (person ASKING for help) ─────────────────────────────────
const INTENT_KEYWORDS = [
  'ابي', 'ابغا', 'ابغى', 'أبي', 'أبغا', 'أبغى', 'احتاج', 'أحتاج',
  'اريد', 'أريد', 'ابي احد', 'ابغى احد', 'محتاج', 'أحتاج أحد',
  'مين يحل', 'مين يسوي', 'مين يقدر', 'مين يعرف يسوي', 'شخص يحل',
  'مطلوب', 'مطلب', 'مساعدة', 'مساعده', 'يساعدني', 'ساعدوني',
  'فزعة', 'فزعه', 'فزعتكم', 'يحللي', 'يسويلي', 'يجهزلي', 'يجهز لي',
  'ممكن احد', 'اببحث عن', 'ابحث عن شخص', 'مطلوب شخص', 'مطلوب حل',
  'يحل', 'يسوي', 'يكتب', 'يبرمج', 'يصمم', 'يترجم', 'يساعد',
  'مين شاطر', 'مين فاهم', 'مين يعرف', 'مين يقدر', 'مين يترجم', 'مين يصمم', 'مين يبرمج',
  'عندي', 'مين عنده', 'تكفون', 'تكفى',
  'كيف', 'شلون', 'وش', 'وشو', 'شنو', 'طريقة', 'طريقه', 'استفسار',
  'سؤال', 'سوال', 'اسال', 'أسأل', 'استفسر', 'أسئلة', 'اسئلة',
  'احد يعرف', 'أحد يعرف', 'احد عنده', 'أحد عنده', 'مين قد', 'مين جرب',
  'هل في', 'هل فيه', 'من يعرف', 'من عنده', 'يفيدني', 'افيدوني', 'أفيدوني',
  // Sick leave / medical specific intent
  'حد يعرف', 'أحد يسوي', 'احد يسوي', 'حد يسوي', 'حد يقدر',
  'شخص ثقه', 'شخص ثقة', 'شخص موثوق', 'مختص', 'متخصص', 'يفهم',
  'غبت عن', 'صار عندي حرمان', 'حرمان', 'والدفع للمكافاه', 'والدفع للمكافأة',
  // Newly requested intent expressions
  'ابي شخص ثقه', 'أبي شخص ثقة', 'ابي مختص شاطر', 'أبي مختص شاطر',
  'ابي حد يسوي', 'أبي حد يسوي', 'من يحل', 'من يسوي', 'من يعرف',
  'من يعرف يصمم', 'من يعرف يحل', 'مين يعرف يصمم', 'مين يفهم',
  'من يفهم', 'حد يعرف يسوي', 'حد يعرف يحل', 'أحد يعرف يسوي',
  'ابي حد يحل', 'أبي حد يحل', 'ابغى حد يسوي', 'ابي حد يفهم', 'أبي حد يفهم',
  'الدفع بعد الدرجه', 'الدفع بعد الدرجة', 'بعد الدرجه', 'بعد الدرجة',
  'للراتب', 'للمكافاه', 'للمكافأة', 'مختص الحين', 'ابي حد يترجم', 'من يترجم',
  'need help', 'need someone', 'looking for', 'can someone', 'anyone can',
  'do my', 'solve my', 'help me with', 'anyone knows'
];

// ─── Academic & Service Subject Keywords ──────────────────────────────────────
const ACADEMIC_KEYWORDS = [
  // Academic tasks
  'واجب', 'تكليف', 'بحث', 'مشروع', 'بروجكت', 'تقرير',
  'برزنتيشن', 'بوربوينت', 'عرض تقديمي', 'كويز', 'اختبار', 'فاينل',
  'ميد', 'لاب', 'برمجة', 'cv', 'سيرة ذاتية', 'سيره ذاتيه', 'ترجمة', 'تصميم',
  'رياضيات', 'تدريب تعاوني', 'تدريب ميداني',
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
  // Sick leave / Medical excuses / Documents
  'سكليف', 'سيكليف', 'skleave', 'سكاليف', 'سكالف', 'سكيليف', 'sick leave',
  'عذر طبي', 'عذر', 'اعذار', 'أعذار', 'عذر ورقي', 'عذر مرضي',
  'تقرير طبي', 'تقرير مرضي', 'شهادة مرضية', 'شهاده مرضيه',
  'اجازة مرضية', 'إجازة مرضية', 'اجازه مرضيه', 'إجازه مرضيه',
  'مشهد مراجعه', 'مشهد مراجعة', 'وصفة طبية', 'وصفه طبيه',
  'موعد مستشفى', 'مستشفى حكومي', 'مستشفى خاص', 'مختم',
  'مرافق مريض', 'مراجعة طبية', 'مراجعه طبيه',
  'شهادة صحية', 'شهاده صحيه', 'فحص طبي',
  // Design tools
  'كانفا', 'canva', 'فوتوشوب', 'photoshop', 'فيتشوب',
  'وورد', 'word', 'اكسل', 'excel', 'بوربوينت', 'powerpoint',
  'انفوجرافيك', 'infographic', 'لوقو', 'logo', 'شعار', 'بنر', 'banner',
  'ملف pdf', 'pdf',
  // Newly requested Academic & Specialized Keywords
  'ماث', 'math', 'معادلات', 'تكامل وتفاضل', 'تكامل', 'تفاضل', 'محاسبة مالية', 'دراسة جدوى', 'دراسة جدوي', 'فيزياء',
  'خرائط ذهنيه', 'خرائط ذهنية', 'خرائط مفاهيم', 'هيكل تنظيمي', 'فيديو بالذكاء الاصطناعي', 'ذكاء اصطناعي', 'ذكاء إصطناعي',
  'فيديو متحرك', 'تعليق صوتي', 'فيديو انمي', 'موشن جرافيك', 'مناهج البحث', 'بحث علمي', 'مراجع APA 7', 'apa 7', 'apa',
  'تلخيص فصل', 'تلخيص مقرر', 'تلخيص شبتر', 'تلخيص شباتر', 'تلخيص', 'ملخص', 'رسم هندسي', 'جدول مقارنه', 'جدول مقارنة',
  'سيرة ذاتية ATS', 'ats', 'سيره ذاتيه ats', 'تدريب نهائي', 'تدريب تعاوني', 'تدريب تطبيقي', 'تدريب ميداني',
  'طفوله مبكره', 'طفولة مبكرة', 'رياض الأطفال', 'رياض الاطفال', 'احياء', 'الأحياء', 'أحياء', 'بروبوزل', 'proposal',
  'مقترح بحث', 'خطة بحث', 'خطه بحث', 'ريبورت', 'report', 'مطويه', 'مطوية', 'برشور', 'بروشور', 'ورقه علمية', 'ورقة علمية',
  'ملصق علمي', 'ملصق علمى', 'بوستر', 'poster', 'ترجمة ملف', 'ترجمة شابتر', 'ترجمة شابترز', 'ترجمة جمله بجمله',
  'ترجمة جملة بجملة', 'سلايدات', 'شرائح', 'تعبئة البيانات', 'تعبئة بيانات', 'تعديل ملف', 'تحليل احصائي', 'تحليل إحصائي',
  'spss', 'اس بي اس اس', 'باكت تريسر', 'packet tracer', 'تصميم جرافيك', 'نظم معلومات', 'بحث فقهي', 'توثيق المراجع',
  'الحواشي', 'الهامش', 'الهوامش', 'لابات', 'لاب', 'بايثون', 'python', 'تطبيق', 'موقع الكتروني', 'موقع إلكتروني',
  'متجر الكتروني', 'متجر إلكتروني', 'موقع بالويب', 'الويب', 'تصميم تخرج', 'تكليف جماعي', 'اسئلة الفصل', 'أسئلة الفصل', 'اسئله الفصل', 'أسئله الفصل', 'اسئله', 'أسئله',
  'تفريغ صوتي', 'تفريغ صوتى', 'تعبير باللغة الانجليزية', 'تعبير بالانجليزي',
  // English
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

  // 1. Sick leave / Medical (highest priority)
  if (lowerText.includes('سكليف') || lowerText.includes('سكاليف') || lowerText.includes('سكالف') || lowerText.includes('سيكليف') || lowerText.includes('سكيليف') || lowerText.includes('sick leave')) {
    return 'سكليف';
  }
  if (lowerText.includes('عذر طبي') || lowerText.includes('عذر مرضي') || lowerText.includes('عذر ورقي') || lowerText.includes('اجازة مرضية') || lowerText.includes('إجازة مرضية') || lowerText.includes('شهادة مرضية') || lowerText.includes('مشهد مراجعه') || lowerText.includes('مشهد مراجعة') || lowerText.includes('وصفة طبية') || lowerText.includes('وصفه طبيه') || lowerText.includes('مرافق مريض') || lowerText.includes('تقرير طبي') || lowerText.includes('شهادة صحية') || lowerText.includes('فحص طبي') || lowerText.includes('موعد مستشفى')) {
    return 'طب';
  }

  // 2. Accounting & Finance (check before programming to avoid 'محاسب' matching 'حاسب')
  if (lowerText.includes('محاسبة') || lowerText.includes('محاسبه') || lowerText.includes('تكاليف') || lowerText.includes('جدوى') || lowerText.includes('جدوي') || lowerText.includes('اقتصاد') || lowerText.includes('مالية')) {
    return 'محاسبة';
  }

  // 3. Training (check before programming to avoid 'تطبيقي' matching 'تطبيق')
  if (lowerText.includes('تدريب') || lowerText.includes('تعاوني') || lowerText.includes('ميداني') || lowerText.includes('تطبيقي')) {
    return 'تدريب';
  }

  // 4. Programming & Tech
  if (lowerText.includes('برمجة') || lowerText.includes('برمجه') || lowerText.includes('code') || lowerText.includes('python') || lowerText.includes('java') || 
     (lowerText.includes('حاسب') && !lowerText.includes('محاسب')) || 
     lowerText.includes('باكت تريسر') || lowerText.includes('packet tracer') || lowerText.includes('ويب') || 
     (lowerText.includes('تطبيق') && !lowerText.includes('تطبيقي')) || 
     lowerText.includes('موقع الكتروني') || lowerText.includes('موقع إلكتروني') || lowerText.includes('متجر الكتروني') || lowerText.includes('متجر إلكتروني') || lowerText.includes('نظم معلومات')) {
    return 'برمجة';
  }

  // 5. Research
  if (lowerText.includes('بحث') || lowerText.includes('بحوث') || lowerText.includes('research') || lowerText.includes('مناهج البحث') || lowerText.includes('بروبوزل') || lowerText.includes('proposal') || lowerText.includes('مقترح بحث') || lowerText.includes('خطة بحث') || lowerText.includes('خطه بحث') || lowerText.includes('ورقه علمية') || lowerText.includes('ورقة علمية') || lowerText.includes('ملصق علمي') || lowerText.includes('بوستر') || lowerText.includes('poster')) {
    return 'بحث';
  }

  // 6. CV / ATS
  if (lowerText.includes('cv') || lowerText.includes('سيرة ذاتية') || lowerText.includes('ats') || lowerText.includes('سيره ذاتيه')) {
    return 'CV';
  }

  // 7. Design & Visuals
  if (lowerText.includes('كانفا') || lowerText.includes('canva') || lowerText.includes('فوتوشوب') || lowerText.includes('photoshop') || lowerText.includes('فيتشوب') || lowerText.includes('انفوجرافيك') || lowerText.includes('تصميم جرافيك') || lowerText.includes('مطويه') || lowerText.includes('مطوية') || lowerText.includes('برشور') || lowerText.includes('بروشور') || lowerText.includes('لوقو') || lowerText.includes('logo') || lowerText.includes('شعار') || lowerText.includes('بنر') || lowerText.includes('خرائط ذهنيه') || lowerText.includes('خرائط ذهنية') || lowerText.includes('خرائط مفاهيم') || lowerText.includes('هيكل تنظيمي') || lowerText.includes('فيديو') || lowerText.includes('موشن جرافيك') || lowerText.includes('انمي') || lowerText.includes('موشن') || lowerText.includes('تعليق صوتي')) {
    return 'تصميم';
  }

  // 8. Design fallback
  if (lowerText.includes('تصميم') || lowerText.includes('design')) {
    return 'تصميم';
  }

  // 9. Reports
  if (lowerText.includes('تقرير') || lowerText.includes('report') || lowerText.includes('تقارير') || lowerText.includes('ريبورت')) {
    return 'تقارير';
  }

  // 10. Projects
  if (lowerText.includes('مشروع') || lowerText.includes('project') || lowerText.includes('بروجكت') || lowerText.includes('مشروع تخرج')) {
    return 'مشاريع';
  }

  // 11. Homework / General tasks
  if (lowerText.includes('واجب') || lowerText.includes('تكليف') || lowerText.includes('assignment') || lowerText.includes('homework') || lowerText.includes('تفريغ') || lowerText.includes('تعديل ملف') || lowerText.includes('تعبئة') || lowerText.includes('اسئلة الفصل') || lowerText.includes('أسئلة الفصل') || lowerText.includes('اسئله الفصل') || lowerText.includes('أسئله الفصل') || lowerText.includes('اسئله') || lowerText.includes('أسئله')) {
    return 'واجبات';
  }

  // 12. Exams & Quizzes
  if (lowerText.includes('اختبار') || lowerText.includes('كويز') || lowerText.includes('فاينل') || lowerText.includes('ميد') || lowerText.includes('exam') || lowerText.includes('quiz') || lowerText.includes('امتحان')) {
    return 'اختبارات';
  }

  // 13. Presentations
  if (lowerText.includes('بوربوينت') || lowerText.includes('عرض تقديمي') || lowerText.includes('برزنتيشن') || lowerText.includes('presentation') || lowerText.includes('عرض') || lowerText.includes('سلايدات') || lowerText.includes('شرائح')) {
    return 'عروض';
  }

  // 14. Mathematics
  if (lowerText.includes('رياضيات') || lowerText.includes('math') || lowerText.includes('calculus') || lowerText.includes('حسبان') || lowerText.includes('احصاء') || lowerText.includes('إحصاء') || lowerText.includes('spss') || lowerText.includes('ماث') || lowerText.includes('معادلات') || lowerText.includes('تكامل') || lowerText.includes('تفاضل') || lowerText.includes('جبر') || lowerText.includes('رسم هندسي')) {
    return 'رياضيات';
  }

  // 15. Translation
  if (lowerText.includes('ترجمة') || lowerText.includes('translation') || lowerText.includes('تعبير باللغة الانجليزية') || lowerText.includes('تعبير بالانجليزي')) {
    return 'ترجمة';
  }

  // 16. Word / Excel
  if (lowerText.includes('وورد') || lowerText.includes('word') || lowerText.includes('اكسل') || lowerText.includes('excel')) {
    return 'واجبات';
  }

  return null;
};

/**
 * Enhanced keyword-based fallback classifier.
 * Requires BOTH an intent keyword AND an academic keyword to classify as a request.
 * @param {string} messageText
 * @returns {Object} Classification result
 */
/**
 * Helper to count how many distinct academic service categories are matched in the text.
 * Listing 4+ different subjects/services (e.g. math, physics, coding, sick leave) is a strong advertiser indicator.
 * @param {string} text
 * @returns {number} count of unique matched categories
 */
const countDetectedServiceTypes = (text) => {
  const lowerText = text.toLowerCase();
  let count = 0;
  const categories = [
    ['سكليف', 'سكاليف', 'عذر طبي', 'تقرير طبي'],
    ['برمجة', 'بايثون', 'جاوا', 'code'],
    ['بحث', 'بحوث', 'research'],
    ['محاسبة', 'تكاليف', 'جدوى'],
    ['رياضيات', 'ماث', 'معادلات'],
    ['ترجمة', 'translation'],
    ['تصميم', 'كانفا', 'فوتوشوب'],
    ['كويز', 'اختبار', 'امتحان'],
  ];
  categories.forEach(cat => {
    if (cat.some(kw => lowerText.includes(kw))) {
      count++;
    }
  });
  return count;
};

/**
 * Enhanced keyword-based fallback classifier.
 * Requires BOTH an intent keyword AND an academic keyword to classify as a request.
 * Incorporates structural scoring to reject long spam advertiser posts containing emojis, lists of subjects, and repeated links/handles.
 * @param {string} messageText
 * @returns {Object} Classification result
 */
const keywordFallback = (messageText) => {
  const trimmedText = messageText.trim();
  const matchedAdvertiserKws = findMatchingKeywords(trimmedText, ADVERTISER_KEYWORDS);
  const matchedIntentKws = findMatchingKeywords(trimmedText, INTENT_KEYWORDS);
  const matchedAcademicKws = findMatchingKeywords(trimmedText, ACADEMIC_KEYWORDS);

  // ─── Structural Advertiser Scoring ──────────────────────────────────────────
  let advertiserScore = 0;

  // 1. Keyword Matches (1.5 points per ad keyword matched)
  advertiserScore += matchedAdvertiserKws.length * 1.5;

  // 2. Emoji Density & Count
  // Matches typical emojis and decorative symbols used in ads
  const emojiMatches = trimmedText.match(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2B06}\u{2190}-\u{21FF}]/gu);
  const emojiCount = emojiMatches ? emojiMatches.length : 0;
  if (emojiCount >= 10) {
    advertiserScore += 4.0;
  } else if (emojiCount >= 5) {
    advertiserScore += 2.0;
  }

  // 3. Repeated Contact/Handles (e.g. repeated telegram usernames or whatsapp links)
  const usernameMatches = trimmedText.match(/@[a-zA-Z0-9_]+/g);
  if (usernameMatches) {
    const usernameCounts = {};
    usernameMatches.forEach(u => {
      usernameCounts[u] = (usernameCounts[u] || 0) + 1;
    });
    const maxRepetitions = Math.max(...Object.values(usernameCounts));
    if (maxRepetitions >= 3) {
      advertiserScore += 4.0; // Same handle repeated multiple times is a signature ad structure
    } else if (usernameMatches.length >= 3) {
      advertiserScore += 2.0; // Multiple different handles
    }
  }

  // WhatsApp / External links
  if (/wa\.me|api\.whatsapp|chat\.whatsapp|t\.me/i.test(trimmedText)) {
    // Note: only add score if there's no question intent, since students might post links occasionally
    // but advertisers always have links.
    advertiserScore += 2.5;
  }

  // 4. Multi-subject listing
  const serviceTypesCount = countDetectedServiceTypes(trimmedText);
  if (serviceTypesCount >= 4) {
    advertiserScore += 3.0; // A single student doesn't request 4+ completely different subjects in one message
  }

  // 5. Length Check (ads are typically very long paragraphs)
  if (trimmedText.length > 500) {
    advertiserScore += 1.5;
  }

  // Determine advertiser status based on cumulative score (threshold = 3.0)
  const isAdvertiser = advertiserScore >= 3.0;

  // Smart student posting detection:
  // 1. Classic case: has intent (e.g. ابي, احتاج) AND academic topic (e.g. واجب, ماث)
  // 2. Noun-first case: starts with a request noun (e.g. واجب محاسبة, تكليف فيزياء) and has academic keywords
  const startsWithRequestNoun = /^(واجب|تكليف|بحث|مشروع|بروجكت|تقرير|سيرة|سيره|ترجمة|ترجمه|تلخيص|عذر|سكليف|سكاليف|سيكليف|لاب|كويز|رسم|سلايدات|تفريغ|تصميم|حل|مطلوب)\s+/i.test(trimmedText);
  
  const hasIntentAndAcademic = matchedIntentKws.length > 0 && matchedAcademicKws.length > 0;
  
  const isRequest = (hasIntentAndAcademic || (startsWithRequestNoun && matchedAcademicKws.length > 0)) && !isAdvertiser;

  const serviceType = isRequest ? detectServiceType(trimmedText) : null;

  // Priority detection
  let priority = 'NORMAL';
  if (findMatchingKeywords(trimmedText, URGENT_KEYWORDS).length > 0) {
    priority = 'URGENT';
  } else if (findMatchingKeywords(trimmedText, LOW_PRIORITY_KEYWORDS).length > 0) {
    priority = 'LOW';
  }

  const allMatchedKeywords = [...matchedIntentKws, ...matchedAcademicKws].slice(0, 10);
  const confidenceScore = isRequest
    ? Math.min(0.5 + (matchedIntentKws.length * 0.1) + (matchedAcademicKws.length * 0.08) + (startsWithRequestNoun ? 0.15 : 0), 0.85)
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
