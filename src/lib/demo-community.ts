import { catalog } from "../../shared/catalog";
import {
  communityMutationSchema,
  communityReadSchema,
  originalQuestIdentity,
  type CommunityAction,
  type CommunityView,
  type CreatorProfile,
  type CommunityPost,
  type OriginalDraft,
  type BusinessProfile,
  type LicenseOffer,
  type CommunityActivity,
  type CommunityReport,
} from "../../shared/community";
import type { Run } from "./types";
import { DEMO_PEOPLE, demoActor, demoPersona } from "./demo-identity";

const KEY = "sidequest-community-demo-v1";
export const DEMO_POST_ID = "55555555-5555-4555-8555-555555555555";
const FIXTURE_ASSET = "66666666-6666-4666-8666-666666666666";
type StoredPost = CommunityPost & {
  ownerId: string;
  runId: string;
  assetId: string;
};
type Activity = CommunityActivity & { recipientId: string };
type State = {
  creators: Record<string, CreatorProfile>;
  posts: StoredPost[];
  drafts: OriginalDraft[];
  brands: (BusinessProfile & { ownerId: string })[];
  offers: LicenseOffer[];
  activity: Activity[];
  reports: CommunityReport[];
  blocks: { by: string; target: string }[];
  readIds: string[];
  requests: Record<string, { fingerprint: string; result: unknown }>;
};
const now = () => new Date().toISOString();
function creator(
  id: string,
  name: string,
  avatarKey: CreatorProfile["avatarKey"],
): CreatorProfile {
  return {
    id,
    displayName: name,
    avatarKey,
    bio: "Clearly labeled local demonstration account.",
    openToBrands: false,
    version: 1,
    publishedCount: 0,
    attemptCount: 0,
    authoredCount: 0,
    demo: true,
  };
}
function initial(): State {
  const creators = Object.fromEntries(
    Object.values(DEMO_PEOPLE).map((person, index) => [
      person.id,
      creator(
        person.id,
        person.name,
        ["coral", "mint", "violet", "sunset"][
          index
        ] as CreatorProfile["avatarKey"],
      ),
    ]),
  );
  creators[DEMO_PEOPLE.viewer.id].openToBrands = true;
  const quest =
    catalog.find((item) => item.id === "date_pit_crew_chill_v1") ||
    catalog.find(
      (item) => item.category === "date_night" && item.intensity === "chill",
    )!;
  return {
    creators,
    posts: [
      {
        id: DEMO_POST_ID,
        ownerId: DEMO_PEOPLE.viewer.id,
        runId: "77777777-7777-4777-8777-777777777777",
        assetId: FIXTURE_ASSET,
        creator: creators[DEMO_PEOPLE.viewer.id],
        quest,
        questAuthor: null,
        caption:
          "DEMO · Synthetic FFmpeg footage showing how a published attempt connects to a real quest. This is not a genuine participant or brand endorsement.",
        brandOptIn: true,
        state: "published",
        version: 1,
        createdAt: "2026-09-29T12:00:00.000Z",
        attemptCount: 0,
        mediaUrl: "/api/local-media/demo-reel",
        thumbnailUrl: "/api/local-media/demo-reel?thumbnail=1",
        sponsorDisclosure: null,
        inspiredByPostId: null,
        demo: true,
      },
    ],
    drafts: [],
    brands: [
      {
        id: DEMO_PEOPLE.brand.id,
        ownerId: DEMO_PEOPLE.brand.id,
        name: "Demo brand · no real business",
        website: "https://example.com",
        contactEmail: "demo@example.com",
        state: "approved",
        version: 1,
        reviewNotes: "Simulated approval for local testing only.",
      },
    ],
    offers: [],
    activity: [],
    reports: [],
    blocks: [],
    readIds: [],
    requests: {},
  };
}
function read(): State {
  try {
    const value = localStorage.getItem(KEY);
    return value ? JSON.parse(value) : initial();
  } catch {
    return initial();
  }
}
function write(state: State) {
  localStorage.setItem(KEY, JSON.stringify(state));
  window.dispatchEvent(new Event("sidequest-change"));
}
function requireValue<T>(
  value: T | null | undefined,
  message = "This item is unavailable.",
): T {
  if (!value) throw new Error(message);
  return value;
}
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function checkVersion(actual: number, expected: number) {
  check(
    actual === expected,
    "This item changed. Refresh and review its latest version.",
  );
}
function blocked(state: State, first: string, second: string) {
  return state.blocks.some(
    (row) =>
      (row.by === first && row.target === second) ||
      (row.by === second && row.target === first),
  );
}
function runsFor(id: string): Run[] {
  const name = Object.entries(DEMO_PEOPLE).find(
    ([, person]) => person.id === id,
  )?.[0];
  if (!name) return [];
  try {
    return (
      JSON.parse(
        localStorage.getItem(
          name === "creator"
            ? "sidequest-demo-v1"
            : `sidequest-demo-v1:${name}`,
        ) || "null",
      )?.runs || []
    );
  } catch {
    return [];
  }
}
function allRuns() {
  return Object.values(DEMO_PEOPLE).flatMap((person) =>
    runsFor(person.id).map((run) => ({ ...run, ownerId: person.id })),
  );
}
function creatorDto(state: State, id: string): CreatorProfile {
  const item = requireValue(state.creators[id]);
  return {
    ...item,
    publishedCount: state.posts.filter(
      (p) => p.ownerId === id && isPublished(state, p),
    ).length,
    attemptCount: allRuns().filter((run) =>
      state.posts.some(
        (post) => post.ownerId === id && post.id === run.inspiredByPostId,
      ),
    ).length,
    authoredCount: state.drafts.filter(
      (d) => d.authorId === id && d.state === "approved",
    ).length,
  };
}
function hasReel(post: StoredPost) {
  return (
    post.id === DEMO_POST_ID ||
    runsFor(post.ownerId).some(
      (run) =>
        run.id === post.runId &&
        // Re-rendering keeps the already-published exact file. Deleting this
        // run's media removes all versions and clears this reference.
        Boolean(run.render),
    )
  );
}
function isPublished(_state: State, post: StoredPost) {
  return post.state === "published" && hasReel(post);
}
function postDto(state: State, item: StoredPost): CommunityPost {
  const { ownerId, runId: _runId, assetId: _assetId, ...publicFields } = item;
  return {
    ...publicFields,
    mediaUrl: hasReel(item) ? publicFields.mediaUrl : "",
    thumbnailUrl: hasReel(item) ? publicFields.thumbnailUrl : "",
    creator: creatorDto(state, ownerId),
    attemptCount: allRuns().filter((run) => run.inspiredByPostId === item.id)
      .length,
  };
}
function offerDto(state: State, offer: LicenseOffer): LicenseOffer {
  const brand = state.brands.find((item) => item.id === offer.brandId);
  const post = state.posts.find((item) => item.id === offer.postId);
  const active =
    offer.state === "completed" &&
    !offer.suspended &&
    offer.fulfillment &&
    Date.parse(offer.fulfillment.usageStartsAt) <= Date.now() &&
    Date.parse(offer.fulfillment.usageEndsAt) > Date.now() &&
    brand?.state === "approved" &&
    brand.ownerId === demoActor().id &&
    post &&
    hasReel(post);
  return {
    ...offer,
    mediaUrl: active ? post.mediaUrl : null,
  };
}
function activityFor(state: State, actor: string): CommunityActivity[] {
  const derived: Activity[] = allRuns().flatMap((run) => {
    const post = state.posts.find((item) => item.id === run.inspiredByPostId);
    return post &&
      post.ownerId === actor &&
      run.ownerId !== actor &&
      !blocked(state, actor, run.ownerId)
      ? [
          {
            id: run.id,
            recipientId: actor,
            kind: "inspired_attempt",
            text: `${state.creators[run.ownerId]?.displayName || "A demo creator"} started their version of ${post.quest.title}.`,
            href: `/posts/${post.id}`,
            readAt: null,
            createdAt: run.createdAt,
          },
        ]
      : [];
  });
  return [
    ...state.activity.filter((item) => item.recipientId === actor),
    ...derived,
  ]
    .map(({ recipientId: _recipient, ...item }) => ({
      ...item,
      readAt: state.readIds.includes(item.id) ? item.readAt || now() : null,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
function notify(
  state: State,
  recipientId: string,
  kind: string,
  text: string,
  href: string,
) {
  if (!blocked(state, recipientId, demoActor().id))
    state.activity.push({
      id: crypto.randomUUID(),
      recipientId,
      kind,
      text,
      href,
      readAt: null,
      createdAt: now(),
    });
}
export function demoOriginalTemplates() {
  return read()
    .drafts.filter((draft) => draft.state === "approved")
    .map((draft) => draft.quest);
}
export function demoInspiration(postId: string, templateId: string) {
  const state = read();
  const post = requireValue(state.posts.find((item) => item.id === postId));
  check(
    isPublished(state, post) &&
      !blocked(state, demoActor().id, post.ownerId) &&
      post.quest.id === templateId,
    "The inspiring post is unavailable or this is a different quest. Find another quest.",
  );
}
export function demoRead<T>(
  view: CommunityView,
  raw: Record<string, unknown> = {},
): T {
  const input = communityReadSchema.parse(raw),
    state = read(),
    actor = demoActor().id;
  const visible = state.posts.filter(
    (post) => isPublished(state, post) && !blocked(state, actor, post.ownerId),
  );
  const myBrand = state.brands.find((brand) => brand.ownerId === actor) || null;
  const myOffers = state.offers
    .filter(
      (offer) => offer.creatorId === actor || myBrand?.id === offer.brandId,
    )
    .map((offer) => offerDto(state, offer));
  let result: unknown;
  switch (view) {
    case "feed": {
      const filtered = visible
        .filter(
          (post) =>
            (!input.templateId || post.quest.id === input.templateId) &&
            (!input.brandOnly ||
              (post.brandOptIn &&
                state.creators[post.ownerId]?.openToBrands)) &&
            (!input.before || post.createdAt < input.before),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const posts = filtered.slice(0, input.limit || 20);
      result = {
        posts: posts.map((post) => postDto(state, post)),
        nextCursor:
          filtered.length > posts.length ? posts.at(-1)?.createdAt : null,
      };
      break;
    }
    case "post": {
      const post = requireValue(
        state.posts.find(
          (p) =>
            p.id === input.id &&
            (p.ownerId === actor || isPublished(state, p)) &&
            !blocked(state, actor, p.ownerId),
        ),
      );
      result = postDto(state, post);
      break;
    }
    case "creator":
      check(
        !blocked(state, actor, requireValue(input.id)),
        "This creator is unavailable.",
      );
      result = {
        creator: creatorDto(state, requireValue(input.id)),
        posts: visible
          .filter((post) => post.ownerId === input.id)
          .map((post) => postDto(state, post)),
        quests: state.drafts
          .filter(
            (draft) =>
              draft.authorId === input.id && draft.state === "approved",
          )
          .map((draft) => draft.quest),
      };
      break;
    case "me":
      result = {
        userId: actor,
        roles: demoPersona() === "operator" ? ["operator"] : [],
        creator: creatorDto(state, actor),
        posts: state.posts
          .filter((post) => post.ownerId === actor)
          .map((post) => postDto(state, post)),
        publications: state.posts
          .filter((post) => post.ownerId === actor)
          .map((post) => ({ runId: post.runId, postId: post.id })),
        drafts: state.drafts.filter((draft) => draft.authorId === actor),
        brand: myBrand,
        offers: myOffers,
        activity: activityFor(state, actor),
        blocks: state.blocks
          .filter((row) => row.by === actor)
          .map((row) => row.target),
      };
      break;
    case "activity": {
      const items = activityFor(state, actor);
      result = {
        items,
        unreadCount: items.filter((item) => !item.readAt).length,
      };
      break;
    }
    case "offers":
      result = { offers: myOffers };
      break;
    case "offer":
      result = requireValue(
        myOffers.find((offer) => offer.id === input.id) ||
          (demoPersona() === "operator"
            ? state.offers.find((offer) => offer.id === input.id)
            : null),
      );
      break;
    case "draft":
      result = requireValue(
        state.drafts.find(
          (draft) =>
            draft.id === input.id &&
            (draft.authorId === actor || demoPersona() === "operator"),
        ),
      );
      break;
    case "brand":
      result = {
        brand: myBrand,
        posts:
          myBrand?.state === "approved"
            ? visible
                .filter(
                  (post) =>
                    post.brandOptIn &&
                    state.creators[post.ownerId]?.openToBrands,
                )
                .map((post) => postDto(state, post))
            : [],
      };
      break;
    case "operator":
      check(demoPersona() === "operator", "Operator access required.");
      result = {
        drafts: state.drafts.filter((draft) => draft.state === "submitted"),
        businesses: state.brands,
        offers: state.offers.map((offer) => offerDto(state, offer)),
        reports: state.reports,
      };
      break;
  }
  return structuredClone(result) as T;
}

export async function demoMutate<T>(
  action: CommunityAction,
  input: unknown,
  key: string,
): Promise<T> {
  const operation = communityMutationSchema.parse({ action, input });
  const actor = demoActor().id;
  const execute = () => {
    const state = read();
    const fingerprint = JSON.stringify(operation),
      requestKey = `${actor}:${key}`;
    const replay = state.requests[requestKey];
    if (replay) {
      check(
        replay.fingerprint === fingerprint,
        "This request was already used for a different action.",
      );
      return structuredClone(replay.result) as T;
    }
    let result: unknown;
    const operator = () =>
      check(demoPersona() === "operator", "Operator access required.");
    switch (operation.action) {
      case "creator_save": {
        const p = operation.input,
          existing = state.creators[actor];
        checkVersion(existing?.version || 0, p.expectedVersion);
        state.creators[actor] = {
          ...creator(actor, p.displayName, p.avatarKey),
          ...p,
          version: (existing?.version || 0) + 1,
        };
        result = creatorDto(state, actor);
        break;
      }
      case "post_publish": {
        const p = operation.input,
          run = requireValue(
            runsFor(actor).find((item) => item.id === p.runId),
          );
        check(
          run.status === "finalized" &&
            run.render?.status === "ready" &&
            run.render.id === p.assetId &&
            run.render.url,
          "Complete the quest and render a reel before publishing.",
        );
        const existing = state.posts.find((post) => post.runId === run.id);
        if (existing) {
          check(existing.state !== "removed", "An operator removed this post.");
          result = postDto(state, existing);
          break;
        }
        const post: StoredPost = {
          id: crypto.randomUUID(),
          ownerId: actor,
          runId: run.id,
          assetId: p.assetId,
          creator: creatorDto(state, actor),
          quest: run.quest,
          questAuthor: state.drafts.find(
            (draft) => draft.templateId === run.quest.id,
          )
            ? creatorDto(
                state,
                state.drafts.find((draft) => draft.templateId === run.quest.id)!
                  .authorId,
              )
            : null,
          caption: p.caption,
          brandOptIn: p.brandOptIn,
          state: "published",
          version: 1,
          createdAt: now(),
          attemptCount: 0,
          mediaUrl: run.render.url!,
          thumbnailUrl: run.render.thumbnailUrl || "",
          sponsorDisclosure: run.quest.sponsorDisclosure || null,
          inspiredByPostId: run.inspiredByPostId || null,
          demo: true,
        };
        state.posts.push(post);
        result = postDto(state, post);
        break;
      }
      case "post_update": {
        const p = operation.input,
          post = requireValue(
            state.posts.find(
              (item) => item.id === p.id && item.ownerId === actor,
            ),
          );
        checkVersion(post.version, p.expectedVersion);
        check(post.state !== "removed", "An operator removed this post.");
        check(
          !p.published || hasReel(post),
          "This reel was deleted. Create a new reel before publishing.",
        );
        post.caption = p.caption;
        post.brandOptIn = p.brandOptIn;
        post.state = p.published ? "published" : "unpublished";
        post.version++;
        result = postDto(state, post);
        break;
      }
      case "draft_save": {
        const p = operation.input,
          existing = p.id
            ? state.drafts.find((draft) => draft.id === p.id)
            : undefined;
        check(
          !existing || existing.authorId === actor,
          "This draft belongs to someone else.",
        );
        checkVersion(existing?.version || 0, p.expectedVersion);
        check(
          !existing || ["draft", "rejected"].includes(existing.state),
          "A submitted or approved quest cannot be overwritten.",
        );
        const id = existing?.id || p.id || crypto.randomUUID();
        const { sponsorDisclosure: _unverifiedSponsor, ...quest } = p.quest;
        const draft: OriginalDraft = {
          id,
          authorId: actor,
          quest: { ...quest, ...originalQuestIdentity(id) },
          state: "draft",
          version: (existing?.version || 0) + 1,
          reviewNotes: "",
          templateId: null,
          createdAt: existing?.createdAt || now(),
        };
        state.drafts = [
          ...state.drafts.filter((item) => item.id !== id),
          draft,
        ];
        result = draft;
        break;
      }
      case "draft_submit": {
        const p = operation.input,
          draft = requireValue(
            state.drafts.find(
              (item) => item.id === p.id && item.authorId === actor,
            ),
          );
        checkVersion(draft.version, p.expectedVersion);
        check(draft.state === "draft", "Only a saved draft can be submitted.");
        draft.state = "submitted";
        draft.version++;
        notify(
          state,
          DEMO_PEOPLE.operator.id,
          "quest_submitted",
          "An original quest needs review.",
          "/studio",
        );
        result = draft;
        break;
      }
      case "draft_review": {
        operator();
        const p = operation.input,
          draft = requireValue(state.drafts.find((item) => item.id === p.id));
        checkVersion(draft.version, p.expectedVersion);
        check(
          draft.state === "submitted" && draft.authorId !== actor,
          "Only another creator’s submitted quest can be reviewed.",
        );
        draft.state = p.decision === "approve" ? "approved" : "rejected";
        draft.reviewNotes = p.notes;
        draft.version++;
        draft.templateId = draft.state === "approved" ? draft.quest.id : null;
        notify(
          state,
          draft.authorId,
          "quest_reviewed",
          `Your original quest was ${draft.state}.`,
          `/originals/${draft.id}`,
        );
        result = draft;
        break;
      }
      case "brand_save": {
        const p = operation.input,
          existing = state.brands.find((brand) => brand.ownerId === actor);
        checkVersion(existing?.version || 0, p.expectedVersion);
        const brand = {
          id: existing?.id || crypto.randomUUID(),
          ownerId: actor,
          name: p.name,
          website: p.website,
          contactEmail: p.contactEmail,
          state: "pending" as const,
          version: (existing?.version || 0) + 1,
          reviewNotes: "",
        };
        state.brands = [
          ...state.brands.filter((item) => item.ownerId !== actor),
          brand,
        ];
        result = brand;
        break;
      }
      case "brand_review": {
        operator();
        const p = operation.input,
          brand = requireValue(state.brands.find((item) => item.id === p.id));
        checkVersion(brand.version, p.expectedVersion);
        check(brand.ownerId !== actor, "You cannot approve your own business.");
        brand.state = p.decision === "approve" ? "approved" : "rejected";
        brand.reviewNotes = p.notes;
        brand.version++;
        notify(
          state,
          brand.ownerId,
          "brand_reviewed",
          `Business profile ${brand.state}.`,
          "/studio",
        );
        result = brand;
        break;
      }
      case "offer_create": {
        const p = operation.input,
          brand = requireValue(
            state.brands.find(
              (item) => item.ownerId === actor && item.state === "approved",
            ),
            "An approved business is required.",
          );
        const post = requireValue(
          state.posts.find((item) => item.id === p.postId),
        );
        check(
          isPublished(state, post) &&
            post.brandOptIn &&
            state.creators[post.ownerId]?.openToBrands &&
            post.ownerId !== actor &&
            !blocked(state, actor, post.ownerId),
          "This video is not available for inquiries.",
        );
        check(
          !state.offers.some(
            (offer) =>
              offer.postId === post.id &&
              offer.brandId === brand.id &&
              ["proposed", "countered", "pending_fulfillment"].includes(
                offer.state,
              ),
          ),
          "There is already an open offer for this video. Review that offer.",
        );
        const createdAt = now(),
          offer: LicenseOffer = {
            id: crypto.randomUUID(),
            postId: post.id,
            assetId: post.assetId,
            brandId: brand.id,
            creatorId: post.ownerId,
            brandName: brand.name,
            creatorName: state.creators[post.ownerId].displayName,
            postTitle: post.quest.title,
            state: "proposed",
            version: 1,
            proposerId: actor,
            terms: p.terms,
            acceptedTerms: null,
            acceptedAt: null,
            history: [
              { version: 1, proposerId: actor, terms: p.terms, createdAt },
            ],
            fulfillment: null,
            suspended: false,
            moderationReason: null,
            mediaUrl: null,
            createdAt,
            demo: true,
          };
        state.offers.push(offer);
        notify(
          state,
          post.ownerId,
          "offer_received",
          "A demo brand proposed terms for your video.",
          `/offers/${offer.id}`,
        );
        result = offer;
        break;
      }
      case "offer_respond": {
        const p = operation.input,
          offer = requireValue(state.offers.find((item) => item.id === p.id)),
          brand = requireValue(
            state.brands.find((item) => item.id === offer.brandId),
          );
        check(
          actor === offer.creatorId || actor === brand.ownerId,
          "This offer belongs to someone else.",
        );
        checkVersion(offer.version, p.expectedVersion);
        check(!offer.suspended, "An operator suspended this request.");
        check(
          ["proposed", "countered"].includes(offer.state),
          "This offer can no longer be changed.",
        );
        check(
          !blocked(state, offer.creatorId, brand.ownerId),
          "This exchange is blocked.",
        );
        if (p.decision === "cancel")
          check(
            actor === offer.proposerId,
            "Only the current proposer can withdraw terms.",
          );
        else
          check(
            actor !== offer.proposerId,
            "The other party must respond to this proposal.",
          );
        if (p.decision === "accept" || p.decision === "counter") {
          const post = requireValue(
            state.posts.find((item) => item.id === offer.postId),
          );
          check(
            isPublished(state, post),
            "This published video is no longer available.",
          );
          check(
            brand.state === "approved",
            "The business is no longer approved.",
          );
        }
        if (p.decision === "accept") {
          offer.state = "pending_fulfillment";
          offer.acceptedTerms = structuredClone(offer.terms);
          offer.acceptedAt = now();
        }
        if (p.decision === "counter") {
          offer.state = "countered";
          offer.terms = requireValue(p.terms);
          offer.proposerId = actor;
          offer.history.push({
            version: offer.version + 1,
            proposerId: actor,
            terms: structuredClone(offer.terms),
            createdAt: now(),
          });
        }
        if (p.decision === "decline") offer.state = "declined";
        if (p.decision === "cancel") offer.state = "canceled";
        offer.version++;
        notify(
          state,
          actor === offer.creatorId ? brand.ownerId : offer.creatorId,
          "offer_updated",
          `Offer ${offer.state === "pending_fulfillment" ? "terms accepted; manual fulfillment is pending" : offer.state}.`,
          `/offers/${offer.id}`,
        );
        result = offer;
        break;
      }
      case "offer_fulfill": {
        operator();
        const p = operation.input,
          offer = requireValue(state.offers.find((item) => item.id === p.id));
        checkVersion(offer.version, p.expectedVersion);
        const brand = requireValue(
          state.brands.find((item) => item.id === offer.brandId),
        );
        check(
          !offer.suspended &&
            brand.state === "approved" &&
            actor !== brand.ownerId &&
            actor !== offer.creatorId,
          "An independent operator and an approved business are required.",
        );
        check(
          offer.state === "pending_fulfillment" && offer.acceptedTerms,
          "Mutually accepted terms are required before fulfillment.",
        );
        const starts = `${offer.acceptedTerms.startDate}T00:00:00.000Z`,
          ends = new Date(
            Date.parse(starts) + offer.acceptedTerms.durationDays * 86400000,
          ).toISOString();
        offer.fulfillment = {
          paymentReference: p.paymentReference,
          permissionReference: p.permissionReference,
          usageStartsAt: starts,
          usageEndsAt: ends,
          completedAt: now(),
        };
        offer.state = "completed";
        offer.version++;
        for (const recipient of [offer.creatorId, brand.ownerId])
          notify(
            state,
            recipient,
            "fulfillment_recorded",
            "Demo manual fulfillment recorded. No money moved.",
            `/offers/${offer.id}`,
          );
        result = offer;
        break;
      }
      case "activity_read": {
        check(
          activityFor(state, actor).some(
            (item) => item.id === operation.input.id,
          ),
          "This activity belongs to someone else.",
        );
        if (!state.readIds.includes(operation.input.id))
          state.readIds.push(operation.input.id);
        result = { read: true };
        break;
      }
      case "report": {
        const p = operation.input;
        if (p.postId)
          requireValue(
            state.posts.find(
              (item) => item.id === p.postId && isPublished(state, item),
            ),
          );
        if (p.offerId) {
          const offer = requireValue(
            state.offers.find((item) => item.id === p.offerId),
          );
          check(
            offer.creatorId === actor ||
              state.brands.some(
                (brand) =>
                  brand.ownerId === actor && brand.id === offer.brandId,
              ),
            "You cannot report a private offer you do not own.",
          );
        }
        const report = {
          id: crypto.randomUUID(),
          reporterId: actor,
          postId: p.postId || null,
          offerId: p.offerId || null,
          reason: p.reason,
          createdAt: now(),
        };
        state.reports.push(report);
        result = { reported: true };
        break;
      }
      case "block": {
        const p = operation.input;
        check(p.userId !== actor, "You cannot block yourself.");
        state.blocks = state.blocks.filter(
          (row) => row.by !== actor || row.target !== p.userId,
        );
        if (p.blocked) state.blocks.push({ by: actor, target: p.userId });
        result = { blocked: p.blocked };
        break;
      }
      case "post_moderate": {
        operator();
        const p = operation.input,
          post = requireValue(state.posts.find((item) => item.id === p.id));
        checkVersion(post.version, p.expectedVersion);
        post.state = "removed";
        post.version++;
        notify(
          state,
          post.ownerId,
          "post_removed",
          "An operator unpublished your post. Your private original is unchanged.",
          `/posts/${post.id}`,
        );
        result = postDto(state, post);
        break;
      }
      case "offer_moderate": {
        operator();
        const p = operation.input,
          offer = requireValue(state.offers.find((item) => item.id === p.id));
        checkVersion(offer.version, p.expectedVersion);
        offer.suspended = true;
        offer.moderationReason = p.reason;
        offer.version++;
        const brand = requireValue(
          state.brands.find((item) => item.id === offer.brandId),
        );
        for (const recipient of [offer.creatorId, brand.ownerId])
          notify(
            state,
            recipient,
            "offer_suspended",
            "An operator suspended this request. Accepted terms and payment records are preserved.",
            `/offers/${offer.id}`,
          );
        result = offer;
        break;
      }
    }
    state.requests[requestKey] = { fingerprint, result };
    write(state);
    return structuredClone(result) as T;
  };
  return navigator.locks ? navigator.locks.request(KEY, execute) : execute();
}
