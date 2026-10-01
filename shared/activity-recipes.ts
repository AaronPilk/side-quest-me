import {
  AWARDS,
  type Category,
  type Exclusion,
  type Intensity,
  type QuestVariant,
  type Setting,
} from "./domain";

/** Editorial recipes, not scraped listings or claims that an event/place exists.
 * Each prompt changes the task; intensity changes its structure and deliverable.
 * A recipe shares one reward family across all prompts and intensities.
 */
export type ActivityRecipe = {
  id: string;
  title: string;
  category: Category;
  action: string;
  evidence: string;
  prompts: string[];
  interests: string[];
  settings: Setting[];
  conflicts?: Exclusion[];
  /** Editorial constraints survive generation; a draft is never silently free,
   * solo-compatible, shorter, or assigned a different intensity. */
  constraints?: {
    minutes: number;
    groups: ("solo" | "couple" | "friends")[];
    intensity: Intensity;
    cost: { minMinor: number; maxMinor: number };
    note: string;
  };
};
const both: Setting[] = ["home", "outside"];
const quiet: Setting[] = ["home", "outside", "venue"];
const outside: Setting[] = ["outside"];
const home: Setting[] = ["home"];

const historicalActivityRecipes: ActivityRecipe[] = [
  {
    id: "date_photo_duet",
    title: "Two Views, One Story",
    category: "date_night",
    action:
      "Each partner makes a photo answering the same brief, without seeing the other's frame. Compare your choices and combine them into one two-image story.",
    evidence: "the two original photos side by side",
    prompts: [
      "something that looks like a first date",
      "a tiny detail that feels like a grand adventure",
      "two completely different kinds of calm",
      "an ordinary object that deserves romance",
      "a visual reply to your partner's favorite color",
      "the opening and ending of an imaginary holiday",
    ],
    interests: ["making", "mystery_date"],
    settings: quiet,
  },
  {
    id: "date_postcard",
    title: "Postcards from Right Here",
    category: "date_night",
    action:
      "Draw a postcard of the place you are in and write a short message to your partner on the back. Read the cards together and choose a detail for your next shared adventure.",
    evidence: "both finished postcards and one line from each",
    prompts: [
      "a holiday in your own neighborhood",
      "a future anniversary with no expensive plans",
      "the funniest detail of today",
      "a tiny moment you would like to repeat",
      "a destination invented from nearby shapes",
      "the view from your partner's perspective",
    ],
    interests: ["making", "local_knowledge"],
    settings: both,
  },
  {
    id: "date_portrait",
    title: "The Portrait Exchange",
    category: "date_night",
    action:
      "Draw your partner using the agreed constraint, then exchange portraits. Name one real detail each drawing captured rather than scoring anyone's appearance.",
    evidence: "the pair of drawings and their chosen details",
    prompts: [
      "continuous lines without lifting the pencil",
      "a portrait made only from circles",
      "a superhero version with an everyday superpower",
      "an album cover for your shared afternoon",
      "a silhouette filled with favorite objects",
      "a portrait in five expressive lines",
    ],
    interests: ["making", "absurd"],
    settings: both,
  },
  {
    id: "date_memory_map",
    title: "Map Our Small Adventures",
    category: "date_night",
    action:
      "Draw a fictional map using shared memories as landmarks. Give each landmark a name, connect them into a route, and tell the story behind your favorite stop.",
    evidence: "the finished map and one shared memory",
    prompts: [
      "the first time you laughed together",
      "three ordinary places that became memorable",
      "a route made entirely from favorite snacks",
      "your most gloriously unsuccessful plan",
      "a map of inside jokes you both agree to share",
      "a future free afternoon with three imagined stops",
    ],
    interests: ["making", "local_knowledge"],
    settings: quiet,
  },
  {
    id: "date_object_museum",
    title: "The Museum of Us",
    category: "date_night",
    action:
      "Choose ordinary objects you already own, give each a museum label, and take turns explaining why it belongs in a tiny exhibition about your relationship.",
    evidence: "one object beside its handwritten label",
    prompts: [
      "the exhibit called How This Started",
      "the object that survived your worst plan",
      "an award for the most reliable everyday helper",
      "a collection representing a perfect cheap date",
      "a future archaeologist's completely wrong explanation",
      "two objects that tell opposite halves of one memory",
    ],
    interests: ["making", "comedy"],
    settings: both,
  },
  {
    id: "date_trailer",
    title: "Trailer for an Ordinary Date",
    category: "date_night",
    action:
      "Make a tiny fictional movie trailer about an ordinary shared activity. Plan a beginning, one change, and a final reveal, using only your own voices and objects.",
    evidence: "the trailer's decisive reveal and your reaction",
    prompts: [
      "a thriller about choosing where to sit",
      "a romance about returning a borrowed pen",
      "a documentary about a missing sock",
      "an adventure about opening a notebook",
      "a sports film about deciding on a snack",
      "a mystery about whose turn it is to choose",
    ],
    interests: ["comedy", "making", "absurd"],
    settings: both,
  },
  {
    id: "date_prompt_walk",
    title: "The Two-Person Discovery Trail",
    category: "date_night",
    action:
      "Choose a small accessible outdoor area. Each partner finds a detail answering the brief, then brings the other to see it; walking speed and distance never count toward the result.",
    evidence: "both found details and why each matters",
    prompts: [
      "a shape that resembles your initials",
      "a view you would put on a postcard",
      "a texture that belongs in an imaginary home",
      "two colors that should never work together but do",
      "a tiny sign that the seasons are changing",
      "something ordinary that deserves a ridiculous name",
    ],
    interests: ["local_knowledge", "making", "mystery_date"],
    settings: outside,
  },
  {
    id: "date_mini_game",
    title: "Invent Our House Rules",
    category: "date_night",
    action:
      "Invent a tabletop game with paper and small objects you own. Write a clear win condition, play together, and change the one rule that made the first attempt confusing.",
    evidence: "the game board and one genuine turn",
    prompts: [
      "a treasure hunt on a nine-square map",
      "a cooperative game against a paper storm",
      "a guessing game using drawings of familiar objects",
      "a race for paper tokens with no timed movement",
      "a negotiation game about an imaginary picnic",
      "a tiny strategy game where the loser picks the title",
    ],
    interests: ["games", "making", "competitive"],
    settings: both,
  },
  {
    id: "date_shared_skill",
    title: "Teach Me Your Tiny Trick",
    category: "date_night",
    action:
      "Each partner chooses a small seated skill they genuinely know, gives a patient demonstration, and lets the other try. Compare your first attempts without pretending either person is an expert.",
    evidence: "one before-and-after attempt at the agreed skill",
    prompts: [
      "drawing a recognizable animal with simple shapes",
      "folding a paper bookmark",
      "remembering three items with a silly story",
      "making a quiet rhythm with fingertips",
      "telling a story in exactly three sentences",
      "taking a close-up photograph in available light",
    ],
    interests: ["making", "skill_reveals"],
    settings: both,
  },
  {
    id: "date_soundtrack",
    title: "Our Original Theme Tune",
    category: "date_night",
    action:
      "Create a short original sound theme using quiet humming, tapping, or spoken words. Each partner contributes a layer, then perform the theme together without recorded commercial music.",
    evidence: "your shared original theme and its title",
    prompts: [
      "the theme for getting ready far too slowly",
      "a victory theme for remembering the keys",
      "a tiny love song for an ordinary object",
      "the soundtrack of your most chaotic journey",
      "a calm theme for doing absolutely nothing",
      "an intro for your imaginary cooking show",
    ],
    interests: ["music", "comedy"],
    settings: both,
  },
  {
    id: "date_paper_picnic",
    title: "Plan the Impossible Picnic",
    category: "date_night",
    action:
      "Use drawings and objects you already own to stage an imaginary picnic. Each partner adds an idea, then together design a real free version you could actually enjoy.",
    evidence: "the imaginary picnic and the achievable version",
    prompts: [
      "a picnic on the moon",
      "a picnic for two extremely polite dragons",
      "a picnic inside a pocket",
      "a picnic where every object has a job",
      "a picnic in a black-and-white movie",
      "a picnic that could fit on one sheet of paper",
    ],
    interests: ["making", "absurd", "mystery_date"],
    settings: both,
  },
  {
    id: "date_time_capsule",
    title: "A Capsule for Next Time",
    category: "date_night",
    action:
      "Write separate predictions, a small wish, and one detail about today. Read only the agreed lines aloud, then keep the notes privately for your next date; do not bury or leave anything outside.",
    evidence: "the dated envelope or folded notes, with private text hidden",
    prompts: [
      "the small thing you will still laugh about next month",
      "the free activity you think your partner will choose",
      "an everyday habit you would like to celebrate",
      "the title of the next chapter of your story",
      "a harmless prediction about your next shared meal",
      "one kind thing you want future-you to remember",
    ],
    interests: ["making", "mystery_date"],
    settings: quiet,
  },

  {
    id: "day_color_atlas",
    title: "A Tiny Color Atlas",
    category: "daytime",
    action:
      "Collect photographs, not physical objects, of colors in your chosen area. Arrange the images into a small palette and name the place or mood it suggests.",
    evidence: "the assembled palette with its source details",
    prompts: [
      "six shades hiding inside what looked like gray",
      "a warm-to-cool color transition",
      "colors for an imaginary seaside town",
      "a palette built from one overlooked object",
      "the brightest color beside its quietest neighbor",
      "three colors that make an ordinary corner feel new",
    ],
    interests: ["making", "local_knowledge"],
    settings: quiet,
  },
  {
    id: "day_texture_library",
    title: "The Texture Library",
    category: "daytime",
    action:
      "Photograph surface textures without touching or removing anything. Give each image a descriptive title, then pair textures that would make an interesting fictional material.",
    evidence: "two close-ups and the imaginary material they suggest",
    prompts: [
      "smooth beside weathered",
      "a surface that looks like a landscape",
      "repeated marks with one interruption",
      "soft-looking and sharp-looking shapes",
      "a texture that could belong to another planet",
      "something handmade beside something naturally formed",
    ],
    interests: ["making", "local_knowledge"],
    settings: quiet,
  },
  {
    id: "day_shadow_sketch",
    title: "Follow a Shadow",
    category: "daytime",
    action:
      "Draw the outline of a shadow from an object you own or a stationary feature you can safely observe. Turn that outline into a new imaginary character or scene.",
    evidence: "the original shadow and the drawing it became",
    prompts: [
      "a small object becoming a giant creature",
      "a shadow that suggests a skyline",
      "two shadows forming one character",
      "an ordinary handle becoming a secret doorway",
      "a shadow that looks like a musical instrument",
      "a silhouette that changes meaning when rotated",
    ],
    interests: ["making"],
    settings: both,
  },
  {
    id: "day_paper_architect",
    title: "Architecture on One Sheet",
    category: "daytime",
    action:
      "Sketch and fold a small paper structure without blades or adhesives. Test whether it stands on a flat surface, change the design, and explain what made it more stable.",
    evidence: "the paper structure standing or honestly falling",
    prompts: [
      "a tiny bridge for a paper token",
      "a shelter with an unusually dramatic entrance",
      "a chair for an imaginary thumb-sized guest",
      "a tower with a broad stable base",
      "a stage for a one-object performance",
      "a miniature reading nook with a roof",
    ],
    interests: ["making", "skill_reveals"],
    settings: both,
  },
  {
    id: "day_local_alphabet",
    title: "The Nearby Alphabet",
    category: "daytime",
    action:
      "Look for letter shapes in ordinary objects or permitted signs. Photograph a small set and arrange them into a word that tells a story about where you are.",
    evidence: "the found letters assembled into your chosen word",
    prompts: [
      "letters made by curves rather than printed type",
      "a word assembled from household objects",
      "your initials found in unexpected shapes",
      "a word that describes today's mood",
      "three letters from three different materials",
      "a tiny greeting made from reflections",
    ],
    interests: ["making", "local_knowledge"],
    settings: quiet,
  },
  {
    id: "day_sound_map",
    title: "Map What You Can Hear",
    category: "daytime",
    action:
      "Listen from a safe stationary spot, then draw a map of distinct non-private sounds. Describe their rhythm and distance without recording identifiable conversations.",
    evidence: "your sound map and an original imitation of one sound",
    prompts: [
      "the nearest and furthest ordinary sound",
      "a rhythm that repeats irregularly",
      "natural and mechanical sounds in the same scene",
      "a quiet sound you usually overlook",
      "the sounds that could introduce an imaginary place",
      "a soundscape described with shapes instead of words",
    ],
    interests: ["music", "local_knowledge"],
    settings: quiet,
  },
  {
    id: "day_micro_comic",
    title: "A Three-Panel Discovery",
    category: "daytime",
    action:
      "Draw a short comic about an ordinary object finding a new purpose. Give it a clear beginning, a change, and an ending; simple stick figures count.",
    evidence: "the finished comic shown in reading order",
    prompts: [
      "a pencil that wants a day off",
      "a mug auditioning for a new job",
      "a leaf applying to be an umbrella",
      "a paperclip solving a tiny mystery",
      "a shoe discovering it prefers dancing",
      "a notebook with one blank-page ambition",
    ],
    interests: ["making", "comedy"],
    settings: quiet,
  },
  {
    id: "day_object_redesign",
    title: "Fix One Tiny Annoyance",
    category: "daytime",
    action:
      "Choose a harmless everyday annoyance and draw a possible improvement. Make a paper mock-up, test the idea without modifying electrical or structural equipment, and explain one limitation.",
    evidence: "the paper prototype beside the problem sketch",
    prompts: [
      "a bookmark that remembers why you stopped",
      "a reminder for where the keys belong",
      "a label that makes a drawer easier to understand",
      "a clearer scorecard for a homemade game",
      "a paper stand for displaying a tiny drawing",
      "a packing checklist that tells a visual story",
    ],
    interests: ["making", "skill_reveals"],
    settings: both,
  },
  {
    id: "day_observation_bingo",
    title: "Bingo for the Overlooked",
    category: "daytime",
    action:
      "Draw a small observation grid using the brief. Find real examples in a familiar accessible area, documenting each without collecting objects or approaching strangers.",
    evidence: "the marked grid and the hardest genuine find",
    prompts: [
      "circles, stripes, and unexpected triangles",
      "signs of repair and careful maintenance",
      "tiny details in one room",
      "different ways light lands on surfaces",
      "patterns that almost repeat perfectly",
      "evidence that someone made a thoughtful choice",
    ],
    interests: ["games", "local_knowledge"],
    settings: quiet,
  },
  {
    id: "day_paper_puzzle",
    title: "Make a Puzzle Worth Solving",
    category: "daytime",
    action:
      "Create a small paper puzzle with a definite answer. Solve your own draft, fix any ambiguous clue, and let a willing companion try or demonstrate the solution yourself.",
    evidence: "one solvable clue and its explained answer",
    prompts: [
      "a maze shaped like an ordinary object",
      "a wordless sequence of three picture clues",
      "a code based on colored shapes",
      "a logic puzzle about three imaginary pets",
      "a folding puzzle with a hidden drawing",
      "a tiny map with a single correct route",
    ],
    interests: ["games", "making"],
    settings: quiet,
  },
  {
    id: "day_tiny_exhibit",
    title: "Curate a Pocket Exhibition",
    category: "daytime",
    action:
      "Choose objects you own or images you created and arrange a miniature exhibition. Give it a title and write short labels that explain a real connection between the pieces.",
    evidence: "the exhibition and its most convincing label",
    prompts: [
      "ordinary things with unexpectedly good design",
      "objects that have outlasted their original purpose",
      "a collection connected by one unusual shape",
      "evidence of a hobby you actually practice",
      "three items that tell the story of one morning",
      "a museum devoted to useful mistakes",
    ],
    interests: ["making", "local_knowledge"],
    settings: both,
  },
  {
    id: "day_first_last_frame",
    title: "The Matching-Frame Challenge",
    category: "daytime",
    action:
      "Plan a short visual story that starts and ends on the same object in the same position. Change its context in the middle using your own props and a clear, honest reveal.",
    evidence: "the matched first and last frames",
    prompts: [
      "a notebook becoming a tiny landscape",
      "a mug receiving an imaginary award",
      "a paper token traveling across a drawn map",
      "a pencil changing from tool to character",
      "a folded sheet opening into a surprising picture",
      "a familiar object revealed at two different scales",
    ],
    interests: ["making", "skill_reveals"],
    settings: both,
  },

  {
    id: "night_shadow_cast",
    title: "The Quiet Shadow Cast",
    category: "late_night",
    action:
      "Use a household lamp and your own hands or paper shapes to make a small shadow scene. Keep the light away from eyes, avoid candles, and tell a simple story with a clear ending.",
    evidence: "the shadow scene and the ordinary objects behind it",
    prompts: [
      "a tiny creature missing its bus",
      "two mountains having a polite disagreement",
      "a bird discovering its own shadow",
      "a sleepy city waking one window at a time",
      "a moon auditioning for the role of a lamp",
      "a doorway that leads back to the beginning",
    ],
    interests: ["making", "comedy"],
    settings: home,
  },
  {
    id: "night_pocket_poem",
    title: "A Poem for This Ordinary Night",
    category: "late_night",
    action:
      "Write a short original poem from details you can see or remember. Read it quietly or show the text on paper, then explain the real detail that started it.",
    evidence: "the poem and its ordinary source detail",
    prompts: [
      "a kitchen after everyone has finished eating",
      "the final light left on in a room",
      "an object waiting for tomorrow",
      "the sound of a familiar place settling down",
      "a message you can express without private details",
      "a circle that ends on the poem's first word",
    ],
    interests: ["making", "music"],
    settings: both,
  },
  {
    id: "night_stop_motion",
    title: "The Tabletop Night Shift",
    category: "late_night",
    action:
      "Move your own small objects a little at a time and photograph each position. Review the sequence as a tiny stop-motion story; a slideshow is a valid result.",
    evidence: "the image sequence and final object arrangement",
    prompts: [
      "a pencil clocking out after a long day",
      "paper stars arranging themselves into a new shape",
      "a mug slowly gaining a paper crown",
      "a notebook opening into a miniature doorway",
      "two paper characters trading places",
      "an object completing a loop back to its first mark",
    ],
    interests: ["making"],
    settings: home,
  },
  {
    id: "night_whisper_review",
    title: "The Very Serious Quiet Review",
    category: "late_night",
    action:
      "Give a quiet, obviously comic review of an ordinary object you own. Invent a harmless rating category, demonstrate the object's actual use, and deliver an honest verdict.",
    evidence: "the real demonstration and your final rating",
    prompts: [
      "a pillow's suitability for deep thinking",
      "a mug's imaginary leadership skills",
      "a bookmark's commitment to its job",
      "a sock's contribution to interior design",
      "a lamp's dramatic timing",
      "a notebook's ability to keep a blank face",
    ],
    interests: ["comedy", "absurd"],
    settings: home,
  },
  {
    id: "night_dream_blueprint",
    title: "Blueprint for a Ridiculous Dream",
    category: "late_night",
    action:
      "Draw a fictional place inspired by the brief. Add a practical entrance, one impossible feature, and a reason someone would want to visit; label the whole thing as invented.",
    evidence: "the blueprint and its most impractical feature",
    prompts: [
      "a hotel for lost umbrellas",
      "a library where books recommend people",
      "a train station for unfinished ideas",
      "a bakery that sells imaginary weather",
      "a museum of almost-forgotten dreams",
      "a park where benches tell original stories",
    ],
    interests: ["making", "absurd"],
    settings: both,
  },
  {
    id: "night_original_jingle",
    title: "Jingle for the Night Shift",
    category: "late_night",
    action:
      "Compose a very short original jingle in a quiet voice or with soft tabletop taps. Give it a title, rehearse a clear ending, and record one complete attempt.",
    evidence: "the original jingle and the object it celebrates",
    prompts: [
      "the last clean spoon",
      "a phone that finally gets charged",
      "a glass of water beside the bed",
      "a notebook catching one last idea",
      "a lamp saying goodnight",
      "a blanket applying for employee of the month",
    ],
    interests: ["music", "comedy"],
    settings: home,
  },
  {
    id: "night_prediction_cards",
    title: "Tomorrow in Six Tiny Predictions",
    category: "late_night",
    action:
      "Write harmless predictions about an ordinary future day. Explain the reasoning for one, seal or fold the cards, and choose when you will check what actually happened.",
    evidence: "the dated cards without private personal information",
    prompts: [
      "the first useful object you will pick up",
      "the color you will notice most often",
      "a small problem you think you can prevent",
      "a sound that will start the day",
      "a free activity you might make time for",
      "one ordinary moment that could become a good story",
    ],
    interests: ["games", "making"],
    settings: quiet,
  },
  {
    id: "night_memory_radio",
    title: "Broadcast from an Imaginary Place",
    category: "late_night",
    action:
      "Write and quietly perform an original fictional radio segment. Make clear the place and events are invented, use your own sound effects, and close with a recurring sign-off.",
    evidence: "the best part of the fictional bulletin and sign-off",
    prompts: [
      "weather from a town inside a teacup",
      "traffic news for migrating paperclips",
      "an interview with a very tired pencil",
      "a sports update from the pillow league",
      "a travel report from the back of a drawer",
      "a cultural review from a city of bookmarks",
    ],
    interests: ["music", "comedy", "absurd"],
    settings: home,
  },
  {
    id: "night_window_palette",
    title: "Colors After Dark",
    category: "late_night",
    action:
      "From home or a familiar well-lit spot, draw the colors and shapes of the evening scene. Avoid photographing private windows or people; abstract the light into a small artwork.",
    evidence: "the abstract palette and your description of the scene",
    prompts: [
      "warm light against a cool background",
      "a single bright rectangle in the darkness",
      "reflections in an object you own",
      "the colors of one lamp through different paper shapes",
      "a nighttime scene made from just three colors",
      "the same room before and after dimming a lamp",
    ],
    interests: ["making"],
    settings: both,
  },
  {
    id: "night_dialogue",
    title: "Two Objects, One Conversation",
    category: "late_night",
    action:
      "Write a short original dialogue between two objects you own. Perform it quietly using the objects as characters, then reveal the real everyday problem behind the scene.",
    evidence: "the objects' final exchange and the real explanation",
    prompts: [
      "a charger asking a phone for a day off",
      "a mug negotiating with a teaspoon",
      "a notebook arguing with an eraser",
      "a pillow interviewing a blanket",
      "a lamp teaching a candle about electricity without lighting it",
      "a bookmark promising a book it will return",
    ],
    interests: ["comedy", "making", "absurd"],
    settings: home,
  },
  {
    id: "night_constellation",
    title: "Name Your Own Constellation",
    category: "late_night",
    action:
      "Place dots on paper, connect a few into an original constellation, and invent a clearly fictional story for it. Actual stargazing is optional and no trip into darkness is needed.",
    evidence: "the new constellation beside its short story",
    prompts: [
      "a heroic household object",
      "an animal with an everyday job",
      "a route that returns to the starting star",
      "a picture suggested by your initials",
      "a constellation for a small personal victory",
      "two constellations that complete one story",
    ],
    interests: ["making", "local_knowledge"],
    settings: both,
  },
  {
    id: "night_cover_design",
    title: "Album Cover for Tonight",
    category: "late_night",
    action:
      "Arrange objects you own or make a drawing for a fictional album cover. Invent the artist and title, then explain which real detail of your evening inspired the design.",
    evidence: "the finished cover and its fictional title",
    prompts: [
      "a jazz album about washing up",
      "an ambient record for waiting for the kettle",
      "a dramatic soundtrack for finding the remote",
      "a folk album about a worn notebook",
      "a concept album about the last biscuit",
      "a greatest-hits collection of tiny everyday wins",
    ],
    interests: ["music", "making", "comedy"],
    settings: home,
  },

  {
    id: "street_geometry",
    title: "Geometry Hiding in Plain Sight",
    category: "street_challenges",
    action:
      "Find geometric shapes in a small accessible public area and photograph only the permitted details. Arrange your discoveries into a visual sequence with a beginning and ending.",
    evidence: "the shape sequence and its unexpected final match",
    prompts: [
      "circles hiding inside rectangles",
      "triangles made by shadows",
      "a curve repeated in three different materials",
      "a nearly symmetrical view with one odd detail",
      "a tiny shape echoed by a larger one",
      "a pattern that returns to its first shape",
    ],
    interests: ["making", "local_knowledge"],
    settings: outside,
  },
  {
    id: "street_bench_editor",
    title: "The View Deserves a Review",
    category: "street_challenges",
    action:
      "Choose a permitted public sitting or standing spot and review the view using observable details. Keep paths clear, avoid filming bystanders, and invent a playful award for the scene.",
    evidence: "a close detail of the view and your original award",
    prompts: [
      "best supporting tree",
      "most unexpectedly good color combination",
      "the smallest detail with the biggest personality",
      "a view that could open an imaginary movie",
      "the most calming repeated pattern",
      "an ordinary corner with excellent dramatic timing",
    ],
    interests: ["local_knowledge", "comedy"],
    settings: outside,
  },
  {
    id: "street_sign_story",
    title: "A Story in Public Letters",
    category: "street_challenges",
    action:
      "Look at permitted public lettering and select a few ordinary words. Write an original fictional sentence or poem from them without claiming any business endorsed the result.",
    evidence: "your original sentence and a few non-identifying letter details",
    prompts: [
      "a sentence that sounds like a tiny adventure",
      "a title for a fictional detective story",
      "a greeting to an imaginary visitor",
      "a weather report made from unrelated words",
      "a six-word story with an unexpected ending",
      "a line that begins and ends with the same word",
    ],
    interests: ["making", "comedy", "local_knowledge"],
    settings: outside,
  },
  {
    id: "street_mini_documentary",
    title: "Documentary About One Small Thing",
    category: "street_challenges",
    action:
      "Observe a public detail without touching it or interviewing anyone. Make a short account using only what you can actually see, separating your personal interpretation from facts.",
    evidence: "the observed detail and one clearly supported observation",
    prompts: [
      "a repaired surface that still shows its history",
      "a pattern of leaves beside a path",
      "an unusually shaped public planter",
      "the design of a public wayfinding arrow",
      "a texture created by ordinary weather",
      "the shadow of a familiar landmark",
    ],
    interests: ["local_knowledge", "making"],
    settings: outside,
  },
  {
    id: "street_color_relay",
    title: "Pass the Color Forward",
    category: "street_challenges",
    action:
      "Photograph a detail, then find another nearby detail sharing one of its colors. Continue the visual chain inside your chosen accessible area and finish with a color from the first frame.",
    evidence: "the color chain returning to its opening color",
    prompts: [
      "start with something blue",
      "start with the quietest color you can find",
      "start with a warm color beside a cool one",
      "start with a color hidden in a shadow",
      "start with a bright detail no larger than your hand",
      "start with two colors in a single texture",
    ],
    interests: ["making", "local_knowledge"],
    settings: outside,
  },
  {
    id: "street_map_memory",
    title: "Draw This Corner from Memory",
    category: "street_challenges",
    action:
      "Study a small public scene, turn away or sit somewhere safe, and sketch its layout from memory. Compare with the real view and mark what your attention chose to keep.",
    evidence: "the memory sketch and one honest correction",
    prompts: [
      "the arrangement of three public objects",
      "the shape of a small planted area",
      "the colors in an ordinary facade",
      "the position of shadows across a clear space",
      "a public sign and the shapes around it",
      "a tiny view framed by two trees",
    ],
    interests: ["making", "local_knowledge", "games"],
    settings: outside,
  },
  {
    id: "street_typography",
    title: "The Lettering Detective",
    category: "street_challenges",
    action:
      "Find visible public lettering and compare its shapes, spacing, and materials. Draw an original letter inspired by what you notice rather than copying a full logo.",
    evidence: "your original letter beside a cropped source detail",
    prompts: [
      "rounded letters versus angular ones",
      "a letter with an unusual tail",
      "handmade lettering with a charming imperfection",
      "shadows that change how a letter looks",
      "the same letter in two different styles",
      "a letter design that matches the mood of the place",
    ],
    interests: ["making", "local_knowledge"],
    settings: outside,
  },
  {
    id: "street_reflection",
    title: "The Reflection Switch",
    category: "street_challenges",
    action:
      "Use a reflection visible from a permitted stationary spot to create a photo with an unexpected composition. Never enter roads or private property to get the frame.",
    evidence: "the reflected frame and a wider shot explaining it",
    prompts: [
      "a tree appearing inside an ordinary object",
      "a reflection that joins two unrelated shapes",
      "the sky broken into small pieces",
      "a curved reflection that changes scale",
      "a color echoed in a shiny surface",
      "a frame that reveals its source only at the end",
    ],
    interests: ["making", "skill_reveals"],
    settings: outside,
  },
  {
    id: "street_detail_awards",
    title: "Awards for Overlooked Details",
    category: "street_challenges",
    action:
      "Nominate real details in a small public area for invented awards. Explain your judging criteria and present the winner without attaching signs or leaving objects behind.",
    evidence: "the winning detail and your spoken or written award",
    prompts: [
      "best use of one surprising color",
      "most determined tiny plant",
      "best accidental face in an object",
      "most useful ordinary design",
      "most cinematic patch of light",
      "best comeback after a visible repair",
    ],
    interests: ["comedy", "local_knowledge", "competitive"],
    settings: outside,
  },
  {
    id: "street_route_caption",
    title: "A Trail Told in Captions",
    category: "street_challenges",
    action:
      "Choose a short accessible route or a single public spot with several views. Make original captions for your observations, then arrange them into a story; distance and speed do not matter.",
    evidence: "the observation sequence and its final caption",
    prompts: [
      "a journey narrated by an imaginary ant",
      "a normal afternoon described like a nature documentary",
      "a tiny expedition searching for a perfect curve",
      "a route where every caption asks a new question",
      "an adventure told through three ordinary objects",
      "a story whose last caption answers the first",
    ],
    interests: ["comedy", "making", "local_knowledge"],
    settings: outside,
  },
  {
    id: "street_nature_notes",
    title: "Nature Notes Without Taking Anything",
    category: "street_challenges",
    action:
      "Observe plants or other natural details from an allowed public path. Sketch or photograph differences without picking, feeding, handling wildlife, or claiming species identifications you cannot verify.",
    evidence: "your observation sheet and one real contrast",
    prompts: [
      "different leaf shapes visible from one spot",
      "new growth beside older growth",
      "a natural pattern repeated at two scales",
      "colors that change between sunlight and shade",
      "a plant finding space beside a built surface",
      "one detail that suggests a changing season",
    ],
    interests: ["local_knowledge", "making"],
    settings: outside,
  },
  {
    id: "street_frame_within",
    title: "Find a Frame Inside the Frame",
    category: "street_challenges",
    action:
      "Use existing shapes as a visual frame around a public detail. Make the composition from a permitted position, then reveal the simple framing trick in a wider shot.",
    evidence: "the framed composition and the wider explanation",
    prompts: [
      "a tree framed by another tree's branches",
      "a distant shape inside a nearby opening",
      "a small detail framed by its own shadow",
      "a color framed by neutral surfaces",
      "a repeating shape nested inside a larger version",
      "an ordinary object that looks monumental when framed",
    ],
    interests: ["making", "skill_reveals"],
    settings: outside,
  },

  {
    id: "demon_object_debate",
    title: "The Most Unnecessary Debate",
    category: "demon",
    action:
      "Make an absurd but harmless argument on behalf of an ordinary object. Give the opposing view equal time, then deliver a comic verdict without making false claims about real people.",
    evidence: "the strongest argument and your final verdict",
    prompts: [
      "should a spoon be allowed to lead the kitchen",
      "does a notebook deserve paid vacation",
      "is a sock a tiny sleeping bag",
      "should bookmarks receive loyalty awards",
      "can a mug be elected mayor of the desk",
      "is a pencil more dramatic than an eraser",
    ],
    interests: ["comedy", "absurd", "competitive"],
    settings: both,
    conflicts: ["public_performance"],
  },
  {
    id: "demon_paper_olympics",
    title: "The Tabletop Grand Championship",
    category: "demon",
    action:
      "Create a seated paper-and-pencil competition with an exact scoring rule. Compete with your own earlier attempt or willing companions, keep the actual scores, and present a homemade paper trophy.",
    evidence: "the actual score sheet and trophy presentation",
    prompts: [
      "drawing the most recognizable animal in ten lines",
      "making the clearest tiny maze",
      "naming the most original uses for a blank sheet",
      "copying a pattern accurately from memory",
      "inventing the best three-word fictional team name",
      "creating the strongest freestanding folded-paper arch",
    ],
    interests: ["games", "making", "competitive"],
    settings: both,
  },
  {
    id: "demon_micro_festival",
    title: "A Film Festival for One Object",
    category: "demon",
    action:
      "Make original short scenes in different genres using an object you own as the star. Review the scenes yourself or with willing companions and award a clearly homemade prize.",
    evidence: "the genre change and the winning original scene",
    prompts: [
      "a mug in a detective story",
      "a pencil in a space adventure",
      "a folded paper creature in a romantic comedy",
      "a notebook in a sports documentary",
      "a spoon in an epic historical drama",
      "a bookmark in a very slow chase scene",
    ],
    interests: ["making", "comedy", "absurd"],
    settings: both,
  },
  {
    id: "demon_silent_drama",
    title: "Silent Cinema, Huge Stakes",
    category: "demon",
    action:
      "Perform a tiny fictional drama using gestures, paper title cards, and your own props. Keep all movement stationary or at ordinary walking pace and make the final reveal clear.",
    evidence: "the decisive gesture and the ordinary truth behind it",
    prompts: [
      "discovering the pencil was behind your ear",
      "a dramatic reunion with a missing bookmark",
      "a heroic attempt to choose between two chairs",
      "an epic betrayal by a blank page",
      "a grand farewell to an empty mug",
      "a secret revealed by unfolding one sheet of paper",
    ],
    interests: ["comedy", "making", "absurd"],
    settings: both,
    conflicts: ["public_performance"],
  },
  {
    id: "demon_launch_event",
    title: "Launch the World's Smallest Big Idea",
    category: "demon",
    action:
      "Invent an obviously fictional upgrade for an object you own. Make a paper prototype, deliver a dramatic launch presentation, and end by revealing what the object really does.",
    evidence: "the paper prototype and honest real-world reveal",
    prompts: [
      "a bookmark with imaginary diplomatic powers",
      "a mug that claims to supervise meetings",
      "a pencil case marketed as a tiny hotel",
      "a paper crown for a highly qualified spoon",
      "a notebook billed as a portable blank universe",
      "a sock introduced as luxury foot accommodation",
    ],
    interests: ["making", "comedy", "absurd"],
    settings: both,
    conflicts: ["public_performance"],
  },
  {
    id: "demon_museum_tour",
    title: "The Extremely Questionable Museum",
    category: "demon",
    action:
      "Arrange ordinary objects you own as an explicitly fictional museum. Invent harmless backstories, guide a short tour, then reveal the real uses of your exhibits.",
    evidence: "your best fictional label followed by the actual object",
    prompts: [
      "artifacts from the kingdom of lost stationery",
      "tools of an imaginary microscopic civilization",
      "treasures from a very unsuccessful space mission",
      "relics of the world's most boring royal family",
      "inventions from a future obsessed with tea",
      "evidence from the great missing-sock mystery",
    ],
    interests: ["comedy", "making", "absurd"],
    settings: both,
  },
  {
    id: "demon_tabletop_escape",
    title: "Escape from One Sheet of Paper",
    category: "demon",
    action:
      "Design a short paper puzzle sequence with a clear final answer. Test every clue, run the attempt yourself or with a willing companion, then explain how the solution works; nobody is confined.",
    evidence: "the final clue, answer, and honest solving attempt",
    prompts: [
      "recovering a fictional museum's missing spoon",
      "decoding a message from a paper spaceship",
      "finding the key to an imaginary miniature city",
      "solving a mystery in a drawing of one room",
      "opening a paper vault with a shape sequence",
      "following clues that return to the first drawing",
    ],
    interests: ["games", "making", "elaborate_setups"],
    settings: both,
  },
  {
    id: "demon_awards_show",
    title: "The Everyday Achievement Awards",
    category: "demon",
    action:
      "Invent awards for ordinary objects or your own harmless habits. Make a tiny trophy, deliver original nomination speeches, and accept the winning award with theatrical commitment.",
    evidence: "the award, its actual reason, and the acceptance speech",
    prompts: [
      "best supporting pen",
      "outstanding contribution to keeping things warm",
      "lifetime achievement in holding paper together",
      "best comeback by an almost-forgotten hobby",
      "most reliable performance by a household object",
      "best accidental improvement to an ordinary day",
    ],
    interests: ["comedy", "absurd", "making"],
    settings: both,
    conflicts: ["public_performance"],
  },
  {
    id: "demon_breaking_news",
    title: "Breaking News About Almost Nothing",
    category: "demon",
    action:
      "Write and perform an obviously fictional news bulletin about your own ordinary objects. Use an invented station name, make no emergency claims, and end with the actual mundane explanation.",
    evidence: "the dramatic bulletin followed by the honest reveal",
    prompts: [
      "a pencil moving to a different side of the desk",
      "an empty mug awaiting its next assignment",
      "a notebook opening to a completely blank page",
      "a sock finally finding its partner",
      "a paperclip announcing a career change",
      "a lamp declining to comment on the weather",
    ],
    interests: ["comedy", "absurd"],
    settings: both,
    conflicts: ["public_performance"],
  },
  {
    id: "demon_improv_manual",
    title: "Instructions Nobody Asked For",
    category: "demon",
    action:
      "Write a mock instruction manual for an extremely simple everyday action. Demonstrate the harmless real action with absurdly serious narration and finish by simplifying it to one honest sentence.",
    evidence: "the overcomplicated demonstration and simple final instruction",
    prompts: [
      "how to open a notebook",
      "how to put a pencil on a table",
      "how to choose a bookmark",
      "how to admire a blank sheet of paper",
      "how to introduce two household objects",
      "how to return a mug to where it started",
    ],
    interests: ["comedy", "absurd", "making"],
    settings: both,
  },
  {
    id: "demon_invention_lab",
    title: "The Bureau of Unnecessary Inventions",
    category: "demon",
    action:
      "Draw and make a paper mock-up of a deliberately impractical invention. Demonstrate what it is supposed to do without power tools or risky tests, then name its funniest design flaw.",
    evidence: "the mock-up, its pretend use, and the admitted flaw",
    prompts: [
      "a hat for a pencil",
      "a tiny waiting room for paperclips",
      "a bookmark with an unnecessarily large balcony",
      "a trophy for a single pea-sized paper ball",
      "a privacy screen for an empty mug",
      "a travel brochure holder for imaginary holidays",
    ],
    interests: ["making", "comedy", "absurd"],
    settings: both,
  },
  {
    id: "demon_press_conference",
    title: "A Press Conference for Your Desk",
    category: "demon",
    action:
      "Choose an object you own as a fictional spokesperson. Write harmless questions, answer them in character using your own voice, and close by revealing the ordinary situation that inspired the announcement.",
    evidence: "the best original question and the mundane truth",
    prompts: [
      "a notebook explaining its blank-page policy",
      "a mug announcing a new handle strategy",
      "a pencil discussing its artistic ambitions",
      "a spoon responding to rumors of a promotion",
      "a bookmark defending its excellent attendance",
      "a paper crown announcing its retirement",
    ],
    interests: ["comedy", "absurd"],
    settings: both,
    conflicts: ["public_performance"],
  },
];

const missionIds = [
  "alpha",
  "bravo",
  "charlie",
  "delta",
  "echo",
  "foxtrot",
] as const;
const levels = {
  chill: {
    minutes: 25,
    structure:
      "Make one complete attempt. Choose a single detail worth showing and give an honest verdict.",
    opening: "One small mission",
    preparation: "start_now",
  },
  bold: {
    minutes: 40,
    structure:
      "Make two distinct attempts or versions. Change one clear creative choice between them, compare the results, and choose your winner with a reason.",
    opening: "Two attempts, one winner",
    preparation: "a_few_things",
  },
  full_send: {
    minutes: 55,
    structure:
      "Make a three-round mini event: an opening attempt, a deliberately different second version, and a final version combining what worked. Name the rounds, keep a visible result sheet, and give the finale a proper reveal. This needs no extra cast or booking.",
    opening: "Three rounds. One big reveal",
    preparation: "a_few_things",
  },
} as const;

/** Expands one editorial recipe into its six briefs × three intensities.
 * Pure: the same recipe always yields the same 18 variants. Generated draft
 * recipes (see quest-ideas.ts) reuse this so drafts are catalog-compatible. */
function legacyRecipeVariants(recipe: ActivityRecipe): QuestVariant[] {
  return recipe.prompts.flatMap((prompt, promptIndex) =>
    (Object.keys(levels) as (keyof typeof levels)[]).map((intensity) => {
      const level = levels[intensity];
      const familyId = `activity_${recipe.id}`;
      return {
        id: `${familyId}_${missionIds[promptIndex]}_${intensity}_v1`,
        familyId,
        variantKey: missionIds[promptIndex],
        version: 1,
        title: `${prompt.charAt(0).toUpperCase()}${prompt.slice(1)}`,
        category: recipe.category,
        intensity,
        hook: `${level.opening}: ${prompt}. Can you make the ordinary worth a second look?`,
        durationMinutes: level.minutes,
        minParticipants: recipe.category === "date_night" ? 2 : 1,
        maxParticipants: 8,
        cost: {
          minMinor: 0,
          maxMinor: 0,
          currency: "USD" as const,
          scope: "total" as const,
          venueCostUnknown: false,
          note: "No purchase, admission, or booking is required. Use your phone, paper and objects you already own. Choose a free place where this activity is allowed; paid entry is not part of this quest. Any confirmed outing travel or entry costs still count toward your budget.",
        },
        settings: recipe.settings,
        interests: recipe.interests,
        roles: [
          "main_character",
          "mastermind",
          "camera_person",
          "rotate",
        ] as QuestVariant["roles"],
        preparation: level.preparation,
        conflicts: recipe.conflicts ?? [],
        venuePermissionRequired: false,
        arrangementRequired: false,
        adultOnly: false,
        supportsAdultContext: false,
        requiresVolunteer: false,
        beats: [
          {
            label: "The hook",
            action: `Your brief: ${prompt}. Choose a small permitted space and the supplies you already have. ${level.structure}`,
            filming: `Open with the unfinished subject or your prediction, before revealing the result. Say or write: “Our mission: ${prompt}.” Hold a recognizable opening frame you can return to at the end.`,
            caption: level.opening,
          },
          {
            label: "The attempt",
            action: `${recipe.action} Follow the ${intensity === "full_send" ? "three-round" : intensity === "bold" ? "two-version" : "single-attempt"} plan from your setup. If you are with others, share the decisions and take turns; an imperfect result still counts.`,
            filming: `Capture the real decision or change while making ${recipe.evidence}. Record short parts as the activity happens; stop between parts. Show one obstacle or surprise honestly instead of staging a false reaction.`,
            caption: "Did the idea work?",
          },
          {
            label: "The reveal + loop",
            action: `Show ${recipe.evidence}. Answer the opening question with what actually happened and name one choice you would keep or change. Finish at the opening subject or composition so the result leads naturally back to the question.`,
            filming: `Show ${recipe.evidence}, then return to the same composition as your first frame. End with “That started with…” or a visual match back to the beginning. Keep the real outcome; a loop does not need a fake surprise.`,
            caption: "Back to where it began",
          },
        ] as QuestVariant["beats"],
        materials: [
          "A phone",
          "Paper and a pen when the brief needs them",
          "Safe ordinary objects you already own",
        ],
        completionQuestions: [
          `Did you make the ${intensity === "full_send" ? "three-round" : intensity === "bold" ? "two-version" : "single-attempt"} activity for your chosen brief and show the actual result?`,
          "Did everyone shown agree to being recorded, or did you film only your own work and give an honest recap?",
          "Did you stay within the chosen free, permitted space and leave it as you found it?",
        ],
        fallback: recipe.settings.includes("home")
          ? "Use a quiet corner at home and supplies you already own. A rough drawing, an ordinary object, or an honest unsuccessful attempt can carry the story. Keep the selected number of rounds."
          : "Choose a smaller accessible public spot and observe from one stationary position. No long walk, stranger participation, purchase, or special access is required. Return in suitable conditions if the space is unavailable.",
        requirements: [
          "Use your own objects or observe public details from a permitted place. No purchase, outside cast, audience, or advance booking is required.",
          "Keep voices considerate and paths clear. Film your own work or consenting companions; leave identifiable bystanders and private information out of frame.",
          ...(recipe.settings.includes("venue")
            ? [
                "Choose a free-access venue that allows this quiet activity and personal filming. If entry or permission is unavailable, use a home or outdoor setting instead.",
              ]
            : []),
        ],
        award: { ...AWARDS[intensity] },
        cooldownDays: 30,
      } satisfies QuestVariant;
    }),
  );
}

/** Frozen v1 content is kept for immutable history and idempotent seed replay. */
export const historicalActivityCatalog: QuestVariant[] =
  historicalActivityRecipes.flatMap(legacyRecipeVariants);

/** A revision keeps the reward family; it does not create extra earning families. */
export const activityRecipes: ActivityRecipe[] = historicalActivityRecipes.map(
  (recipe) =>
    recipe.id === "date_memory_map"
      ? {
          ...recipe,
          title: "The Three-Stop Date",
          action:
            "Build a short date with three free stops in one familiar area. Each partner picks one stop; choose the last together. Visit them in order and decide which one you would come back to.",
          evidence: "one detail from each stop and your shared favorite",
          settings: ["outside"],
          prompts: [
            "a good view, a curious detail, and somewhere to sit",
            "a mural, an unusual doorway, and a quiet corner",
            "three places you usually pass without stopping",
            "one stop in each partner's favorite color, then a shared pick",
            "a place for a photo, a place for a story, and a place to rest",
            "three free stops along one short accessible route",
          ],
        }
      : recipe.id === "date_mini_game"
        ? {
            ...recipe,
            prompts: recipe.prompts.map((prompt, index) =>
              index === 3 ? "a strategy game for paper tokens" : prompt,
            ),
          }
        : recipe,
);

type ActivityCoaching = {
  hook: string;
  setup: string;
  shots: [string, string, string];
  finish: string;
  challenge?: Record<Intensity, string>;
};

const coaching: Record<string, ActivityCoaching> = {
  date_photo_duet: {
    hook: "Same brief. Two different photos. Don't show each other until the reveal.",
    setup:
      "Read the photo brief together. Agree a small area and keep your screens hidden from each other.",
    shots: [
      "Film both of you naming the photo brief with your screens turned away. Keep the finished photos hidden.",
      "Record a few seconds of each person choosing a subject or framing a shot; avoid revealing the finished images.",
      "Show both photos side by side and capture your first comparison. Finish on the same two phones from your opening, now with the photos visible.",
    ],
    finish:
      "Reveal both photos at the same time. Name one thing the other person noticed that you missed.",
    challenge: {
      chill: "Take one photo each and compare them.",
      bold: "Take two photos each using different angles; each partner chooses their final entry before the reveal.",
      full_send:
        "Each partner makes a three-photo mini story answering the brief. Reveal both sequences, then choose one frame from each to make a shared final pair.",
    },
  },
  date_postcard: {
    hook: "Make a postcard from where you are right now, then trade without a preview.",
    setup:
      "Fold two pieces of paper into cards. Choose one real detail nearby and keep your message hidden until you exchange them.",
    shots: [
      "Show the blank cards beside the real place you are drawing.",
      "Film a drawing taking shape and a short line being written; hide anything private.",
      "Film the card exchange, then hold both finished drawings in one frame.",
    ],
    finish:
      "Exchange the cards. Read an agreed line aloud and choose a real detail to revisit next time.",
  },
  date_portrait: {
    hook: "Draw each other with one ridiculous rule. Reveal the portraits together.",
    setup:
      "Choose the drawing rule below, give each person paper, and agree a five-minute drawing timer. Keep the drawings face down until both are ready.",
    shots: [
      "Say the drawing rule over two blank sheets. Don't show a finished portrait yet.",
      "Film the pencil following the rule and a quick reaction to the difficulty.",
      "Reveal both drawings together. Ask which real detail each person managed to capture.",
    ],
    finish:
      "Swap portraits and point out one recognizable detail. Keep jokes about the drawings, not anyone's appearance.",
  },
  date_memory_map: {
    hook: "Three free stops. You pick one, your date picks one, and the last is a joint decision.",
    setup:
      "Pick one familiar area and check that all three stops are free, open, and close enough for your available time. Use the selected place as the starting point if you chose one; it is not a promise of entry or opening hours.",
    shots: [
      "Film yourselves naming the three-stop challenge at your starting point. Say what kind of stop each of you is choosing; save the favorite for the end.",
      "At each stop, record one short detail that explains why you chose it. Film while stopped, not while navigating or crossing roads.",
      "Show your favorite stop and give one sentence explaining the choice. A final look at the route can connect back to your opening; no repeated reaction is needed.",
    ],
    finish:
      "At the last stop, each choose a favorite and explain why. Agree one place you would return to.",
    challenge: {
      chill:
        "Keep all three stops in one small area. A few different views from an accessible public spot are enough.",
      bold: "Keep your individual choices a surprise until you reach them. At each stop, the chooser has thirty seconds to explain why it belongs on the date.",
      full_send:
        "Plan three distinct reveals along one short route: the first partner leads stop one, the second leads stop two, then create a shared photo or mini picnic with things you already brought at stop three.",
    },
  },
  date_object_museum: {
    hook: "Choose an ordinary object that tells a story about you two. Give it the museum treatment.",
    setup:
      "Each pick an object you own and write a short museum label. Agree which parts of its story are okay to film.",
    shots: [
      "Show an object without its label and ask why it belongs in your museum.",
      "Film the label being made and one person giving a short tour.",
      "Show the object with its finished label and tell the actual story behind it.",
    ],
    finish:
      "Give each other a one-minute tour. Pick the label that tells the clearest true story.",
  },
  date_trailer: {
    hook: "Turn an ordinary date moment into a movie trailer using only your own voices and props.",
    setup:
      "Choose the film premise below. Write three shots: the situation, a complication, and the reveal. Give each person a role.",
    shots: [
      "Show the ordinary prop or situation and announce the movie genre.",
      "Film your most committed trailer moment, including the real attempt to get the shot.",
      "Show the final scene, then reveal the ordinary prop again. That repeated prop can make a natural visual loop.",
    ],
    finish:
      "Play the trailer back together and choose a title that makes the ordinary premise clear.",
  },
  date_prompt_walk: {
    hook: "Find a detail your date would have walked straight past, then bring them to see it.",
    setup:
      "Choose a small accessible area and the discovery prompt below. Each partner finds a detail without showing the other yet.",
    shots: [
      "Name the discovery prompt at your starting point; keep your chosen details out of frame.",
      "Film a short search or your partner noticing their find. Stop filming while crossing or navigating.",
      "Reveal both details and give each person one sentence to explain their choice.",
    ],
    finish:
      "Show each other the discoveries. Choose which one changed how you see the place.",
  },
  date_mini_game: {
    hook: "Invent a game you can explain in one sentence. Find out whether it actually works.",
    setup:
      "Put paper and a few objects on a stable surface. Write how a turn works and the exact condition for winning.",
    shots: [
      "Show the board and state the win condition before the first turn.",
      "Record a real turn and the moment a rule works or causes confusion.",
      "Show the result beside the corrected rule. End with the board reset if you want the next loop to look like a new game.",
    ],
    finish:
      "Play a complete game, change one confusing rule, and explain the final version in one sentence.",
  },
  date_shared_skill: {
    hook: "Teach your date one tiny skill. Show the first attempt before the improved one.",
    setup:
      "Choose a skill one of you genuinely knows from the prompt below. Gather what it needs and let the learner make one uncoached attempt.",
    shots: [
      "Film the learner's first attempt and name the skill they will learn.",
      "Capture one useful tip being demonstrated, then the learner trying it.",
      "Show the improved attempt beside the first. Keep the outcome honest if it is still difficult.",
    ],
    finish:
      "Swap teacher and learner roles if both have something to teach. Each name the tip that helped most.",
  },
  date_soundtrack: {
    hook: "Make your date a theme tune. One person starts the rhythm; the other adds the melody or words.",
    setup:
      "Choose the theme below. Agree a quiet volume and a short original rhythm you can both repeat.",
    shots: [
      "Name what the theme tune is for and show the two people about to contribute.",
      "Record a layer being added and the real attempt to make the sounds work together.",
      "Perform the finished tune once. Let its last beat lead back to the opening rhythm only if it fits naturally.",
    ],
    finish:
      "Perform the finished theme and give it a title. Use your own sounds rather than a commercial backing track.",
  },
  date_paper_picnic: {
    hook: "Design an impossible picnic, then see what part you can make work with things you already have.",
    setup:
      "Pick the picnic premise below. Each sketch one idea, then gather a few objects you own to represent it.",
    shots: [
      "Show the two picnic sketches before revealing the finished setup.",
      "Film the moment you turn one impossible idea into something achievable.",
      "Show the finished setup and explain which part you could actually use on a real picnic.",
    ],
    finish:
      "Choose one practical idea to keep for a real free outing. Food purchases are not required.",
  },
  date_time_capsule: {
    hook: "Make three predictions for your next date, then seal them without showing the private parts.",
    setup:
      "Choose when you will open the notes. Each write a prediction and a small wish; agree which single line may be filmed.",
    shots: [
      "Show the blank notes and state when you will open them.",
      "Film writing or folding without revealing private words; read only the agreed line.",
      "Show the sealed, dated notes and where you will keep them. Returning to the opening envelope gives an optional visual loop.",
    ],
    finish:
      "Date and keep the notes somewhere private. Put the agreed opening date in your own calendar if you want a reminder.",
  },
};

function shortText(value: string, max: number) {
  if (value.length <= max) return value;
  const cut = value.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[,:;]$/, "")}…`;
}

/** Reviewed generation uses the activity as the task and the prompt as a brief.
 * It never asks a user to "make" a memory, reaction, or an abstract title. */
export function recipeVariants(
  recipe: ActivityRecipe,
  version = 1,
): QuestVariant[] {
  if (!recipe.prompts.length || recipe.prompts.length > missionIds.length)
    throw new Error("A recipe needs one to six authored briefs.");
  const plan = coaching[recipe.id];
  const constraints = recipe.constraints;
  const intensities: Intensity[] = constraints
    ? [constraints.intensity]
    : ["chill", "bold", "full_send"];
  return recipe.prompts.flatMap((prompt, promptIndex) =>
    intensities.map((intensity) => {
      const level = levels[intensity];
      const familyId = `activity_${recipe.id}`;
      const challenge =
        plan?.challenge?.[intensity] ??
        (constraints
          ? ""
          : {
              chill: "Make one complete result for this brief.",
              bold: "Make a first version, deliberately change one detail, and compare the results.",
              full_send:
                "Make three different entries for the brief, choose a winner using one clear criterion, and show why it won.",
            }[intensity]);
      const task = `${recipe.action} ${challenge}`.trim();
      const participantMin = constraints
        ? constraints.groups.includes("solo")
          ? 1
          : 2
        : recipe.category === "date_night"
          ? 2
          : 1;
      const participantMax = constraints
        ? constraints.groups.includes("friends")
          ? 8
          : constraints.groups.includes("couple")
            ? 2
            : 1
        : 8;
      const cost = constraints?.cost ?? { minMinor: 0, maxMinor: 0 };
      const paid = cost.maxMinor > 0;
      return {
        id: `${familyId}_${missionIds[promptIndex]}_${intensity}_v${version}`,
        familyId,
        variantKey: missionIds[promptIndex],
        version,
        // Render manifests share this title and have a 96-character limit.
        title: shortText(`${recipe.title}: ${prompt}`, 96),
        category: recipe.category,
        intensity,
        hook: shortText(
          `${plan?.hook ?? recipe.action.split(/(?<=\.)\s/)[0]} Brief: ${prompt}.`,
          260,
        ),
        durationMinutes: constraints
          ? Math.max(15, constraints.minutes)
          : level.minutes,
        minParticipants: participantMin,
        maxParticipants: participantMax,
        ...(constraints ? { allowedGroups: [...constraints.groups] } : {}),
        cost: {
          ...cost,
          currency: "USD",
          scope: "total",
          venueCostUnknown: false,
          note: paid
            ? "This is the activity's estimated total cost. Check current prices before choosing it; any confirmed travel and entry charges also count toward your budget."
            : "Use things you already own and a free, permitted place. No purchase or booking is required. Any confirmed travel or entry charges still count toward your budget.",
        },
        settings: recipe.settings,
        interests: recipe.interests,
        roles: ["main_character", "mastermind", "camera_person", "rotate"],
        preparation: level.preparation,
        conflicts: recipe.conflicts ?? [],
        venuePermissionRequired: false,
        arrangementRequired: false,
        adultOnly: false,
        supportsAdultContext: false,
        requiresVolunteer: false,
        beats: [
          {
            label: "Set up the challenge",
            action:
              `${plan?.setup ?? recipe.action} Today's brief: ${prompt}. ${challenge}`.trim(),
            filming:
              plan?.shots[0] ??
              shortText(
                `Introduce ${recipe.title.toLowerCase()} and show what you will use. Say the brief: “${prompt}.” Keep the finished result for the end.`,
                400,
              ),
            caption: shortText(recipe.title, 80),
          },
          {
            label: "Do the activity",
            action: task,
            filming:
              plan?.shots[1] ??
              `Record a short moment of the activity itself, with ${recipe.evidence} taking shape. Keep the camera on the specific choice, movement, or change; stop between takes to skip waiting.`,
            caption: "The attempt",
          },
          {
            label: "Show the result",
            action:
              plan?.finish ??
              `Show ${recipe.evidence}. Point out one real detail that worked or surprised you. An unsuccessful attempt is still a result; do not stage a reaction.`,
            filming:
              plan?.shots[2] ??
              `Get a clear close-up of ${recipe.evidence}, then give your honest verdict in one sentence. Only repeat an opening frame if it helps show the change.`,
            caption: "The result",
          },
        ],
        materials: [
          "A phone",
          "Any paper or ordinary objects needed for your chosen brief",
        ],
        completionQuestions: [
          "Did you attempt the activity and show the actual result?",
          "Did everyone shown agree to be recorded?",
          "Did you use a permitted place and leave it as you found it?",
        ],
        fallback:
          recipe.id === "date_memory_map"
            ? "Use three different views within one accessible public area. Skip any closed, paid, or unsuitable stop; do not change your budget or enter private property."
            : "If the place or supplies are unavailable, choose another eligible quest. Keep your budget and boundaries; a shorter honest attempt is better than pretending the planned result happened.",
        requirements: [
          "Film yourself, your own work, or consenting companions. Keep paths clear and private information out of frame.",
          ...(constraints?.note ? [constraints.note] : []),
          ...(recipe.settings.includes("venue")
            ? [
                "Check that the venue allows your activity and personal filming. A place suggestion does not confirm permission or opening hours.",
              ]
            : []),
        ],
        award: { ...AWARDS[intensity] },
        cooldownDays: 30,
      } satisfies QuestVariant;
    }),
  );
}

/** Current recommendations use new immutable versions of the same 60 families. */
const authoredActivityVersions: QuestVariant[] = activityRecipes.flatMap(
  (recipe) => recipeVariants(recipe, 2),
);

// These immutable versions remain available for accepted-story playback. Their
// generic multiplier mechanics do not meet the current Full Send promise.
export const retiredFullSendActivityCatalog = authoredActivityVersions.filter(
  (quest) => quest.intensity === "full_send",
);
export const activityCatalog: QuestVariant[] = authoredActivityVersions.filter(
  (quest) => quest.intensity !== "full_send",
);
