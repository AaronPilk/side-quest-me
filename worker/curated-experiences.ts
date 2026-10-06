import {
  effectiveBudget,
  questVariantSchema,
  type Exclusion,
  type Preferences,
  type Setting,
} from "../shared/domain";
import {
  discoveryEligibility,
  type ExperienceDiscoveryRequest,
} from "../shared/experience-discovery";
import { buildQuestRoutingBrief } from "../shared/quest-routing";
import { confirmedAgeBand } from "../shared/age-eligibility";

type PreviousExperience = { title: string; activity: string; mechanic: string };
type EditorialExperience = {
  mechanic: string;
  match: RegExp;
  allowed: boolean;
  minutes: number;
  /** Conservative planning threshold, not a current venue quote. */
  floor: number;
  title: string;
  hook: string;
  interests: string[];
  conflicts: Exclusion[];
  setup: string;
  challenge: string;
  finish: string;
  requirements: string[];
  materials: string[];
  settings?: Setting[];
  minimumPeople?: number;
  maximumPeople?: number;
  preparation?: "start_now" | "a_few_things" | "proper_setup";
  fallback?: string;
  adultOnly?: boolean;
  minimumAge?: 18 | 21;
  nightlife?: boolean;
  chargePending?: boolean;
  filming?: [string, string, string];
};
const normalizedTitle = (title: string) =>
  title
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** An honest editorial fallback, never labelled as model output or live inventory.
 * It still passes the same boundaries and preflight as a model proposal. */
export function curatedDiscoveryFallback(
  preferences: Preferences,
  request: ExperienceDiscoveryRequest,
  previousExperiences: PreviousExperience[] = [],
) {
  const outing = request.outing;
  const exclusions = new Set(preferences.exclusions ?? []);
  const routing = buildQuestRoutingBrief(preferences, outing);
  const age = confirmedAgeBand(preferences);
  const adult = age === "18_20" || age === "21_plus";
  const nightlife = routing.adultContext.nightlifeSuggestionAllowed;
  const barNight = nightlife && age === "21_plus";
  const friends = outing.group === "friends" && outing.participants >= 2;
  const adventurous =
    outing.category === "demon" || outing.category === "late_night";
  if (outing.adultContext && !nightlife) return null;
  const full = outing.intensity === "full_send";
  const bold = outing.intensity === "bold";
  const available = effectiveBudget(outing) - outing.travelCostMinor;
  const options: EditorialExperience[] = [
    {
      mechanic: "listening_party",
      match: /$a/,
      settings: ["home"],
      allowed: !full && !bold,
      minutes: 55,
      floor: 0,
      chargePending: false,
      preparation: "start_now",
      title: "One Album, One Listening Party",
      hook: "Give an album you have only heard in fragments a proper first listen, then choose the track you want someone else to hear.",
      interests: ["music", "shared_discovery"],
      conflicts: [],
      setup:
        "Choose an album under 40 minutes that you can already play legally at no extra cost and have never heard all the way through. If there are two or more of you, agree on one together. Before listening, each person predicts a favorite from the track titles. Settle somewhere comfortable with your own headphones or speaker.",
      challenge:
        "Listen in order and keep a short note of three moments you want to revisit. Pause whenever you need to; this is a listening session, not a test. With company, save your verdicts until the album ends so everybody gets their own first impression.",
      finish:
        "Replay a short section of your favorite track and explain what changed your prediction. Alone, leave yourself a voice note; with company, compare picks and choose one track for a shared playlist you already use.",
      requirements: [
        "Use music you can already access without buying anything. Choose something everyone is comfortable hearing and keep the volume considerate.",
      ],
      materials: [
        "An album you can already play",
        "Your own headphones or speaker",
      ],
      filming: [
        "Record your own prediction before the music starts; no copyrighted audio is needed in your video.",
        "Capture your reaction or notes with the music paused, keeping other people out of frame unless they agree.",
        "Film your final track pick and compare it with the opening prediction in your own words.",
      ],
      fallback:
        "If you cannot access the album, choose another one you already own or can hear free. Do not sign up or spend money to complete this plan.",
    },
    {
      mechanic: "home_cooking",
      match: /$a/,
      settings: ["home"],
      allowed: bold,
      minutes: 100,
      floor: 0,
      chargePending: false,
      preparation: "a_few_things",
      title: "Your Kitchen's One-Night Special",
      hook: "Turn ingredients you already have into a restaurant-style dish you have never cooked, then serve your own one-night special.",
      interests: ["cooking", "food", "making"],
      conflicts: [],
      setup:
        "Check your actual ingredients, equipment and dietary needs. Choose one unfamiliar recipe from a source you trust that uses what you already have and takes at most 60 minutes including preparation. Pick the dish before starting; no shopping or special equipment is part of this plan. With company, agree who handles each cooking task.",
      challenge:
        "Follow the recipe and make the dish from start to finish. Give one component your full attention: a properly cooked sauce, crisp texture or careful plating. If you are cooking together, hand off tasks clearly. Take photos only while knives and hot pans are put down.",
      finish:
        "Plate and name your one-night special, sit down to eat it, and decide what you would change on a second attempt. Compare the actual result with the recipe honestly; finish by clearing the kitchen together or on your own.",
      requirements: [
        "Proceed only with a recipe that fits your ingredients, equipment, allergies and skill. Follow its food-safety instructions; tasting is always optional.",
      ],
      materials: [
        "Ingredients and kitchen equipment you already own",
        "A suitable recipe",
      ],
      filming: [
        "Show the ingredients and name the dish you have never made before.",
        "Capture one stationary progress shot with hot equipment and knives safely set down.",
        "Reveal your plated dish in the same spot as the opening ingredients, then give your honest verdict.",
      ],
      fallback:
        "If no recipe fits what you already have, choose another experience. This zero-purchase plan does not assume a stocked kitchen or ask you to exceed your budget.",
    },
    {
      mechanic: "neighborhood_photowalk",
      match:
        /\b(?:park|garden|greenway|promenade|waterfront|historic district)\b/i,
      settings: ["outside"],
      allowed: !full && !bold,
      minutes: 45,
      floor: 0,
      chargePending: false,
      preparation: "start_now",
      title: "Your Neighborhood, Six Frames",
      hook: "Come back from a short local walk with six photos that make somewhere familiar worth a second look.",
      interests: ["local_knowledge", "making", "shared_discovery"],
      conflicts: [],
      setup:
        "Choose a free public route with a comfortable return within 30 minutes. Check access, opening hours, weather and lighting; stay within your selected area. Pick one theme you can spot along the way, such as unusual doorways, reflections or signs of the season.",
      challenge:
        "Follow the route at your own pace and take six photos connected by your theme. With company, divide the six frames between you; solo, choose all six yourself. Stop somewhere accessible for each shot. Keep people, private homes and sensitive details out of the pictures.",
      finish:
        "Return to the starting point, put the six frames in a deliberate order and give the set a title. Choose the one detail you would otherwise have walked past. Save the set privately or share only the images you want to.",
      requirements: [
        "Use free, open public paths within everyone's access needs. No climbing, entering private property or photographing unwilling people.",
      ],
      materials: ["Your phone camera", "Weather-appropriate clothing"],
      filming: [
        "Show your chosen theme and starting point without revealing a home address.",
        "Record a stationary glimpse of one detail before taking its photo.",
        "Reveal the six-frame sequence and return to the detail from your opening shot.",
      ],
      fallback:
        "If the route is closed or conditions do not suit the outing, use another accessible public route within the same time and area, or pause the plan. No free access is assumed from a place listing.",
    },
    {
      mechanic: "geocache_hunt",
      match: /\b(?:park|trail|greenway)\b/i,
      settings: ["outside"],
      allowed: bold && !exclusions.has("physical_challenges"),
      minutes: 90,
      floor: 0,
      chargePending: false,
      preparation: "a_few_things",
      title: "Find Your First Hidden Cache",
      hook: "Follow a real local geocache listing, work out its hiding place and leave your name in the logbook if you find it.",
      interests: ["local_knowledge", "adventure", "games"],
      conflicts: ["physical_challenges"],
      setup:
        "Use a current geocache listing available to you for free. Choose an easy, well-reviewed cache in your selected area with recent successful finds and a public approach that fits a 60-minute return walk. Read the terrain, access and opening restrictions before leaving. A park listing alone does not prove a cache is there.",
      challenge:
        "Follow the listed coordinates and clues while staying on permitted public access. With company, take turns reading the clue and checking the location; solo, compare each clue with what is actually around you. Search gently without moving fixtures, damaging plants or entering water. Use the official hint if needed and turn back at your planned time.",
      finish:
        "If you find it, sign the logbook with a nickname, return the container exactly as found and record your find on the listing. If you do not, log the honest attempt and your best theory. Keep the hiding place and coordinates out of any public video so the next person can solve it.",
      requirements: [
        "Only start after verifying a suitable free listing and lawful public access. No climbing, digging, trespass or purchases are required.",
      ],
      materials: [
        "Your phone with a current free cache listing",
        "A pen",
        "Weather-appropriate clothing",
      ],
      filming: [
        "Film your prediction about the clue without showing the coordinates.",
        "Record your own search reaction from a safe stationary spot, not the exact hiding place.",
        "Reveal whether you found the cache and return to your original theory; preserve the location for future hunters.",
      ],
      fallback:
        "If no suitable free cache listing is current and accessible within your time, choose another experience. Never improvise a cache location or pay for access to make this plan fit.",
    },
    {
      mechanic: "immersive_horror",
      match:
        /(?:immersive horror|live[- ]actor|horror escape|haunted attraction)/i,
      allowed: full && !exclusions.has("being_surprised"),
      minutes: 120,
      floor: 5000,
      minimumPeople: 2,
      maximumPeople: 8,
      title: "Step Inside the Horror Story",
      hook: "Book a live-actor immersive horror experience and find out which of you can stay in character when the story starts happening around you.",
      interests: ["adventure", "mystery", "shared_discovery"],
      conflicts: ["being_surprised"],
      setup:
        "Find a staffed live-actor horror attraction with an immersive story, not an ordinary puzzle room. Confirm that the experience includes actors interacting with your group, runs at most 75 minutes and has a real slot for everyone. Check the complete group price, age limits, content warnings, access needs and exit procedure before booking. Everyone must actively choose this level of scares.",
      challenge:
        "Enter the booked immersive story together, take the roles the attraction actually assigns and respond to its actors and tasks as the story unfolds. Let each person make their own choices instead of appointing one spokesperson. Stay within the provider's rules; use its stop signal or exit whenever needed, with no penalty from your group.",
      finish:
        "After leaving the attraction, each person reveals the moment that broke their composure and the choice they would make differently. Compare your accounts to reconstruct the story you actually experienced, including an early exit if anyone chose one.",
      requirements: [
        "Confirm a genuine live-actor format, current slot and every participant's age and content eligibility. A generic escape-room listing is not evidence of this experience.",
        "Follow the attraction's contact, filming and health rules. Do not arrive impaired; film reactions afterward if recording inside is prohibited.",
      ],
      materials: [
        "Confirmed group reservation",
        "Provider-required clothing and ID",
      ],
      filming: [
        "Outside the attraction, record which kind of scare each willing participant expects to handle best.",
        "Follow the actual no-filming rules. If cameras are prohibited, capture your own first reaction after leaving instead.",
        "Return to the opening predictions and reveal what actually happened, without exposing the attraction's surprises or other guests.",
      ],
    },
    {
      mechanic: "nightlife_competition",
      match: /\b(?:bar|pub|lounge|tavern)\b/i,
      allowed: barNight && friends && adventurous && bold,
      minutes: 180,
      floor: 4500,
      title: "Three Bars. One Crew Champion.",
      hook: "Your group chat becomes a real night out: three stops, a running score and one friend choosing the final order.",
      interests: ["competitive", "games", "spontaneous"],
      conflicts: ["adult_venues"],
      adultOnly: true,
      minimumAge: 21,
      nightlife: true,
      minimumPeople: 2,
      setup:
        "Choose walkable bars with a legal, suitable entry age for every participant. Confirm hours, cover charges, transport home and one all-in group spending cap. Pick three stops; reserve time and budget for moving between them.",
      challenge:
        "At each stop, everyone plays a best-of-three rock-paper-scissors bracket while seated with the group. Score one point per match win; the stop's champion chooses the next menu order from options each person already approved. Any drink can be alcohol-free. Carry the score between stops, then play a final bracket at the last bar.",
      finish:
        "Reveal the overall champion and their final menu pick. Before starting, friends may agree to cover a capped snack or dinner for the winner within the confirmed budget; everyone can instead play for bragging rights. Settle the actual bill and use the planned ride home.",
      requirements: [
        "Confirm each venue's current entry age and ID requirements for everyone; an age band is not admission permission.",
        "No drinking rounds, speed-drinking, surprise alcohol, compulsory drinks or driving after drinking. Declining an order never loses points.",
      ],
      materials: ["A group scorecard", "A confirmed route and transport home"],
    },
    {
      mechanic: "surprise_nightlife",
      match: /\b(?:bar|pub|lounge|cocktail)\b/i,
      allowed:
        barNight && adventurous && !full && !exclusions.has("being_surprised"),
      minutes: 90,
      floor: 3000,
      title: "The Menu Is Classified",
      hook: "Tell the bartender what is off-limits, then let a mystery order decide which friend knows your taste best.",
      interests: ["surprises", "food", "shared_discovery"],
      conflicts: ["adult_venues", "being_surprised"],
      adultOnly: true,
      minimumAge: 21,
      nightlife: true,
      minimumPeople: 2,
      setup:
        "Choose a bar with suitable entry rules and ask whether a staff member is happy to recommend a mystery menu choice. Agree dietary needs, alcohol-free or alcoholic preferences, ingredients to avoid and a fixed price before ordering. A refusal simply means companions choose from the menu instead.",
      challenge:
        "Each friend predicts which approved flavor or menu item the recommendation will contain, without seeing the order. Staff must still identify ingredients and alcohol content when asked. Reveal the order, then compare the predictions; tasting is optional and nobody has to finish anything.",
      finish:
        "Award the best prediction the title of group taste expert. Reveal the menu choice and honest reactions, then pay the agreed bill and leave with the planned transport.",
      requirements: [
        "Confirm entry eligibility and the full group price. The mystery is the menu choice, never hidden alcohol or undisclosed ingredients.",
        "Keep the game within the willing group; staff participation and filming are optional.",
      ],
      materials: [
        "A short list of tastes and dietary needs",
        "An agreed spending limit",
      ],
    },
    {
      mechanic: "spontaneous_staycation",
      match: /(?:hotel|resort|inn|suites)/i,
      allowed:
        adult &&
        friends &&
        adventurous &&
        full &&
        outing.durationMinutes === null &&
        !exclusions.has("travel_outside_area"),
      minutes: 1200,
      floor: 15000,
      title: "The Group Chat Checks In",
      hook: "Tonight stops being another maybe: pick a local hotel, book the crew's rooms and turn your own city into an overnight trip.",
      interests: ["spontaneous", "adventure", "shared_discovery"],
      conflicts: [],
      adultOnly: true,
      minimumPeople: 2,
      setup:
        "Pick a local hotel everyone can afford and confirm room occupancy, minimum check-in age, an actual available room, taxes and deposit holds. Price the entire stay plus dinner, one nearby evening activity and transport before anyone books. Everyone must be free overnight into tomorrow; the outing needs Unlimited time.",
      challenge:
        "Check in and give each friend control of one part of the evening: dinner, a real bookable show or late activity, and the final food stop. Everyone retains a veto for boundaries and cost. Make the bookings together, then complete the actual night out; no surprise charges or assumptions of availability.",
      finish:
        "Return to the booked hotel using the planned transport. Next morning, each person reveals the stop they would repeat and one photo or clip they chose to keep. Complete checkout and settle only the costs everyone approved.",
      requirements: [
        "This is an overnight commitment extending beyond the active evening; confirm tomorrow's checkout and responsibilities before booking.",
        "The hotel's check-in age can exceed 18. Confirm the actual policy and all room, deposit, activity and travel costs. Nightlife stops must fit every participant's entry age.",
      ],
      materials: [
        "Verified hotel reservation for the actual group",
        "Overnight essentials and required ID",
        "Confirmed evening bookings and return transport",
      ],
    },
    {
      mechanic: "live_show",
      match: /(?:concert|music venue|theat(?:er|re)|performing arts)/i,
      allowed:
        adventurous &&
        friends &&
        bold &&
        !exclusions.has("being_surprised"),
      minutes: 150,
      floor: 4500,
      title: "The Unknown Headliner",
      hook: "Pick a show none of you planned to see, commit to the real tickets and find out who becomes a fan by the final song.",
      interests: ["music", "spontaneous", "shared_discovery"],
      conflicts: ["being_surprised"],
      minimumPeople: 2,
      setup:
        "Check official venue or ticket pages for an actual show with seats for your whole group during your available time. Put two affordable unfamiliar acts to a group vote. Verify age rules, ticket fees, start/end times and transport before buying; an Apple Maps listing alone is not an event listing.",
      challenge:
        "Buy the agreed tickets and attend the booked performance together. Before the set, each friend predicts what the act will sound like; compare that guess with the real set after it ends.",
      finish:
        "After the show, each friend nominates the moment that changed their mind. Name the biggest new fan and share only your own permitted footage; a show you disliked is still a valid result.",
      requirements: [
        "Only use verified current event times and ticket availability; if no show fits, choose a fresh experience before purchasing.",
        "Confirm entry eligibility and a full group cost including fees, food and transport. No alcohol is required.",
      ],
      materials: ["Verified tickets for the actual group", "Transport plan"],
    },
    {
      mechanic: "golf_competition",
      match: /(?:golf course|golf club|golf links)/i,
      allowed:
        friends &&
        (full || bold) &&
        !exclusions.has("physical_challenges") &&
        !outing.adultContext,
      minutes: full ? 240 : 180,
      floor: full ? 9000 : 5000,
      title: full
        ? "Nine Holes. Dinner on the Line."
        : "The Nine-Hole Grudge Match",
      hook: "Book the tee time your friends keep talking about, then settle the rivalry with an actual scorecard and a dinner the crew agreed to cover.",
      interests: ["sports", "competitive", "games"],
      conflicts: ["physical_challenges"],
      minimumPeople: 2,
      setup:
        "Find a course with a real nine-hole tee time for your group, splitting into course-approved groups when needed. Confirm rentals, access rules and the entire group fee. Agree a fair scoring format for mixed skill levels; Full Send also includes a pre-budgeted group dinner after the round.",
      challenge:
        "Play nine holes under the course's pace and conduct rules. Track both the agreed score and one personal target per player. Phones stay put during swings and cart driving; a friend can film from a safe designated spot with permission. Keep the competition on the scorecard, with no drinking challenges.",
      finish:
        "Sign the scorecard and announce the winner and most-improved player. If every friend agreed beforehand, the others cover a capped share of the winner's planned dinner within the total budget; otherwise bragging rights are the prize.",
      requirements: [
        "Use the course's own group limits, equipment rules and tee-time availability. Everyone stays sober while playing or driving a cart.",
        "Any dinner treat is voluntary, agreed in advance and capped inside the confirmed budget; no cash betting or escalating forfeits.",
      ],
      materials: [
        "Confirmed tee time and required equipment",
        "A scorecard",
        "An agreed dinner cap for Full Send",
      ],
    },
    {
      mechanic: "novelty_fishing",
      match: /(?:fishing|angling|fishing pier)/i,
      settings: ["outside"],
      allowed:
        friends &&
        (full || bold) &&
        !exclusions.has("physical_challenges") &&
        !outing.adultContext,
      minutes: full ? 180 : 120,
      floor: 3000,
      title: full
        ? "Tiny Rods. Real Fish. No Excuses."
        : "The Tiny-Rod Showdown",
      hook: "Same ridiculous small fishing rods, same real fishing spot: which friend can actually land a fish?",
      interests: ["sports", "competitive", "absurd"],
      conflicts: ["physical_challenges"],
      minimumPeople: 2,
      setup:
        "Ask a local fishing operator or tackle shop to confirm a lawful shore-fishing spot, licenses, species rules and suitable small beginner rods. Use matching gear appropriate for the fish, not unsafe toy tackle. Confirm gear, bait, access and permit costs for everyone before accepting.",
      challenge:
        "Fish from the permitted dry bank or guarded pier for the agreed timed session. Score the first legally landed fish, then compare total valid catches without harming fish for content. Follow current handling, retention and release rules; no one enters the water, climbs barriers or casts near other people.",
      finish:
        "Name the winner if anyone catches a fish; a total blank is a shared loss worth admitting. The group can award a pre-agreed capped snack treat, then remove every hook, line and piece of litter before leaving.",
      requirements: [
        "Confirm licenses, access, species/season rules and suitable equipment locally. Stop if conditions or safe access deteriorate.",
        "No jumping or swimming forfeits and no alcohol challenge around water.",
      ],
      materials: [
        "Matched suitable small fishing rods and tackle",
        "Required permits",
        "Waste bag and fish-handling equipment",
      ],
    },
    {
      mechanic: "ebike_exploration",
      match:
        /(?:e[- ]?bike|electric bike|bicycle rental|bike rental|cycle hire)/i,
      settings: ["outside"],
      allowed:
        friends &&
        (full || bold) &&
        !exclusions.has("physical_challenges") &&
        !exclusions.has("travel_outside_area") &&
        !outing.adultContext,
      minutes: full ? 180 : 120,
      floor: full ? 6000 : 4000,
      title: full ? "The E-Bike Mystery Circuit" : "The E-Bike Detour Draft",
      hook: "Rent the bikes, give each friend one secret stop and discover the complete route only as the crew rides it.",
      interests: ["sports", "adventure", "local_knowledge"],
      conflicts: ["physical_challenges", "being_surprised"],
      minimumPeople: 2,
      setup:
        "Choose a licensed rental operator and confirm suitable bikes, helmets, training, age rules and the full group price. Ask the operator to approve a route inside your chosen area and the actual rental window. Each friend adds one safe public stopping point; review the complete route before departure without revealing each stop's story.",
      challenge:
        "Ride the approved circuit together at a comfortable pace and within local rules. At every designated stop, dismount and reveal why that friend chose it. Vote on the best discovery only after all stops; speed and overtaking earn no points. Full Send commits to the full multi-stop rental circuit, not a timed road race.",
      finish:
        "Return all bikes within the booked window and name the friend's stop everyone would revisit. Film an honest route recap while stationary; the successful finish is the completed route and returned equipment.",
      requirements: [
        "Ride sober, obey the operator and local path rules, and use required helmets. No street racing, stunt riding or handheld filming while moving.",
        "Confirm route distance, battery range, conditions and any deposit before starting.",
      ],
      materials: [
        "Operator-approved rental e-bikes and helmets",
        "An approved route",
        "Water and required ID",
      ],
    },
    {
      mechanic: "wingman_challenge",
      match: /$a/,
      settings: ["home"],
      allowed:
        adult &&
        friends &&
        outing.category === "demon" &&
        bold &&
        !exclusions.has("strangers") &&
        ["invitation", "conversation"].includes(
          routing.boundaries.participation,
        ),
      minutes: 45,
      floor: 0,
      title: "Your Friend Writes the First Message",
      hook: "Your boldest friend gets one shot at writing the message you keep putting off. You approve it, you send it, and everyone owns the result.",
      interests: ["friendly_awkward", "absurd", "competitive"],
      conflicts: ["strangers"],
      adultOnly: true,
      chargePending: false,
      minimumPeople: 2,
      setup:
        "Each willing participant chooses an adult crush or match they already know and actually want to message. Privately tell your friend the context; keep unrelated chats and contacts hidden. Agree a tiny dinner treat only if it fits the existing budget; bragging rights cost nothing.",
      challenge:
        "Friends each draft one honest opening message. The account owner must read it, approve it and press send themselves; nobody pretends to be someone else. Give each message one chance, then put the phones away and make your own prediction about the response. No follow-up pressure or contacting someone who has declined.",
      finish:
        "At the end of the session, account owners can share whether there was a positive reply without exposing the conversation. The friend whose approved opener got that reply earns the agreed treat; no reply or a no is a valid outcome and ends the challenge.",
      requirements: [
        "Everyone participating must opt in and approve their own message. Never publish a recipient's identity or response without their permission.",
        "Do not sexualize, pressure or repeatedly contact anyone; no positive response is promised or owed.",
      ],
      materials: ["Your own phones", "Willing adult friends"],
      filming: [
        "Film your own prediction and your friend's draft on a blank note; keep names, notifications and conversations out of frame.",
        "Record only the account owner's approved send reaction. Do not screen-record a private conversation or expose the recipient.",
        "Film your own verdict with the phone face down. Return to the opening prediction for the ending; no response screenshot is needed.",
      ],
    },
    {
      mechanic: "adrenaline",
      match: /(?:go[- ]?kart|karting|kart track)/i,
      allowed: (full || bold) && !exclusions.has("physical_challenges"),
      minutes: full ? 90 : 60,
      minimumPeople: full ? 2 : 1,
      floor: 2500,
      title: full
        ? "The Crew's Karting Grand Prix"
        : "Your First Karting Time Attack",
      hook: "Trade the group chat's racing boasts for a real circuit, timed laps and an official result.",
      interests: ["competitive", "sports"],
      conflicts: ["physical_challenges"],
      setup:
        "Book an operator-run karting session that includes a safety briefing and timed driving. Confirm the complete group price, session length, age and equipment rules before accepting.",
      challenge: full
        ? "Complete the briefing, a qualifying heat and the operator's race session. Set your grid from the venue's official lap results only if the operator permits it; otherwise compete on best clean lap across both heats. Follow every flag and the circuit's no-contact rules."
        : "Complete the safety briefing and the booked timed session. Pick a personal clean-lap target, follow the operator's rules and compare your official best lap with the group's predictions.",
      finish:
        "Collect the official timing sheet. Name the fastest clean lap and each driver's biggest improvement; an unfinished or slow session is an honest result.",
      requirements: [
        "Only drive sober and within the operator's eligibility and safety rules.",
        "The operator controls all race formats and on-track conduct; no phone or handheld filming while driving.",
      ],
      materials: [
        "Closed-toe shoes and operator-required clothing",
        "Operator-provided kart and safety equipment",
      ],
    },
    {
      mechanic: "skill_challenge",
      match: /(?:climbing|climb gym|bouldering)/i,
      allowed: (full || bold) && !exclusions.has("physical_challenges"),
      minutes: full ? 120 : 90,
      floor: 2000,
      title: full ? "The First Big Wall" : "The Climbing Route Challenge",
      hook: "A proper climbing session with an instructor, a real route and a height or grade you have never attempted.",
      interests: ["sports", "adventure"],
      conflicts: ["physical_challenges"],
      setup:
        "Book a staffed climbing venue's introductory session with instruction and equipment included. Confirm the total group charge, eligibility and a suitable supervised route before accepting.",
      challenge: full
        ? "Learn the venue's safety system with its instructor, complete a practice route, then each choose a taller or harder route the instructor approves. Make a full coached attempt on that route; each climber controls their own stopping point. Partners encourage from the designated area."
        : "Complete the instructor's induction, then choose a suitable route and make a coached attempt. Ask for one technique adjustment and try it on the wall; the goal is a real new movement, not racing someone else's height.",
      finish:
        "Record the route you actually attempted and the highest point or move reached. Return equipment and compare the fear before starting with the result afterward.",
      requirements: [
        "Use the venue's trained supervision, equipment and permitted routes; no unassisted climbing or improvised anchors.",
        "Take part sober. Nobody has to continue beyond their comfort or the instructor's limits.",
      ],
      materials: [
        "Operator-provided climbing equipment",
        "Venue-approved clothing and footwear",
      ],
    },
    {
      mechanic: "competition",
      match: /(?:escape room|escape game|escape adventure)/i,
      allowed: bold,
      minutes: 90,
      floor: 2500,
      title: "The Mystery Room Pact",
      hook: "Commit the whole group to a real timed escape room and find out who becomes the leader under pressure.",
      interests: ["competitive", "games", "mystery"],
      conflicts: [],
      setup:
        "Find a staffed escape-room venue with a room that fits your exact group size and a suitable introductory mystery. Confirm its real time slot, duration and complete group price before accepting.",
      challenge:
        "Enter the booked room without spoilers. Share every clue aloud if you have company, keep solved objects separate and use the venue's hint system when you need it. Attempt the actual timed challenge and follow every staff rule.",
      finish:
        "Ask staff for the actual escape time or furthest stage reached. Reveal which clue fooled the group and give everyone credit for one useful contribution; failure to escape counts as a real attempt.",
      requirements: [
        "Choose a room designed for your group size, access needs and agreed themes.",
        "Respect the venue's no-spoiler and filming rules; film only permitted arrival or reaction moments.",
      ],
      materials: ["A confirmed room reservation", "Your willing group"],
    },
    {
      mechanic: "food_choice",
      match: /(?:restaurant|cafe|café|food hall|bakery)/i,
      allowed: !full && !bold,
      minutes: 45,
      floor: 1500,
      title: "The Menu Wildcard Date",
      hook: "Let someone else's favorite lead you to one new dish, with your tastes and dietary needs firmly in play.",
      interests: ["food", "shared_discovery"],
      conflicts: [],
      setup:
        "Choose a restaurant or food hall that suits everyone's dietary needs. Check it is open and confirm the complete group price before accepting; each person sets a spending limit.",
      challenge:
        "Each person gives a willing companion two acceptable menu choices and lets them choose the order. Solo, ask staff for one recommendation within your stated preferences, with no pressure to participate. Taste the chosen dish and describe the first surprising detail; you can decline anything unsuitable.",
      finish:
        "Give the new choice an honest verdict and name the dish you would return for. Pay the confirmed bill and capture only your own food or consenting group.",
      requirements: [
        "Check dietary needs and ingredients with the venue. No compulsory tasting or alcohol is involved.",
      ],
      materials: ["A menu and an agreed spending limit"],
    },
  ];
  const viable = options.filter(
    (option) =>
      option.allowed &&
      (option.settings ?? ["venue"]).includes(outing.setting) &&
      outing.participants >= (option.minimumPeople ?? 1) &&
      outing.participants <= (option.maximumPeople ?? 100) &&
      (!option.adultOnly || adult) &&
      !option.conflicts.some((conflict) => exclusions.has(conflict)) &&
      !previousExperiences.some(
        ({ title }) => normalizedTitle(title) === normalizedTitle(option.title),
      ) &&
      available >= option.floor * outing.participants &&
      (outing.durationMinutes === null ||
        option.minutes + outing.travelMinutes <= outing.durationMinutes),
  );
  const match = viable.flatMap((option) =>
    request.nearbyPlaces
      .filter((place) =>
        option.match.test(`${place.name} ${place.category ?? ""}`),
      )
      .map((location) => ({ option, location })),
  )[0];
  const option =
    match?.option ??
    (adult && adventurous && friends ? viable[0] : undefined) ??
    viable.find(
      (entry) =>
        entry.mechanic === (full || bold ? "competition" : "food_choice"),
    ) ??
    viable[0];
  if (!option) return null;
  // A generic fallback never borrows an unrelated bar/park's identity.
  const location = match?.location ?? null;
  const quest = questVariantSchema.parse({
    id: `private_${crypto.randomUUID()}`,
    familyId: `private_${outing.category}_${option.mechanic}`,
    version: 1,
    title: option.title,
    hook: option.hook,
    category: outing.category,
    intensity: outing.intensity,
    durationMinutes: option.minutes,
    minParticipants: outing.participants,
    maxParticipants: outing.participants,
    allowedGroups: [outing.group],
    cost: {
      minMinor: 0,
      maxMinor: 0,
      currency: "USD",
      scope: "total",
      venueCostUnknown: option.chargePending !== false,
      note:
        option.chargePending === false
          ? "No purchase is required; use equipment and materials you already have. Any optional spending must stay within the agreed budget."
          : "Current pricing is unconfirmed. Confirm one complete group charge including every required booking, rental, admission, tax and fee before accepting. It must fit your remaining budget; no separate purchase is assumed.",
    },
    settings: [outing.setting],
    interests: option.interests,
    roles: ["main_character", "mastermind", "camera_person", "rotate"],
    preparation: option.preparation ?? "proper_setup",
    conflicts: option.conflicts,
    venuePermissionRequired: false,
    arrangementRequired: option.chargePending !== false,
    adultOnly: option.adultOnly ?? false,
    ...(option.minimumAge
      ? { minimumAge: option.minimumAge }
      : option.adultOnly
        ? { minimumAge: 18 }
        : {}),
    supportsAdultContext: option.nightlife ?? false,
    requiresVolunteer: false,
    beats: [
      {
        label: "Choose and confirm",
        action: option.setup,
        filming:
          option.filming?.[0] ??
          "Open on your group's prediction: who wins, what you expect, or the commitment you just made. Film your own arrival where permitted; keep booking details and other guests out of frame.",
        caption: "We committed to this",
      },
      {
        label: "Take on the experience",
        action: option.challenge,
        filming:
          option.filming?.[1] ??
          "Capture the actual decisive moment from a permitted stationary position, or record your reaction just afterward if filming the activity is prohibited. Keep hands and attention on the activity.",
        caption: "The actual attempt",
      },
      {
        label: "Own the outcome",
        action: option.finish,
        filming:
          option.filming?.[2] ??
          "Return to the opening prediction and reveal the real result. Let the winner and the friend who called it wrong react; keep other guests and private information out of frame.",
        caption: "What really happened",
      },
    ],
    materials: option.materials,
    requirements: option.requirements,
    completionQuestions: [
      "Did you genuinely attempt the experience and report its honest result?",
      "Did you follow the venue's rules and obtain agreement from anyone filmed?",
    ],
    fallback:
      option.fallback ??
      (option.chargePending === false
        ? "If someone changes their mind, keep their phone and contacts out of the game. An unsent draft and an honest decision not to proceed are valid outcomes."
        : "If there is no suitable slot or the confirmed total price exceeds your plan, do not accept this proposal. Find a different suitable provider and request a fresh suggestion; no availability is promised."),
    privateGenerated: true,
    award: { xp: 0, points: 0 },
    cooldownDays: 30,
  });
  return discoveryEligibility(quest, outing, preferences).blocking.length
    ? null
    : { quest, mechanic: option.mechanic, location };
}
