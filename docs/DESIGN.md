# Sidequest interface

The visual direction combines restrained system typography, neutral surfaces, and
subtle translucent navigation with a creator-led social feed. Instagram is the Meta
reference for this pass. Sidequest keeps its own identity and real quest actions.

`src/styles.css` retains the existing functional layouts, capture controls, and
media states. `src/design.css`, loaded after it, defines the shared visual layer:
colors, surface and radius treatments, responsive navigation, feed, profile, and
activity presentation. No external fonts or new UI dependency are required.

- Mobile uses four floating primary tabs ordered **Create, Discover, Activity,
  Profile**, and a header **Your space** disclosure for
  private journal, rewards, studio, and account settings. Desktop at 1120px and up
  uses a left navigation rail and a contextual Discover sidebar.
- Discover leads with creator identity and real video. **All quests / Open to
  brands** uses the existing server-supported inquiry filter. The header remains
  available during loading or a recoverable error; filter changes retain focus.
- Profiles group avatar, bio, actual counts, and editing. Activity uses compact
  icon-led rows, semantic timestamps, and explicit unread state.
- Primary actions use blue; navigation and content surfaces stay mostly neutral.
  Large controls, visible focus, reduced-motion handling, and native video controls
  remain in place. The demo identity selector and fixture disclosures stay explicit.
- No decorative follower totals, likes, comments, or nonworking social controls
  were added. Publishing and licensing authorization retain their existing flows.

Verified locally on September 29, 2026: all 13 existing browser scenarios passed;
four main destinations were checked at 320/390/768/1440px with no horizontal
overflow, plus 200% text at 320px. An explicit local API fixture verified delayed
feed loading, failure, keyboard focus, retry, and filter reset. Screenshots are
under `output/design`; browser regression artifacts are under
`output/output-design-regression`. This is a local presentation pass, not a deployment.

Create now uses `QuestWizard` for one question per screen, progress, Back/Continue,
and an editable review before the separate results screen. Home plans have seven
questions; heading out adds a travel question. Trying an existing quest starts with
the participant question because its scene and energy are already defined. Optional
area entry stays collapsed until requested. Venue costs and permissions remain
explicit, and changing the setting clears venue/adult confirmations.

Valid outing answers and the current question survive refresh in the current tab.
Demo identity switches, reset, and sign-out clear that draft; acceptance clears the
question position. Matching locks review edits until the request finishes. Numeric
validation handles invalid intermediate values without crashing the budget total.
New browser regressions cover question isolation, nav order, Back, refresh, review
edits, invalid numbers, and conditional venue/travel state. Every wizard step was
checked at 320/390/768/1440px and at 200% text on 320px without horizontal overflow.
