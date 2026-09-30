import {
  AWARDS,
  type Category,
  type Exclusion,
  type Intensity,
  type QuestVariant,
  type Role,
  type Setting,
} from "./domain";

type Beat = QuestVariant["beats"][number];
type VariantInput = {
  intensity: Intensity;
  hook: string;
  minutes: number;
  people?: [number, number];
  beats: [Beat, Beat, Beat];
  materials: string[];
  requirements?: string[];
  settings?: Setting[];
  conflicts?: Exclusion[];
  setup?: boolean;
  volunteer?: boolean;
  minCost?: number;
  maxCost?: number;
  venueCostUnknown?: boolean;
};
type FamilyInput = {
  familyId: string;
  title: string;
  category: Category;
  people: [number, number];
  interests: string[];
  fallback: string;
  requirements: string[];
  completion: string;
  costNote?: string;
  variants: [VariantInput, VariantInput, VariantInput] | [VariantInput];
};
const beat = (
  label: string,
  action: string,
  filming: string,
  caption = label,
): Beat => ({ label, action, filming, caption });
const roleFits: Record<string, Role[]> = {
  day_pitch_swap: ["main_character", "camera_person", "rotate"],
  day_tiny_discovery: ["mastermind", "camera_person", "rotate"],
  night_pocket_radio: ["main_character", "camera_person", "rotate"],
  date_pit_crew: ["mastermind", "camera_person"],
  date_menu_draft: ["main_character", "rotate"],
  day_secret_expert: ["mastermind", "camera_person"],
  day_absurd_commercial: ["main_character", "camera_person", "rotate"],
  night_itinerary_draft: ["mastermind", "rotate"],
  night_karaoke_bench: ["main_character", "camera_person"],
  street_meal_choice: ["mastermind", "camera_person"],
  street_make_us_break: ["main_character", "rotate"],
  demon_surprise_fanclub: ["mastermind", "camera_person"],
  demon_friends_write_set: ["main_character", "rotate"],
};
function family(input: FamilyInput): QuestVariant[] {
  return input.variants.map((v) => ({
    id: `${input.familyId}_${v.intensity}_v1`,
    familyId: input.familyId,
    version: 1,
    title: input.title,
    category: input.category,
    intensity: v.intensity,
    hook: v.hook,
    durationMinutes: v.minutes,
    minParticipants: (v.people ?? input.people)[0],
    maxParticipants: (v.people ?? input.people)[1],
    cost: {
      minMinor: v.minCost ?? 0,
      maxMinor: v.maxCost ?? 0,
      currency: "USD",
      scope: "total",
      venueCostUnknown: v.venueCostUnknown ?? true,
      note:
        input.costNote ??
        "Use supplies you already own. Purchases are optional. At a venue, confirm the complete group charge; your travel estimate is added separately.",
    },
    settings: v.settings ?? ["home", "venue"],
    interests: input.interests,
    roles: roleFits[input.familyId],
    preparation:
      v.setup || v.intensity === "full_send"
        ? "proper_setup"
        : v.intensity === "bold"
          ? "a_few_things"
          : "start_now",
    conflicts: v.conflicts ?? [],
    venuePermissionRequired: true,
    arrangementRequired: v.setup ?? v.intensity === "full_send",
    adultOnly: false,
    supportsAdultContext: input.familyId === "night_itinerary_draft",
    requiresVolunteer: v.volunteer ?? false,
    beats: v.beats,
    materials: v.materials,
    completionQuestions: [
      input.completion,
      "Did everyone shown agree to being recorded, or did you use your own props and an honest private recap?",
      "Did you make the agreed attempt without pressuring anyone to continue?",
    ],
    fallback: input.fallback,
    requirements: [...input.requirements, ...(v.requirements ?? [])],
    award: { ...AWARDS[v.intensity] },
    cooldownDays: 30,
  }));
}

export const catalog: QuestVariant[] = [
  ...family({
    familyId: "date_pit_crew",
    title: "Your Date Has a Pit Crew",
    category: "date_night",
    people: [2, 6],
    interests: ["mystery_date", "elaborate_setups", "surprises", "making"],
    requirements: [
      "Both partners agree to a playful outing. This is not an unsuspecting first date.",
      "Staff join only by prior agreement. Keep paths clear and reveals brief.",
    ],
    completion:
      "Did the agreed coaching or pit-crew reveal happen, even if the reaction was quiet?",
    fallback:
      "Make one elaborate stop at home. Friends can send coaching messages in advance; a homemade welcome, water, and an existing snack are enough.",
    variants: [
      {
        intensity: "chill",
        hook: "Two secret coaching messages. One couple trying to make the right call.",
        minutes: 30,
        materials: ["Two messages from willing friends", "Paper or a phone"],
        beats: [
          beat(
            "Setup",
            "Each partner asks a friend for a secret suggestion for an at-home snack or next free walking stop. Confirm both options fit your plans.",
            "Record the two unopened messages without showing private chats.",
          ),
          beat(
            "The Moment",
            "Open the two suggestions together and make your case for the better choice.",
            "Capture the conflicting advice and each partner choosing a side.",
          ),
          beat(
            "Payoff",
            "Choose an option together, then give the coaching a very serious rating.",
            "Record your decision and genuine reaction—even if both suggestions lose.",
          ),
        ],
      },
      {
        intensity: "bold",
        hook: "Your next date stop comes with two friends taking support far too seriously.",
        minutes: 45,
        people: [4, 6],
        setup: true,
        materials: [
          "Two willing friends",
          "Water already available",
          "A homemade conversation scorecard",
        ],
        beats: [
          beat(
            "Setup",
            "Ask two friends to prepare a one-minute pit stop at home or another approved spot. Give them a welcome line and water.",
            "Film the crew practicing its best over-serious welcome.",
          ),
          beat(
            "The Moment",
            "Arrive with your partner. The crew presents water and an “excellent conversation” board, then clears the space.",
            "Capture the planned arrival without blocking a doorway.",
          ),
          beat(
            "Payoff",
            "Let your partner review the crew’s performance. No reaction is owed.",
            "Film the first real reaction and a quick crew sign-off.",
          ),
        ],
      },
      {
        intensity: "full_send",
        hook: "A supporting cast turns a simple date into a three-stop championship.",
        minutes: 75,
        people: [4, 6],
        setup: true,
        materials: [
          "Two or more willing crew members",
          "Homemade welcome and finish signs",
          "An existing snack or dessert",
        ],
        requirements: [
          "Arrange all three moments before accepting; friends and any venue must agree to the plan.",
        ],
        beats: [
          beat(
            "Setup",
            "Plan a welcome, a dessert reveal, and a private finish-line photo. Use existing food and home space, or confirm all venue charges.",
            "Record the crew huddle and the planned sequence.",
          ),
          beat(
            "The Moment",
            "Run the biggest approved surprise stop. Let the couple enjoy it without repeated takes.",
            "Film the dessert or welcome reveal from a clear, agreed spot.",
          ),
          beat(
            "Payoff",
            "The couple crosses the homemade finish line and judges this deeply unnecessary operation.",
            "Capture their real reaction and the crew celebrating.",
          ),
        ],
      },
    ],
  }),
  ...family({
    familyId: "date_menu_draft",
    title: "The Menu Is Out of Your Hands",
    category: "date_night",
    people: [2, 6],
    interests: ["mystery_date", "competitive", "absurd", "cooking"],
    requirements: [
      "Everyone names allergies, dietary boundaries, and vetoes first. No hidden ingredients or blindfolds.",
      "Keep neighboring diners out of frame. Special service or staff filming needs venue approval.",
    ],
    completion:
      "Did everyone make an agreed draft pick and give an honest verdict?",
    fallback:
      "Draft snacks or ingredients already at home. Three existing course choices and a homemade board can carry the whole event.",
    variants: [
      {
        intensity: "chill",
        hook: "Draft the snacks you already have like the championship depends on it.",
        minutes: 30,
        materials: [
          "At least two snacks already available",
          "Paper for the draft order",
        ],
        beats: [
          beat(
            "Setup",
            "Lay out available snacks, agree on vetoes, and choose the draft order.",
            "Give the snack candidates a dramatic close-up.",
          ),
          beat(
            "The Moment",
            "Each person announces a pick with a ten-second explanation of its supposed greatness.",
            "Record the most committed selection speech.",
          ),
          beat(
            "Payoff",
            "Try your own approved selection and rate the draft strategy.",
            "Capture a first-bite verdict or an honest recap if someone prefers not to eat on camera.",
          ),
        ],
      },
      {
        intensity: "bold",
        hook: "Two friends commentate a dinner draft at a completely reasonable volume.",
        minutes: 45,
        people: [4, 6],
        materials: [
          "Two willing commentators",
          "An existing meal or a confirmed actual menu",
          "Homemade draft board",
        ],
        beats: [
          beat(
            "Setup",
            "Confirm the total cost and dietary choices. Assign two friends as commentators and draw a small draft board.",
            "Film the board and the commentators stating their predictions.",
          ),
          beat(
            "The Moment",
            "The couple drafts a starter and dessert while friends commentate at normal table volume.",
            "Capture the decisive pick, keeping other tables out of frame.",
          ),
          beat(
            "Payoff",
            "Let each diner give a verdict on the selection and the commentary.",
            "Record the partner’s verdict and the commentators receiving their review.",
          ),
        ],
      },
      {
        intensity: "full_send",
        hook: "Three courses, a fixed ceiling, and a championship dessert nobody can take seriously.",
        minutes: 60,
        setup: true,
        materials: [
          "Three approved course choices",
          "A homemade championship dessert presentation",
          "Willing friends",
        ],
        requirements: [
          "Confirm the course choices, dietary requirements, final price, and any special service before starting.",
        ],
        beats: [
          beat(
            "Setup",
            "Arrange three existing courses at home or fixed choices with a willing venue. Friends prepare a championship dessert reveal.",
            "Show the approved menu board and presentation rehearsal.",
          ),
          beat(
            "The Moment",
            "Run the final course pick with full draft-night commitment.",
            "Film the final pick and the diner’s reasoning.",
          ),
          beat(
            "Payoff",
            "Friends present the championship dessert. Let the diners decide whether the hype was justified.",
            "Capture the reveal and unprompted reaction.",
          ),
        ],
      },
    ],
  }),
  ...family({
    familyId: "day_secret_expert",
    title: "The Secret Teammate",
    category: "daytime",
    people: [3, 8],
    interests: [
      "secret_expert",
      "skill_reveals",
      "competitive",
      "games",
      "sports",
    ],
    requirements: [
      "Everyone agrees that a playful skill surprise may happen. No wagers, fake credentials, dangerous mismatch, or humiliation.",
      "Choose an accessible game and let anyone stop. Commercial-location filming needs approval.",
    ],
    completion:
      "Did the skilled friend reveal their real background and attempt the demonstration or game?",
    fallback:
      "Use a familiar tabletop game at home. If the trick fails, reveal the secret anyway and teach the group one useful move.",
    variants: [
      {
        intensity: "chill",
        hook: "One clumsy attempt. Then your friend shows what they actually know.",
        minutes: 30,
        materials: [
          "A friend with a genuine skill",
          "Equipment already owned for a safe tabletop skill",
        ],
        beats: [
          beat(
            "Setup",
            "Choose a real skill such as chess or card handling. The skilled friend makes one playful clumsy attempt; the group knows a surprise is possible.",
            "Film the attempt and the group’s friendly predictions.",
          ),
          beat(
            "The Moment",
            "The friend makes an honest attempt at their real skill. A missed trick still counts.",
            "Capture the demonstration in one clear shot.",
          ),
          beat(
            "Payoff",
            "Reveal the friend’s actual experience and teach everyone a small piece of the skill.",
            "Film the explanation and group reaction.",
          ),
        ],
      },
      {
        intensity: "bold",
        hook: "A friendly game gets a very different second round.",
        minutes: 60,
        materials: [
          "A willing skilled teammate",
          "A game and equipment already available",
        ],
        beats: [
          beat(
            "Setup",
            "Agree to a short accessible game, with no bets. Let everyone know one player has a playful surprise background.",
            "Film ordinary introductions and confident predictions.",
          ),
          beat(
            "The Moment",
            "Play a real round, then reveal the skilled participant’s experience. Nobody needs to lose on purpose.",
            "Capture one authentic impressive attempt.",
          ),
          beat(
            "Payoff",
            "Finish with handshakes, the real backstory, and a shared tip.",
            "Record the group’s reaction and the expert’s explanation.",
          ),
        ],
      },
      {
        intensity: "full_send",
        hook: "A tiny tournament, a homemade trophy, and one very unexpected contender.",
        minutes: 90,
        setup: true,
        materials: [
          "Three or more willing players",
          "A homemade trophy",
          "An existing accessible game",
        ],
        beats: [
          beat(
            "Setup",
            "Arrange a short tournament and a genuine expert reveal. Tell players beforehand that one guest has a surprise background; agree there are no wagers.",
            "Capture earnest player introductions beside the homemade trophy.",
          ),
          beat(
            "The Moment",
            "Let the expert play honestly, then reveal their real experience at the planned moment.",
            "Film a clear skill attempt or the moment the background is announced.",
          ),
          beat(
            "Payoff",
            "Award the silly trophy to the actual winner, then end with a short lesson for everyone.",
            "Capture trophy reactions and the group learning together.",
          ),
        ],
      },
    ],
  }),
  ...family({
    familyId: "day_absurd_commercial",
    title: "The Most Overproduced Commercial",
    category: "daytime",
    people: [2, 6],
    interests: [
      "spontaneous",
      "absurd",
      "elaborate_setups",
      "making",
      "comedy",
    ],
    requirements: [
      "Use an ordinary object you own. No implied sponsorship, false health claims, unsafe stunts, road filming, or trespass.",
      "All action stays stationary or at walking pace.",
    ],
    completion:
      "Did you make the promised commercial shot and reveal the ordinary product?",
    fallback:
      "Use a window, an ordinary object, and a living-room premiere. Existing supplies are enough.",
    variants: [
      {
        intensity: "chill",
        hook: "Give the most ordinary thing you own an absurdly serious launch.",
        minutes: 30,
        settings: ["home", "outside", "venue"],
        materials: [
          "An ordinary object you own",
          "A window or good natural light",
        ],
        beats: [
          beat(
            "Setup",
            "Choose something ordinary: a battered cooler, an old mug, or a sandwich. Invent an obviously comic pitch with no misleading claims.",
            "Record a dramatic close-up in good light.",
          ),
          beat(
            "The Moment",
            "Perform an over-serious ceremonial handoff of the object.",
            "Film the handoff without moving into roads or other people’s space.",
          ),
          beat(
            "Payoff",
            "Give a very serious owner testimonial, then let yourself break character.",
            "Capture the object reveal and honest laugh or deadpan ending.",
          ),
        ],
      },
      {
        intensity: "bold",
        hook: "Your crew has a director, a star, and a product nobody asked for.",
        minutes: 45,
        people: [3, 6],
        settings: ["home", "outside", "venue"],
        materials: [
          "An object already owned",
          "A willing director, performer, and camera person",
        ],
        beats: [
          beat(
            "Setup",
            "Assign director, performer, and camera roles. Plan one stationary hero shot for your very ordinary product.",
            "Film the makeshift production meeting.",
          ),
          beat(
            "The Moment",
            "Commit to one extravagantly serious hero shot. All stunts are limited to standing or walking safely.",
            "Capture the best stationary product shot.",
          ),
          beat(
            "Payoff",
            "Reveal what the production was actually selling, then ask the cast for a review.",
            "Film the product reveal and cast reaction.",
          ),
        ],
      },
      {
        intensity: "full_send",
        hook: "Invite a tiny audience to the premiere of the world’s least necessary commercial.",
        minutes: 75,
        people: [4, 6],
        setup: true,
        materials: [
          "A homemade premiere poster",
          "An existing object",
          "A small willing audience",
        ],
        beats: [
          beat(
            "Setup",
            "Arrange a living-room mini premiere, a homemade poster, and an audience who agrees to the surprise. Keep the actual product concealed.",
            "Record the earnest premiere introduction.",
          ),
          beat(
            "The Moment",
            "Perform or screen your best stationary commercial shot with complete confidence.",
            "Capture the hero shot that makes the object look spectacular.",
          ),
          beat(
            "Payoff",
            "Reveal the ordinary product to your willing audience and take their real reviews.",
            "Film the audience discovering what all that production was for.",
          ),
        ],
      },
    ],
  }),
  ...family({
    familyId: "night_itinerary_draft",
    title: "The After-Dark Draft",
    category: "late_night",
    people: [2, 6],
    interests: [
      "spontaneous",
      "mystery_date",
      "competitive",
      "local_knowledge",
      "music",
    ],
    requirements: [
      "Confirm actual hours, admission, and round-trip transport. No place is assumed open or participating.",
      "Adult venues require explicit age eligibility, group opt-in, and venue permission. Never record performers or make alcohol a challenge.",
    ],
    completion:
      "Did your group make the agreed draft and try the feasible plan, including an honest closed-stop fallback?",
    fallback:
      "If every stop is closed, draft food already at home and make the collapsed plan the payoff. Do not claim you visited a closed venue.",
    variants: [
      {
        intensity: "chill",
        hook: "Two late-snack finalists. One deeply unnecessary selection process.",
        minutes: 45,
        settings: ["home", "venue"],
        materials: ["Two available snack choices", "Paper for nominations"],
        beats: [
          beat(
            "Setup",
            "Nominate two snacks already at home or two confirmed open choices that fit your full budget.",
            "Record the nominations and arguments for each.",
          ),
          beat(
            "The Moment",
            "Draw the finalists and choose one. If heading out, use the transport you agreed and respect venue filming rules.",
            "Film the winning snack or permitted arrival without bystanders.",
          ),
          beat(
            "Payoff",
            "Give the snack its final verdict. If the plan collapsed, explain it honestly over something already available.",
            "Capture the first-bite verdict or the group judging its failed planning.",
          ),
        ],
      },
      {
        intensity: "bold",
        hook: "Food, then music. Your group’s budget keeper gets a veto.",
        minutes: 90,
        setup: true,
        materials: [
          "Two confirmed activities or at-home stations",
          "A written all-in budget and transport plan",
        ],
        beats: [
          beat(
            "Setup",
            "Draft two feasible stops, such as food and permitted music. At home, make two distinct stations with existing supplies. Agree the full cost and a budget keeper.",
            "Film the winning route and budget keeper’s terms.",
          ),
          beat(
            "The Moment",
            "Try stop one. Replace a closed stop only with an agreed alternative within the original limits.",
            "Capture a permitted moment or your own arrival recap.",
          ),
          beat(
            "Payoff",
            "Finish the second stop and let everyone judge the draft.",
            "Record the group’s final verdict away from bystanders.",
          ),
        ],
      },
      {
        intensity: "full_send",
        hook: "Three planned stops. Everyone approves the type and cost; the final place stays secret.",
        minutes: 120,
        setup: true,
        materials: [
          "Three confirmed stops or at-home stations",
          "An envelope for the final reveal",
          "An agreed transport plan",
        ],
        requirements: [
          "Confirm all stops, costs, permissions, and transport before acceptance. No surprise adult context.",
        ],
        beats: [
          beat(
            "Setup",
            "Arrange three stops or at-home stations. Everyone approves the activity types and total cost; only the final location may stay hidden.",
            "Record the final-stop envelope and the agreed outline.",
          ),
          beat(
            "The Moment",
            "Open the envelope at the planned moment and head to the confirmed stop.",
            "Film the reveal or permitted entrance, never adult performers.",
          ),
          beat(
            "Payoff",
            "Afterward, ask whether the secret final stop earned its place in the draft.",
            "Record reactions privately or outside the venue with no bystanders.",
          ),
        ],
      },
    ],
  }),
  ...family({
    familyId: "night_karaoke_bench",
    title: "The Karaoke Bench",
    category: "late_night",
    people: [3, 8],
    interests: ["music", "elaborate_setups", "absurd", "friendly_awkward"],
    requirements: [
      "The singer approves the song, performance, and filming. Use home or a private room unless an organizer has approved a real slot.",
      "Use music you have permission to record/export or mute the reel. Keep aisles clear and respect mobility alternatives.",
    ],
    completion:
      "Did the willing singer perform and the support crew deliver the agreed welcome or celebration?",
    fallback:
      "Use your own room and a song you are allowed to record, or a spoken performance. The support team supplies the spectacle.",
    variants: [
      {
        intensity: "chill",
        hook: "One home chorus. Two friends scoring it like an Olympic final.",
        minutes: 30,
        materials: ["A willing singer", "Two homemade scorecards"],
        beats: [
          beat(
            "Setup",
            "Agree a song or spoken performance and export permissions. Two friends prepare wildly serious scorecards.",
            "Film the bench preparing and debating its scoring criteria.",
          ),
          beat(
            "The Moment",
            "The willing singer performs one short chorus or spoken excerpt.",
            "Record the approved excerpt; mute later if recording rights are unclear.",
          ),
          beat(
            "Payoff",
            "Reveal the scorecards and let the singer rate the judges.",
            "Capture the scores and singer’s real reaction.",
          ),
        ],
      },
      {
        intensity: "bold",
        hook: "A private-room singer gets an entrance worthy of a championship team.",
        minutes: 60,
        setup: true,
        materials: [
          "A private room or home space",
          "Willing support team",
          "Small homemade signs",
        ],
        beats: [
          beat(
            "Setup",
            "Arrange one synchronized entrance in your own space. Agree the song, movement alternatives, and post-song celebration.",
            "Film the team huddle and the overly serious plan.",
          ),
          beat(
            "The Moment",
            "Give the singer the agreed entrance and space to perform.",
            "Capture the entrance and a permitted short performance excerpt.",
          ),
          beat(
            "Payoff",
            "Celebrate briefly, then ask the singer whether this support was remotely helpful.",
            "Record the singer’s reaction afterward.",
          ),
        ],
      },
      {
        intensity: "full_send",
        hook: "A scheduled singer discovers just how seriously their bench takes the job.",
        minutes: 90,
        setup: true,
        conflicts: ["public_performance"],
        materials: [
          "A confirmed scheduled slot or private room",
          "Small signs",
          "A willing support team",
        ],
        requirements: [
          "A public version needs an accepted slot and organizer approval. At home or in your own private room, prepare the same entrance.",
        ],
        beats: [
          beat(
            "Setup",
            "Confirm the exact slot and filming rules, or arrange your private-room version. Rehearse an obviously comic welcome with clear aisles and appropriate volume.",
            "Film preparation in an approved area.",
          ),
          beat(
            "The Moment",
            "Deliver the coordinated entrance for the willing singer’s one scheduled turn.",
            "Record the permitted entrance; keep unrelated guests and performers out of frame.",
          ),
          beat(
            "Payoff",
            "Let the singer greet the bench and review its unnecessary commitment.",
            "Capture the greeting and honest post-performance reaction.",
          ),
        ],
      },
    ],
  }),
  ...family({
    familyId: "street_meal_choice",
    title: "Pick Your Challenge, Get Your Meal",
    category: "street_challenges",
    people: [3, 6],
    interests: ["meal_challenge", "games", "local_knowledge", "skill_reveals"],
    costNote:
      "Reserve $10–$30 total for the promised meal; choose a real option within that cap before inviting anyone. An honest attempt earns it. Travel and any venue charge are additional.",
    requirements: [
      "Two organizers invite one willing adult. Never target someone because they appear hungry, homeless, distressed, intoxicated, or financially vulnerable.",
      "Explain the finite meal offer first. A genuine attempt earns it; recording and publication are never conditions. Provide a nonphysical alternative.",
      "Confirm dietary options and a real meal price before acceptance. Withdrawal of filming consent never cancels the meal.",
    ],
    completion:
      "Did a willing adult make an honest attempt and receive the promised meal, regardless of performance or filming permission?",
    fallback:
      "Use a prearranged willing friend in private. If nobody wants to participate, stop or abandon; do not pressure anyone or claim a meal handoff happened.",
    variants: [
      {
        intensity: "chill",
        hook: "A volunteer chooses trivia or a harmless skill. A real attempt earns the meal.",
        minutes: 30,
        minCost: 1000,
        maxCost: 3000,
        volunteer: true,
        settings: ["home", "venue"],
        materials: [
          "A real organizer-funded meal option",
          "A trivia question and a nonphysical skill alternative",
        ],
        beats: [
          beat(
            "Setup",
            "Explain the meal cap, dietary options, and choice of trivia or a comfortable skill. State clearly that an honest attempt earns the meal and filming is optional.",
            "Record the organizer explaining the real choices.",
          ),
          beat(
            "The Moment",
            "Let the adult volunteer choose and attempt. Wrong answers and incomplete attempts still qualify.",
            "With permission, film the attempt; otherwise film your own honest recap.",
          ),
          beat(
            "Payoff",
            "Provide the promised meal without asking for recording or publication rights in return.",
            "Film a permitted handoff, meal-only close-up, or private organizer recap.",
          ),
        ],
      },
      {
        intensity: "bold",
        hook: "Three questions, a harmless trick shot, or a quick talent. The volunteer calls it.",
        minutes: 45,
        minCost: 1000,
        maxCost: 3000,
        volunteer: true,
        materials: [
          "A meal with confirmed price and dietary options",
          "Three trivia questions",
          "A harmless optional skill challenge",
        ],
        beats: [
          beat(
            "Setup",
            "Offer the meal and a choice of three trivia questions, a harmless trick shot, or a quick talent. Give a fully nonphysical option.",
            "Film your explanation of the choices and guaranteed attempt reward.",
          ),
          beat(
            "The Moment",
            "Let the volunteer attempt the chosen option and stop freely.",
            "Record only with permission, or film your own account of the attempt.",
          ),
          beat(
            "Payoff",
            "Give the promised meal after a genuine attempt, even if every answer was wrong.",
            "Capture an optional reaction or a meal-only close-up.",
          ),
        ],
      },
      {
        intensity: "full_send",
        hook: "A tiny game show, one prearranged volunteer, and a genuinely prepaid meal.",
        minutes: 60,
        setup: true,
        minCost: 1000,
        maxCost: 3000,
        volunteer: true,
        materials: [
          "A real prepaid meal or meal voucher from its actual provider",
          "A homemade choice board",
          "Willing friends and one prearranged adult volunteer",
        ],
        requirements: [
          "Verify the prepaid meal instrument works; never fabricate a provider or voucher. A stationed venue setup needs permission.",
        ],
        beats: [
          beat(
            "Setup",
            "Arrange the volunteer, prepaid meal, choices, and location permission. Build a small game-show board with a nonphysical option.",
            "Record the volunteer choosing, if permitted, or the organizer presenting the board.",
          ),
          beat(
            "The Moment",
            "Run one short suspenseful round. Keep spectators optional and paths open.",
            "Film the consented attempt or your own recap without the volunteer.",
          ),
          beat(
            "Payoff",
            "Reveal and hand over the genuine prepaid meal, regardless of the result.",
            "Capture the meal reveal or private organizer reaction.",
          ),
        ],
      },
    ],
  }),
  ...family({
    familyId: "street_make_us_break",
    title: "Make Us Break",
    category: "street_challenges",
    people: [3, 6],
    interests: ["comedy", "friendly_awkward", "competitive", "absurd"],
    requirements: [
      "Agree to participation before recording. No insults, touching, sexual solicitation, chasing, or provocation.",
      "The default is a no-prize round. If you separately promise a prize, guarantee it for an honest attempt and confirm its cost before proceeding.",
    ],
    completion:
      "Did a willing participant attempt their chosen joke, impression, or skill and receive any promised prize?",
    fallback:
      "Play with willing friends in private. An unbroken straight face is a valid ending. Thank everyone; do not pressure a stranger.",
    variants: [
      {
        intensity: "chill",
        hook: "Three friends. Ten seconds each. One increasingly fragile straight face.",
        minutes: 20,
        materials: ["Three willing friends, including the straight-face judge"],
        beats: [
          beat(
            "Setup",
            "Agree who judges and which friends want a turn. Each chooses their own harmless joke, impression, or skill.",
            "Record the organizer explaining the no-prize round.",
          ),
          beat(
            "The Moment",
            "Give each willing friend a short attempt. No touching, private disclosures, or unwanted teasing.",
            "Film the best consented attempt.",
          ),
          beat(
            "Payoff",
            "Show whether the organizer broke. Thank everyone whether the face held or collapsed.",
            "Capture the real reaction and the group’s verdict.",
          ),
        ],
      },
      {
        intensity: "bold",
        hook: "One willing adult chooses their act. Your job is to survive it with a straight face.",
        minutes: 30,
        volunteer: true,
        conflicts: ["strangers"],
        materials: ["One willing adult volunteer", "A clear opt-in invitation"],
        beats: [
          beat(
            "Setup",
            "Make one respectful invitation in an approved setting. Explain the no-prize round, choices, and separate filming permission. A refusal ends the invitation.",
            "Film the organizer explaining the choice or a consented category pick.",
          ),
          beat(
            "The Moment",
            "Let the volunteer deliver their chosen joke, impression, or harmless skill.",
            "Capture only the permitted attempt; use a private recap if filming is declined.",
          ),
          beat(
            "Payoff",
            "Let your face tell the truth and thank the volunteer. Any separately promised prize is owed for the genuine attempt.",
            "Film your own real reaction.",
          ),
        ],
      },
      {
        intensity: "full_send",
        hook: "A very serious panel meets one prearranged talent it is not prepared for.",
        minutes: 45,
        people: [4, 6],
        setup: true,
        volunteer: true,
        materials: [
          "Three willing panelists",
          "One prearranged adult volunteer",
          "A homemade panel sign",
        ],
        beats: [
          beat(
            "Setup",
            "Arrange a private or approved mini panel and one volunteer with a chosen harmless talent. Keep the round under two minutes.",
            "Film the panel’s deadpan introduction.",
          ),
          beat(
            "The Moment",
            "Give the volunteer the agreed space for one performance. Keep an exit clear and spectators optional.",
            "Record the performance with permission, or film a panelist’s recap.",
          ),
          beat(
            "Payoff",
            "Break character and applaud, even if the panel never laughed.",
            "Capture the panel’s final reaction and thanks.",
          ),
        ],
      },
    ],
  }),
  ...family({
    familyId: "demon_surprise_fanclub",
    title: "Your Friend Has Fans",
    category: "demon",
    people: [4, 10],
    interests: [
      "fan_club",
      "surprises",
      "elaborate_setups",
      "absurd",
      "making",
    ],
    requirements: [
      "The featured friend agrees to a playful surprise outing. Celebrate only a harmless, ordinary achievement.",
      "No fake press/security, fake credentials, following strangers, grabbing, obstruction, or jokes about private pain. Stop at any discomfort.",
      "Ask about export permission after the reveal; recording and public sharing are distinct.",
    ],
    completion:
      "Did the agreed fan-club reveal happen and end promptly, with the featured friend free to leave?",
    fallback:
      "Use a private room and homemade signs. Keep the celebration short and let the friend decline filming or publication.",
    variants: [
      {
        intensity: "chill",
        hook: "Your friend answered the group chat. The fans have been waiting for this moment.",
        minutes: 30,
        setup: true,
        conflicts: ["being_surprised"],
        materials: [
          "Two homemade signs",
          "A friend who agreed to a playful surprise",
          "Two willing fans",
        ],
        beats: [
          beat(
            "Setup",
            "Choose an innocuous achievement. Two friends prepare signs in a private space while another brings the friend who agreed to a playful surprise.",
            "Record the fans carefully preparing their ridiculous signs.",
          ),
          beat(
            "The Moment",
            "Let the friend notice the signs and welcome them briefly.",
            "Film the reveal only under the agreed recording terms.",
          ),
          beat(
            "Payoff",
            "Explain the harmless achievement being celebrated and let the friend react naturally.",
            "Capture a willing reaction or your own honest organizer recap.",
          ),
        ],
      },
      {
        intensity: "bold",
        hook: "Four fans, four signs, and a tiny arrival line for a very ordinary legend.",
        minutes: 60,
        people: [5, 10],
        setup: true,
        conflicts: ["being_surprised"],
        materials: [
          "Four willing friends",
          "Distinct homemade fan signs",
          "A private or approved arrival space",
        ],
        beats: [
          beat(
            "Setup",
            "Arrange four friends in a short arrival line. Rehearse the welcome and leave a clear exit.",
            "Film the welcome rehearsal and each fan’s sign.",
          ),
          beat(
            "The Moment",
            "Give your friend one brief celebrity-style welcome without pretending to represent real press or security.",
            "Capture the arrival from an agreed spot without blocking the friend.",
          ),
          beat(
            "Payoff",
            "End the bit after the reveal and offer an optional group photo.",
            "Record the friend’s genuine reaction or an organizer recap.",
          ),
        ],
      },
      {
        intensity: "full_send",
        hook: "A mini premiere for an achievement that absolutely did not need one.",
        minutes: 90,
        people: [5, 10],
        setup: true,
        conflicts: ["being_surprised"],
        materials: [
          "A homemade fan-of-the-month award",
          "Willing supporting cast",
          "Approved private premiere space",
        ],
        beats: [
          beat(
            "Setup",
            "Arrange a tiny approved premiere, harmless award, and optional three-question interview. The performers agree to be the ridiculous ones.",
            "Record the fan club preparing its award and entrance.",
          ),
          beat(
            "The Moment",
            "Reveal the premiere to the friend who agreed to a playful surprise. Keep it brief and stop immediately if uncomfortable.",
            "Film the entrance reveal under the agreed recording terms.",
          ),
          beat(
            "Payoff",
            "Present the homemade award and offer, never require, a short interview.",
            "Capture the award reaction or your own honest recap if the friend declines.",
          ),
        ],
      },
    ],
  }),
  ...family({
    familyId: "demon_friends_write_set",
    title: "Your Friends Wrote Your Set",
    category: "demon",
    people: [3, 8],
    interests: ["open_mic", "comedy", "friendly_awkward", "elaborate_setups"],
    requirements: [
      "The willing performer reviews and can veto every line. No private disclosures, discriminatory abuse, invented accusations, or audience harassment.",
      "A public version requires a real accepted slot and explicit filming approval; availability is never assumed.",
    ],
    completion:
      "Did the willing performer actually deliver the approved set? Bombing counts; abandoning before performing does not.",
    fallback:
      "Choose the Chill or Bold private-gathering version if a real public slot is unavailable. A Full Send public slot cannot be invented.",
    variants: [
      {
        intensity: "chill",
        hook: "Three jokes written by your friends. You get full veto power and none of their confidence.",
        minutes: 45,
        materials: [
          "Three approved observational jokes",
          "A willing performer and two friends",
        ],
        beats: [
          beat(
            "Setup",
            "Friends write three short observational jokes. The performer reads and approves every line before anyone records.",
            "Film the joke cards without revealing private information.",
          ),
          beat(
            "The Moment",
            "The performer reads the approved jokes to the willing group.",
            "Capture one complete approved line and the immediate response.",
          ),
          beat(
            "Payoff",
            "The performer reviews the writing team. A joke bombing is a perfectly good ending.",
            "Film the group reaction and the performer’s honest verdict.",
          ),
        ],
      },
      {
        intensity: "bold",
        hook: "Your friends write a minute. You agree to deliver it to a real, willing audience.",
        minutes: 75,
        setup: true,
        conflicts: ["public_performance"],
        materials: [
          "A one-minute approved set",
          "A permitted small gathering or accepted slot",
        ],
        beats: [
          beat(
            "Setup",
            "Write and rehearse a one-minute set. Arrange a willing private gathering or confirm an actual open-mic slot and filming permission.",
            "Film the writing table and performer approving the lines.",
          ),
          beat(
            "The Moment",
            "Deliver the agreed set without changing it into attacks on the audience.",
            "Record a permitted short performance excerpt.",
          ),
          beat(
            "Payoff",
            "Rejoin the writing team and rate the material honestly.",
            "Capture the immediate reaction, including a total bomb.",
          ),
        ],
      },
      {
        intensity: "full_send",
        hook: "Two minutes. A real open mic. Every line approved; the audience response completely unknown.",
        minutes: 120,
        setup: true,
        settings: ["venue"],
        conflicts: ["public_performance"],
        materials: [
          "A confirmed real open-mic slot",
          "A two-minute approved set",
          "Organizer approval for filming",
        ],
        requirements: [
          "Confirm the actual entry or purchase charge, signup rules, slot, and filming permission before acceptance.",
        ],
        beats: [
          beat(
            "Setup",
            "Friends prepare a two-minute set; the performer reviews and vetoes freely. Confirm the actual slot, total charge, and filming position.",
            "Capture permitted backstage nerves without other performers.",
          ),
          beat(
            "The Moment",
            "The willing performer delivers the approved set during their accepted slot.",
            "Record a short permitted stage excerpt.",
          ),
          beat(
            "Payoff",
            "Meet the performer immediately afterward and hear the honest verdict.",
            "Capture the post-set reaction. Every joke failing still counts.",
          ),
        ],
      },
    ],
  }),
  ...family({
    familyId: "day_pitch_swap",
    title: "The Two-Person Pitch Swap",
    category: "daytime",
    people: [2, 2],
    interests: ["comedy", "making", "absurd", "competitive"],
    requirements: [
      "Two willing people use a space they are allowed to use. No audience, outside cast, purchase, or advance booking is required.",
      "Pitch invented uses for ordinary objects; no real product claims, private disclosures, risky demonstrations, or filming of bystanders.",
    ],
    completion:
      "Did both people deliver a one-minute pitch and respond to the agreed surprise prompt? A pitch falling apart counts.",
    fallback:
      "Stay at home and use a mug or folded paper. If performing on camera is uncomfortable, record the objects and give an honest recap after the live attempt.",
    costNote:
      "Free with two ordinary objects and paper you already own. The 45 minutes includes choosing props, preparing, two pitches, and the verdict. Optional travel is added separately.",
    variants: [
      {
        intensity: "bold",
        hook: "You have ten minutes to turn an ordinary object into a ridiculous invention. Then your partner changes the brief.",
        minutes: 45,
        settings: ["home", "outside"],
        materials: [
          "Two safe ordinary objects already owned",
          "Paper or phone notes",
          "Two willing pitch partners",
        ],
        beats: [
          beat(
            "Setup",
            "Spend ten minutes inventing a harmless new use for your object. Agree two playful prompt cards, such as ‘now pitch it to a penguin’ or ‘explain it as a weather forecast’. Each person may veto a prompt before filming.",
            "Film the ordinary props, preparation, and each person's confident prediction.",
          ),
          beat(
            "The Moment",
            "Take turns delivering a one-minute pitch while the other films or listens. Halfway through, the listener reveals one approved prompt. Keep going in the new style for twenty seconds, then swap roles.",
            "Record the prompt reveal and the performer's genuine attempt to adapt, with their permission.",
          ),
          beat(
            "Payoff",
            "Reveal the original objects and give each invention one sincere compliment and one obviously silly award. Failed improvisation is a valid ending; nobody has to repeat a take.",
            "Capture the two objects, your invented awards, and the pair's real verdict.",
          ),
        ],
      },
    ],
  }),
  ...family({
    familyId: "day_tiny_discovery",
    title: "Three Things You Never Noticed",
    category: "daytime",
    people: [1, 2],
    interests: ["local_knowledge", "making", "spontaneous"],
    requirements: [
      "Stay in your home or an outdoor area you are allowed to access. No entry into private property, purchases, or conversations with strangers are required.",
      "Film objects and textures, avoiding identifiable bystanders, house numbers, private documents, and location clues you do not want to share.",
    ],
    completion:
      "Did you find three genuine details and explain which one surprised you most?",
    fallback:
      "Do the entire trail in one room: a texture, a forgotten object, and a patch of light all count. Remain stationary if walking is unsuitable.",
    costNote:
      "No purchase needed. The 30 minutes includes choosing a small accessible area, looking for details, and filming a short personal verdict. Optional travel is additional.",
    variants: [
      {
        intensity: "chill",
        hook: "A tiny expedition through a familiar place, with three details you usually walk past.",
        minutes: 30,
        settings: ["home", "outside"],
        materials: [
          "Your phone",
          "A familiar room or small accessible outdoor area",
        ],
        beats: [
          beat(
            "Setup",
            "Choose one room or a small familiar outdoor area. Set a fifteen-minute observation window and name three things to look for: an interesting texture, a sign of change, and an overlooked object.",
            "Film yourself naming the three clues, or show a handwritten clue list.",
          ),
          beat(
            "The Moment",
            "Find one real detail for each clue. Stay within your chosen area and film only things you are allowed to show. If with a partner, each contributes at least one discovery.",
            "Capture a close-up of the discovery you almost missed and explain why it caught your attention.",
          ),
          beat(
            "Payoff",
            "Choose the most surprising discovery and explain how you had overlooked it. An ordinary detail with an honest explanation is enough.",
            "Record your final discovery and a short genuine verdict on your tiny expedition.",
          ),
        ],
      },
    ],
  }),
  ...family({
    familyId: "night_pocket_radio",
    title: "The Living-Room Radio Show",
    category: "late_night",
    people: [2, 4],
    interests: ["comedy", "music", "absurd", "friendly_awkward"],
    requirements: [
      "Everyone agrees to a short private performance. This is a fictional show recorded at home, not an actual public broadcast or a prank call.",
      "Use your own spoken words and sound effects. No commercial music, private disclosures, impersonation of real emergency services, or loud late-night noise.",
    ],
    completion:
      "Did you perform a short original show with a live handoff and respond to the agreed prompt? Awkward pauses count.",
    fallback:
      "Use quiet voices and tabletop sound effects. Film the homemade show title and record your own recap if a partner prefers to stay off camera.",
    costNote:
      "Free with household props and phone notes. The 45 minutes includes writing, a rehearsal, a short live attempt, and the closing verdict. No venue or advance arrangements are needed.",
    variants: [
      {
        intensity: "bold",
        hook: "A news desk for extremely ordinary events. Your cohost has one approved interruption up their sleeve.",
        minutes: 45,
        settings: ["home"],
        materials: [
          "Two to four willing hosts",
          "A handwritten show title",
          "Phone notes and quiet household sound-effect props",
        ],
        beats: [
          beat(
            "Setup",
            "Spend fifteen minutes making an original show: a dramatic report about an ordinary household event, an absurd weather update, and a quiet invented jingle. Agree a harmless surprise prompt and let everyone veto topics.",
            "Film the hosts preparing the title and rehearsing their over-serious introductions.",
          ),
          beat(
            "The Moment",
            "Perform the one-minute show in a single live attempt. Hand off to your cohost, who reveals the approved prompt. Improvise for twenty seconds and bring the show back on track without starting again.",
            "Capture the live handoff, prompt reveal, and genuine attempt to keep the show together.",
          ),
          beat(
            "Payoff",
            "Close the fictional show, break character, and name its best accidental moment. Nobody needs to act more embarrassed or repeat a reaction.",
            "Film the hosts' immediate verdict or your own honest recap beside the homemade title.",
          ),
        ],
      },
    ],
  }),
];

export function getQuest(id: string): QuestVariant | undefined {
  return catalog.find((quest) => quest.id === id);
}
