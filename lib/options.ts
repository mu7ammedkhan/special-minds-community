/**
 * Every list the community offers. Plain English labels (Arabic comes from
 * the dictionary in lib/i18n/ar.ts); the keys are what the database stores.
 * Browser-safe: no server imports.
 */

export type Opt = { value: string; label: string; hint?: string };
export type Tone = "neutral" | "brand" | "info" | "good" | "warn" | "bad";

// --------------------------------------------------------------- countries ----

export type Country = { code: string; name: string; tz: string; dial: string; cities: string[] };
export const COUNTRIES: Country[] = [
  { code: "AE", name: "United Arab Emirates", tz: "Asia/Dubai", dial: "971",
    cities: ["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "Al Ain", "Ras Al Khaimah", "Fujairah", "Umm Al Quwain"] },
  { code: "IN", name: "India", tz: "Asia/Kolkata", dial: "91",
    cities: ["Mumbai", "Delhi", "Bengaluru", "Pune", "Hyderabad", "Chennai", "Kolkata", "Gurugram", "Noida", "Ahmedabad", "Kochi", "Jaipur"] },
  { code: "KW", name: "Kuwait", tz: "Asia/Kuwait", dial: "965", cities: ["Kuwait City", "Hawalli", "Salmiya", "Farwaniya", "Jahra", "Ahmadi"] },
  { code: "QA", name: "Qatar", tz: "Asia/Qatar", dial: "974", cities: ["Doha", "Al Rayyan", "Al Wakrah", "Lusail", "Al Khor"] },
  { code: "SA", name: "Saudi Arabia", tz: "Asia/Riyadh", dial: "966", cities: ["Riyadh", "Jeddah", "Dammam", "Khobar", "Mecca", "Medina"] },
];
export const COUNTRY = Object.fromEntries(COUNTRIES.map((c) => [c.code, c])) as Record<string, Country>;
export const countryName = (code: string | null | undefined) => (code ? COUNTRY[code]?.name ?? code : "");
export const tzFor = (code: string | null | undefined) => (code && COUNTRY[code]?.tz) || "Asia/Dubai";
export const ALL_CITIES = [...new Set(COUNTRIES.flatMap((c) => c.cities))];

// ------------------------------------------------------- specialist roles ----

/** The same keys as the Talent portal (lib/options.ts there), so imports and links line up. */
export const ROLES: Opt[] = [
  { value: "shadow_teacher", label: "Shadow teacher" },
  { value: "lsa", label: "Learning support assistant (LSA)" },
  { value: "special_educator", label: "Special educator" },
  { value: "remedial_teacher", label: "Remedial teacher" },
  { value: "early_intervention", label: "Early intervention specialist" },
  { value: "inclusion_lead", label: "SENCO / inclusion coordinator" },
  { value: "speech_therapist", label: "Speech and language therapist" },
  { value: "occupational_therapist", label: "Occupational therapist" },
  { value: "physiotherapist", label: "Physiotherapist" },
  { value: "behaviour_therapist", label: "ABA / behaviour therapist (RBT)" },
  { value: "behaviour_analyst", label: "Behaviour analyst (BCBA)" },
  { value: "psychologist", label: "Psychologist" },
  { value: "counsellor", label: "Counsellor" },
  { value: "play_therapist", label: "Play / art / music therapist" },
  { value: "caregiver", label: "Special needs caregiver" },
];
export const ROLE_LABEL: Record<string, string> = Object.fromEntries(ROLES.map((r) => [r.value, r.label]));
export const roleLabel = (v: string) => ROLE_LABEL[v] ?? v;

/** Words in a Talent portal export ("Shadow teacher", "BCBA") → our role keys. */
export const ROLE_WORDS: [RegExp, string][] = [
  [/shadow/i, "shadow_teacher"], [/\blsa\b|learning support assistant|teaching assistant/i, "lsa"],
  [/special educator|special education teacher|sen teacher/i, "special_educator"], [/remedial/i, "remedial_teacher"],
  [/early intervention/i, "early_intervention"], [/senco|inclusion/i, "inclusion_lead"],
  [/speech|slp|slt/i, "speech_therapist"], [/occupational|\bot\b/i, "occupational_therapist"], [/physio/i, "physiotherapist"],
  [/bcba|bcaba|behaviou?r analyst/i, "behaviour_analyst"], [/rbt|aba|behaviou?r therapist|behaviou?r technician/i, "behaviour_therapist"],
  [/psycholog/i, "psychologist"], [/counsel/i, "counsellor"], [/play|art therap|music therap/i, "play_therapist"], [/care\s?giver|nanny|carer/i, "caregiver"],
];
export function rolesFromText(text: string): string[] {
  const found = new Set<string>();
  for (const part of text.split(/[;,/|]/)) {
    const v = ROLES.find((r) => r.value === part.trim() || r.label.toLowerCase() === part.trim().toLowerCase())?.value
      ?? ROLE_WORDS.find(([re]) => re.test(part))?.[1];
    if (v) found.add(v);
  }
  return [...found];
}

export const LANGUAGES = ["English", "Arabic", "Hindi", "Urdu", "Malayalam", "Tamil", "Tagalog", "French", "Russian", "Persian", "Bengali", "Marathi", "Telugu", "Kannada", "Spanish", "Portuguese", "Sign language"];

export const SKILLS = [
  "ABA", "PECS", "Makaton", "AAC devices", "Social stories", "TEACCH", "DIR/Floortime", "VB-MAPP", "ABLLS-R", "Sensory integration",
  "Toilet training", "Feeding therapy", "PROMPT", "Hanen", "Zones of Regulation", "Behaviour support plans", "IEP writing", "Visual schedules",
  "Data collection", "Social skills groups", "Parent training", "First aid", "Child protection", "Assessment and reports",
];

export const DIAGNOSES: Opt[] = [
  { value: "autism", label: "Autism" },
  { value: "adhd", label: "ADHD" },
  { value: "speech_delay", label: "Speech and language delay" },
  { value: "down_syndrome", label: "Down syndrome" },
  { value: "learning", label: "Learning difficulties (dyslexia and others)" },
  { value: "cerebral_palsy", label: "Cerebral palsy" },
  { value: "developmental_delay", label: "Global developmental delay" },
  { value: "sensory", label: "Sensory processing" },
];
export const DIAGNOSIS_LABEL: Record<string, string> = Object.fromEntries(DIAGNOSES.map((d) => [d.value, d.label]));

// -------------------------------------------------------- people and roles ----

export type Kind = "specialist" | "parent" | "team" | "guest";
export type StaffRole = "owner" | "admin" | "moderator";
export const KIND_LABEL: Record<Kind, string> = { specialist: "Specialist", parent: "Parent or carer", team: "Special Minds team", guest: "Guest" };
export const STAFF_LABEL: Record<StaffRole, string> = { owner: "Owner", admin: "Admin", moderator: "Moderator" };
export const KIND_OPTIONS: Opt[] = [
  { value: "specialist", label: "Specialist", hint: "Therapist, shadow teacher, special educator, psychologist…" },
  { value: "parent", label: "Parent or carer", hint: "A family member of a child with additional needs." },
  { value: "team", label: "Special Minds team", hint: "Works at Special Minds." },
  { value: "guest", label: "Guest", hint: "Can read and react, nothing more." },
];

// ---------------------------------------------------------------- channels ----

export type ChannelType = "chat" | "announcement" | "forum" | "opportunities" | "feed" | "events" | "library";
export const CHANNEL_TYPES: { value: ChannelType; label: string; hint: string }[] = [
  { value: "announcement", label: "Announcements", hint: "Only staff post. Members react, and comment if you allow it." },
  { value: "chat", label: "Chat", hint: "A running conversation with replies in threads." },
  { value: "forum", label: "Forum", hint: "Titled topics with replies. Best for questions people search later." },
  { value: "opportunities", label: "Opportunities", hint: "Job posts with the I'm interested button and alerts to matching specialists." },
  { value: "feed", label: "Feed", hint: "Posts with photos, likes and comments, like a Facebook group." },
  { value: "events", label: "Events", hint: "Workshops, meetups and webinars with RSVP and reminders." },
  { value: "library", label: "Library", hint: "Guides, templates, files and links." },
];
export const CHANNEL_TYPE_LABEL = Object.fromEntries(CHANNEL_TYPES.map((c) => [c.value, c.label])) as Record<ChannelType, string>;

export type PermKey = "view" | "post" | "reply" | "react" | "upload";
export type Perms = Record<PermKey, boolean>;
export type PermAudience = "specialist" | "parent" | "guest";
export const PERM_KEYS: { key: PermKey; label: string; hint: string }[] = [
  { key: "view", label: "See", hint: "Read the channel" },
  { key: "post", label: "Post", hint: "Start a message, topic or post" },
  { key: "reply", label: "Reply", hint: "Reply and comment" },
  { key: "react", label: "React", hint: "Emoji reactions, likes, votes" },
  { key: "upload", label: "Upload", hint: "Photos, files and voice notes" },
];
export const PERM_AUDIENCES: { key: PermAudience; label: string }[] = [
  { key: "specialist", label: "Specialists" }, { key: "parent", label: "Parents" }, { key: "guest", label: "Guests" },
];

const all: Perms = { view: true, post: true, reply: true, react: true, upload: true };
const readReact: Perms = { view: true, post: false, reply: false, react: true, upload: false };
/** What members may do in a new channel of each kind (staff can always do everything). */
export function defaultPerms(type: ChannelType): Record<PermAudience, Perms> {
  const member: Perms =
    type === "announcement" ? { view: true, post: false, reply: true, react: true, upload: false }
    : type === "opportunities" ? { view: true, post: false, reply: false, react: true, upload: false }
    : type === "events" ? { view: true, post: false, reply: true, react: true, upload: false }
    : type === "library" ? { view: true, post: false, reply: false, react: true, upload: false }
    : all;
  return { specialist: { ...member }, parent: { ...member }, guest: { ...readReact } };
}

/** Where a new channel's members start: everything, or only mentions and replies. */
export const defaultNotify = (type: ChannelType): "all" | "mentions" =>
  type === "announcement" || type === "opportunities" || type === "events" ? "all" : "mentions";

export const REACTIONS = ["👍", "❤️", "🙏", "👏", "😂", "😮", "🎉", "✅"];

export const REPORT_REASONS: Opt[] = [
  { value: "contact", label: "Sharing contact details or asking to meet privately" },
  { value: "child", label: "Shows or names a child" },
  { value: "harsh", label: "Unkind, abusive or bullying" },
  { value: "advice", label: "Unsafe medical or therapy advice" },
  { value: "spam", label: "Spam or selling" },
  { value: "other", label: "Something else" },
];
export const REPORT_LABEL = Object.fromEntries(REPORT_REASONS.map((r) => [r.value, r.label]));

export const HOLD_REASON: Record<string, string> = {
  contact_details: "Contact details",
  words: "A word on the review list",
  approval: "Waiting for approval",
  new_member: "New member's post",
  dm_request: "Message request",
};

// ------------------------------------------------------------ help requests ----

/** The same service keys as the CRM's website contract. */
export const HELP_SERVICES: Opt[] = [
  { value: "shadow_teacher", label: "Shadow teacher / LSA" },
  { value: "aba_therapy", label: "ABA therapy" },
  { value: "speech_therapy", label: "Speech therapy" },
  { value: "occupational_therapy", label: "Occupational therapy" },
  { value: "special_educator", label: "Special educator at home" },
  { value: "sen_governess", label: "SEN governess" },
  { value: "not_sure", label: "Not sure yet" },
];
export const HELP_SERVICE_LABEL = Object.fromEntries(HELP_SERVICES.map((s) => [s.value, s.label]));

export const NOTIFY_LEVELS = [
  { value: "all", label: "Everything" },
  { value: "mentions", label: "Mentions and replies" },
  { value: "off", label: "Nothing" },
] as const;
