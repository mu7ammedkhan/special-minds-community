// The empty structure of a fresh live community: the spaces and their channels
// (the same as the demo, without any people or posts), and a starter list of
// words to hold or block. Admins change all of it in Admin → Spaces and channels
// and Admin → Blocked words.
//   node scripts/db.mjs setup        (refuses a database that already has spaces)

export async function structure(db) {
  const q = async (sql, p = []) => (await db.query(sql, p)).rows;
  const one = async (sql, p = []) => (await q(sql, p))[0];
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

  for (const [w, a] of [["kill yourself", "block"], ["idiot", "hold"], ["stupid", "hold"], ["غبي", "hold"], ["school", "caution"], ["nursery", "caution"], ["مدرسة", "caution"]]) {
    await q(`insert into blocked_words (word, action) values ($1, $2) on conflict do nothing`, [w, a]);
  }
  return { spaces: Object.keys(S).length, channels: Object.keys(C).length };
}
