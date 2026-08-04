'use strict';

const OpenAI = require('openai').default;
const logger = require('../../config/logger');

// ─── Service Types ─────────────────────────────────────────────────────────────
const SERVICE_TYPES = [
  'برمجة', 'بحث', 'عروض', 'CV', 'رياضيات', 'واجبات',
  'اختبارات', 'مشاريع', 'تقارير', 'ترجمة', 'طب', 'تصميم',
  'سكليف', 'تدريب', 'محاسبة',
];

// ═══════════════════════════════════════════════════════════════════════════════
//  TIER 1: PRE-FILTER — Quick reject of obviously irrelevant messages
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Quick pre-filter to reject messages that are obviously NOT requests.
 * @param {string} text
 * @returns {boolean} true if the message should be skipped
 */
const shouldSkipMessage = (text) => {
  const trimmed = text.trim();

  // Read min length from env, defaulting to 5 characters (allow short requests like 'ابي واجب')
  const minLength = process.env.MESSAGE_MIN_LENGTH ? parseInt(process.env.MESSAGE_MIN_LENGTH, 10) : 5;
  if (trimmed.length < minLength) return true;

  // Pure greetings / reactions
  const greetingPatterns = /^(السلام عليكم|وعليكم السلام|مرحبا|هلا|اهلا|حياكم|صباح الخير|مساء الخير|شكرا|الله يعطيك العافيه|جزاك الله خير|الحمد لله|ان شاء الله|ماشاء الله|تبارك الله|سبحان الله|الله اكبر|هههه|لا اله الا الله|استغفر الله|اللهم صل|آمين|امين|الله يوفقكم|موفق|بالتوفيق|تمام|اوكي|ok|okay|hi|hello|good morning|thanks)[\s!.؟]*$/i;
  if (greetingPatterns.test(trimmed)) return true;

  // Messages that are just emojis
  const emojiOnly = /^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2702}-\u{27B0}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\s❤👍🤣😂]+$/u;
  if (emojiOnly.test(trimmed)) return true;

  // Accept short 2-word messages since they can be requests like "ابي واجب"
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount < 2) return true;

  return false;
};

// ═══════════════════════════════════════════════════════════════════════════════
//  TIER 2: INTENT ANALYSIS — Smart keyword matching with word boundaries
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Advertiser Detection ──────────────────────────────────────────────────────

// Pattern-based advertiser phrases (checked with word-aware matching)
const ADVERTISER_KEYWORDS = [
  // Service offering phrases
  'تواصل معنا', 'لطلب الخدمة', 'أفضل الأسعار', 'افضل الاسعار',
  'نقدم خدمات', 'نوفر لكم', 'متوفر لدينا', 'فريقنا', 'نحل واجبات',
  'نكتب بحوث', 'سعر مناسب', 'كادر أكاديمي', 'خدماتنا',
  'واتس للتواصل', 'تواصل عبر الواتس', 'للتواصل واتس',
  'نسوي بحوث', 'نسوي واجبات', 'نقدم المساعدة',
  'مكتب إنجاز', 'مكتب انجاز', 'نوفر كادر',
  'اسعار مناسبه', 'اسعار مناسبة', 'ارخص الاسعار',
  'عرض خاص', 'خصومات', 'تخفيضات', 'للحجز', 'للطلب تواصل',
  'فريق متخصص', 'فريق أكاديمي', 'خدمة مميزة', 'جودة عالية',
  'نضمن لكم', 'ضمان النجاح', 'متخصصون في', 'نقدم لكم',
  // Sick leave advertiser patterns
  'نسوي سكاليف', 'نسوي سكليف', 'نوفر سكاليف', 'نوفر سكليف',
  'نسوي اعذار', 'نسوي أعذار', 'نوفر اعذار', 'نوفر أعذار',
  'نسوي تقارير طبية', 'نوفر تقارير طبية', 'نسوي عذر طبي',
  'عندنا سكاليف', 'عندنا سكليف', 'متوفر سكاليف', 'متوفر سكليف',
  'لعمل سكليف', 'سكاليف بسعر', 'سكليف بسعر', 'سكاليف مضمون',
  'سكليف مضمون', 'اعذار مضمونه', 'أعذار مضمونة',
  // Generic offering patterns
  'نسوي لك', 'نجهز لك', 'نوفر لك', 'نعمل لك',
  'تحويل بعد الانجاز', 'تحويل بعد الإنجاز', 'سعر ممتاز',
  'انجاز فوري', 'إنجاز فوري', 'عذر طبي جاهز',
  'الاجوبه مضمونه', 'الأجوبة مضمونة', 'لجميع المواد', 'لجميع الصفوف',
  'ارتق بمجالك', 'ارتق بمسيرتك', 'فرصا محدودة', 'فرصاً محدودة',
  'للمشاركة في', 'خبرة عالية', 'خبره عاليه', 'للاستفسار',
  'احجز عندي', 'يحجز عندي', 'تواصل خاص', 'راسلني خاص', 'يرمسني خاص',
  'نوفر للأطباء', 'نوفر للاطباء', 'مجلات النخبة',
  'الفل مارك', 'full mark', 'بإذن الله',
  'حصرية وخالية', 'خالية من الانتحال', 'خالية من الذكاء الاصطناعي',
  'التزام تام', 'التزام بالمواعيد',
];

// Regex patterns for advertiser sentence structures
const ADVERTISER_PATTERNS = [
  // "I offer you" / "We provide" patterns
  /أقدم\s+لكم/,
  /نقدم\s+لكم/,
  /أقدم\s+جميع/,
  /نقدم\s+جميع/,
  // "Available" + service listing
  /متوفر\s+(حل|كتابة|عمل|تصميم|ترجمة)/,
  // "We do" patterns (provider, not requester)
  /نسوي\s+(لكم|لك|جميع|كل|أي)/,
  /نوفر\s+(لكم|لك|جميع|كل|أي)/,
  /نعمل\s+(لكم|لك|جميع|كل|أي)/,
  // "Contact us" / "For ordering"
  /للتواصل\s+(والطلب|معنا|واتس|على|عبر)/,
  /تواصل\s+(واتساب|واتس|خاص|معنا|على)/,
  // "Our team" / "Our office"
  /فريقنا\s+المتخصص/,
  /لدينا\s+فريق/,
  /عندنا\s+فريق/,
  // "Guaranteed" service offerings
  /مضمون[ةه]?\s+(بإذن|ان شاء|100)/,
  /ضمان\s+(النجاح|الفل|الدرجة|الدرجه)/,
  // Price/discount patterns
  /بسعر\s+(مناسب|رمزي|ممتاز|خاص|منافس)/,
  /خصم\s+\d+/,
  /عرض\s+(خاص|حصري|لفترة)/,
  // "Our advantages" / "Our features"
  /مميزات(نا|ي)?:/,
  /مميزات\s+(الخدمة|العمل)/,
];

// ─── Intent Keywords (person ASKING for help) ─────────────────────────────────
// Split into strong and weak intent to improve accuracy

// Strong intent: very likely means the person needs help
const STRONG_INTENT_KEYWORDS = [
  'ابي احد', 'ابغى احد', 'أبي أحد', 'أبغى أحد',
  'ابي حد', 'أبي حد', 'ابغى حد',
  'احتاج أحد', 'أحتاج أحد', 'محتاج أحد',
  'مين يحل', 'مين يسوي', 'مين يقدر', 'مين يعرف يسوي',
  'من يحل', 'من يسوي', 'من يعرف',
  'شخص يحل', 'شخص يسوي', 'شخص يعرف',
  'مطلوب شخص', 'مطلوب حل', 'مطلوب مختص',
  'يحللي', 'يسويلي', 'يجهزلي', 'يجهز لي',
  'ممكن احد', 'ممكن أحد',
  'ابحث عن شخص', 'ابحث عن مختص',
  'ابي شخص ثقه', 'أبي شخص ثقة',
  'ابي مختص', 'أبي مختص',
  'ابي حد يسوي', 'أبي حد يسوي',
  'ابي حد يحل', 'أبي حد يحل',
  'ابغى حد يسوي', 'ابي حد يفهم', 'أبي حد يفهم',
  'ابي حد يترجم', 'أبي حد يترجم',
  'حد يعرف شخص', 'حد يعرف مختص',
  'أحد يسوي', 'احد يسوي', 'حد يسوي',
  'أحد يعرف يسوي', 'حد يعرف يسوي', 'حد يعرف يحل',
  'مين شاطر', 'مين فاهم', 'مين يفهم', 'من يفهم',
  'يساعدني', 'ساعدوني', 'فزعة', 'فزعه', 'فزعتكم',
  'need help', 'need someone', 'looking for', 'can someone',
  'anyone can', 'do my', 'solve my', 'help me with', 'anyone knows',
  // ── Gulf dialect additions ──
  'ابي أحد فاهم', 'ابغا احد يسوي', 'ودي احد يسوي',
  'ودي أحد', 'ودي حد', 'ودي شخص',
  'ابي واحد', 'أبي واحد', 'ابغى واحد',
  'ابي حد فاهم', 'ابغى حد فاهم', 'أبي حد شاطر',
  'اللي يقدر', 'اللي يعرف', 'اللي فاهم',
  'لو أحد يقدر', 'لو حد يقدر', 'لو احد يقدر',
  'حد يقدر يسوي', 'حد يقدر يحل',
  'محتاج حد', 'محتاج شخص', 'محتاجه شخص',
  'ابي مساعده', 'أبي مساعدة', 'ابغى مساعده',
  'يعملي', 'يعمللي', 'يخلصلي', 'يحل لي',
  'يكتبلي', 'يكتب لي', 'يسوي لي', 'يترجم لي',
  'يصممي', 'يصمملي', 'يصمم لي',
  'مين يكتب', 'مين يترجم', 'مين يصمم',
  'من يكتب', 'من يترجم', 'من يصمم',
  'احد يحل', 'أحد يحل', 'حد يحل',
  'احد يكتب', 'حد يكتب', 'أحد يكتب',
  'ابي اسوي', 'أبي أسوي', 'ابغى اسوي',
  'كم سعر', 'كم يكلف', 'بكم',
  'يسوي واجب', 'يحل واجب', 'يسوي بحث', 'يسوي مشروع',
  'يسوي تقرير', 'يسوي عرض', 'يسوي برزنتيشن',
  'ابي سكليف', 'أبي سكليف', 'ابغى سكليف',
  'محتاج سكليف', 'احتاج سكليف', 'أحتاج سكليف',
];

// Medium intent: likely a request but needs academic context
const MEDIUM_INTENT_KEYWORDS = [
  'ابي', 'ابغا', 'ابغى', 'أبي', 'أبغا', 'أبغى',
  'احتاج', 'أحتاج', 'اريد', 'أريد', 'محتاج', 'محتاجه',
  'مساعدة', 'مساعده', 'مطلوب', 'مطلب',
  'يحل', 'يسوي', 'يكتب', 'يبرمج', 'يصمم', 'يترجم', 'يساعد',
  'مين يعرف', 'مين يقدر', 'مين يترجم', 'مين يصمم', 'مين يبرمج',
  'احد يعرف', 'أحد يعرف', 'حد يعرف', 'حد يقدر',
  'من عنده', 'مين عنده', 'احد عنده', 'أحد عنده',
  'شخص ثقه', 'شخص ثقة', 'شخص موثوق', 'مختص', 'متخصص',
  'تكفون', 'تكفى', 'ارجوكم', 'أرجوكم', 'رجاء', 'رجاءً',
  'يفيدني', 'افيدوني', 'أفيدوني',
  'غبت عن', 'صار عندي حرمان', 'حرمان',
  'والدفع للمكافاه', 'والدفع للمكافأة',
  'الدفع بعد الدرجه', 'الدفع بعد الدرجة',
  'بعد الدرجه', 'بعد الدرجة',
  'للراتب', 'للمكافاه', 'للمكافأة',
  'مختص الحين', 'من يترجم',
  // ── Gulf dialect additions ──
  'ودي', 'ابا', 'أبا', 'ابه', 'أبه',
  'نبي', 'نبغى', 'نحتاج',
  'يخلص', 'يخلصني', 'يخلصه', 'يخلصها',
  'يعمل', 'يعمل لي', 'ممكن حد',
  'دلوني', 'دلني', 'وجهوني', 'ارشدوني', 'أرشدوني',
  'يا شباب', 'يا جماعه', 'يا جماعة', 'يالربع', 'يا ربع',
  'الله يجزاكم', 'الله يعافيكم',
  'عاد', 'بليز', 'please', 'plz',
  'لو سمحتوا', 'لوسمحتوا', 'لو سمحتم',
  'حد سوى', 'حد سوا', 'أحد سوى',
  'عندكم', 'عندكم أحد', 'فيكم أحد',
  'حل ماده', 'حل مادة',
];

// Weak intent: general question words — only counted with very strong academic match
const WEAK_INTENT_KEYWORDS = [
  'عندي', 'كيف', 'شلون', 'وش', 'وشو', 'شنو',
  'طريقة', 'طريقه', 'استفسار', 'سؤال', 'سوال',
  'اسال', 'أسأل', 'استفسر',
  'هل في', 'هل فيه', 'مين قد', 'مين جرب',
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
  // Sick leave / Medical
  'سكليف', 'سيكليف', 'سكاليف', 'سكالف', 'سكيليف', 'sick leave',
  'عذر طبي', 'عذر مرضي', 'عذر ورقي', 'اعذار', 'أعذار',
  'تقرير طبي', 'تقرير مرضي', 'شهادة مرضية', 'شهاده مرضيه',
  'اجازة مرضية', 'إجازة مرضية', 'اجازه مرضيه',
  'مشهد مراجعه', 'مشهد مراجعة', 'وصفة طبية', 'وصفه طبيه',
  'موعد مستشفى', 'مرافق مريض', 'شهادة صحية', 'فحص طبي',
  // Design tools
  'كانفا', 'canva', 'فوتوشوب', 'photoshop', 'فيتشوب',
  'وورد', 'word', 'اكسل', 'excel', 'بوربوينت', 'powerpoint',
  'انفوجرافيك', 'infographic', 'لوقو', 'logo', 'شعار', 'بنر', 'banner',
  // Math & Science
  'ماث', 'math', 'معادلات', 'تكامل وتفاضل', 'تكامل', 'تفاضل',
  'محاسبة مالية', 'محاسبه ماليه', 'تكاليف', 'دراسة جدوى', 'دراسة جدوي',
  'خرائط ذهنيه', 'خرائط ذهنية', 'خرائط مفاهيم', 'هيكل تنظيمي',
  'فيديو بالذكاء الاصطناعي', 'ذكاء اصطناعي', 'فيديو',
  'فيديو متحرك', 'تعليق صوتي', 'فيديو انمي', 'موشن جرافيك',
  'مناهج البحث', 'بحث علمي', 'مراجع APA 7', 'apa 7', 'apa',
  'تلخيص فصل', 'تلخيص مقرر', 'تلخيص شبتر', 'تلخيص', 'ملخص',
  'رسم هندسي', 'جدول مقارنه', 'جدول مقارنة',
  'سيرة ذاتية ATS', 'ats', 'تدريب نهائي', 'تدريب تطبيقي',
  'بروبوزل', 'proposal', 'مقترح بحث', 'خطة بحث', 'خطه بحث',
  'ريبورت', 'report', 'مطويه', 'مطوية', 'برشور', 'بروشور',
  'ورقه علمية', 'ورقة علمية', 'ملصق علمي', 'بوستر', 'poster',
  'ترجمة ملف', 'ترجمة شابتر', 'سلايدات', 'شرائح',
  'تعبئة البيانات', 'تعبئة بيانات', 'تعديل ملف',
  'تحليل احصائي', 'تحليل إحصائي', 'spss',
  'باكت تريسر', 'packet tracer', 'تصميم جرافيك', 'نظم معلومات',
  'بحث فقهي', 'توثيق المراجع', 'لابات',
  'python', 'تطبيق', 'موقع الكتروني', 'موقع إلكتروني',
  'متجر الكتروني', 'متجر إلكتروني', 'تصميم تخرج', 'تكليف جماعي',
  'اسئلة الفصل', 'أسئلة الفصل', 'تفريغ صوتي',
  'تعبير بالانجليزي', 'رسالة ماجستير', 'رسالة دكتوراه',
  'assignment', 'homework', 'project', 'lab', 'quiz',
  'exam', 'presentation', 'thesis', 'research', 'essay', 'calculus',
  // ── Extended academic subjects ──
  'شريعة', 'فقه', 'اصول فقه', 'حديث', 'تفسير', 'عقيدة',
  'تاريخ', 'جغرافيا', 'علم نفس', 'علم اجتماع', 'اجتماعيات',
  'تربية', 'تعليم', 'منهج', 'منهجية', 'مقرر',
  'احياء', 'أحياء', 'biology', 'chemistry', 'physics',
  'اتصالات', 'كهرباء', 'معماري', 'مدني', 'ميكانيكا', 'صناعي',
  'نتيجة', 'درجة', 'درجات', 'علامة', 'علامات',
  'جامعة', 'جامعي', 'كلية', 'كليه', 'دبلوم',
  'ماستر', 'بكالوريوس', 'دكتوراة',
  'شابتر', 'chapter', 'فصل', 'وحدة', 'unit',
  'مذكرة', 'مذكره', 'ملزمة', 'ملزمه',
  'سي شارب', 'c#', 'c++', 'html', 'css', 'javascript', 'js',
  'sql', 'mysql', 'oracle', 'database',
  'ارشيف', 'أرشيف', 'مرجع', 'مراجع', 'مصدر', 'مصادر',
  'matlab', 'ماتلاب', 'اوتوكاد', 'autocad', 'solidworks',
  'ريفيت', 'revit', 'ساب', 'sap', 'اوراكل',
  'تمريض', 'صيدلة', 'صيدله', 'طب', 'اسنان', 'أسنان',
  'بورد', 'سنة تحضيرية', 'سنه تحضيريه', 'تحضيري',
];

// ─── Priority Detection Keywords ──────────────────────────────────────────────
const URGENT_KEYWORDS = [
  'عاجل', 'اليوم', 'الليلة', 'بكره', 'بكرة', 'ضروري', 'asap', 'urgent',
  'نفس اليوم', 'خلال ساعة', 'دقائق', 'الان', 'الآن', 'بسرعة',
  'قبل بكرة', 'لازم اليوم', 'الحين', 'ذحين', 'توه', 'توها',
  'ضروري جدا', 'ضروري جداً', 'محتاجه ضروري', 'لازم',
];

const LOW_PRIORITY_KEYWORDS = [
  'الاسبوع القادم', 'الشهر القادم', 'مفيش ضغط', 'بدون استعجال',
  'مو مستعجل', 'الاسبوع الجاي',
];

// ─── Word-Boundary Matching ───────────────────────────────────────────────────
/**
 * Arabic-aware keyword matching that respects word boundaries.
 * For Arabic: uses spaces/punctuation/start/end as boundaries.
 * For English: uses \b word boundaries.
 * @param {string} text
 * @param {string[]} keywords
 * @returns {string[]} matched keywords
 */
const findMatchingKeywords = (text, keywords) => {
  const lowerText = text.toLowerCase();
  const matched = [];

  for (const kw of keywords) {
    const lowerKw = kw.toLowerCase();

    // For multi-word phrases, just check includes (phrase matching is accurate enough)
    if (lowerKw.includes(' ') || lowerKw.length > 6) {
      if (lowerText.includes(lowerKw)) {
        matched.push(kw);
      }
      continue;
    }

    // For short single words, use boundary checking
    const isEnglish = /^[a-z0-9]+$/i.test(lowerKw);
    if (isEnglish) {
      // English: use \b word boundary
      const regex = new RegExp(`\\b${lowerKw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(lowerText)) {
        matched.push(kw);
      }
    } else {
      // Arabic: check if keyword is surrounded by spaces, punctuation, or text boundaries
      const escaped = lowerKw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(?:^|[\\s.,،؟!\\-:()\\[\\]{}])${escaped}(?:$|[\\s.,،؟!\\-:()\\[\\]{}])`, 'i');
      if (regex.test(lowerText)) {
        matched.push(kw);
      } else if (lowerText.includes(lowerKw)) {
        // Fallback: still accept if it appears as a standalone substring
        // Relax length check to >= 2 to allow short Arabic words like 'حل', 'بحث', 'ابي', 'طب'
        if (lowerKw.length >= 2) {
          matched.push(kw);
        }
      }
    }
  }

  return matched;
};

// ─── Advertiser Pattern Matching ──────────────────────────────────────────────
/**
 * Checks if text matches any advertiser regex patterns.
 * @param {string} text
 * @returns {number} count of matched patterns
 */
const countAdvertiserPatterns = (text) => {
  let count = 0;
  for (const pattern of ADVERTISER_PATTERNS) {
    if (pattern.test(text)) {
      count++;
    }
  }
  return count;
};

// ─── Service Type Detection ───────────────────────────────────────────────────
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

  // 2. Accounting & Finance
  if (lowerText.includes('محاسبة') || lowerText.includes('محاسبه') || lowerText.includes('تكاليف') || lowerText.includes('جدوى') || lowerText.includes('جدوي') || lowerText.includes('اقتصاد') || lowerText.includes('مالية')) {
    return 'محاسبة';
  }

  // 3. Training
  if (lowerText.includes('تدريب') || lowerText.includes('تعاوني') || lowerText.includes('ميداني') || lowerText.includes('تطبيقي') || lowerText.includes('تمهير')) {
    return 'تدريب';
  }

  // 4. Programming & Tech
  if (lowerText.includes('برمجة') || lowerText.includes('برمجه') || lowerText.includes('code') || lowerText.includes('python') || lowerText.includes('java') ||
     (lowerText.includes('حاسب') && !lowerText.includes('محاسب')) ||
     lowerText.includes('باكت تريسر') || lowerText.includes('packet tracer') ||
     (lowerText.includes('تطبيق') && !lowerText.includes('تطبيقي')) ||
     lowerText.includes('موقع الكتروني') || lowerText.includes('موقع إلكتروني') || lowerText.includes('متجر الكتروني') || lowerText.includes('متجر إلكتروني') || lowerText.includes('نظم معلومات') || lowerText.includes('بايثون')) {
    return 'برمجة';
  }

  // 5. Research
  if (lowerText.includes('بحث') || lowerText.includes('بحوث') || lowerText.includes('research') || lowerText.includes('مناهج البحث') || lowerText.includes('بروبوزل') || lowerText.includes('proposal') || lowerText.includes('مقترح بحث') || lowerText.includes('خطة بحث') || lowerText.includes('ورقة علمية') || lowerText.includes('ورقه علمية') || lowerText.includes('ملصق علمي') || lowerText.includes('بوستر') || lowerText.includes('بحث علمي') || lowerText.includes('بحث فقهي')) {
    return 'بحث';
  }

  // 6. CV / ATS
  if (lowerText.includes('cv') || lowerText.includes('سيرة ذاتية') || lowerText.includes('ats') || lowerText.includes('سيره ذاتيه')) {
    return 'CV';
  }

  // 7. Design & Visuals
  if (lowerText.includes('كانفا') || lowerText.includes('canva') || lowerText.includes('فوتوشوب') || lowerText.includes('photoshop') || lowerText.includes('فيتشوب') || lowerText.includes('انفوجرافيك') || lowerText.includes('تصميم جرافيك') || lowerText.includes('مطويه') || lowerText.includes('مطوية') || lowerText.includes('برشور') || lowerText.includes('بروشور') || lowerText.includes('لوقو') || lowerText.includes('logo') || lowerText.includes('شعار') || lowerText.includes('بنر') || lowerText.includes('خرائط ذهنيه') || lowerText.includes('خرائط ذهنية') || lowerText.includes('خرائط مفاهيم') || lowerText.includes('هيكل تنظيمي') || lowerText.includes('موشن جرافيك') || lowerText.includes('تعليق صوتي') || lowerText.includes('تصميم') || lowerText.includes('design')) {
    return 'تصميم';
  }

  // 8. Reports
  if (lowerText.includes('تقرير') || lowerText.includes('report') || lowerText.includes('تقارير') || lowerText.includes('ريبورت')) {
    return 'تقارير';
  }

  // 9. Projects
  if (lowerText.includes('مشروع') || lowerText.includes('project') || lowerText.includes('بروجكت') || lowerText.includes('مشروع تخرج')) {
    return 'مشاريع';
  }

  // 10. Homework / General tasks
  if (lowerText.includes('واجب') || lowerText.includes('تكليف') || lowerText.includes('assignment') || lowerText.includes('homework') || lowerText.includes('تفريغ') || lowerText.includes('تعديل ملف') || lowerText.includes('تعبئة')) {
    return 'واجبات';
  }

  // 11. Exams & Quizzes
  if (lowerText.includes('اختبار') || lowerText.includes('كويز') || lowerText.includes('فاينل') || lowerText.includes('ميد') || lowerText.includes('exam') || lowerText.includes('quiz') || lowerText.includes('امتحان')) {
    return 'اختبارات';
  }

  // 12. Presentations
  if (lowerText.includes('بوربوينت') || lowerText.includes('عرض تقديمي') || lowerText.includes('برزنتيشن') || lowerText.includes('presentation') || lowerText.includes('سلايدات') || lowerText.includes('شرائح')) {
    return 'عروض';
  }

  // 13. Mathematics
  if (lowerText.includes('رياضيات') || lowerText.includes('math') || lowerText.includes('calculus') || lowerText.includes('حسبان') || lowerText.includes('احصاء') || lowerText.includes('إحصاء') || lowerText.includes('spss') || lowerText.includes('ماث') || lowerText.includes('معادلات') || lowerText.includes('تكامل') || lowerText.includes('تفاضل') || lowerText.includes('جبر') || lowerText.includes('رسم هندسي') || lowerText.includes('تحليل احصائي') || lowerText.includes('تحليل إحصائي')) {
    return 'رياضيات';
  }

  // 14. Translation
  if (lowerText.includes('ترجمة') || lowerText.includes('ترجمه') || lowerText.includes('translation') || lowerText.includes('تعبير بالانجليزي')) {
    return 'ترجمة';
  }

  // 15. Word / Excel
  if (lowerText.includes('وورد') || lowerText.includes('اكسل') || lowerText.includes('excel')) {
    return 'واجبات';
  }

  return null;
};

/**
 * Count how many distinct academic service categories are mentioned in the text.
 * Listing 4+ different subjects/services is a strong advertiser indicator.
 * @param {string} text
 * @returns {number}
 */
const countDetectedServiceTypes = (text) => {
  const lowerText = text.toLowerCase();
  let count = 0;
  const categories = [
    ['سكليف', 'سكاليف', 'عذر طبي', 'تقرير طبي', 'اجازة مرضية', 'إجازة مرضية'],
    ['برمجة', 'بايثون', 'جافا', 'code', 'python'],
    ['بحث', 'بحوث', 'research', 'بحث علمي'],
    ['محاسبة', 'تكاليف', 'جدوى', 'اقتصاد', 'مالية'],
    ['رياضيات', 'ماث', 'معادلات', 'احصاء', 'إحصاء'],
    ['ترجمة', 'ترجمه', 'translation'],
    ['تصميم', 'كانفا', 'فوتوشوب', 'فيتشوب', 'انفوجرافيك'],
    ['كويز', 'اختبار', 'امتحان', 'فاينل', 'ميد'],
    ['واجب', 'تكليف', 'واجبات', 'assignment', 'homework'],
    ['مشروع', 'بروجكت', 'مشاريع', 'project', 'مشروع تخرج'],
    ['بوربوينت', 'برزنتيشن', 'عرض تقديمي', 'سلايدات'],
    ['تقرير', 'تقارير', 'ريبورت', 'report'],
    ['cv', 'سيرة ذاتية', 'سيره ذاتيه'],
    ['تدريب', 'تعاوني', 'ميداني', 'تمهير'],
    ['تلخيص', 'ملخص'],
  ];
  categories.forEach(cat => {
    if (cat.some(kw => lowerText.includes(kw))) {
      count++;
    }
  });
  return count;
};

// ─── Enhanced Keyword Classifier ──────────────────────────────────────────────
/**
 * Enhanced keyword-based classifier with multi-tier intent analysis.
 * Uses strong/medium/weak intent separation and structural advertiser detection.
 * @param {string} messageText
 * @returns {Object} Classification result
 */
const keywordFallback = (messageText) => {
  const trimmedText = messageText.trim();

  // ─── Advertiser Scoring (cumulative) ────────────────────────────────────────
  let advertiserScore = 0;

  // 1. Keyword Matches
  const matchedAdvertiserKws = findMatchingKeywords(trimmedText, ADVERTISER_KEYWORDS);
  advertiserScore += matchedAdvertiserKws.length * 1.5;

  // 2. Regex pattern matches (very strong signal)
  const patternMatches = countAdvertiserPatterns(trimmedText);
  advertiserScore += patternMatches * 2.5;

  // 3. Emoji Density
  const emojiMatches = trimmedText.match(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2B06}\u{2190}-\u{21FF}]/gu);
  const emojiCount = emojiMatches ? emojiMatches.length : 0;
  if (emojiCount >= 10) {
    advertiserScore += 4.0;
  } else if (emojiCount >= 5) {
    advertiserScore += 2.0;
  }

  // 4. Repeated Contact/Handles
  const usernameMatches = trimmedText.match(/@[a-zA-Z0-9_]+/g);
  if (usernameMatches) {
    const usernameCounts = {};
    usernameMatches.forEach(u => {
      usernameCounts[u] = (usernameCounts[u] || 0) + 1;
    });
    const maxRepetitions = Math.max(...Object.values(usernameCounts));
    if (maxRepetitions >= 3) {
      advertiserScore += 4.0;
    } else if (usernameMatches.length >= 3) {
      advertiserScore += 2.0;
    }
  }

  // 5. WhatsApp / External links
  if (/wa\.me|api\.whatsapp|chat\.whatsapp/i.test(trimmedText)) {
    advertiserScore += 3.0;
  }

  // 6. Multi-subject listing
  const serviceTypesCount = countDetectedServiceTypes(trimmedText);
  if (serviceTypesCount >= 4) {
    advertiserScore += 4.0;
  } else if (serviceTypesCount >= 3) {
    advertiserScore += 2.0;
  }

  // 7. Length + service listing = strong ad signal
  if (trimmedText.length > 400 && serviceTypesCount >= 2) {
    advertiserScore += 3.0;
  } else if (trimmedText.length > 500) {
    advertiserScore += 1.5;
  }

  // 8. Bullet points / list structure (common in ads)
  const bulletCount = (trimmedText.match(/[•●▪▸►★✅✨🔹🔸◾◽⚡⭐]/g) || []).length;
  if (bulletCount >= 3) {
    advertiserScore += 2.5;
  }

  // 9. "For contact on private" pattern (ads often end this way)
  if (/للتواصل\s+(والطلب\s+)?على\s+الخاص/i.test(trimmedText)) {
    advertiserScore += 3.0;
  }

  // ─── Request Intent Analysis ────────────────────────────────────────────────
  const matchedStrongIntent = findMatchingKeywords(trimmedText, STRONG_INTENT_KEYWORDS);
  const matchedMediumIntent = findMatchingKeywords(trimmedText, MEDIUM_INTENT_KEYWORDS);
  const matchedWeakIntent = findMatchingKeywords(trimmedText, WEAK_INTENT_KEYWORDS);
  const matchedAcademicKws = findMatchingKeywords(trimmedText, ACADEMIC_KEYWORDS);

  // Require higher advertiser score to skip if there is strong/medium request intent
  const advertiserThreshold = matchedStrongIntent.length > 0 ? 7.0 : (matchedMediumIntent.length > 0 ? 5.0 : 3.0);
  const isAdvertiser = advertiserScore >= advertiserThreshold;

  // Starts with a request noun pattern
  const startsWithRequestNoun = /^(واجب|تكليف|بحث|مشروع|بروجكت|تقرير|سيرة|سيره|ترجمة|ترجمه|تلخيص|عذر|سكليف|سكاليف|سيكليف|لاب|كويز|رسم|سلايدات|تفريغ|تصميم|حل|مطلوب|محتاج|احتاج|أحتاج)\s+/i.test(trimmedText);

  // Calculate intent score
  let intentScore = 0;
  intentScore += matchedStrongIntent.length * 30;     // Very strong signal
  intentScore += matchedMediumIntent.length * 15;     // Medium signal
  intentScore += matchedWeakIntent.length * 5;        // Weak signal
  intentScore += matchedAcademicKws.length * 12;      // Academic context
  if (startsWithRequestNoun) intentScore += 20;       // Starts with noun

  // Short message bonus (typical real requests are short)
  if (trimmedText.length < 100 && matchedAcademicKws.length > 0) {
    intentScore += 10;
  }

  // Penalty for long messages without strong intent
  if (trimmedText.length > 300 && matchedStrongIntent.length === 0) {
    intentScore -= 15;
  }

  // Determine if it's a request
  const hasStrongSignal = matchedStrongIntent.length > 0;
  const hasMediumSignal = matchedMediumIntent.length > 0 && (matchedAcademicKws.length > 0 || intentScore >= 15);
  const hasNounStart = startsWithRequestNoun;
  const hasWeakSignal = matchedWeakIntent.length > 0 && (matchedAcademicKws.length >= 1 || matchedMediumIntent.length >= 1);

  const isRequest = (hasStrongSignal || hasMediumSignal || hasNounStart || hasWeakSignal) && !isAdvertiser;

  const serviceType = isRequest ? detectServiceType(trimmedText) : null;

  // Priority detection
  let priority = 'NORMAL';
  if (findMatchingKeywords(trimmedText, URGENT_KEYWORDS).length > 0) {
    priority = 'URGENT';
  } else if (findMatchingKeywords(trimmedText, LOW_PRIORITY_KEYWORDS).length > 0) {
    priority = 'LOW';
  }

  // Confidence score calculation (0.0 - 1.0)
  let confidenceScore;
  if (isRequest) {
    const rawScore = Math.min(intentScore, 100) / 100;
    confidenceScore = Math.min(0.4 + (rawScore * 0.5), 0.88);
  } else if (isAdvertiser) {
    confidenceScore = Math.min(0.5 + (advertiserScore * 0.05), 0.95);
  } else {
    confidenceScore = 0.1;
  }

  const allMatchedKeywords = [
    ...matchedStrongIntent,
    ...matchedMediumIntent,
    ...matchedAcademicKws,
  ].slice(0, 10);

  return {
    isRequest,
    isAdvertiser,
    serviceType,
    confidenceScore,
    keywords: allMatchedKeywords,
    priority,
    classifiedBy: 'keyword_fallback',
    _debug: {
      intentScore,
      advertiserScore,
      strongIntent: matchedStrongIntent.length,
      mediumIntent: matchedMediumIntent.length,
      weakIntent: matchedWeakIntent.length,
      academicKws: matchedAcademicKws.length,
      serviceTypesCount: countDetectedServiceTypes(trimmedText),
    },
  };
};

// ═══════════════════════════════════════════════════════════════════════════════
//  TIER 3: OPENAI — For ambiguous messages
// ═══════════════════════════════════════════════════════════════════════════════

let aiClient = null;
let aiModel = 'gpt-4o-mini';

const getAIClient = () => {
  if (aiClient) return { client: aiClient, model: aiModel };

  const provider = (process.env.AI_PROVIDER || 'hybrid').toLowerCase();

  // 1. Gemini Configuration (check env first, standard OpenAI SDK compatibility)
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'placeholder' && process.env.GEMINI_API_KEY !== '' &&
      (provider === 'gemini' || provider === 'hybrid' || !process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'sk-placeholder')) {
    logger.info('Initializing Gemini AI client...');
    aiClient = new OpenAI({
      apiKey: process.env.GEMINI_API_KEY,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
    });
    aiModel = process.env.AI_MODEL || 'gemini-1.5-flash';
    return { client: aiClient, model: aiModel };
  }

  // 2. DeepSeek Configuration (OpenAI SDK compatible)
  if (process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_API_KEY !== 'placeholder' && process.env.DEEPSEEK_API_KEY !== '' &&
      (provider === 'deepseek' || provider === 'hybrid')) {
    logger.info('Initializing DeepSeek AI client...');
    aiClient = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: "https://api.deepseek.com/v1"
    });
    aiModel = process.env.AI_MODEL || 'deepseek-chat';
    return { client: aiClient, model: aiModel };
  }

  // 3. OpenAI Fallback
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'sk-placeholder' && process.env.OPENAI_API_KEY !== '') {
    logger.info('Initializing OpenAI client...');
    aiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    aiModel = process.env.AI_MODEL || 'gpt-4o-mini';
    return { client: aiClient, model: aiModel };
  }

  return { client: null, model: null };
};

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
- "ابي مختص يحل واجب برمجة"
- "محتاج مساعدة في بحث"
- "مين يسوي لي CV"
- "فزعتكم يا شباب عندي تكليف لازم يتسلم اليوم"
- "حد يعرف شخص ثقه يسوي سكاليف"
- "ابي إجازة مرضية"

## ما لا يُعتبر طلب (isRequest = false):
1. **الإعلانات**: شخص يعرض خدماته (أقدم لكم، نحل واجبات، تواصل معنا، أفضل الأسعار)
2. **الدردشة العادية**: سلام، شكر، نقاش، سؤال عام
3. **الأسئلة المعرفية**: "من يعرف الدكتور؟"، "وش رأيكم بالمادة؟"
4. **الروابط الترويجية**: روابط تسويق، عروض خدمات

### أمثلة رسائل يجب رفضها:
- "أقدم لكم جميع الخدمات الطلابية والأكاديمية" → إعلان
- "نحل جميع الواجبات تواصل واتساب" → إعلان
- "متى موعد الاختبار؟" → سؤال معلوماتي
- "هل أحد أخذ هذي المادة؟" → سؤال عام

## القاعدة الذهبية:
**افهم نية الشخص وليس الكلمات فقط**. الشخص يجب أن يكون يطلب من شخص آخر أن ينفذ له عمل أكاديمي محدد.

## أنواع الخدمات:
برمجة، بحث، عروض، CV، رياضيات، واجبات، اختبارات، مشاريع، تقارير، ترجمة، طب، تصميم، سكليف، تدريب، محاسبة

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

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN CLASSIFIER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Classifies a Telegram message using a 3-tier approach:
 * 1. Pre-filter: reject obviously irrelevant messages
 * 2. Keyword analysis: smart intent + academic matching
 * 3. OpenAI: for ambiguous messages (confidence 0.4–0.7)
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

  // TIER 1: Pre-filter — quickly reject obvious non-requests
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

  // TIER 2: Keyword + Intent Analysis
  const kResult = keywordFallback(messageText);

  // If clearly an advertiser, reject immediately
  if (kResult.isAdvertiser) {
    kResult.classifiedBy = 'keyword_advertiser_reject';
    logger.debug('Message classified as advertiser via keywords', {
      advertiserScore: kResult._debug?.advertiserScore,
    });
    return kResult;
  }

  // If clearly a request with high confidence, accept immediately
  const confidenceThreshold = process.env.AI_CONFIDENCE_THRESHOLD ? parseFloat(process.env.AI_CONFIDENCE_THRESHOLD) : 0.55;
  if (kResult.isRequest && kResult.confidenceScore >= confidenceThreshold) {
    kResult.classifiedBy = 'keyword_fastpass';
    logger.debug('Message classified via keyword fast-pass', {
      serviceType: kResult.serviceType,
      confidence: kResult.confidenceScore,
      intentScore: kResult._debug?.intentScore,
    });
    return kResult;
  }

  // TIER 3: AI model for ambiguous cases (Gemini, DeepSeek, or OpenAI)
  const { client, model } = getAIClient();

  // If no AI client initialized, return keyword result as-is
  if (!client) {
    if (kResult.isRequest) {
      kResult.classifiedBy = 'keyword_fastpass';
    }
    return kResult;
  }

  // Use AI for ambiguous messages
  let attempts = 0;
  const maxAttempts = 2;
  while (attempts < maxAttempts) {
    try {
      attempts++;
      const userContent = context.groupName
        ? `المجموعة: ${context.groupName}\nالمرسل: ${context.senderName || 'مجهول'}\n\nالرسالة:\n${messageText}`
        : messageText;

      const response = await client.chat.completions.create({
        model: model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        temperature: 0.05,
        max_tokens: 300,
        response_format: { type: 'json_object' },
      }, {
        timeout: 15000 // 15 seconds timeout
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('Empty response from AI model');

      const parsed = JSON.parse(content);

      const result = {
        isRequest: Boolean(parsed.isRequest),
        isAdvertiser: Boolean(parsed.isAdvertiser),
        serviceType: parsed.serviceType && SERVICE_TYPES.includes(parsed.serviceType)
          ? parsed.serviceType
          : (parsed.isRequest ? detectServiceType(messageText) : null),
        confidenceScore: Math.min(Math.max(Number(parsed.confidenceScore) || 0, 0), 1),
        keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 8) : [],
        priority: ['URGENT', 'NORMAL', 'LOW'].includes(parsed.priority) ? parsed.priority : 'NORMAL',
        reasoning: parsed.reasoning || '',
        classifiedBy: `ai_${model}`,
      };

      logger.debug('Message classified by AI', {
        model,
        isRequest: result.isRequest,
        isAdvertiser: result.isAdvertiser,
        serviceType: result.serviceType,
        confidence: result.confidenceScore,
        reasoning: result.reasoning,
      });

      return result;
    } catch (err) {
      logger.warn(`AI classification attempt ${attempts} failed: ${err.message}`);
      if (attempts >= maxAttempts) {
        logger.error('AI classification failed completely, using relaxed keyword fallback', {
          error: err.message,
        });
        
        // Relaxed fallback: if keywords indicated even a medium request intent, accept it!
        // This prevents ignoring valid requests during AI downtime.
        if (kResult.isRequest || kResult._debug?.intentScore >= 15) {
          kResult.isRequest = true;
          if (kResult.confidenceScore < 0.5) kResult.confidenceScore = 0.5;
          kResult.classifiedBy = 'ai_fallback_relaxed';
          return kResult;
        }
        return kResult;
      }
      // Small sleep before retry
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
};

module.exports = { classifyMessage, keywordFallback, shouldSkipMessage };
