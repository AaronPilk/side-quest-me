import { z } from "zod";
import { questVariantSchema, type QuestVariant } from "./domain";
import type { SeriesContext } from "./series";
const text = (max: number) => z.string().trim().max(max);
const version = z.number().int().nonnegative();
const id = z.uuid();
export const avatarKeySchema = z.enum(["coral", "mint", "violet", "sunset"]);
export const licenseTermsSchema = z
  .object({
    paymentMinor: z.number().int().min(1).max(100_000_000),
    currency: z.literal("USD"),
    channels: z
      .array(
        z.enum([
          "brand_social",
          "paid_social",
          "website",
          "email",
          "broadcast",
        ]),
      )
      .min(1)
      .max(5),
    startDate: z.iso.date(),
    durationDays: z.number().int().min(1).max(730),
    editingPermissions: z.enum(["none", "crop_captions", "agreed_edits"]),
    message: text(1500),
    platformFeeMinor: z.number().int().min(0).max(100_000_000),
  })
  .strict()
  .refine(
    (t) => t.platformFeeMinor <= t.paymentMinor,
    "The agreed fee cannot exceed the proposed payment.",
  );
export type LicenseTerms = z.infer<typeof licenseTermsSchema>;
export const communityInputs = {
  creator_save: z
    .object({
      displayName: text(60).min(1),
      avatarKey: avatarKeySchema,
      bio: text(280),
      openToBrands: z.boolean(),
      expectedVersion: version,
    })
    .strict(),
  post_publish: z
    .object({
      runId: id,
      assetId: id,
      caption: text(1000),
      brandOptIn: z.boolean(),
    })
    .strict(),
  post_update: z
    .object({
      id,
      expectedVersion: version,
      caption: text(1000),
      brandOptIn: z.boolean(),
      published: z.boolean(),
    })
    .strict(),
  draft_save: z
    .object({
      id: id.optional(),
      expectedVersion: version,
      quest: questVariantSchema,
    })
    .strict(),
  draft_submit: z.object({ id, expectedVersion: version }).strict(),
  draft_review: z
    .object({
      id,
      expectedVersion: version,
      decision: z.enum(["approve", "reject"]),
      notes: text(1500),
    })
    .strict(),
  brand_save: z
    .object({
      name: text(100).min(2),
      website: z
        .url()
        .max(400)
        .refine(
          (value) => value.startsWith("https://"),
          "Use an HTTPS website.",
        ),
      contactEmail: z.email().max(254),
      expectedVersion: version,
    })
    .strict(),
  brand_review: z
    .object({
      id,
      expectedVersion: version,
      decision: z.enum(["approve", "reject"]),
      notes: text(1500),
    })
    .strict(),
  offer_create: z.object({ postId: id, terms: licenseTermsSchema }).strict(),
  offer_respond: z
    .object({
      id,
      expectedVersion: version,
      decision: z.enum(["accept", "counter", "decline", "cancel"]),
      terms: licenseTermsSchema.optional(),
    })
    .strict()
    .superRefine((v, c) => {
      if ((v.decision === "counter") !== Boolean(v.terms))
        c.addIssue({
          code: "custom",
          path: ["terms"],
          message: "Only a counteroffer supplies replacement terms.",
        });
    }),
  offer_fulfill: z
    .object({
      id,
      expectedVersion: version,
      paymentReference: text(300).min(3),
      permissionReference: text(300).min(3),
      paid: z.literal(true),
      permissionsConfirmed: z.literal(true),
    })
    .strict(),
  activity_read: z.object({ id }).strict(),
  report: z
    .object({
      postId: id.optional(),
      offerId: id.optional(),
      reason: text(1000).min(3),
    })
    .strict()
    .refine(
      (v) => Boolean(v.postId) !== Boolean(v.offerId),
      "Report one post or offer.",
    ),
  block: z.object({ userId: id, blocked: z.boolean() }).strict(),
  post_moderate: z
    .object({ id, expectedVersion: version, reason: text(1000).min(3) })
    .strict(),
  offer_moderate: z
    .object({ id, expectedVersion: version, reason: text(1000).min(3) })
    .strict(),
} as const;
export type CommunityAction = keyof typeof communityInputs;
export type CommunityInput<A extends CommunityAction> = z.infer<
  (typeof communityInputs)[A]
>;
export const communityMutationSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("creator_save"),
      input: communityInputs.creator_save,
    })
    .strict(),
  z
    .object({
      action: z.literal("post_publish"),
      input: communityInputs.post_publish,
    })
    .strict(),
  z
    .object({
      action: z.literal("post_update"),
      input: communityInputs.post_update,
    })
    .strict(),
  z
    .object({
      action: z.literal("draft_save"),
      input: communityInputs.draft_save,
    })
    .strict(),
  z
    .object({
      action: z.literal("draft_submit"),
      input: communityInputs.draft_submit,
    })
    .strict(),
  z
    .object({
      action: z.literal("draft_review"),
      input: communityInputs.draft_review,
    })
    .strict(),
  z
    .object({
      action: z.literal("brand_save"),
      input: communityInputs.brand_save,
    })
    .strict(),
  z
    .object({
      action: z.literal("brand_review"),
      input: communityInputs.brand_review,
    })
    .strict(),
  z
    .object({
      action: z.literal("offer_create"),
      input: communityInputs.offer_create,
    })
    .strict(),
  z
    .object({
      action: z.literal("offer_respond"),
      input: communityInputs.offer_respond,
    })
    .strict(),
  z
    .object({
      action: z.literal("offer_fulfill"),
      input: communityInputs.offer_fulfill,
    })
    .strict(),
  z
    .object({
      action: z.literal("activity_read"),
      input: communityInputs.activity_read,
    })
    .strict(),
  z
    .object({ action: z.literal("report"), input: communityInputs.report })
    .strict(),
  z
    .object({ action: z.literal("block"), input: communityInputs.block })
    .strict(),
  z
    .object({
      action: z.literal("post_moderate"),
      input: communityInputs.post_moderate,
    })
    .strict(),
  z
    .object({
      action: z.literal("offer_moderate"),
      input: communityInputs.offer_moderate,
    })
    .strict(),
]);
// Keep legacy timestamp-only cursors readable. New cursors include the post ID
// so a page boundary cannot hide other posts published at the same instant.
const cursorTimestamp = z.iso.datetime({ offset: true });
export const feedCursorSchema = z
  .string()
  .max(100)
  .refine((value) => {
    const [timestamp, postId, extra] = value.split("|");
    return (
      cursorTimestamp.safeParse(timestamp).success &&
      extra === undefined &&
      (postId === undefined || id.safeParse(postId).success)
    );
  }, "Invalid feed cursor");

export function parseFeedCursor(value: string) {
  const [timestamp, postId] = feedCursorSchema.parse(value).split("|");
  return { timestamp, postId };
}

export const communityReadSchema = z
  .object({
    id: id.optional(),
    templateId: text(120).optional(),
    brandOnly: z.boolean().optional(),
    followingOnly: z.boolean().optional(),
    query: z.string().trim().max(80).optional(),
    limit: z.number().int().min(1).max(50).optional(),
    before: feedCursorSchema.optional(),
  })
  .strict();
export type CommunityView =
  | "feed"
  | "post"
  | "creator"
  | "me"
  | "activity"
  | "offers"
  | "offer"
  | "draft"
  | "brand"
  | "operator";
export interface CreatorProfile {
  id: string;
  username?: string | null;
  photoUrl?: string | null;
  displayName: string;
  avatarKey: z.infer<typeof avatarKeySchema>;
  bio: string;
  openToBrands: boolean;
  version: number;
  publishedCount: number;
  attemptCount: number;
  authoredCount: number;
  demo?: boolean;
}
export interface CommunityPost {
  viewerFollowing?: boolean;
  id: string;
  series?: SeriesContext | null;
  creator: CreatorProfile;
  quest: QuestVariant;
  questAuthor: CreatorProfile | null;
  caption: string;
  brandOptIn: boolean;
  state: "published" | "unpublished" | "removed";
  version: number;
  createdAt: string;
  attemptCount: number;
  mediaUrl: string;
  thumbnailUrl: string;
  sponsorDisclosure: string | null;
  inspiredByPostId: string | null;
  demo?: boolean;
}
export interface OriginalDraft {
  id: string;
  authorId: string;
  state: "draft" | "submitted" | "approved" | "rejected";
  version: number;
  quest: QuestVariant;
  reviewNotes: string;
  templateId: string | null;
  createdAt: string;
}
export interface BusinessProfile {
  id: string;
  name: string;
  website: string;
  contactEmail: string;
  state: "pending" | "approved" | "rejected";
  version: number;
  reviewNotes: string;
}
export interface OfferRevision {
  version: number;
  proposerId: string;
  terms: LicenseTerms;
  createdAt: string;
}
export interface LicenseOffer {
  suspended: boolean;
  moderationReason: string | null;
  id: string;
  postId: string;
  assetId: string;
  brandId: string;
  creatorId: string;
  brandName: string;
  creatorName: string;
  postTitle: string;
  state:
    | "proposed"
    | "countered"
    | "pending_fulfillment"
    | "completed"
    | "declined"
    | "canceled";
  version: number;
  proposerId: string;
  terms: LicenseTerms;
  acceptedTerms: LicenseTerms | null;
  acceptedAt: string | null;
  history: OfferRevision[];
  fulfillment: {
    paymentReference: string;
    permissionReference: string;
    usageStartsAt: string;
    usageEndsAt: string;
    completedAt: string;
  } | null;
  mediaUrl: string | null;
  createdAt: string;
  demo?: boolean;
}
export interface CommunityActivity {
  id: string;
  kind: string;
  text: string;
  href: string;
  readAt: string | null;
  createdAt: string;
}
export interface CommunityReport {
  id: string;
  reporterId: string;
  postId: string | null;
  offerId: string | null;
  reason: string;
  createdAt: string;
}
export interface CommunityMe {
  userId: string;
  roles: string[];
  publications: { runId: string; postId: string }[];
  creator: CreatorProfile | null;
  posts: CommunityPost[];
  drafts: OriginalDraft[];
  brand: BusinessProfile | null;
  offers: LicenseOffer[];
  activity: CommunityActivity[];
  blocks: string[];
}
export interface CommunityReadResults {
  feed: { posts: CommunityPost[]; nextCursor: string | null };
  post: CommunityPost;
  creator: {
    creator: CreatorProfile;
    posts: CommunityPost[];
    quests: QuestVariant[];
  };
  me: CommunityMe;
  activity: { items: CommunityActivity[]; unreadCount: number };
  offers: { offers: LicenseOffer[] };
  offer: LicenseOffer;
  draft: OriginalDraft;
  brand: { brand: BusinessProfile | null; posts: CommunityPost[] };
  operator: {
    drafts: OriginalDraft[];
    businesses: BusinessProfile[];
    offers: LicenseOffer[];
    reports: CommunityReport[];
  };
}
export function originalQuestIdentity(draftId: string, questVersion = 1) {
  const compact = z.uuid().parse(draftId).replaceAll("-", "").toLowerCase();
  const familyId = `original_${compact.replace(/[0-9a-f]/g, (c) => "abcdefghijklmnop"[parseInt(c, 16)])}`;
  return {
    familyId,
    id: `${familyId}_v${questVersion}`,
    version: questVersion,
  };
}
