import {
  DEFAULT_PREFERENCES,
  normalizePreferences,
  preferencesSchema,
  type Preferences,
  type PreferenceKey,
  type PreferenceSource,
} from "./domain";

export const COPY_PROFILE_PROMPT = `Help me create a profile for Sidequest, an app that recommends real-world adventures, dates, social challenges, elaborate surprises, and pranks that I might actually want to perform.

Use only information genuinely available in this conversation or other context you can access. Do not invent facts or claim to remember information you cannot access.
Requests to design a product, write hypothetical personas, or suggest features are not evidence of my own preferences. Preserve negation and uncertainty.

Write a summary of no more than 250 words under these headings:

KNOWN PREFERENCES
Summarize interests, hobbies, useful skills, humor, creators or entertainment I have explicitly said I enjoy, and activities I have said I would like to try.

PARTICIPATION STYLE
Summarize anything I have explicitly said about meeting people, public attention, performance, competition, surprises, organizing plans, being on camera, or filming others. Watching a kind of content does not prove I want to participate in it.

BOUNDARIES
Include only preferences and exclusions I have explicitly mentioned that are relevant to choosing an outing. Do not invent limitations or infer sensitive traits.

TENTATIVE IMPRESSIONS
List at most three useful impressions, clearly marked as guesses. Leave this section empty if the evidence is too weak.

UNKNOWN
Briefly identify important gaps instead of filling them with assumptions. Do not guess my current budget, exact location, availability, physical ability, or age.

Do not include names of other people, contact details, precise addresses, financial account information, medical details, intimate history, or other sensitive personal information. Write this for me to review and edit before I paste it into another app. Do not write recommendations or an actual quest yet.`;

export interface SurveyQuestion {
  id: PreferenceKey;
  key: PreferenceKey;
  title: string;
  type: "single" | "multi";
  description?: string;
  optional: boolean;
  options: { value: string; label: string }[];
  otherKey?: PreferenceKey;
  otherLabel?: string;
  noneLabel?: string;
  selectAllLabel?: string;
}
const options = (rows: [string, string][]) =>
  rows.map(([value, label]) => ({ value, label }));
export const INTEREST_OPTIONS = options([
  ["sports", "Sports"],
  ["music", "Music"],
  ["comedy", "Comedy"],
  ["cooking", "Cooking"],
  ["making", "Making or designing things"],
  ["games", "Games"],
  ["local_knowledge", "Exploring local places"],
]);
export const SURVEY_QUESTIONS: SurveyQuestion[] = [
  {
    id: "categories",
    key: "categories",
    title: "What are you here for?",
    type: "multi",
    optional: true,
    selectAllLabel: "Select all",
    noneLabel: "Undecided",
    description:
      "Choose any, all, or none. This is an interest, not a commitment.",
    options: options([
      ["date_night", "Date Night"],
      ["daytime", "Daytime"],
      ["late_night", "Late Night"],
      ["street_challenges", "Street Challenges"],
      ["demon", "Down for Anything"],
    ]),
  },
  {
    id: "premises",
    key: "premises",
    title: "Which would you actually attempt?",
    type: "multi",
    optional: true,
    options: options([
      ["fan_club", "Organize a fake fan club for a friend"],
      ["open_mic", "Perform at a real open mic"],
      ["secret_expert", "Bring a secret expert to game night"],
      ["mystery_date", "Take a mystery date"],
      ["meal_challenge", "Host an earn-your-meal challenge"],
      ["spontaneous", "Something spontaneous with no preparation"],
      ["not_sure", "Not sure yet"],
    ]),
  },
  {
    id: "humor",
    key: "humor",
    title: "What kind of funny works for you?",
    type: "multi",
    optional: true,
    options: options([
      ["friendly_awkward", "Awkward but friendly encounters"],
      ["elaborate_setups", "Elaborate setups"],
      ["skill_reveals", "Unexpected skill reveals"],
      ["competitive", "Competitive trash talk among friends"],
      ["absurd", "Absurd situations"],
      ["surprises", "Surprises for someone I know"],
    ]),
    otherKey: "humorExamples",
    otherLabel: "Creators or examples (optional)",
  },
  {
    id: "usualIntensity",
    key: "usualIntensity",
    title: "What's your usual level?",
    type: "single",
    optional: true,
    description: "A starting point. You can change this for every outing.",
    options: options([
      ["chill", "Chill — start easily"],
      ["bold", "Bold — step into the moment"],
      ["full_send", "Full Send — commit to the setup"],
      ["depends", "Depends on the group"],
    ]),
  },
  {
    id: "role",
    key: "role",
    title: "What's your role?",
    type: "single",
    optional: true,
    options: options([
      ["main_character", "Main character"],
      ["mastermind", "Mastermind"],
      ["camera_person", "Camera person"],
      ["rotate", "Rotate me around"],
    ]),
  },
  {
    id: "approach",
    key: "approach",
    title: "How do you feel about approaching new people?",
    type: "single",
    optional: true,
    options: options([
      ["group_only", "Keep it within my group"],
      ["invitation", "Comfortable with a clear invitation"],
      ["conversation", "Happy to start conversations"],
      ["depends", "Depends on the situation"],
    ]),
  },
  {
    id: "preparation",
    key: "preparation",
    title: "How much preparation sounds fun?",
    type: "single",
    optional: true,
    options: options([
      ["start_now", "Start now"],
      ["a_few_things", "Collect a few things"],
      ["proper_setup", "Organize a proper setup"],
      ["varies", "Varies"],
    ]),
  },
  {
    id: "skills",
    key: "skills",
    title: "What interests or skills can we build around?",
    description:
      "Enjoying something and having a skill are different. Choose either, both, or leave them unknown.",
    type: "multi",
    optional: true,
    options: options([
      ["sports", "Sports"],
      ["music", "Music"],
      ["comedy", "Comedy"],
      ["cooking", "Cooking"],
      ["making", "Making or designing things"],
      ["games", "Games"],
      ["local_knowledge", "Local knowledge"],
      ["none", "No special skill needed"],
    ]),
    otherKey: "otherSkill",
    otherLabel: "Another skill (optional)",
  },
  {
    id: "sharing",
    key: "sharing",
    title: "Where might your reel go?",
    type: "single",
    optional: true,
    description:
      "This never authorizes publication. You decide after seeing the video.",
    options: options([
      ["public", "Public socials"],
      ["friends", "Friends only"],
      ["private", "My private journal"],
      ["decide_later", "Decide after I see it"],
    ]),
  },
  {
    id: "exclusions",
    key: "exclusions",
    title: "What should we leave out?",
    type: "multi",
    optional: true,
    noneLabel: "No preferences yet",
    description:
      "These are firm boundaries until you change them. Leave blank for no preferences yet.",
    options: options([
      ["alcohol", "Alcohol"],
      ["adult_venues", "Adult venues"],
      ["public_performance", "Public performance"],
      ["physical_challenges", "Physical challenges"],
      ["food_challenges", "Food challenges"],
      ["travel_outside_area", "Travel outside my area"],
      ["strangers", "Strangers"],
      ["being_surprised", "Being the person surprised"],
    ]),
    otherKey: "otherExclusion",
    otherLabel:
      "Another boundary (optional; needs review before recommendations)",
  },
];
export const surveyQuestions = SURVEY_QUESTIONS;

export function setPreferenceAnswer<K extends PreferenceKey>(
  preferences: Preferences,
  key: K,
  value: Preferences[K],
  source: PreferenceSource,
): Preferences {
  if (key === "ageBand" && source !== "survey")
    throw new Error("Choose your age group directly in account preferences.");
  const current = normalizePreferences(preferences);
  let answer = value;
  const neutral =
    key === "premises" ? "not_sure" : key === "skills" ? "none" : null;
  if (
    neutral &&
    Array.isArray(answer) &&
    answer.length > 1 &&
    (answer as string[]).includes(neutral)
  ) {
    answer = (
      (answer as string[]).at(-1) === neutral
        ? [neutral]
        : (answer as string[]).filter((item) => item !== neutral)
    ) as Preferences[K];
  }
  const sources = { ...current.sources };
  if (answer === null || answer === "") delete sources[key];
  else sources[key] = source;
  return preferencesSchema.parse({
    ...current,
    [key]: answer,
    sources,
    legacyUnconfirmed: current.legacyUnconfirmed.filter((item) => item !== key),
  });
}

export function resetPreferenceAnswer(
  preferences: Preferences,
  key: PreferenceKey,
): Preferences {
  return setPreferenceAnswer(
    preferences,
    key,
    DEFAULT_PREFERENCES[key],
    "survey",
  );
}

/** Review only saved structured answers; imported text never creates a claim. */
export function preferenceChips(preferences: Preferences): string[] {
  preferences = normalizePreferences(preferences);
  const chips: string[] = [];
  if (preferences.humor?.includes("elaborate_setups"))
    chips.push("Enjoys elaborate setups");
  if (preferences.humor?.includes("skill_reveals"))
    chips.push("Enjoys skill reveals");
  if (preferences.humor?.includes("absurd"))
    chips.push("Enjoys absurd situations");
  const roles = {
    mastermind: "Prefers the mastermind role",
    camera_person: "Prefers the camera role",
    main_character: "Prefers the main character role",
    rotate: "Happy to rotate roles",
  };
  if (preferences.role) chips.push(roles[preferences.role]);
  if (preferences.approach === "group_only")
    chips.push("Keeps it within the group");
  if (preferences.preparation === "start_now") chips.push("Likes to start now");
  if (preferences.preparation === "proper_setup")
    chips.push("Enjoys a proper setup");
  const exclusions = {
    alcohol: "No alcohol",
    adult_venues: "No adult venues",
    public_performance: "No public performance",
    physical_challenges: "No physical challenges",
    food_challenges: "No food challenges",
    travel_outside_area: "Stays in the area",
    strangers: "No strangers",
    being_surprised: "Not the surprise target",
  };
  // Boundaries take precedence in the compact review so they never disappear behind interest chips.
  for (const interest of preferences.interests || []) {
    const label = INTEREST_OPTIONS.find(
      (option) => option.value === interest,
    )?.label;
    if (label) chips.push(`Interested in ${label.toLowerCase()}`);
  }
  for (const skill of preferences.skills || []) {
    if (skill === "none") continue;
    chips.push(
      `Skill: ${SURVEY_QUESTIONS.find((question) => question.key === "skills")!.options.find((option) => option.value === skill)!.label}`,
    );
  }
  // Every answer type has a representation, including explicit neutral choices.
  // These labels report what was chosen without claiming every field affects rank.
  const remainingHumor = {
    friendly_awkward: "Enjoys awkward but friendly encounters",
    competitive: "Enjoys competitive humor among friends",
    surprises: "Enjoys surprises for someone they know",
  };
  for (const [value, label] of Object.entries(remainingHumor))
    if (preferences.humor?.includes(value as never)) chips.push(label);
  for (const category of preferences.categories || [])
    chips.push(
      `Interested in ${SURVEY_QUESTIONS[0].options.find((option) => option.value === category)!.label}`,
    );
  const participation = {
    fan_club: "Would organize a fan club for a friend",
    open_mic: "Would perform at an open mic",
    secret_expert: "Would bring a secret expert to game night",
    mystery_date: "Would take a mystery date",
    meal_challenge: "Would host an earn-your-meal challenge",
    spontaneous: "Would try something spontaneous",
    not_sure: "Participation still undecided",
  };
  for (const premise of preferences.premises || [])
    chips.push(participation[premise]);
  if (preferences.approach && preferences.approach !== "group_only")
    chips.push(
      {
        invitation: "Comfortable with a clear invitation",
        conversation: "Happy to start conversations",
        depends: "Approaching people depends on the situation",
      }[preferences.approach],
    );
  if (preferences.preparation === "a_few_things")
    chips.push("Happy to collect a few things");
  if (preferences.preparation === "varies") chips.push("Preparation varies");
  if (preferences.usualIntensity)
    chips.push(
      {
        chill: "Usually chooses Chill",
        bold: "Usually chooses Bold",
        full_send: "Usually chooses Full Send",
        depends: "Usual level depends on the group",
      }[preferences.usualIntensity],
    );
  if (preferences.sharing)
    chips.push(
      {
        public: "May share on public socials",
        friends: "May share with friends",
        private: "Prefers a private journal",
        decide_later: "Will decide about sharing after seeing the reel",
      }[preferences.sharing],
    );
  if (preferences.skills?.includes("none"))
    chips.push("No special skill requested");
  if (preferences.otherSkill) chips.push(`Skill: ${preferences.otherSkill}`);
  if (preferences.humorExamples) chips.push("Humor examples saved");
  const boundaries = (preferences.exclusions || []).map(
    (value) => exclusions[value],
  );
  if (preferences.otherExclusion)
    boundaries.unshift("Custom boundary saved — needs review");
  if (preferences.exclusions?.length === 0)
    boundaries.push("No listed boundaries");
  return [...boundaries, ...chips].slice(0, 6);
}
