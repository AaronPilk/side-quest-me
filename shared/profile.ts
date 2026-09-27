import type { Preferences } from "./domain";

export const COPY_PROFILE_PROMPT = `Help me create a profile for Sidequest, an app that recommends real-world adventures, dates, social challenges, elaborate surprises, and pranks that I might actually want to perform.

Use only information genuinely available in this conversation or other context you can access. Do not invent facts or claim to remember information you cannot access.

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
  id: keyof Preferences;
  key: keyof Preferences;
  title: string;
  type: "single" | "multi";
  description?: string;
  optional: boolean;
  options: { value: string; label: string }[];
  otherKey?: keyof Preferences;
  otherLabel?: string;
  noneLabel?: string;
  selectAllLabel?: string;
}
const options = (rows: [string, string][]) =>
  rows.map(([value, label]) => ({ value, label }));
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
      ["demon", "Demon"],
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
    title: "What can we build a quest around?",
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

/** Only explicit survey answers produce review chips. Imported guesses never override these. */
export function preferenceChips(preferences: Preferences): string[] {
  const chips: string[] = [];
  if (preferences.humor.includes("elaborate_setups"))
    chips.push("Likes elaborate surprises");
  if (preferences.humor.includes("skill_reveals"))
    chips.push("Enjoys skill reveals");
  if (preferences.humor.includes("absurd"))
    chips.push("Enjoys absurd situations");
  const roles = {
    mastermind: "Usually the mastermind",
    camera_person: "Prefers filming",
    main_character: "Happy in the spotlight",
    rotate: "Happy to rotate roles",
  };
  chips.push(roles[preferences.role]);
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
  const boundaries = preferences.exclusions.map((value) => exclusions[value]);
  return [...boundaries, ...chips].slice(0, 6);
}
