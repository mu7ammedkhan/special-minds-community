// Made-up demo data for the local database and the preview. Every person,
// message and number here is invented. Emails end in @demo.local and phone
// numbers are +9715000001xx, so nothing can ever be sent to a real person.

import { readFileSync } from "node:fs";
import path from "node:path";

export async function seed(db, root) {
  const q = async (sql, p = []) => (await db.query(sql, p)).rows;
  const one = async (sql, p = []) => (await q(sql, p))[0];
  const ago = (min) => new Date(Date.now() - min * 60_000).toISOString();
  const ahead = (min) => new Date(Date.now() + min * 60_000).toISOString();
  const H = 60, D = 24 * 60;

  // ------------------------------------------------------------ settings ----
  await q(`insert into settings (key, value) values ('name', '"Special Minds Community"') on conflict do nothing`);

  // -------------------------------------------------------------- spaces ----
  const S = {};
  const space = async (key, o) => {
    const r = await one(`insert into spaces (slug, name, name_ar, audience, country, tz, description, description_ar, join_policy, questions, rules, rules_ar, filter_contacts, position)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::text::jsonb, $11, $12, $13, $14) returning id`,
      [key, o.name, o.name_ar, o.audience, o.country, o.tz, o.description, o.description_ar, o.join_policy, JSON.stringify(o.questions ?? []), o.rules, o.rules_ar, o.filter_contacts ?? false, o.position]);
    S[key] = r.id;
  };
  const specialistRules = `1. Be kind and professional. We are colleagues.
2. Never write a child's full name, school or family details. Use initials and ages only.
3. No photos of children, ever.
4. Opportunities are posted by Special Minds staff. Say "I'm interested" there, not in chat.
5. Agreements with families go through Special Minds.`;
  const specialistRulesAr = `١. كن لطيفاً ومهنياً، فنحن زملاء.
٢. لا تكتب اسم الطفل الكامل أو مدرسته أو تفاصيل عائلته. استخدم الأحرف الأولى والعمر فقط.
٣. لا صور للأطفال أبداً.
٤. فرص العمل ينشرها فريق سبيشال مايندز. اضغط "أنا مهتم" هناك وليس في الدردشة.
٥. أي اتفاق مع العائلات يتم عبر سبيشال مايندز.`;
  const familyRules = `1. Be kind. Every family's journey is different.
2. Don't share your child's photo, full name or school in open channels.
3. Answers from other parents and specialists are not medical advice.
4. No selling or advertising.
5. Need a specialist? Use "Ask Special Minds for help" instead of sharing phone numbers.`;
  const familyRulesAr = `١. كن لطيفاً، فلكل عائلة رحلتها الخاصة.
٢. لا تشارك صورة طفلك أو اسمه الكامل أو مدرسته في القنوات المفتوحة.
٣. إجابات الأهالي والمختصين ليست نصيحة طبية.
٤. ممنوع البيع والإعلانات.
٥. تحتاج مختصاً؟ استخدم زر "اطلب المساعدة من سبيشال مايندز" بدلاً من مشاركة أرقام الهواتف.`;
  await space("specialists-uae", { name: "Specialists · UAE", name_ar: "المختصون · الإمارات", audience: "specialists", country: "AE", tz: "Asia/Dubai", join_policy: "invite", position: 1,
    description: "Shadow teachers, therapists, BCBAs and psychologists working with Special Minds in the UAE.", description_ar: "معلمو الظل والمعالجون والمحللون السلوكيون والأخصائيون النفسيون العاملون مع سبيشال مايندز في الإمارات.",
    rules: specialistRules, rules_ar: specialistRulesAr });
  await space("families-uae", { name: "Families · UAE", name_ar: "العائلات · الإمارات", audience: "families", country: "AE", tz: "Asia/Dubai", join_policy: "request", position: 2, filter_contacts: true,
    description: "Parents and carers of children with additional needs, supporting each other.", description_ar: "أولياء أمور الأطفال من ذوي الاحتياجات الإضافية، يدعم بعضهم بعضاً.",
    questions: [{ id: "q1", label: "How old is your child?", label_ar: "كم عمر طفلك؟", required: true }, { id: "q2", label: "How did you hear about Special Minds?", label_ar: "كيف عرفت عن سبيشال مايندز؟", required: false }],
    rules: familyRules, rules_ar: familyRulesAr });
  await space("specialists-india", { name: "Specialists · India", name_ar: "المختصون · الهند", audience: "specialists", country: "IN", tz: "Asia/Kolkata", join_policy: "invite", position: 3,
    description: "Special Minds specialists in India.", description_ar: "مختصو سبيشال مايندز في الهند.", rules: specialistRules, rules_ar: specialistRulesAr });

  // ------------------------------------------------------------- members ----
  const M = {};
  let phoneN = 100;
  const member = async (key, o) => {
    phoneN++;
    const r = await one(`insert into members (email, phone, full_name, display_name, kind, staff_role, status, city, country, languages, roles, skills, gender, verified_title, verified_at,
        talent_ref, open_to_work, available_from, availability_note, locale, prefs, profile_done, rules_accepted_at, consent_at, joined_at, last_seen_at, created_at, bio)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::text[], $11::text[], $12::text[], $13, $14, case when $14::text is null then null else now() end,
        $15, $16, $17, $18, $19, $20::text::jsonb, true, now(), now(), $21::timestamptz, $22, coalesce($21::timestamptz, now()), $23) returning id`,
      [`${key}@demo.local`, `+971500000${phoneN}`, o.name, o.display ?? null, o.kind, o.staff ?? null, o.status ?? "active", o.city, o.country ?? "AE", o.languages ?? ["English"],
        o.roles ?? [], o.skills ?? [], o.gender ?? null, o.verified ?? null, o.ref ?? null, o.open ?? false, o.from ?? null, o.note ?? null, o.locale ?? "en", JSON.stringify(o.prefs ?? {}),
        o.status === "pending" ? null : ago(o.joined ?? 40 * D), ago(o.seen ?? 30), o.bio ?? null]);
    M[key] = r.id;
  };
  await member("owner", { name: "Layla Haddad", kind: "team", staff: "owner", city: "Dubai", languages: ["English", "Arabic"], verified: "Special Minds team", seen: 5, joined: 60 * D });
  await member("admin", { name: "Omar Siddiqui", kind: "team", staff: "admin", city: "Dubai", languages: ["English", "Arabic", "Urdu"], verified: "Special Minds team", seen: 12, joined: 58 * D });
  await member("moderator", { name: "Priya Nair", kind: "team", staff: "moderator", city: "Dubai", languages: ["English", "Hindi", "Malayalam"], seen: 20, joined: 55 * D });
  await member("mariam", { name: "Mariam Al Suwaidi", kind: "team", staff: "moderator", city: "Abu Dhabi", languages: ["Arabic", "English"], locale: "ar", seen: 90, joined: 50 * D });
  // specialists, UAE
  await member("aisha", { name: "Aisha Rahman", kind: "specialist", city: "Dubai", languages: ["English", "Arabic", "Urdu"], roles: ["shadow_teacher"], skills: ["ABA", "PECS", "Data collection"], gender: "female", ref: "1042", open: true, from: ahead(14 * D).slice(0, 10), note: "Mornings suit me best", prefs: { whatsapp: true }, seen: 45, joined: 30 * D, bio: "Shadow teacher for 6 years, mostly in mainstream schools." });
  await member("hana", { name: "Hana Yousef", kind: "specialist", city: "Dubai", languages: ["Arabic", "English"], roles: ["shadow_teacher", "lsa"], skills: ["Visual schedules", "Social stories"], gender: "female", ref: "1057", open: true, seen: 3 * H, joined: 28 * D });
  await member("joel", { name: "Joel Mathew", kind: "specialist", city: "Dubai", languages: ["English", "Malayalam"], roles: ["behaviour_therapist"], skills: ["ABA", "VB-MAPP"], gender: "male", ref: "1063", seen: 5 * H, joined: 27 * D });
  await member("fatima", { name: "Fatima Al Mansoori", kind: "specialist", city: "Dubai", languages: ["Arabic", "English"], roles: ["behaviour_analyst"], skills: ["ABA", "Behaviour support plans", "Parent training"], gender: "female", verified: "Verified BCBA", ref: "1008", seen: 2 * H, joined: 45 * D, bio: "BCBA. I supervise the ABA team and love a good data sheet." });
  await member("maria", { name: "Maria Santos", kind: "specialist", city: "Abu Dhabi", languages: ["English", "Tagalog"], roles: ["speech_therapist"], skills: ["PROMPT", "Hanen", "AAC devices"], gender: "female", verified: "Verified speech therapist", ref: "1021", seen: 6 * H, joined: 40 * D });
  await member("ravi", { name: "Ravi Kumar", kind: "specialist", city: "Sharjah", languages: ["English", "Hindi", "Tamil"], roles: ["occupational_therapist"], skills: ["Sensory integration", "Fine motor skills"], gender: "male", ref: "1077", seen: 2 * D, joined: 20 * D });
  await member("grace", { name: "Grace Okafor", kind: "specialist", city: "Dubai", languages: ["English"], roles: ["lsa"], gender: "female", ref: "1081", seen: 1 * D, joined: 18 * D });
  await member("sara", { name: "Sara Iqbal", kind: "specialist", city: "Abu Dhabi", languages: ["English", "Urdu", "Hindi"], roles: ["special_educator"], gender: "female", ref: "1090", open: true, seen: 9 * H, joined: 16 * D });
  await member("noor", { name: "Noor Khalil", kind: "specialist", city: "Sharjah", languages: ["Arabic"], roles: ["shadow_teacher"], gender: "female", locale: "ar", ref: "1095", seen: 4 * H, joined: 14 * D });
  await member("daniel", { name: "Daniel Pereira", kind: "specialist", city: "Dubai", languages: ["English", "Portuguese"], roles: ["psychologist"], skills: ["Assessment and reports"], gender: "male", verified: "Verified psychologist", ref: "1012", seen: 8 * H, joined: 35 * D });
  await member("meera", { name: "Meera Pillai", kind: "specialist", city: "Dubai", languages: ["English", "Hindi", "Malayalam"], roles: ["speech_therapist"], gender: "female", ref: "1101", open: true, prefs: { whatsapp: true }, seen: 50, joined: 10 * D });
  await member("youssef", { name: "Youssef Benali", kind: "specialist", city: "Dubai", languages: ["Arabic", "French", "English"], roles: ["shadow_teacher"], gender: "male", ref: "1110", seen: 7 * H, joined: 9 * D });
  // specialists, India
  await member("arjun", { name: "Arjun Mehta", kind: "specialist", city: "Mumbai", country: "IN", languages: ["English", "Hindi", "Marathi"], roles: ["special_educator"], gender: "male", ref: "2004", seen: 3 * H, joined: 12 * D });
  await member("kavya", { name: "Kavya Rao", kind: "specialist", city: "Mumbai", country: "IN", languages: ["English", "Kannada", "Hindi"], roles: ["speech_therapist"], gender: "female", ref: "2011", seen: 1 * D, joined: 11 * D });
  await member("rohan", { name: "Rohan Desai", kind: "specialist", city: "Mumbai", country: "IN", languages: ["English", "Hindi", "Gujarati"], roles: ["shadow_teacher"], gender: "male", ref: "2019", seen: 5 * H, joined: 8 * D });
  // families, UAE
  await member("amina", { name: "Amina Khan", display: "Amina", kind: "parent", city: "Dubai", languages: ["English", "Urdu"], seen: 25, joined: 25 * D, bio: "Mum of two. My son is 6 and autistic." });
  await member("rahul", { name: "Rahul Verma", display: "Rahul", kind: "parent", city: "Dubai", languages: ["English", "Hindi"], seen: 4 * H, joined: 22 * D });
  await member("sophie", { name: "Sophie Laurent", display: "Sophie", kind: "parent", city: "Abu Dhabi", languages: ["English", "French"], seen: 6 * H, joined: 20 * D });
  await member("khalid", { name: "Khalid Al Nuaimi", display: "Abu Saif", kind: "parent", city: "Abu Dhabi", languages: ["Arabic"], locale: "ar", seen: 2 * H, joined: 19 * D });
  await member("deepa", { name: "Deepa Menon", display: "Deepa", kind: "parent", city: "Sharjah", languages: ["English", "Malayalam"], seen: 1 * D, joined: 15 * D });
  await member("james", { name: "James Carter", display: "James", kind: "parent", city: "Dubai", languages: ["English"], seen: 3 * H, joined: 13 * D });
  await member("ummyusuf", { name: "Mariam Hassan", display: "Umm Yusuf", kind: "parent", city: "Dubai", languages: ["Arabic", "English"], locale: "ar", seen: 70, joined: 12 * D });
  await member("lina", { name: "Lina Farouk", display: "Lina", kind: "parent", city: "Dubai", languages: ["Arabic", "English"], seen: 40, joined: 2 * D });
  // waiting to join, and a guest
  await member("nadia", { name: "Nadia Aziz", display: "Nadia", kind: "parent", status: "pending", city: "Dubai", languages: ["English", "Arabic"], seen: 3 * H });
  await member("tom", { name: "Tom Becker", display: "Tom", kind: "parent", status: "pending", city: "Abu Dhabi", languages: ["English", "German"], seen: 20 * H });
  await member("guest", { name: "Visiting trainer", kind: "guest", city: "Dubai", languages: ["English"], seen: 2 * D, joined: 6 * D });

  const join = async (who, sp, daysAgo) => q(`insert into space_members (space_id, member_id, joined_at) values ($1, $2, $3) on conflict do nothing`, [S[sp], M[who], ago((daysAgo ?? 30) * D)]);
  for (const k of ["owner", "admin", "moderator", "aisha", "hana", "joel", "fatima", "maria", "ravi", "grace", "sara", "noor", "daniel", "meera", "youssef", "guest"]) await join(k, "specialists-uae", k === "guest" ? 6 : k === "youssef" ? 9 : 30);
  for (const k of ["owner", "admin", "moderator", "mariam", "amina", "rahul", "sophie", "khalid", "deepa", "james", "ummyusuf", "maria", "fatima", "noor", "meera"]) await join(k, "families-uae", 25);
  await join("lina", "families-uae", 2);
  for (const k of ["owner", "admin", "arjun", "kavya", "rohan"]) await join(k, "specialists-india", 12);

  // ------------------------------------------------------------ channels ----
  const C = {};
  const all = { view: true, post: true, reply: true, react: true, upload: true };
  const channel = async (key, sp, o) => {
    const r = await one(`insert into channels (space_id, slug, name, name_ar, topic, topic_ar, type, visibility, auto_join, tags, perms, posting_hours, slow_mode, approval, allow_anonymous, child_photos, case_talk, position)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::text::jsonb, $11::text::jsonb, $12::text::jsonb, $13, $14, $15, $16, $17, $18) returning id`,
      [S[sp], o.slug ?? key, o.name, o.name_ar ?? null, o.topic ?? null, o.topic_ar ?? null, o.type, o.visibility ?? "open", o.auto_join ?? true, JSON.stringify(o.tags ?? {}),
        JSON.stringify(o.perms ?? {}), o.hours ? JSON.stringify(o.hours) : null, o.slow ?? 0, o.approval ?? "none", o.anon ?? false, o.child_photos ?? false, o.case_talk ?? false, o.position]);
    C[key] = { id: r.id, sp, type: o.type, vis: o.visibility ?? "open", auto: o.auto_join ?? true };
  };
  let pos = 0;
  await channel("s-announce", "specialists-uae", { slug: "announcements", name: "Announcements", name_ar: "الإعلانات", type: "announcement", topic: "News from Special Minds. Only staff post here.", topic_ar: "أخبار سبيشال مايندز. ينشر هنا الفريق فقط.", position: ++pos });
  await channel("s-opp-dxb", "specialists-uae", { slug: "opportunities-dubai", name: "Opportunities · Dubai", name_ar: "فرص العمل · دبي", type: "opportunities", tags: { city: ["Dubai"] }, topic: "New cases in Dubai. Tap I'm interested on the ones that fit you.", topic_ar: "حالات جديدة في دبي. اضغط أنا مهتم على ما يناسبك.", position: ++pos });
  await channel("s-opp-auh", "specialists-uae", { slug: "opportunities-abu-dhabi", name: "Opportunities · Abu Dhabi", name_ar: "فرص العمل · أبوظبي", type: "opportunities", tags: { city: ["Abu Dhabi"] }, position: ++pos });
  await channel("s-general", "specialists-uae", { slug: "general", name: "General", name_ar: "عام", type: "chat", topic: "Say hello, share wins, ask colleagues.", topic_ar: "تعارفوا وشاركوا نجاحاتكم واسألوا زملاءكم.", position: ++pos });
  await channel("s-aba", "specialists-uae", { slug: "aba-and-behaviour", name: "ABA and behaviour", name_ar: "تحليل السلوك التطبيقي", type: "forum", tags: { skill: ["ABA"] }, topic: "Questions and ideas about behaviour support.", position: ++pos });
  await channel("s-case", "specialists-uae", { slug: "case-talk", name: "Case talk", name_ar: "نقاش الحالات", type: "forum", case_talk: true, topic: "Ask colleagues for ideas. Never name a child, school or family.", topic_ar: "اطلب أفكاراً من زملائك. لا تذكر اسم طفل أو مدرسة أو عائلة.", position: ++pos });
  await channel("s-shadow", "specialists-uae", { slug: "shadow-teachers", name: "Shadow teachers", name_ar: "معلمو الظل", type: "chat", visibility: "private", auto_join: false, topic: "For shadow teachers and LSAs.", position: ++pos });
  await channel("s-bcba", "specialists-uae", { slug: "bcba-supervision", name: "BCBA supervision", name_ar: "إشراف المحللين", type: "chat", visibility: "hidden", auto_join: false, topic: "Supervision notes and scheduling.", position: ++pos });
  await channel("s-events", "specialists-uae", { slug: "training-and-events", name: "Training and events", name_ar: "التدريب والفعاليات", type: "events", position: ++pos });
  await channel("s-res", "specialists-uae", { slug: "resources", name: "Resources", name_ar: "المصادر", type: "library", topic: "Data sheets, templates and guides.", position: ++pos });
  pos = 0;
  await channel("f-news", "families-uae", { slug: "welcome-and-news", name: "Welcome and news", name_ar: "أهلاً وأخبار", type: "announcement", topic: "News and events from Special Minds.", topic_ar: "أخبار وفعاليات سبيشال مايندز.", position: ++pos });
  await channel("f-feed", "families-uae", { slug: "community-feed", name: "Community feed", name_ar: "مساحة العائلات", type: "feed", approval: "new", topic: "Share wins, questions and ideas with other parents.", topic_ar: "شاركوا النجاحات والأسئلة والأفكار مع الأهالي.", position: ++pos });
  await channel("f-ask", "families-uae", { slug: "ask-a-specialist", name: "Ask a specialist", name_ar: "اسأل مختصاً", type: "forum", anon: true, topic: "Questions answered by verified Special Minds specialists. You can ask without your name.", topic_ar: "أسئلة يجيب عنها مختصو سبيشال مايندز. يمكنك السؤال دون ذكر اسمك.", position: ++pos });
  await channel("f-autism", "families-uae", { slug: "autism", name: "Autism", name_ar: "التوحد", type: "chat", tags: { diagnosis: ["autism"] }, hours: { from: "07:00", to: "23:00" }, topic: "Parents of autistic children.", position: ++pos });
  await channel("f-adhd", "families-uae", { slug: "adhd", name: "ADHD", name_ar: "فرط الحركة وتشتت الانتباه", type: "chat", tags: { diagnosis: ["adhd"] }, auto_join: false, position: ++pos });
  await channel("f-speech", "families-uae", { slug: "speech-delay", name: "Speech delay", name_ar: "تأخر النطق", type: "forum", tags: { diagnosis: ["speech_delay"] }, auto_join: false, position: ++pos });
  await channel("f-dubai", "families-uae", { slug: "dubai-parents", name: "Dubai parents", name_ar: "أولياء أمور دبي", type: "chat", tags: { city: ["Dubai"] }, slow: 30, auto_join: false, topic: "Meetups, places and tips in Dubai.", position: ++pos });
  await channel("f-auh", "families-uae", { slug: "abu-dhabi-parents", name: "Abu Dhabi parents", name_ar: "أولياء أمور أبوظبي", type: "chat", tags: { city: ["Abu Dhabi"] }, auto_join: false, position: ++pos });
  await channel("f-arabic", "families-uae", { slug: "arabic-parents", name: "Arabic-speaking parents", name_ar: "أولياء الأمور بالعربية", type: "chat", tags: { language: ["Arabic"] }, auto_join: false, topic: "A place to talk in Arabic.", topic_ar: "مساحة للحديث باللغة العربية.", position: ++pos });
  await channel("f-events", "families-uae", { slug: "events-and-workshops", name: "Events and workshops", name_ar: "الفعاليات وورش العمل", type: "events", position: ++pos });
  await channel("f-guides", "families-uae", { slug: "guides-library", name: "Guides library", name_ar: "مكتبة الأدلة", type: "library", topic: "Guides from Special Minds.", position: ++pos });
  pos = 0;
  await channel("i-announce", "specialists-india", { slug: "announcements", name: "Announcements", type: "announcement", position: ++pos });
  await channel("i-opp", "specialists-india", { slug: "opportunities-mumbai", name: "Opportunities · Mumbai", type: "opportunities", tags: { city: ["Mumbai"] }, position: ++pos });
  await channel("i-general", "specialists-india", { slug: "general", name: "General", type: "chat", position: ++pos });

  const notifyFor = (type) => (["announcement", "opportunities", "events"].includes(type) ? "all" : "mentions");
  const cm = async (ch, who, readAgoMin = 2 * D) => q(`insert into channel_members (channel_id, member_id, notify, last_read_at) values ($1, $2, $3, $4) on conflict do nothing`, [C[ch].id, M[who], notifyFor(C[ch].type), ago(readAgoMin)]);
  // Everyone in a space joins its open, auto-join channels.
  for (const [key, c] of Object.entries(C)) {
    if (!c.auto || c.vis !== "open") continue;
    const members = await q(`select member_id from space_members where space_id = $1`, [S[c.sp]]);
    for (const m of members) await q(`insert into channel_members (channel_id, member_id, notify, last_read_at) values ($1, $2, $3, now() - interval '2 days') on conflict do nothing`, [c.id, m.member_id, notifyFor(c.type)]);
    void key;
  }
  for (const k of ["aisha", "hana", "noor", "youssef", "grace", "owner", "admin", "moderator"]) await cm("s-shadow", k);
  for (const k of ["fatima", "joel", "owner", "admin"]) await cm("s-bcba", k);
  for (const k of ["rahul", "amina", "james", "lina", "ummyusuf", "moderator"]) await cm("f-dubai", k);
  for (const k of ["sophie", "khalid", "mariam"]) await cm("f-auh", k);
  for (const k of ["khalid", "ummyusuf", "lina", "noor", "mariam"]) await cm("f-arabic", k);
  for (const k of ["rahul", "james", "deepa", "moderator"]) await cm("f-adhd", k);
  for (const k of ["sophie", "deepa", "maria", "meera", "moderator"]) await cm("f-speech", k);

  // --------------------------------------------------------------- files ----
  const file = async (name, owner, kind, mime, w = null, h = null) => {
    const data = readFileSync(path.join(root, "scripts/seed-files", name));
    return (await one(`insert into files (owner_id, kind, name, mime, size, width, height, data) values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`, [M[owner], kind, name, mime, data.length, w, h, data])).id;
  };

  // --------------------------------------------------------------- posts ----
  const post = async (o) => {
    const at = ago(o.at ?? 60);
    const r = await one(`insert into posts (channel_id, dm_id, parent_id, author_id, kind, title, body, data, anonymous, status, hold_reason, flagged, publish_at, pinned_at, mentions, created_at, updated_at, last_reply_at)
      values ($1, $2, $3, $4, $5, $6, $7, $8::text::jsonb, $9, $10, $11, $12, $13, $14, $15::bigint[], $16, $16, null) returning id`,
      [o.ch ? C[o.ch].id : null, o.dm ?? null, o.parent ?? null, M[o.by], o.kind ?? "message", o.title ?? null, o.body ?? "", JSON.stringify(o.data ?? {}), o.anon ?? false,
        o.status ?? "published", o.hold ?? null, o.flagged ?? null, o.publishAt ?? null, o.pinned ? at : null, (o.mentions ?? []).map((k) => M[k]), at]);
    if (o.parent && (o.status ?? "published") === "published") await q(`update posts set reply_count = reply_count + 1, last_reply_at = greatest(coalesce(last_reply_at, $2::timestamptz), $2::timestamptz) where id = $1`, [o.parent, at]);
    for (const [i, f] of (o.files ?? []).entries()) await q(`insert into post_files (post_id, file_id, position) values ($1, $2, $3)`, [r.id, f, i]);
    if (o.dm) await q(`update dms set last_post_at = greatest(coalesce(last_post_at, $2::timestamptz), $2::timestamptz) where id = $1`, [o.dm, at]);
    return r.id;
  };
  const react = async (id, emoji, who) => { for (const k of who) await q(`insert into reactions (post_id, member_id, emoji) values ($1, $2, $3) on conflict do nothing`, [id, M[k], emoji]); };
  const seen = async (id, who) => { for (const k of who) await q(`insert into post_views (post_id, member_id) values ($1, $2) on conflict do nothing`, [id, M[k]]); };
  const vote = async (id, option, who) => { for (const k of who) await q(`insert into poll_votes (post_id, member_id, option) values ($1, $2, $3) on conflict do nothing`, [id, M[k], option]); };

  // Specialists · UAE: announcements
  let p = await post({ ch: "s-announce", by: "owner", at: 6 * D, pinned: true, body: "Welcome to the Special Minds Community for specialists 👋\n\nThis is where we share **opportunities**, training and news. Turn on pop-ups (the bell, then Turn on pop-ups) so you never miss an opportunity that fits you, and keep your availability up to date in My account." });
  await react(p, "👍", ["aisha", "hana", "joel", "fatima", "maria", "ravi", "grace", "sara", "meera"]); await react(p, "❤️", ["noor", "youssef", "daniel"]);
  await seen(p, ["aisha", "hana", "joel", "fatima", "maria", "ravi", "grace", "sara", "noor", "daniel", "meera", "youssef"]);
  p = await post({ ch: "s-announce", by: "admin", at: 2 * D, body: "Reminder: please update your availability (My account → Profile → Availability). We match new cases to people who are open to work first." });
  await react(p, "✅", ["aisha", "meera", "sara", "hana"]); await seen(p, ["aisha", "hana", "meera", "sara", "joel", "fatima"]);
  const reply1 = await post({ ch: "s-announce", parent: p, by: "grace", at: 2 * D - 30, body: "Done! Can we also add the days we prefer?" });
  await post({ ch: "s-announce", parent: p, by: "admin", at: 2 * D - 10, body: "Good idea Grace, write it in the note box for now (for example “Sun to Wed only”)." });
  void reply1;
  p = await post({ ch: "s-announce", by: "owner", at: 3 * H, body: "December training is open: **Data collection for shadow teachers**, Saturday morning at our Al Barsha centre. Places are limited, RSVP in #training-and-events." });
  await react(p, "🎉", ["aisha", "hana", "youssef"]); await seen(p, ["aisha", "hana", "youssef", "grace"]);

  // general chat
  const g = [];
  g.push(await post({ ch: "s-general", by: "joel", at: 2 * D + 120, body: "Morning everyone! Anyone else doing the VB-MAPP training next month?" }));
  g.push(await post({ ch: "s-general", by: "fatima", at: 2 * D + 100, body: "I'll be there, and I'm happy to share my notes from last year's session." }));
  await react(g[1], "🙏", ["joel", "aisha", "grace"]);
  g.push(await post({ ch: "s-general", by: "aisha", at: 1 * D + 300, body: "Small win to share: my student said “my turn” on his own today during snack time. Three months of modelling! 🎉" }));
  await react(g[2], "🎉", ["joel", "fatima", "hana", "maria", "meera", "youssef", "grace"]); await react(g[2], "❤️", ["noor", "sara", "daniel"]);
  await post({ ch: "s-general", parent: g[2], by: "fatima", at: 1 * D + 280, body: "That's lovely Aisha. Write it in your session note too, it's great data for the next review." });
  await post({ ch: "s-general", parent: g[2], by: "hana", at: 1 * D + 260, body: "Mabrook! The modelling pays off." });
  await post({ ch: "s-general", parent: g[2], by: "aisha", at: 1 * D + 240, body: "Thank you both ❤️" });
  const poll = await post({ ch: "s-general", by: "moderator", at: 1 * D, kind: "poll", body: "Which time suits you best for the next team workshop?", data: { options: ["Friday evening", "Saturday morning", "Saturday afternoon"], multi: false, closesAt: ahead(3 * D) } });
  await vote(poll, 1, ["aisha", "hana", "joel", "fatima", "grace", "youssef"]); await vote(poll, 0, ["maria", "ravi"]); await vote(poll, 2, ["meera"]);
  g.push(await post({ ch: "s-general", by: "ravi", at: 6 * H, body: `Does anyone have a good sensory diet template for a 5 year old? <@${M.fatima}>`, mentions: ["fatima"] }));
  g.push(await post({ ch: "s-general", by: "fatima", at: 5 * H, body: "There's one in #resources, and I'll add our updated version this week." }));
  g.push(await post({ ch: "s-general", by: "youssef", at: 2 * H, body: "Bonjour tout le monde! New here, I'm a shadow teacher in Dubai. Happy to help with French-speaking families too." }));
  await react(g[g.length - 1], "👋", ["aisha", "hana", "joel", "grace"]);
  g.push(await post({ ch: "s-general", by: "meera", at: 40, body: "Welcome Youssef! 😊" }));

  // opportunities, Dubai
  const oppA = await post({ ch: "s-opp-dxb", by: "admin", at: 26 * H, kind: "opportunity", title: "Shadow teacher · Al Barsha, Dubai", body: "",
    data: { role: "shadow_teacher", city: "Dubai", area: "Al Barsha", schedule: "Sun to Thu, 7:30 am to 2:30 pm", childAge: "Boy, 6", needs: "autism, mainstream school", languages: ["English", "Arabic"], gender: "any", start: "1 December", pay: "AED 6,000 to 7,000 a month", details: "A friendly boy who loves trains. Needs support with transitions and joining group work. The school is happy to have a shadow teacher in class. A short meeting with the family and the school first.", status: "open", nudge: true } });
  for (const k of ["aisha", "hana", "youssef"]) await q(`insert into opportunity_targets (post_id, member_id, alerted_at, nudged_at) values ($1, $2, $3, $4)`, [oppA, M[k], ago(26 * H), k === "youssef" ? ago(24 * H) : null]);
  await seen(oppA, ["aisha", "hana", "youssef", "admin", "owner"]);
  await q(`insert into responses (post_id, member_id, answer, note, stage, created_at, updated_at) values ($1, $2, 'interested', 'Free from 1 December, mornings suit me. I have worked with two boys with autism in mainstream schools.', 'new', $3, $3)`, [oppA, M.aisha, ago(25 * H)]);
  await q(`insert into responses (post_id, member_id, answer, note, stage, staged_by, staged_at, created_at, updated_at) values ($1, $2, 'interested', 'I speak Arabic with the family. Available from 24 November.', 'shortlisted', $4, $3, $3, $3)`, [oppA, M.hana, ago(20 * H), M.admin]);
  await q(`insert into responses (post_id, member_id, answer, created_at, updated_at) values ($1, $2, 'not_for_me', $3, $3)`, [oppA, M.youssef, ago(22 * H)]);
  const oppB = await post({ ch: "s-opp-dxb", by: "moderator", at: 5 * H, kind: "opportunity", title: "Speech therapist for home sessions · JLT, Dubai", body: "",
    data: { role: "speech_therapist", city: "Dubai", area: "JLT", schedule: "Twice a week, after 4 pm", childAge: "Girl, 4", needs: "speech delay", languages: ["English"], gender: "female", start: "As soon as possible", pay: "AED 300 a session", details: "Home sessions. The family would like a therapist who can coach them too.", status: "open", nudge: false } });
  await q(`insert into opportunity_targets (post_id, member_id, alerted_at) values ($1, $2, $3)`, [oppB, M.meera, ago(5 * H)]);
  await seen(oppB, ["meera"]);
  await q(`insert into responses (post_id, member_id, answer, note, created_at, updated_at) values ($1, $2, 'interested', 'I can do Monday and Wednesday at 5 pm.', $3, $3)`, [oppB, M.meera, ago(4 * H)]);
  const oppC = await post({ ch: "s-opp-dxb", by: "admin", at: 9 * D, kind: "opportunity", title: "LSA · Jumeirah, Dubai", body: "",
    data: { role: "lsa", city: "Dubai", area: "Jumeirah", schedule: "Mon to Fri, 8 am to 1 pm", childAge: "Girl, 8", needs: "learning difficulties", languages: ["English"], gender: "any", start: "Next term", status: "filled", filledAt: ago(5 * D) } });
  await q(`insert into opportunity_targets (post_id, member_id, alerted_at) values ($1, $2, $3), ($1, $4, $3)`, [oppC, M.grace, ago(9 * D), M.hana]);
  await q(`insert into responses (post_id, member_id, answer, stage, created_at, updated_at) values ($1, $2, 'interested', 'shortlisted', $3, $3), ($1, $4, 'interested', 'new', $3, $3)`, [oppC, M.grace, ago(8 * D), M.hana]);
  await seen(oppC, ["grace", "hana"]);
  const oppD = await post({ ch: "s-opp-auh", by: "admin", at: 2 * D, kind: "opportunity", title: "Special educator at home · Khalifa City, Abu Dhabi", body: "",
    data: { role: "special_educator", city: "Abu Dhabi", area: "Khalifa City", schedule: "Three afternoons a week", childAge: "Boy, 9", needs: "Down syndrome", languages: ["English"], gender: "any", start: "December", status: "open" } });
  await q(`insert into opportunity_targets (post_id, member_id, alerted_at) values ($1, $2, $3)`, [oppD, M.sara, ago(2 * D)]);
  await seen(oppD, ["sara"]);
  await q(`insert into responses (post_id, member_id, answer, note, created_at, updated_at) values ($1, $2, 'interested', 'Yes please, afternoons work well for me.', $3, $3)`, [oppD, M.sara, ago(40 * H)]);

  // forum: ABA and behaviour
  let tp = await post({ ch: "s-aba", by: "joel", at: 3 * D, kind: "topic", title: "Reducing escape behaviour during table work", body: "My learner (7) slides off the chair after about 2 minutes of table work. We've tried a first-then board. Any other ideas that worked for you?" });
  const best = await post({ ch: "s-aba", parent: tp, by: "fatima", at: 3 * D - 60, body: "Try shorter demands with high-probability tasks first (behavioural momentum), and reinforce sitting itself on a dense schedule at the start. Then thin it slowly. Take ABC data for a week so we can check the function together." });
  await post({ ch: "s-aba", parent: tp, by: "aisha", at: 3 * D - 40, body: "A wobble cushion helped one of my students a lot." });
  await post({ ch: "s-aba", parent: tp, by: "joel", at: 2 * D, body: "Thanks both. Behavioural momentum is working well already: 6 minutes today!" });
  await q(`update posts set best_answer_id = $2 where id = $1`, [tp, best]);
  await react(best, "👍", ["joel", "aisha", "hana"]);
  tp = await post({ ch: "s-aba", by: "aisha", at: 20 * H, kind: "topic", title: "VB-MAPP or ABLLS-R for a 5-year-old?", body: "Starting with a new learner next month. Which assessment do you prefer and why?" });
  await post({ ch: "s-aba", parent: tp, by: "fatima", at: 18 * H, body: "VB-MAPP for language-focused goals at that age; ABLLS-R if you need a wider skills picture. Let's talk in supervision." });

  // case talk (with one flagged reply)
  tp = await post({ ch: "s-case", by: "hana", at: 30 * H, kind: "topic", title: "Ideas for a 7-year-old who finds transitions hard", body: "He gets very upset when we move from play to work. Visual timer helps a little. What else could I try?" });
  await post({ ch: "s-case", parent: tp, by: "daniel", at: 28 * H, body: "Transition objects work well: something he carries to the next activity. And give a 5-minute and a 1-minute warning, always the same words." });
  await post({ ch: "s-case", parent: tp, by: "noor", at: 26 * H, flagged: "school", body: "At school we sing a short transition song before every change. The teacher joined in and now the whole class uses it." });

  // private shadow teachers channel
  await post({ ch: "s-shadow", by: "hana", at: 10 * H, body: "Does anyone have a good template for a daily communication book with parents?" });
  await post({ ch: "s-shadow", by: "aisha", at: 9 * H, body: "I'll share mine in #resources tonight." });
  await post({ ch: "s-shadow", by: "noor", at: 3 * H, body: "صباح الخير جميعاً، هل من أحد يستخدم جداول بصرية بالعربية؟ أبحث عن صور مناسبة." });
  // hidden BCBA channel
  await post({ ch: "s-bcba", by: "fatima", at: 5 * H, body: "Joel, can we move Thursday's supervision to 3 pm?" });
  await post({ ch: "s-bcba", by: "joel", at: 4 * H, body: "Yes, 3 pm works." });

  // events (specialists)
  let ev = await post({ ch: "s-events", by: "owner", at: 3 * H, kind: "event", title: "Data collection for shadow teachers", body: "A hands-on morning: ABC data, frequency counts and simple graphs. Bring a laptop if you have one. Certificates of attendance for everyone.",
    data: { startsAt: ahead(22 * D + 4 * H), endsAt: ahead(22 * D + 6 * H), place: "Special Minds centre, Al Barsha", online: "", capacity: 30 } });
  for (const [k, a] of [["aisha", "going"], ["hana", "going"], ["grace", "maybe"], ["youssef", "going"], ["noor", "going"]]) await q(`insert into rsvps (post_id, member_id, answer) values ($1, $2, $3)`, [ev, M[k], a]);
  ev = await post({ ch: "s-events", by: "moderator", at: 2 * D, kind: "event", title: "Webinar: Positive behaviour support basics", body: "One hour online with Fatima Al Mansoori, then questions.",
    data: { startsAt: ahead(8 * D + 9 * H), endsAt: ahead(8 * D + 10 * H), place: "", online: "https://example.com/webinar", capacity: null } });
  for (const [k, a] of [["joel", "going"], ["sara", "going"], ["ravi", "maybe"]]) await q(`insert into rsvps (post_id, member_id, answer) values ($1, $2, $3)`, [ev, M[k], a]);
  await post({ ch: "s-events", by: "owner", at: 16 * D, kind: "event", title: "Meet the team coffee morning", body: "Thank you to everyone who came!", data: { startsAt: ago(15 * D), endsAt: ago(15 * D - 120), place: "Special Minds centre, Al Barsha" } });

  // resources library
  const pdf = await file("abc-data-sheet.pdf", "fatima", "file", "application/pdf");
  await post({ ch: "s-res", by: "fatima", at: 12 * D, kind: "resource", title: "ABC data sheet", body: "A printable sheet for antecedent, behaviour and consequence notes. Initials only, never full names.", data: { category: "Data sheets" }, files: [pdf] });
  const sched = await file("visual-schedule.jpg", "aisha", "image", "image/jpeg", 1000, 640);
  await post({ ch: "s-res", by: "aisha", at: 8 * D, kind: "resource", title: "Visual schedule: morning routine", body: "Six steps with pictures. Print, laminate, and add Velcro.", data: { category: "Visual supports" }, files: [sched] });
  await post({ ch: "s-res", by: "owner", at: 20 * D, kind: "resource", title: "How to write a good session note", body: "1. Date, time and setting.\n2. Goals worked on, with data.\n3. What helped and what didn't.\n4. One thing to try next time.\n5. Initials only.", data: { category: "Guides" } });
  await post({ ch: "s-res", by: "fatima", at: 25 * D, kind: "resource", title: "BACB (Behavior Analyst Certification Board)", body: "Ethics code, supervision requirements and certification information.", data: { category: "Links", url: "https://www.bacb.com/" } });

  // Families · UAE
  p = await post({ ch: "f-news", by: "mariam", at: 7 * D, pinned: true, body: "Welcome to the Special Minds families community 💜\n\nThis is a safe place to share, ask and support each other. Please read the rules, keep your child's photo, name and school private, and use “Ask Special Minds for help” whenever you need a specialist." });
  await react(p, "❤️", ["amina", "rahul", "sophie", "khalid", "deepa", "james", "ummyusuf"]);
  await seen(p, ["amina", "rahul", "sophie", "khalid", "deepa", "james", "ummyusuf", "lina"]);
  p = await post({ ch: "f-news", by: "mariam", at: 7 * D - 5, body: "أهلاً وسهلاً بكم في مجتمع عائلات سبيشال مايندز 💜\nهذه مساحة آمنة للمشاركة والسؤال ودعم بعضنا البعض. نرجو الحفاظ على خصوصية صور أطفالكم وأسمائهم ومدارسهم." });
  await react(p, "❤️", ["khalid", "ummyusuf", "lina"]);
  p = await post({ ch: "f-news", by: "owner", at: 5 * H, body: "Parents' coffee morning this Saturday at our Al Barsha centre ☕ A relaxed chat with other families and our team. RSVP in #events-and-workshops." });
  await react(p, "👍", ["amina", "lina"]); await seen(p, ["amina", "lina", "rahul"]);

  // community feed
  let fp = await post({ ch: "f-feed", by: "amina", at: 20 * H, body: "Small win today 💜 My son used his AAC device to ask for “more” at dinner, without any prompt. Three months ago I couldn't imagine it." });
  await react(fp, "❤️", ["rahul", "sophie", "khalid", "deepa", "james", "ummyusuf", "maria", "mariam"]);
  await post({ ch: "f-feed", parent: fp, by: "sophie", at: 19 * H, body: "This made my day! Well done to both of you." });
  await post({ ch: "f-feed", parent: fp, by: "maria", at: 18 * H, body: "Wonderful progress. Keep modelling on the device yourself too, it really helps." });
  await post({ ch: "f-feed", parent: fp, by: "amina", at: 17 * H, body: "Thank you Maria, we will!" });
  const calm = await file("calm-corner.jpg", "james", "image", "image/jpeg", 900, 640);
  fp = await post({ ch: "f-feed", by: "james", at: 9 * H, body: "We finally set up a calm corner at home: a small tent, a bean bag, ear defenders and a visual timer. Our daughter goes there by herself when things get too loud. Happy to share where we got things.", files: [calm] });
  await react(fp, "❤️", ["amina", "deepa", "rahul", "lina"]); await react(fp, "👏", ["sophie"]);
  await post({ ch: "f-feed", parent: fp, by: "deepa", at: 8 * H, body: "Love this! Where did you find the tent?" });
  fp = await post({ ch: "f-feed", by: "lina", at: 6 * H, body: "هل يعرف أحد نادياً رياضياً في دبي يرحب بالأطفال من ذوي الاحتياجات الخاصة؟ ابني يحب السباحة." });
  await post({ ch: "f-feed", parent: fp, by: "ummyusuf", at: 5 * H, body: "نعم، هناك عدة نوادٍ تقدم حصص سباحة فردية. سأرسل لك التفاصيل في قناة أولياء الأمور بالعربية." });
  const pollF = await post({ ch: "f-feed", by: "rahul", at: 3 * H, kind: "poll", body: "What time works best for a parents' meetup?", data: { options: ["Friday after 5 pm", "Saturday morning", "Sunday evening"], multi: true } });
  await vote(pollF, 1, ["amina", "sophie", "james", "lina"]); await vote(pollF, 0, ["deepa", "rahul"]); await vote(pollF, 2, ["ummyusuf"]);
  // a new member's post waiting for approval (Lina joined 2 days ago)
  await post({ ch: "f-feed", by: "lina", at: 50, status: "pending", hold: "new_member", body: "Thank you all for the warm welcome! I'm learning so much here already." });

  // Ask a specialist (anonymous question, Arabic question)
  tp = await post({ ch: "f-ask", by: "sophie", at: 2 * D, kind: "topic", anon: true, title: "Is it normal that my 3-year-old isn't talking yet?", body: "He understands a lot and points to what he wants, but has only a few words. Family keeps telling me to wait. Should I?" });
  const ans = await post({ ch: "f-ask", parent: tp, by: "maria", at: 2 * D - 90, body: "Thank you for asking. By 3, most children use many words and short sentences, so it's worth having a speech and language assessment now rather than waiting. The good news: understanding and pointing are strong foundations. Early support makes a big difference." });
  await post({ ch: "f-ask", parent: tp, by: "amina", at: 2 * D - 30, body: "We waited a year with our son and I wish we hadn't. Getting the assessment gave us a plan." });
  await q(`update posts set best_answer_id = $2 where id = $1`, [tp, ans]);
  await react(ans, "🙏", ["sophie", "amina", "deepa"]);
  tp = await post({ ch: "f-ask", by: "khalid", at: 30 * H, kind: "topic", title: "ما الفرق بين معلم الظل ومساعد التعلم؟", body: "المدرسة طلبت معلم ظل لابني، لكن مدرسة أخرى تحدثت عن مساعد تعلم. ما الفرق؟" });
  await post({ ch: "f-ask", parent: tp, by: "noor", at: 28 * H, body: "معلم الظل يرافق طفلاً واحداً طوال اليوم ويساعده في الصف والاستراحة. مساعد التعلم يدعم عادة عدة أطفال داخل الصف تحت إشراف المعلم." });
  await post({ ch: "f-ask", parent: tp, by: "khalid", at: 27 * H, body: "شكراً جزيلاً، الصورة أوضح الآن." });
  tp = await post({ ch: "f-ask", by: "rahul", at: 4 * H, kind: "topic", title: "Toilet training at 5: where do we start?", body: "Our son is 5 and still in nappies during the day. Any advice on where to begin?" });

  // autism chat (with a held message that shares a phone number)
  await post({ ch: "f-autism", by: "amina", at: 22 * H, body: "Does anyone else find haircuts really hard? Any tips?" });
  await post({ ch: "f-autism", by: "deepa", at: 21 * H, body: "We bring his tablet and do it at home with clippers now. Much calmer." });
  await post({ ch: "f-autism", by: "ummyusuf", at: 20 * H, body: "نحن نذهب في الصباح الباكر عندما يكون المكان هادئاً، وهذا ساعدنا كثيراً." });
  await post({ ch: "f-autism", by: "deepa", at: 2 * H, status: "held", hold: "contact_details", body: "I know a barber who comes to your home, call me on 050 123 4567 and I'll give you his number." });
  await post({ ch: "f-autism", by: "rahul", at: 70, body: "Our occupational therapist suggested letting him hold the clippers first so he knows the sound. Worth a try!" });
  // ADHD
  await post({ ch: "f-adhd", by: "james", at: 2 * D, body: "Homework time is a daily battle. What has worked for you?" });
  await post({ ch: "f-adhd", by: "rahul", at: 2 * D - 60, body: "Short bursts with a timer: 10 minutes work, 5 minutes movement. Game changer for us." });
  // speech delay forum
  tp = await post({ ch: "f-speech", by: "deepa", at: 4 * D, kind: "topic", title: "Books that helped your child's speech", body: "Looking for book ideas for a 4-year-old. Ours loves animals." });
  await post({ ch: "f-speech", parent: tp, by: "meera", at: 4 * D - 120, body: "Books with repeated phrases are great, for example lift-the-flap animal books. Pause before the repeated word and wait for them to fill it in." });
  // Dubai parents (with a reported post)
  await post({ ch: "f-dubai", by: "amina", at: 26 * H, body: "Anyone going to the sensory-friendly cinema screening next Friday?" });
  const spam = await post({ ch: "f-dubai", by: "james", at: 8 * H, body: "Selling our barely-used therapy swing, AED 300. Message me if interested!" });
  await q(`insert into reports (post_id, reporter_id, reason, note) values ($1, $2, 'spam', 'Selling in the parents channel')`, [spam, M.rahul]);
  await post({ ch: "f-dubai", by: "lina", at: 3 * H, body: "We went last month, the staff were wonderful. Lights stay on and the sound is lower." });
  // Abu Dhabi, Arabic
  await post({ ch: "f-auh", by: "sophie", at: 3 * D, body: "Hello Abu Dhabi families! Any recommendations for inclusive nurseries near Khalifa City?" });
  await post({ ch: "f-arabic", by: "khalid", at: 2 * D, body: "السلام عليكم جميعاً، سعيد بوجود قناة باللغة العربية." });
  await post({ ch: "f-arabic", by: "ummyusuf", at: 2 * D - 30, body: "وعليكم السلام، أهلاً بك يا أبو سيف." });
  await post({ ch: "f-arabic", by: "noor", at: 6 * H, body: "إذا كان لديكم أي سؤال عن معلمي الظل، يسعدني المساعدة." });
  await post({ ch: "f-arabic", by: "lina", at: 4 * H, body: "شكراً نور! سؤالي: كيف أعرف أن معلم الظل مناسب لابني؟" });

  // events (families)
  ev = await post({ ch: "f-events", by: "mariam", at: 5 * H, kind: "event", title: "Parents' coffee morning, Al Barsha", body: "A relaxed morning with other families and our team. Children are welcome: there's a quiet room with toys.",
    data: { startsAt: ahead(5 * D + 3 * H), endsAt: ahead(5 * D + 5 * H), place: "Special Minds centre, Al Barsha", capacity: 25 } });
  for (const [k, a] of [["amina", "going"], ["rahul", "maybe"], ["lina", "going"], ["sophie", "going"], ["james", "going"]]) await q(`insert into rsvps (post_id, member_id, answer) values ($1, $2, $3)`, [ev, M[k], a]);
  await post({ ch: "f-events", parent: ev, by: "amina", at: 3 * H, body: "Looking forward to it! Is there parking?" });
  await post({ ch: "f-events", parent: ev, by: "mariam", at: 2 * H, body: "Yes, free parking in front of the building." });
  ev = await post({ ch: "f-events", by: "owner", at: 2 * D, kind: "event", title: "Webinar: Understanding your child's assessment report", body: "Our psychologist Daniel Pereira explains the words and scores in a typical report, then answers questions.",
    data: { startsAt: ahead(12 * D + 10 * H), endsAt: ahead(12 * D + 11 * H), online: "https://example.com/webinar" } });
  for (const [k, a] of [["sophie", "going"], ["khalid", "going"], ["deepa", "maybe"]]) await q(`insert into rsvps (post_id, member_id, answer) values ($1, $2, $3)`, [ev, M[k], a]);
  await post({ ch: "f-events", by: "mariam", at: 20 * D, kind: "event", title: "Sensory play workshop", body: "Thank you for joining us!", data: { startsAt: ago(18 * D), endsAt: ago(18 * D - 120), place: "Special Minds centre, Al Barsha" } });

  // guides library
  await post({ ch: "f-guides", by: "mariam", at: 15 * D, kind: "resource", title: "Your first assessment: what to expect", body: "What happens on the day, how long it takes, what to bring (reports, videos of your child at home), and the questions you might be asked. You'll get a written report with recommendations afterwards.", data: { category: "Getting started" } });
  await post({ ch: "f-guides", by: "mariam", at: 14 * D, kind: "resource", title: "Questions to ask a new shadow teacher", body: "• What experience do you have with children like mine?\n• How will you share updates with us?\n• How do you work with the class teacher?\n• What do you do when my child is upset?\n• How do you help my child become more independent?", data: { category: "Shadow teachers" } });
  await post({ ch: "f-guides", by: "owner", at: 13 * D, kind: "resource", title: "Special Minds UAE website", body: "Our services, team and contact details.", data: { category: "Links", url: "https://specialminds.ae" } });
  const sched2 = await file("visual-schedule.jpg", "mariam", "image", "image/jpeg", 1000, 640);
  await post({ ch: "f-guides", by: "mariam", at: 6 * D, kind: "resource", title: "Visual schedule for mornings", body: "Print it, stick it near the door, and point to each step.", data: { category: "Visual supports" }, files: [sched2] });

  // Specialists · India
  p = await post({ ch: "i-announce", by: "owner", at: 5 * D, body: "Welcome to the Special Minds Community, India team! Opportunities in Mumbai will appear in #opportunities-mumbai." });
  await react(p, "🙏", ["arjun", "kavya", "rohan"]);
  const oppE = await post({ ch: "i-opp", by: "admin", at: 30 * H, kind: "opportunity", title: "Special educator · Andheri West, Mumbai", body: "",
    data: { role: "special_educator", city: "Mumbai", area: "Andheri West", schedule: "Mon to Fri, 3 pm to 6 pm", childAge: "Girl, 7", needs: "learning difficulties", languages: ["English", "Hindi"], gender: "any", start: "1 December", status: "open" } });
  await q(`insert into opportunity_targets (post_id, member_id, alerted_at) values ($1, $2, $3)`, [oppE, M.arjun, ago(30 * H)]);
  await seen(oppE, ["arjun"]);
  await q(`insert into responses (post_id, member_id, answer, note, created_at, updated_at) values ($1, $2, 'interested', 'Available from 25 November.', $3, $3)`, [oppE, M.arjun, ago(28 * H)]);
  await post({ ch: "i-general", by: "kavya", at: 1 * D, body: "Hi all! Kavya here, speech therapist in Mumbai." });
  await post({ ch: "i-general", by: "rohan", at: 20 * H, body: "Welcome Kavya 👋" });

  // a scheduled announcement
  await post({ ch: "s-announce", by: "admin", at: 30, status: "scheduled", publishAt: ahead(2 * D), body: "Our office is closed on 2 and 3 December for the National Day holiday. Happy National Day! 🇦🇪" });

  // ----------------------------------------------------- private messages ----
  const dm = async (who, opts = {}) => {
    const d = await one(`insert into dms (is_group, title, status, created_by, created_at) values ($1, $2, $3, $4, $5) returning id`, [who.length > 2, opts.title ?? null, opts.status ?? "active", M[who[0]], ago(opts.at ?? 3 * D)]);
    for (const k of who) await q(`insert into dm_members (dm_id, member_id, last_read_at) values ($1, $2, $3)`, [d.id, M[k], ago(k === who[0] ? 0 : opts.unread ? 3 * D : 0)]);
    return d.id;
  };
  let d1 = await dm(["admin", "aisha"], { at: 20 * H, unread: true });
  await post({ dm: d1, by: "admin", at: 20 * H, body: "Hi Aisha, thanks for your interest in the Al Barsha role. Could you do a short call with the family on Tuesday?" });
  await post({ dm: d1, by: "aisha", at: 19 * H, body: "Hi Omar, yes, Tuesday after 3 pm is perfect." });
  await post({ dm: d1, by: "admin", at: 18 * H, body: "Great, I'll confirm the time tomorrow." });
  d1 = await dm(["joel", "fatima"], { at: 2 * D });
  await post({ dm: d1, by: "joel", at: 2 * D, body: "Fatima, could you look at my graph before Thursday?" });
  await post({ dm: d1, by: "fatima", at: 2 * D - 30, body: "Of course, send it over." });
  d1 = await dm(["amina", "deepa"], { at: 1 * D, unread: true });
  await post({ dm: d1, by: "deepa", at: 1 * D, body: "Hi Amina! Saw your post about the AAC device. Which app do you use?" });
  await post({ dm: d1, by: "amina", at: 22 * H, body: "Hi Deepa! We use the one his speech therapist set up. Happy to show you at the coffee morning 😊" });
  d1 = await dm(["moderator", "maria", "meera"], { title: "Speech team", at: 3 * D });
  await post({ dm: d1, by: "moderator", at: 3 * D, body: "Hi both, can we plan the speech webinar for parents in January?" });
  await post({ dm: d1, by: "maria", at: 3 * D - 60, body: "Yes! I can prepare the slides." });
  await post({ dm: d1, by: "meera", at: 3 * D - 30, body: "Count me in for the questions part." });

  // -------------------------------------------------- moderation and more ----
  for (const [w, a] of [["idiot", "hold"], ["stupid", "hold"], ["kill yourself", "block"], ["school", "caution"], ["nursery", "caution"], ["مدرسة", "caution"], ["غبي", "hold"]]) {
    await q(`insert into blocked_words (word, action, created_by) values ($1, $2, $3)`, [w, a, M.owner]);
  }
  await q(`insert into join_requests (space_id, member_id, answers, created_at) values ($1, $2, $3::text::jsonb, $4)`, [S["families-uae"], M.nadia, JSON.stringify({ q1: "4 years old", q2: "A friend at school" }), ago(3 * H)]);
  await q(`insert into join_requests (space_id, member_id, answers, created_at) values ($1, $2, $3::text::jsonb, $4)`, [S["families-uae"], M.tom, JSON.stringify({ q1: "7", q2: "Instagram" }), ago(20 * H)]);
  await q(`insert into invites (code, space_id, kind, max_uses, uses, expires_at, note, created_by, auto_approve) values ('demoSpecialistsUAE', $1, 'specialist', 50, 12, now() + interval '20 days', 'WhatsApp group, November', $2, true)`, [S["specialists-uae"], M.admin]);
  await q(`insert into invites (code, space_id, kind, max_uses, uses, expires_at, note, created_by, auto_approve) values ('demoFamiliesEvent', $1, 'parent', null, 4, now() + interval '30 days', 'QR code at the coffee morning', $2, false)`, [S["families-uae"], M.mariam]);
  for (const [code, name, addr, roles, city, ref] of [["demoTalentA1", "Reem Haddad", "reem@demo.local", ["shadow_teacher"], "Dubai", "1120"], ["demoTalentB2", "Kiran Shah", "kiran@demo.local", ["occupational_therapist"], "Dubai", "1124"], ["demoTalentC3", "Salma Idris", "+971500000199", ["speech_therapist"], "Sharjah", "1131"]]) {
    await q(`insert into invites (code, space_id, kind, for_address, for_name, prefill, max_uses, expires_at, note, created_by) values ($1, $2, 'specialist', $3, $4, $5::text::jsonb, 1, now() + interval '60 days', 'Talent import', $6)`,
      [code, S["specialists-uae"], addr, name, JSON.stringify({ roles, city, country: "AE", languages: ["English"], talent_ref: ref }), M.admin]);
  }
  await q(`insert into help_requests (member_id, space_id, service, child_age, city, area, details, name, phone, email, contact_by, status, created_at) values ($1, $2, 'shadow_teacher', '6', 'Dubai', 'Al Barsha', 'Looking for a shadow teacher for next term, mainstream school. He is autistic and very social.', 'Amina Khan', '+971500000121', 'amina@demo.local', 'whatsapp', 'new', $3)`, [M.amina, S["families-uae"], ago(5 * H)]);
  await q(`insert into help_requests (member_id, space_id, service, child_age, city, details, name, phone, email, contact_by, status, created_at) values ($1, $2, 'speech_therapy', '3', 'Abu Dhabi', 'Speech assessment, then therapy if needed.', 'Sophie Laurent', '+971500000123', 'sophie@demo.local', 'call', 'done', $3)`, [M.sophie, S["families-uae"], ago(2 * D)]);

  // a broadcast, sent three days ago
  const b = await one(`insert into broadcasts (author_id, title, body, segment, via, recipients, sent_at, created_at) values ($1, 'New: the Special Minds Community app', 'Add the community to your phone''s Home Screen for pop-up alerts: open it in Safari or Chrome, tap Share, then Add to Home Screen. Questions? Reply in #general.', $2::text::jsonb, '{"email":true}', 0, $3, $3) returning id`,
    [M.owner, JSON.stringify({ spaces: [S["specialists-uae"]] }), ago(3 * D)]);
  const rec = await q(`select member_id from space_members where space_id = $1`, [S["specialists-uae"]]);
  for (const [i, r] of rec.entries()) await q(`insert into broadcast_recipients (broadcast_id, member_id, seen_at) values ($1, $2, $3)`, [b.id, r.member_id, i % 3 === 2 ? null : ago(3 * D - 60 * i)]);
  await q(`update broadcasts set recipients = $2 where id = $1`, [b.id, rec.length]);

  // notifications for a few people
  const note = async (who, kind, title, body, link, minAgo, read = false, important = false) =>
    q(`insert into notifications (member_id, kind, title, body, link, important, created_at, read_at, pushed_at) values ($1, $2, $3, $4, $5, $6, $7, $8, $7)`, [M[who], kind, title, body, link, important, ago(minAgo), read ? ago(minAgo - 1) : null]);
  await note("aisha", "opportunity", "New opportunity: Shadow teacher · Al Barsha, Dubai", "Sun to Thu, 7:30 am to 2:30 pm · Starts 1 December", `/s/specialists-uae/opportunities-dubai/${oppA}`, 26 * H, true, true);
  await note("aisha", "dm", "Omar Siddiqui", "Great, I'll confirm the time tomorrow.", `/dm/${1}`, 18 * H);
  await note("aisha", "post", "New announcement in #Announcements", "December training is open: Data collection for shadow teachers…", "/s/specialists-uae/announcements", 3 * H, false, true);
  await note("hana", "shortlisted", "You're shortlisted: Shadow teacher · Al Barsha, Dubai", "Special Minds will be in touch with the next steps.", `/s/specialists-uae/opportunities-dubai/${oppA}`, 19 * H, false, true);
  await note("meera", "opportunity", "New opportunity: Speech therapist for home sessions · JLT, Dubai", "Twice a week, after 4 pm", `/s/specialists-uae/opportunities-dubai/${oppB}`, 5 * H, true, true);
  await note("fatima", "mention", "Ravi Kumar mentioned you in #General", "Does anyone have a good sensory diet template for a 5 year old?", "/s/specialists-uae/general", 6 * H);
  await note("amina", "reply", "Maria Santos replied to your post", "Wonderful progress. Keep modelling on the device yourself too…", "/s/families-uae/community-feed", 18 * H, true);
  await note("amina", "event", "New event in #Events and workshops", "Parents' coffee morning, Al Barsha", "/s/families-uae/events-and-workshops", 5 * H, false, true);
  await note("sophie", "reply", "Maria Santos replied to “Is it normal that my 3-year-old isn't talking yet?”", "By 3, most children use many words…", "/s/families-uae/ask-a-specialist", 2 * D - 90, true);
  for (const s of ["owner", "admin", "moderator", "mariam"]) {
    await note(s, "request", "Nadia Aziz asked to join", null, "/admin/requests", 3 * H);
    await note(s, "queue", "A post from Deepa is waiting for review", "Contact details", "/admin/moderation", 2 * H);
    await note(s, "help", "Amina Khan asked Special Minds for help", "Shadow teacher / LSA", "/admin/help", 5 * H, false, true);
  }

  // what the delivery log looks like when nothing is sent for real
  for (const [ch, to, subject, body, purpose, min] of [
    ["email", "reem@demo.local", "You're invited to the Special Minds Community", "Hello Reem Haddad,\n\nYou're invited to the Special Minds Community: opportunities, announcements and colleagues in one place.\nJoin here: /join/demoTalentA1", "invite", 2 * D],
    ["whatsapp", "+971500000199", null, "Hello Salma Idris, you're invited to the Special Minds Community: /join/demoTalentC3", "invite", 2 * D],
    ["whatsapp", "+971500000101", null, "Hi Aisha, a new opportunity fits you: Shadow teacher · Al Barsha, Dubai. Tap to see it and say if you're interested.", "opportunity_nudge", 24 * H],
    ["email", "aisha@demo.local", "Your sign-in code: ••••••", "Your Special Minds Community sign-in code is ••••••.\nIt works for 10 minutes. Don't share it with anyone.", "login_code", 3 * H],
  ]) await q(`insert into outbox (channel, to_address, subject, body, purpose, status, created_at) values ($1, $2, $3, $4, $5, 'simulated', $6)`, [ch, to, subject, body, purpose, ago(min)]);
  for (const r of rec) await q(`insert into outbox (channel, member_id, to_address, subject, body, purpose, status, created_at) select 'email', id, email, 'New: the Special Minds Community app', 'Add the community to your phone''s Home Screen…', 'broadcast', 'simulated', $2::timestamptz from members where id = $1 and email is not null`, [r.member_id, ago(3 * D)]);

  // audit log
  for (const [who, action, target, min] of [["admin", "invite.create", "space:1", 2 * D], ["admin", "import.talent", "space:1", 2 * D - 5], ["mariam", "post.remove", "post:0", 4 * D], ["owner", "settings.save", null, 6 * D], ["admin", "opportunity.shortlisted", `post:${oppA}`, 19 * H], ["admin", "opportunity.filled", `post:${oppC}`, 5 * D]]) {
    await q(`insert into audit_log (actor_id, actor_name, action, target, created_at) select id, full_name, $2::text, $3::text, $4::timestamptz from members where id = $1`, [M[who], action, target, ago(min)]);
  }

  // Unread for demo: Aisha and Amina have new things waiting
  await q(`update channel_members set last_read_at = now() - interval '4 hours' where member_id = $1`, [M.aisha]);
  await q(`update channel_members set last_read_at = now() - interval '6 hours' where member_id = $1`, [M.amina]);
}
