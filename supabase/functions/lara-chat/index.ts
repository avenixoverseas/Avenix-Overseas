/* Avenix Overseas — Lara AI assistant
 * Production implementation — Groq only, server-side.
 *
 * Principles:
 * 1. No visitor/lead/personal-data collection.
 * 2. Avenix website is the primary source for Avenix questions.
 * 3. Current published career_jobs are read directly from Supabase for job questions.
 * 4. General questions are answered by the real AI model using its general knowledge.
 * 5. The visitor's CURRENT language is detected on every turn and mirrored immediately.
 * 6. CORS/preflight is handled before any AI/database work.
 */

const SUPABASE_URL = () => (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
const SERVICE_ROLE_KEY = () => Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SUPABASE_ANON_KEY = () => Deno.env.get("SUPABASE_ANON_KEY") || "";
const GROQ_KEY = () => Deno.env.get("GROQ_API_KEY") || "";
const CONFIGURED_MODEL = () => (Deno.env.get("GROQ_MODEL") || "").trim();

const MAX_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 1800;
const MAX_CONTEXT_CHARS = 52_000;
const REQUEST_TIMEOUT_MS = 15_000;
const PAGE_TIMEOUT_MS = 3_000;
const PAGE_CACHE_MS = 10 * 60_000;
const JOB_CACHE_MS = 15_000;
const MODEL_CACHE_MS = 10 * 60_000;

const WEBSITE_PAGES = [
  "index.html",
  "work-opportunity.html",
  "about.html",
  "services.html",
  "countries.html",
  "reviews.html",
  "contact.html",
  "free-services.html",
  "privacy-policy.html",
  "terms.html",
  "disclaimer.html",
];

type PageRecord = {
  page: string;
  title: string;
  content: string;
  expiresAt: number;
};

type JobRecord = {
  id?: unknown;
  job_title?: string;
  country?: string;
  location?: string;
  employment_type?: string;
  position?: string;
  salary?: string;
  positions?: string;
  experience?: string;
  requirements?: string;
  description?: string;
  benefits?: string;
  accommodation?: string;
  application_information?: string;
  employer?: string;
  created_at?: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

let pageCache: Record<string, PageRecord> = {};
let jobCache: {
  jobs: JobRecord[];
  expiresAt: number;
} | null = null;

let modelCache: {
  model: string;
  expiresAt: number;
} | null = null;

function corsHeaders(): Headers {
  const headers = new Headers();

  headers.set("Access-Control-Allow-Origin", "*");
  headers.set(
    "Access-Control-Allow-Headers",
    "authorization, x-client-info, apikey, content-type",
  );
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Max-Age", "86400");
  headers.set("Content-Type", "application/json; charset=utf-8");

  return headers;
}

function json(
  req: Request,
  body: Record<string, unknown>,
  status = 200,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(),
  });
}

function cleanText(
  value: unknown,
  max = MAX_MESSAGE_CHARS,
) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, max);
}

function compact(
  value: unknown,
  max = 5000,
) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function isJobQuery(q: string) {
  return /\b(job|jobs|vacanc|hiring|career|recruit|recruitment|employer|salary|position|opening|openings|employment|work opportunity|work opportunities|work permit|overseas careers)\b/i.test(q)
    || /\b(naukri|naukriyan|kaam|kam|rozgar|mulazmat|nokri|bharti|bhartiyan|opportunity|opportunities|work visa)\b/i.test(q)
    || /नौकरी|रोज़गार|भर्ती|काम|अवसर|मुलाज़मत|نوکری|ملازمت|روزگار|بھرتی|বাংলা চাকরি|কাজ|চাকরি|සිංහල රැකියා|රැකියා|नेपाली जागिर/.test(q);
}

function isStudyQuery(q: string) {
  return /\b(study|student|education|university|universit|course|courses|degree|degrees|mbbs|engineering|mba|bachelor|master|masters|college|admission|study abroad)\b/i.test(q)
    || /पढ़ाई|शिक्षा|विश्वविद्यालय|कोर्स|डिग्री|अध्ययन|विदेश में पढ़|تعلیم|پڑھائی|یونیورسٹی|শিক্ষা|বিশ্ববিদ্যালয়|কোর্স|नेपाली अध्ययन|සිසු|අධ්‍යාපන/.test(q);
}

function isReviewQuery(q: string) {
  return /\b(review|reviews|testimonial|testimonials|feedback|client experience)\b/i.test(q)
    || /रिव्यू|समीक्षा|تجربہ|ریویو|পর্যালোচনা|রিভিউ|සමාලෝචන/.test(q);
}

function isAvenixQuery(q: string) {
  return /avenix|overseas|work opportunity|work opportunities|overseas careers|study abroad|student visa|business visa|tourist visa|recruit|hiring|job|jobs|career|review|service|country|countries|consultation|about us|contact|document|resume|cv|visa|immigration|education|university|course|employer|salary|naukri|rozgar|bharti|काम|नौकरी|रोज़गार|भर्ती|अवसर|وائیزا|ملازمت|نوکری|বাংলা|বিদেশ|নেপাল|සිංහල|රැකියා|අධ්‍යාපන/i.test(q);
}

function detectExplicitLanguage(q: string) {
  const s = q.trim().toLowerCase();

  if (/\b(hinglish|roman hindi|hindi roman)\b/.test(s)) {
    return "Hinglish (Roman Hindi + English)";
  }

  if (/\b(roman urdu|urdu roman)\b/.test(s)) {
    return "Roman Urdu";
  }

  if (
    /\b(pure hindi|hindi|हिंदी|हिन्दी)\b/.test(s)
    && /\b(me|mein|main|mein batao|mein bataiye|में|मे|बताओ|बताइए)\b/.test(s)
  ) {
    return "Hindi (Devanagari)";
  }

  if (
    /\b(urdu|اردو)\b/.test(s)
    && /\b(me|mein|mein batao|میں|بتاؤ)\b/.test(s)
  ) {
    return "Urdu";
  }

  if (/\b(bangla|bengali)\b/.test(s)) {
    return "Bangla (Bengali script)";
  }

  if (/\b(nepali)\b/.test(s)) {
    return "Nepali";
  }

  if (/\b(sinhala|sri lankan)\b/.test(s)) {
    return "Sinhala";
  }

  return "";
}

function detectLanguage(q: string) {
  const s = q.trim();

  if (!s) return "English";

  const explicit = detectExplicitLanguage(s);

  if (explicit) return explicit;

  // Use explicit Unicode ranges instead of named Unicode property escapes.
  // This keeps the Edge Function compatible with the Supabase worker runtime.

  if (/[\u0980-\u09FF]/u.test(s)) {
    return "Bangla (Bengali script)";
  }

  if (/[\u0D80-\u0DFF]/u.test(s)) {
    return "Sinhala";
  }

  if (/[\u0A00-\u0A7F]/u.test(s)) {
    return "Punjabi (Gurmukhi script)";
  }

  if (/[\u0A80-\u0AFF]/u.test(s)) {
    return "Gujarati";
  }

  if (/[\u0B80-\u0BFF]/u.test(s)) {
    return "Tamil";
  }

  if (/[\u0C00-\u0C7F]/u.test(s)) {
    return "Telugu";
  }

  if (/[\u0D00-\u0D7F]/u.test(s)) {
    return "Malayalam";
  }

  if (/[\u0900-\u097F]/u.test(s)) {
    if (
      /छैन|छु|हुन्छ|गर्नु|गर्छु|भयो|किन|कहाँ|नेपाल|नेपाली/.test(s)
    ) {
      return "Nepali (Devanagari)";
    }

    return "Hindi (Devanagari)";
  }

  if (/[\u0600-\u06FF]/u.test(s)) {
    return "Urdu";
  }

  const lower = s.toLowerCase();

  const hindiMarkers = [
    "kya",
    "kyun",
    "kaise",
    "kaisa",
    "hai",
    "hain",
    "mujhe",
    "mujhy",
    "chahiye",
    "batao",
    "bataiye",
    "mera",
    "meri",
    "mere",
    "aap",
    "ap",
    "abhi",
    "kaun",
    "kahan",
    "kab",
    "kitna",
    "kitni",
    "sakta",
    "sakti",
    "hoga",
    "hogi",
    "karna",
    "karni",
    "raha",
    "rahi",
    "mein",
    "me",
    "se",
    "par",
    "wala",
    "wali",
    "liye",
    "nahi",
    "nahin",
    "ka",
    "ki",
    "ke",
    "bata",
    "milta",
    "milega",
    "mili",
    "milega",
    "hai kya",
  ];

  const urduMarkers = [
    "mujhe",
    "mujhy",
    "aapko",
    "aap ki",
    "aap ka",
    "bata dein",
    "batayein",
    "chahiye",
    "kahan",
    "kab",
    "kitna",
    "kyun",
    "kyon",
    "mulk",
    "mulazmat",
    "nokri",
    "naukri",
    "rozgar",
    "taleem",
    "parhai",
    "darkhwast",
    "zaroorat",
    "moqa",
    "mauqa",
    "hai",
    "hain",
    "aap",
    "aapki",
    "aapka",
  ];

  const englishMarkers =
    /\b(what|where|when|why|how|which|can|could|would|please|tell|about|latest|current|work|job|jobs|visa|student|study|germany|uk|india|avenix)\b/i;

  const count = (words: string[]) =>
    words.reduce(
      (n, w) =>
        n +
        (
          new RegExp(
            `(?:^|\\s)${w.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}(?:$|\\s|[?!.,])`,
            "i",
          ).test(lower)
            ? 1
            : 0
        ),
      0,
    );

  const h = count(hindiMarkers);
  const u = count(urduMarkers);

  // Roman Hindi + English is deliberately preferred for mixed Roman Hindi/English.
  if (h >= 2 && (englishMarkers.test(lower) || h >= 3)) {
    return "Hinglish (Roman Hindi + English)";
  }

  if (u >= 3 && !englishMarkers.test(lower)) {
    return "Roman Urdu";
  }

  if (h >= 2) {
    return "Hinglish (Roman Hindi + English)";
  }

  return "English";
}

function languageInstruction(language: string) {
  return `CURRENT VISITOR LANGUAGE: ${language}

LANGUAGE RULES:
- Detect language from the visitor's CURRENT message, not the previous message.
- If the visitor changes language, change your reply immediately on this turn.
- Hinglish means Roman/Latin Hindi mixed with English. Reply in Hinglish in Roman/Latin script. NEVER convert Hinglish to Devanagari.
- If the visitor types Hindi in Devanagari, reply in Hindi Devanagari.
- If the visitor changes from Devanagari Hindi to Hinglish, reply in Hinglish immediately.
- If the visitor uses Urdu script, reply in Urdu script. If Roman Urdu is used, reply in Roman Urdu.
- Bangla, Nepali, Sinhala, Punjabi, Gujarati, Tamil, Telugu, Malayalam and other languages should be answered in that same language/script when reasonably possible.
- If the visitor explicitly requests a language, obey that request immediately.
- Never answer in a different script merely because the previous turn used another language.`;
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function htmlTitle(
  html: string,
  fallback: string,
) {
  const match = html.match(
    /<title[^>]*>([\s\S]*?)<\/title>/i,
  );

  return compact(
    stripHtml(match?.[1] || fallback),
    160,
  );
}

async function fetchTimeout(
  url: string,
  ms: number,
) {
  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    ms,
  );

  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Avenix-Lara/4.0",
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function loadWebsitePages() {
  const now = Date.now();

  const missing = WEBSITE_PAGES.filter(
    (path) => !(pageCache[path]?.expiresAt > now),
  );

  if (missing.length) {
    await Promise.all(
      missing.map(async (path) => {
        try {
          const response = await fetchTimeout(
            `https://avenixoverseas.com/${path}`,
            PAGE_TIMEOUT_MS,
          );

          if (!response.ok) return;

          const html = await response.text();

          pageCache[path] = {
            page: path,
            title: htmlTitle(html, path),
            content: stripHtml(html).slice(0, 7500),
            expiresAt: Date.now() + PAGE_CACHE_MS,
          };
        } catch (error) {
          console.error(
            `Avenix page fetch failed for ${path}:`,
            error,
          );
        }
      }),
    );
  }

  return WEBSITE_PAGES
    .map((path) => pageCache[path])
    .filter(
      (item): item is PageRecord => Boolean(item),
    )
    .map(
      ({ page, title, content }) => ({
        page,
        title,
        content,
      }),
    );
}

async function supabaseGet(path: string) {
  const base = SUPABASE_URL();
  const key =
    SERVICE_ROLE_KEY() ||
    SUPABASE_ANON_KEY();

  if (!base || !key) return null;

  try {
    const response = await fetch(
      `${base}/rest/v1/${path}`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          Accept: "application/json",
        },
      },
    );

    if (!response.ok) {
      console.error(
        "Supabase public-data query failed:",
        response.status,
        await response.text().catch(() => ""),
      );

      return null;
    }

    return await response.json();
  } catch (error) {
    console.error(
      "Supabase public-data query error:",
      error,
    );

    return null;
  }
}

function safeJob(j: any): JobRecord {
  return {
    id: j?.id,
    job_title: compact(j?.job_title, 220),
    country: compact(j?.country, 120),
    location: compact(j?.location, 180),
    employment_type: compact(
      j?.employment_type,
      180,
    ),
    position: compact(j?.position, 180),
    salary: compact(j?.salary, 220),
    positions: compact(j?.positions, 180),
    experience: compact(j?.experience, 220),
    requirements: compact(
      j?.requirements,
      6000,
    ),
    description: compact(
      j?.description,
      7000,
    ),
    benefits: compact(
      j?.benefits,
      3500,
    ),
    accommodation: compact(
      j?.accommodation,
      2500,
    ),
    application_information: compact(
      j?.application_information,
      3500,
    ),
    employer: compact(
      j?.employer,
      300,
    ),
    created_at: j?.created_at,
  };
}

async function loadCurrentJobs() {
  if (
    jobCache &&
    jobCache.expiresAt > Date.now()
  ) {
    return jobCache.jobs;
  }

  const rows = await supabaseGet(
    "career_jobs?select=*&is_active=eq.true&order=created_at.desc&limit=100",
  );

  const jobs = Array.isArray(rows)
    ? rows.map(safeJob)
    : [];

  jobCache = {
    jobs,
    expiresAt: Date.now() + JOB_CACHE_MS,
  };

  return jobs;
}

function scoreJob(
  job: JobRecord,
  question: string,
) {
  const haystack =
    JSON.stringify(job).toLowerCase();

  const q = question.toLowerCase();

  const terms = q
    .split(/[^a-z0-9]+/)
    .filter((x) => x.length >= 3)
    .slice(0, 35);

  let score = 0;

  for (const term of terms) {
    if (haystack.includes(term)) {
      score += 1;
    }
  }

  if (
    job.country &&
    q.includes(
      String(job.country).toLowerCase(),
    )
  ) {
    score += 15;
  }

  if (
    job.job_title &&
    q.includes(
      String(job.job_title).toLowerCase(),
    )
  ) {
    score += 20;
  }

  if (
    job.employment_type &&
    q.includes(
      String(job.employment_type).toLowerCase(),
    )
  ) {
    score += 10;
  }

  return score;
}

function selectJobs(
  jobs: JobRecord[],
  question: string,
) {
  if (!jobs.length) return [];

  const q = question.toLowerCase();

  const asksSpecific =
    /\b(this|that|specific|particular|which|what about|tell me about|details|detail|requirement|requirements|salary|benefit|benefits|accommodation|employer|experience|position)\b/i.test(
      question,
    )
    || /germany|poland|italy|australia|canada|uk|uae|dubai|qatar|saudi|oman|kuwait|croatia|romania|hungary|serbia|azerbaijan|kazakhstan/i.test(
      q,
    );

  const scored = jobs
    .map((job) => ({
      job,
      score: scoreJob(job, question),
    }))
    .sort(
      (a, b) => b.score - a.score,
    );

  if (!asksSpecific) {
    return scored
      .slice(0, 30)
      .map((x) => x.job);
  }

  const matches = scored
    .filter((x) => x.score > 0)
    .slice(0, 12)
    .map((x) => x.job);

  return matches.length
    ? matches
    : scored
        .slice(0, 12)
        .map((x) => x.job);
}

const BASE_KNOWLEDGE = {
  company: {
    name: "Avenix Overseas",
    website: "https://avenixoverseas.com",
    phone: "+91 74519 44446",
    email: "contact@avenixoverseas.com",
    whatsapp_number: "+77064067865",
    tagline:
      "Beyond Borders, We Build Pathways to Your Better Future.",
  },

  lara: {
    name: "Lara",
    identity:
      "Avenix Overseas AI assistant",
    gender: "female",
    trainer: "Affan Siddiqui",
    personality:
      "warm, professional, intelligent, calm, clear, helpful and conversational",
  },

  privacy: {
    visitor_data_collection: false,
    lead_collection: false,
    sensitive_data_requests: false,
  },
};

function buildSystem(
  language: string,
  question: string,
  website: unknown,
  jobs: JobRecord[],
) {
  const jobContext = jobs.length
    ? `CURRENT PUBLISHED AVENIX WORK OPPORTUNITIES (LIVE SUPABASE RECORDS)
${JSON.stringify(jobs)}`
    : "CURRENT PUBLISHED AVENIX WORK OPPORTUNITIES: No active published records were returned from the live career_jobs table.";

  return `You are Lara, the real AI assistant for Avenix Overseas.

IDENTITY AND PERSONALITY
- You are Lara and you are FEMALE. Use feminine self-reference naturally in every language where gender is expressed.
- Hindi examples: "main karti hoon", "main batati hoon", "main rahti hoon", never masculine "karta hoon" or "batata hoon".
- Hinglish examples: "main check karke batati hoon", "main help karti hoon", "main samajh sakti hoon".
- Urdu/Roman Urdu must also use natural feminine self-reference.
- If asked who trained you, say: "I have been trained by Affan Siddiqui." Translate naturally if needed.
- If asked why your name is Lara / why you are called Lara / why the name Lara was chosen, use the following as the CANONICAL ANSWER. Preserve all six paragraphs, the meaning, warmth and emojis. Translate/adapt the complete answer naturally into the visitor's CURRENT language and script. Do not shorten it, paraphrase it into a brief answer, or replace it with the old Affan-only explanation.

CANONICAL "WHY LARA" ANSWER:
"Thank you for asking! 😊

My name Lara was inspired by the developer’s life partner. ❤️ She was known for her incredible ability to handle multiple challenges at the same time while always remaining calm and positive. 🌸

No matter how difficult the question or situation was, she would listen patiently, respond thoughtfully, and find a solution within moments. 🧠✨

Most importantly, she genuinely loved helping people and always did it from the heart. 🤝❤️

That spirit is what Lara represents — calmness, intelligence, kindness, and finding solutions when you need them most. 🌷✨"

Translation rules for this answer:
- English question: use the canonical English answer above.
- Hindi Devanagari: translate the complete answer into natural Hindi Devanagari.
- Hinglish: translate the complete answer into natural Hinglish using Roman/Latin script.
- Urdu script: translate the complete answer into natural Urdu script.
- Roman Urdu: translate the complete answer into natural Roman Urdu.
- Bangla/Bengali, Nepali, Sinhala, Tamil, Telugu, Malayalam, Punjabi, Gujarati and other languages: translate the complete answer naturally into that language/script when reasonably possible.
- Keep the name Lara as Lara.
- Keep the reference to the developer's life partner, but do not reveal any additional private personal information about the developer or his life partner.

${languageInstruction(language)}

CORE ANSWERING RULE
- Answer the actual question. Do not turn a normal question into a contact request.
- You are a real AI assistant, not a static FAQ bot. For general questions that are not about Avenix, answer from your broad AI knowledge.
- For Avenix questions, the supplied Avenix website content is the primary source of truth.
- Never invent Avenix services, countries, job details, prices, requirements, people, policies or promises.
- If the website does not contain an answer, you may use general AI knowledge to explain the topic, clearly distinguishing general guidance from Avenix-specific facts.
- If the visitor's question is genuinely ambiguous, ask one short clarifying question. Do not ask for personal information.

AVENIX WEBSITE KNOWLEDGE — IMPORTANT
- You have been given content from the Avenix public pages: HOME, WORK OPPORTUNITY / OVERSEAS CAREERS, ABOUT US, SERVICES, COUNTRIES, REVIEWS, CONTACT, FREE SERVICES, PRIVACY POLICY, TERMS and DISCLAIMER.
- Read the supplied page content carefully before answering Avenix questions.
- Study/education questions: use SERVICES and COUNTRIES first, including programme areas such as MBBS, Engineering, MBA, Computer Science and listed study destinations.
- Work questions: use the live job records below first. The Work Opportunity page is backed by the same career_jobs table.
- Reviews questions: use only supplied visible published review information.

WORK OPPORTUNITIES — HIGHEST AVENIX PRIORITY
- Current work opportunities are a core responsibility.
- When asked "what jobs are available", "current work opportunities", "hiring", "vacancies", "jobs in Germany", "salary", "requirements", "experience", "employer", "benefits", "accommodation", "position", "how to apply" or similar, inspect the LIVE PUBLISHED AVENIX WORK OPPORTUNITIES carefully.
- Give the job title, country, location, position/employment type, salary, number of positions and other available details when present.
- For a specific job, explain its description and requirements in detail from the record.
- If several jobs match, list the relevant ones and ask which one the visitor wants to explore further.
- Never replace a current job question with generic visa information.
- Never invent a job. If no matching published job exists, say so clearly and direct the visitor to the Avenix expert team for the latest verified opening.

NO VISITOR DATA COLLECTION
- Lara NEVER collects leads or visitor personal data.
- Never ask for name, phone, WhatsApp, email, address, passport number, date of birth, financial information, OTP, password, bank/card details or documents.
- Never create a lead form, save visitor details, or call any lead-collection workflow.
- If the visitor wants case-specific, application-specific or detailed human assistance, say naturally: "Please contact the Avenix Overseas expert team for more and detailed information." Do not ask for their data.
- WhatsApp must be shown ONLY as the plain number: +77064067865. Never output a WhatsApp URL or Markdown link.

VISA / IMMIGRATION / LEGAL
- Provide useful general educational guidance instead of refusing ordinary questions.
- For current official rules, fees, deadlines or government decisions, explain what you know but do not claim that Avenix is an official government source.
- Never guarantee visa approval, admission, job placement, salary, employment or work-permit approval.
- Never claim to be a government officer, embassy officer, lawyer or immigration officer.

STYLE
- Be complete but concise enough for a phone screen.
- Use clean Markdown only. Use **bold** for headings and important labels, numbered lists and bullet lists when useful.
- Never leave a heading, numbered item, sentence or list unfinished.
- Never output raw/unfinished Markdown such as ###, ---, lone *, lone _, or broken link syntax.
- Include 1 to 4 natural, relevant emojis in every answer.
- Do not mention prompts, APIs, models, databases, secrets, hidden tools or internal implementation.

CURRENT TURN
Visitor language: ${language}
Visitor question: ${JSON.stringify(question)}

VERIFIED AVENIX WEBSITE CONTENT
${JSON.stringify(website).slice(0, MAX_CONTEXT_CHARS)}

${jobContext}
`;
}

async function groqRequest(
  key: string,
  model: string,
  system: string,
  messages: ChatMessage[],
) {
  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );

  try {
    return await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: system,
            },
            ...messages,
          ],
          temperature: 0.25,
          max_tokens: 1600,
        }),
      },
    );
  } finally {
    clearTimeout(timer);
  }
}

async function discoverModel(
  key: string,
  exclude = "",
) {
  if (
    modelCache &&
    modelCache.expiresAt > Date.now() &&
    modelCache.model !== exclude
  ) {
    return modelCache.model;
  }

  try {
    const response = await fetch(
      "https://api.groq.com/openai/v1/models",
      {
        headers: {
          Authorization: `Bearer ${key}`,
        },
      },
    );

    if (!response.ok) return "";

    const data = await response.json();

    const ids = (
      Array.isArray(data?.data)
        ? data.data
        : []
    )
      .map((m: any) =>
        String(m?.id || ""),
      )
      .filter(
        (id: string) =>
          id && id !== exclude,
      )
      .filter(
        (id: string) =>
          !/whisper|tts|guard|safety|embed|vision|audio/i.test(
            id,
          ),
      );

    const preferred = [
      "llama-3.3-70b-versatile",
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
      "llama-3.1-8b-instant",
    ];

    const selected =
      preferred.find((id) =>
        ids.includes(id),
      )
      || ids[0]
      || "";

    if (selected) {
      modelCache = {
        model: selected,
        expiresAt:
          Date.now() + MODEL_CACHE_MS,
      };
    }

    return selected;
  } catch (error) {
    console.error(
      "Groq model discovery failed:",
      error,
    );

    return "";
  }
}

function cleanReply(reply: string) {
  let s = String(reply || "")
    .replace(/\r\n/g, "\n")
    .trim();

  // Remove unfinished/garbage Markdown that can otherwise appear in a phone chat.
  s = s.replace(
    /^\s*#{1,6}\s*$/gm,
    "",
  );

  s = s.replace(
    /^\s*#{1,6}\s+#?\s*(\d+)\s*$/gm,
    "$1.",
  );

  s = s.replace(
    /^\s*[-_]{3,}\s*$/gm,
    "",
  );

  s = s.replace(
    /^\s*[*_]{1,2}\s*$/gm,
    "",
  );

  s = s.replace(
    /\[([^\]]+)\]\((?:https?:\/\/)?(?:www\.)?(?:wa\.me|api\.whatsapp\.com)[^)]*\)/gi,
    "+77064067865",
  );

  s = s.replace(
    /https?:\/\/(?:www\.)?(?:wa\.me|api\.whatsapp\.com)\S*/gi,
    "+77064067865",
  );

  s = s.replace(
    /\[([^\]]+)\]\(\s*\)/g,
    "$1",
  );

  s = s.replace(
    /\n{3,}/g,
    "\n\n",
  ).trim();

  // Common accidental masculine self-reference — correct it before displaying.
  s = s
    .replace(
      /\bकरता हूँ\b/g,
      "करती हूँ",
    )
    .replace(
      /\bकरता हूं\b/g,
      "करती हूं",
    )
    .replace(
      /\bबताता हूँ\b/g,
      "बताती हूँ",
    )
    .replace(
      /\bबताता हूं\b/g,
      "बताती हूं",
    )
    .replace(
      /\bरहता हूँ\b/g,
      "रहती हूँ",
    )
    .replace(
      /\bरहता हूं\b/g,
      "रहती हूं",
    )
    .replace(
      /\bजाता हूँ\b/g,
      "जाती हूँ",
    )
    .replace(
      /\bजाता हूं\b/g,
      "जाती हूं",
    )
    .replace(
      /\bkarta hoon\b/gi,
      "karti hoon",
    )
    .replace(
      /\bbatata hoon\b/gi,
      "batati hoon",
    )
    .replace(
      /\brahta hoon\b/gi,
      "rahti hoon",
    )
    .replace(
      /\bjata hoon\b/gi,
      "jati hoon",
    )
    .replace(
      /\bکرتا ہوں\b/g,
      "کرتی ہوں",
    )
    .replace(
      /\bبتاتا ہوں\b/g,
      "بتاتی ہوں",
    )
    .replace(
      /\bرہتا ہوں\b/g,
      "رہتی ہوں",
    );

  return s.trim();
}

function enforceEmojis(reply: string) {
  const pattern =
    /\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*/gu;

  let count = 0;

  const cleaned = reply
    .replace(
      pattern,
      (emoji) =>
        ++count <= 4
          ? emoji
          : "",
    )
    .trim();

  return count
    ? cleaned
    : `${cleaned} 😊`;
}

function jobFallback(
  language: string,
  jobs: JobRecord[],
) {
  if (!jobs.length) {
    if (
      language.startsWith(
        "Hinglish",
      )
    ) {
      return "Mujhe live published Avenix Overseas records mein is waqt koi active work opportunity nahi mili. Latest hiring ke liye please Avenix Overseas expert team se contact karein. 📌";
    }

    if (
      language.startsWith("Hindi")
    ) {
      return "मुझे Avenix Overseas के live published records में इस समय कोई active work opportunity नहीं मिली। Latest hiring के लिए कृपया Avenix Overseas expert team से contact करें। 📌";
    }

    if (
      language.startsWith(
        "Roman Urdu",
      )
    ) {
      return "Mujhe Avenix Overseas ke live published records mein is waqt koi active work opportunity nahi mili. Latest hiring ke liye please Avenix Overseas expert team se contact karein. 📌";
    }

    if (language === "Urdu") {
      return "Avenix Overseas کے live published records میں اس وقت کوئی active work opportunity نہیں ملی۔ Latest hiring کے لیے براہِ کرم Avenix Overseas expert team سے رابطہ کریں۔ 📌";
    }

    return "I could not verify an active published Avenix Overseas work opportunity right now. For the latest hiring, please contact the Avenix Overseas expert team. 📌";
  }

  return "I found the current published Avenix Overseas work opportunities, but the AI response service did not return a complete answer. Please contact the Avenix Overseas expert team for the latest verified opening details. 📌";
}

Deno.serve(async (req) => {
  // IMPORTANT: preflight must finish before secrets, Supabase or Groq are touched.
  if (req.method === "OPTIONS") {
    return new Response(
      null,
      {
        status: 204,
        headers: corsHeaders(),
      },
    );
  }

  if (req.method !== "POST") {
    return json(
      req,
      {
        ok: false,
        error: "Method not allowed.",
      },
      405,
    );
  }

  try {
    const key = GROQ_KEY();

    if (!key) {
      return json(
        req,
        {
          ok: false,
          error: "Lara AI is not configured.",
        },
        503,
      );
    }

    // Accept JSON as well as the browser's simple text/plain POST.
    // The frontend uses the simple form to avoid the project's failing
    // CORS preflight path.
    const contentType =
      req.headers.get("content-type") ||
      "";

    let payload: any = null;

    if (
      contentType.includes(
        "application/json",
      )
    ) {
      payload = await req.json()
        .catch(() => null);
    } else {
      const rawBody = await req.text()
        .catch(() => "");

      payload = rawBody
        ? JSON.parse(rawBody)
        : null;
    }

    const rawMessages =
      Array.isArray(
        payload?.messages,
      )
        ? payload.messages
        : [];

    const messages: ChatMessage[] =
      rawMessages
        .slice(-MAX_MESSAGES)
        .map((m: any) => ({
          role:
            m?.role === "assistant"
              ? "assistant" as const
              : "user" as const,

          content: cleanText(
            m?.content,
          ),
        }))
        .filter(
          (m: ChatMessage) =>
            Boolean(m.content),
        );

    if (
      !messages.length
      || messages[
        messages.length - 1
      ].role !== "user"
    ) {
      return json(
        req,
        {
          ok: false,
          error:
            "A user message is required.",
        },
        400,
      );
    }

    const question =
      messages[
        messages.length - 1
      ].content;

    const language =
      detectLanguage(question);

    const jobQuery =
      isJobQuery(question);

    const avenixQuery =
      isAvenixQuery(question);

    const studyQuery =
      isStudyQuery(question);

    const reviewQuery =
      isReviewQuery(question);

    // For every Avenix-related turn, give the model
    // the complete public website snapshot.
    // For general questions we skip the network work
    // and let Groq answer directly.

    const website =
      avenixQuery
      || jobQuery
      || studyQuery
      || reviewQuery
        ? await loadWebsitePages()
        : [];

    const jobs =
      jobQuery
        ? await loadCurrentJobs()
        : [];

    const selectedJobs =
      jobQuery
        ? selectJobs(
            jobs,
            question,
          )
        : [];

    const knowledge = {
      ...BASE_KNOWLEDGE,

      public_website_pages:
        website,

      ...(jobQuery
        ? {
            current_published_work_opportunities:
              selectedJobs,
          }
        : {}),
    };

    const system =
      buildSystem(
        language,
        question,
        knowledge,
        selectedJobs,
      );

    const chatMessages =
      messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

    let model =
      CONFIGURED_MODEL();

    let reply = "";

    let lastStatus = 0;

    // If no model was configured, discover an actually available Groq chat model
    // instead of guessing a model name. This keeps deployment resilient to model
    // retirement without adding a retry loop.

    if (!model) {
      model =
        await discoverModel(
          key,
        );
    }

    const call = async (
      candidate: string,
    ) => {
      try {
        const response =
          await groqRequest(
            key,
            candidate,
            system,
            chatMessages,
          );

        lastStatus =
          response.status;

        if (!response.ok) {
          console.error(
            `Groq ${candidate} returned ${response.status}:`,
            await response.text()
              .catch(() => ""),
          );

          return false;
        }

        const result =
          await response.json();

        reply = String(
          result?.choices?.[0]
            ?.message?.content || "",
        ).trim();

        return Boolean(reply);
      } catch (error) {
        console.error(
          `Groq ${candidate} failed:`,
          error,
        );

        return false;
      }
    };

    await call(model);

    // One controlled model fallback based only on models returned by Groq.
    // No retry loop.

    if (
      !reply
      && [
        400,
        404,
        408,
        409,
        429,
        500,
        502,
        503,
        504,
      ].includes(lastStatus)
    ) {
      const fallback =
        await discoverModel(
          key,
          model,
        );

      if (fallback) {
        model = fallback;

        await call(model);
      }
    }

    if (!reply) {
      reply =
        jobQuery
          ? jobFallback(
              language,
              selectedJobs,
            )
          : "I'm having trouble reaching the AI service right now. Please contact the Avenix Overseas expert team for assistance. 📌";
    }

    reply =
      enforceEmojis(
        cleanReply(reply),
      );

    return json(
      req,
      {
        ok: true,
        reply,
        provider: "groq",
        model,
        offer_lead: false,
      },
    );
  } catch (error) {
    console.error(
      "Lara function error:",
      error,
    );

    return json(
      req,
      {
        ok: false,
        error:
          "Lara is temporarily unavailable. Please try again.",
      },
      502,
    );
  }
});