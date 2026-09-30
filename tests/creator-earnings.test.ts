import { describe, expect, it } from "vitest";
import type { LicenseOffer, LicenseTerms } from "../shared/community";
import { creatorEarnings } from "../src/lib/creator-earnings";

const creatorId = "11111111-1111-4111-8111-111111111111";
const terms: LicenseTerms = {
  paymentMinor: 10000,
  platformFeeMinor: 500,
  currency: "USD",
  channels: ["brand_social"],
  startDate: "2026-09-29",
  durationDays: 30,
  editingPermissions: "none",
  message: "Use this exact video.",
};
function offer(id: string, patch: Partial<LicenseOffer> = {}): LicenseOffer {
  return {
    id,
    creatorId,
    brandId: "brand",
    postId: "post",
    assetId: "asset",
    brandName: "A business",
    creatorName: "Creator",
    postTitle: "A quest",
    state: "proposed",
    version: 1,
    proposerId: "brand",
    terms,
    acceptedTerms: null,
    acceptedAt: null,
    history: [],
    fulfillment: null,
    mediaUrl: null,
    createdAt: "2026-09-29T10:00:00Z",
    suspended: false,
    moderationReason: null,
    ...patch,
  };
}
const accepted = { acceptedTerms: terms, acceptedAt: "2026-09-29T11:00:00Z" };
const fulfilled = {
  ...accepted,
  state: "completed" as const,
  fulfillment: {
    paymentReference: "Verified bank record",
    permissionReference: "Release signed",
    usageStartsAt: "2026-09-29T00:00:00Z",
    usageEndsAt: "2026-10-29T00:00:00Z",
    completedAt: "2026-09-29T12:00:00Z",
  },
};

describe("creator earnings derive only from verified account-owned records", () => {
  it("separates proposals, accepted pending, paid records, and closed deals", () => {
    const rows = [
      offer("proposed"),
      offer("counter", {
        state: "countered",
        terms: { ...terms, paymentMinor: 90000 },
      }),
      offer("pending", { state: "pending_fulfillment", ...accepted }),
      offer("paid", fulfilled),
      offer("declined", { state: "declined" }),
      offer("cancel", { state: "canceled" }),
    ];
    const summary = creatorEarnings(rows, creatorId, false);
    expect(summary.paidMinor).toBe(10000);
    expect(summary.pendingMinor).toBe(10000);
    expect(summary.proposals).toHaveLength(2);
    expect(summary.closed).toHaveLength(2);
    expect(summary.incomplete).toHaveLength(0);
  });
  it("uses frozen accepted amounts and counts repeated offer events once", () => {
    const paid = offer("paid", {
      ...fulfilled,
      terms: { ...terms, paymentMinor: 990000 },
      version: 3,
    });
    const summary = creatorEarnings(
      [
        paid,
        { ...paid },
        {
          ...paid,
          version: 2,
          state: "pending_fulfillment",
          fulfillment: null,
        },
      ],
      creatorId,
      false,
    );
    expect(summary.paid).toHaveLength(1);
    expect(summary.paidMinor).toBe(10000);
    expect(summary.pendingMinor).toBe(0);
    expect(summary.records[0].version).toBe(3);
  });
  it("does not subtract a fee without a recorded net payout model", () => {
    expect(
      creatorEarnings([offer("paid", fulfilled)], creatorId, false).paidMinor,
    ).toBe(terms.paymentMinor);
  });
  it("never treats missing verification or mere acceptance as paid income", () => {
    const rows = [
      offer("no-reference", {
        ...fulfilled,
        fulfillment: { ...fulfilled.fulfillment, paymentReference: "" },
      }),
      offer("no-terms", { ...fulfilled, acceptedTerms: null }),
      offer("no-fulfillment", { ...fulfilled, fulfillment: null }),
      offer("pending-no-terms", { state: "pending_fulfillment" }),
    ];
    const summary = creatorEarnings(rows, creatorId, false);
    expect(summary.paidMinor).toBe(0);
    expect(summary.pendingMinor).toBe(0);
    expect(summary.incomplete).toHaveLength(4);
  });
  it("excludes another creator’s income and never treats business spending as creator earnings", () => {
    const summary = creatorEarnings(
      [
        offer("another", {
          ...fulfilled,
          creatorId: "someone-else",
          brandId: creatorId,
        }),
      ],
      creatorId,
      false,
    );
    expect(summary.records).toEqual([]);
    expect(summary.paidMinor).toBe(0);
  });
  it("keeps simulated records separate from real earnings", () => {
    const rows = [
      offer("real", fulfilled),
      offer("demo", { ...fulfilled, demo: true }),
    ];
    expect(
      creatorEarnings(rows, creatorId, false).paid.map((row) => row.id),
    ).toEqual(["real"]);
    expect(
      creatorEarnings(rows, creatorId, true).paid.map((row) => row.id),
    ).toEqual(["demo"]);
  });
  it("preserves verified payment history after commercial usage is suspended", () => {
    const summary = creatorEarnings(
      [offer("suspended", { ...fulfilled, suspended: true })],
      creatorId,
      false,
    );
    expect(summary.paidMinor).toBe(10000);
    expect(summary.paid[0].suspended).toBe(true);
  });
  it("keeps separate agreements even when one payment reference covered a batch", () => {
    const summary = creatorEarnings(
      [offer("one", fulfilled), offer("two", fulfilled)],
      creatorId,
      false,
    );
    expect(summary.paidMinor).toBe(20000);
    expect(summary.paid).toHaveLength(2);
  });
});
