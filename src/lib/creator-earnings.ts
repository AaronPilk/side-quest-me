import type { LicenseOffer } from "../../shared/community";

/** Derive creator records, never a withdrawable balance or a proposed payout. */
export function creatorEarnings(
  offers: LicenseOffer[],
  creatorId: string,
  demo: boolean,
) {
  const byId = new Map<string, LicenseOffer>();
  for (const offer of offers) {
    if (offer.creatorId !== creatorId || Boolean(offer.demo) !== demo) continue;
    const previous = byId.get(offer.id);
    if (!previous || offer.version > previous.version)
      byId.set(offer.id, offer);
  }
  const records = [...byId.values()].sort(
    (a, b) =>
      Date.parse(b.fulfillment?.completedAt || b.acceptedAt || b.createdAt) -
      Date.parse(a.fulfillment?.completedAt || a.acceptedAt || a.createdAt),
  );
  const paid = records.filter(
    (offer) =>
      offer.state === "completed" &&
      offer.acceptedTerms &&
      offer.fulfillment?.paymentReference &&
      offer.fulfillment.permissionReference,
  );
  const pending = records.filter(
    (offer) =>
      offer.state === "pending_fulfillment" &&
      offer.acceptedTerms &&
      !offer.fulfillment,
  );
  const proposals = records.filter((offer) =>
    ["proposed", "countered"].includes(offer.state),
  );
  const closed = records.filter((offer) =>
    ["declined", "canceled"].includes(offer.state),
  );
  const incomplete = records.filter(
    (offer) =>
      !paid.includes(offer) &&
      !pending.includes(offer) &&
      !proposals.includes(offer) &&
      !closed.includes(offer),
  );
  return {
    records,
    paid,
    pending,
    proposals,
    closed,
    incomplete,
    paidMinor: paid.reduce(
      (sum, offer) => sum + offer.acceptedTerms!.paymentMinor,
      0,
    ),
    pendingMinor: pending.reduce(
      (sum, offer) => sum + offer.acceptedTerms!.paymentMinor,
      0,
    ),
  };
}
