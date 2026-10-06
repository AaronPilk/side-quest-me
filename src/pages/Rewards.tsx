import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowUpRight,
  BadgeCheck,
  Clock3,
  Gift,
  ReceiptText,
} from "lucide-react";
import type { LicenseOffer } from "../../shared/community";
import { useCommunity, money, words } from "../components/Community";
import { Button, Empty, Loading, Notice, PageTitle } from "../components/ui";
import { creatorEarnings } from "../lib/creator-earnings";
import { DEMO } from "../lib/auth";
import { hasBusinessWorkspace } from "../../shared/account";
import Perks from "./Perks";
import "../rewards-design.css";

const tabs = [
  { id: "perks", label: "Perks" },
  { id: "earnings", label: "Earnings" },
  { id: "offers", label: "Brand offers" },
] as const;

export default function Rewards() {
  const [params, setParams] = useSearchParams();
  const tab = tabs.find((item) => item.id === params.get("tab"))?.id || "perks";
  const me = useCommunity("me", {}, tab !== "perks");
  const ledger = me.data
    ? creatorEarnings(me.data.offers, me.data.userId!, DEMO)
    : null;
  function selectTab(value: string) {
    const next = new URLSearchParams(params);
    next.set("tab", value);
    setParams(next);
  }
  return (
    <div className="rewards-page">
      <PageTitle title="Rewards">
        Your stories. Your progress. Your opportunities.
      </PageTitle>
      <div
        className="rewards-tabs"
        role="tablist"
        aria-label="Rewards"
        onKeyDown={(event) => {
          const current = tabs.findIndex((item) => item.id === tab);
          const next =
            event.key === "ArrowRight"
              ? (current + 1) % tabs.length
              : event.key === "ArrowLeft"
                ? (current + tabs.length - 1) % tabs.length
                : event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? tabs.length - 1
                    : -1;
          if (next >= 0) {
            event.preventDefault();
            selectTab(tabs[next].id);
            event.currentTarget
              .querySelectorAll<HTMLButtonElement>('[role="tab"]')
              [next]?.focus();
          }
        }}
      >
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`rewards-tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls="rewards-content"
            tabIndex={tab === item.id ? 0 : -1}
            onClick={() => selectTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <section
        id="rewards-content"
        role="tabpanel"
        aria-labelledby={`rewards-tab-${tab}`}
      >
        {tab === "perks" ? (
          <Perks />
        ) : me.error ? (
          <>
            <Notice error>{me.error}</Notice>
            <Button secondary onClick={me.refresh}>
              Retry rewards
            </Button>
          </>
        ) : !ledger ? (
          <Loading />
        ) : (
          <>
            {DEMO && (
              <p className="rewards-demo">
                <span className="demo-dot" /> Local demo · All payment records
                below are simulated.
              </p>
            )}
            {tab === "earnings" ? (
              <>
                <div className="earnings-summary">
                  <div
                    className="earnings-paid"
                    role="region"
                    aria-label="Verified payments"
                  >
                    <span className="earnings-symbol">
                      <BadgeCheck size={23} />
                    </span>
                    <span>{DEMO ? "Demo paid earnings" : "Paid earnings"}</span>
                    <strong>{money(ledger.paidMinor)}</strong>
                    <small>
                      {ledger.paid.length}{" "}
                      {ledger.paid.length === 1 ? "payment" : "payments"}{" "}
                      verified manually
                    </small>
                  </div>
                  <div
                    className="earnings-pending"
                    role="region"
                    aria-label="Accepted awaiting payment"
                  >
                    <Clock3 size={20} />
                    <span>Accepted · awaiting payment</span>
                    <strong>{money(ledger.pendingMinor)}</strong>
                    <small>
                      {ledger.pending.length} accepted{" "}
                      {ledger.pending.length === 1 ? "deal" : "deals"}. This is
                      not paid income.
                    </small>
                  </div>
                </div>
                <p className="support earnings-explainer">
                  Payments appear after an independent admin verifies the agreed
                  payment and permissions. Accepting an offer does not transfer
                  money.
                </p>
                <div className="section-heading earnings-history-heading">
                  <h2>Payment history</h2>
                  <ReceiptText size={20} />
                </div>
                {ledger.paid.length ||
                ledger.pending.length ||
                ledger.incomplete.length ? (
                  <div className="earnings-history">
                    {ledger.records
                      .filter(
                        (offer) =>
                          ledger.paid.includes(offer) ||
                          ledger.pending.includes(offer) ||
                          ledger.incomplete.includes(offer),
                      )
                      .map((offer) => (
                        <PaymentRow
                          key={offer.id}
                          offer={offer}
                          paid={ledger.paid.includes(offer)}
                          pending={ledger.pending.includes(offer)}
                        />
                      ))}
                  </div>
                ) : (
                  <Empty
                    title="Your first paid story starts here."
                    to="/rewards?tab=offers"
                    action="Explore brand offers"
                  >
                    Verified payments and accepted deals will appear here.
                    Publishing a video is always your choice.
                  </Empty>
                )}
                <Link className="rewards-next" to="/rewards?tab=offers">
                  <span>
                    <strong>
                      {ledger.proposals.length
                        ? `${ledger.proposals.length} ${ledger.proposals.length === 1 ? "offer" : "offers"} to review`
                        : "Brand offers"}
                    </strong>
                    <small>
                      Proposals are separate from earned and pending income.
                    </small>
                  </span>
                  <ArrowUpRight size={20} />
                </Link>
              </>
            ) : (
              <>
                <div className="rewards-offer-intro">
                  <h2>Your brand offers</h2>
                  <p className="support">
                    Review exact video usage and payment terms. Counter, accept,
                    or decline from each offer.
                  </p>
                </div>
                <OfferGroup
                  title="Active offers"
                  offers={ledger.records.filter(
                    (offer) =>
                      !["completed", "declined", "canceled"].includes(
                        offer.state,
                      ),
                  )}
                />
                <OfferGroup
                  title="Past deals"
                  offers={ledger.records.filter((offer) =>
                    ["completed", "declined", "canceled"].includes(offer.state),
                  )}
                />
                {!ledger.records.length && (
                  <Empty
                    title="Good stories can open doors."
                    to="/profile"
                    action="View your profile"
                  >
                    Publish a video and choose whether it’s open to brand
                    inquiries. You approve the exact terms before any
                    advertising permission is granted.
                  </Empty>
                )}
                {me.data && hasBusinessWorkspace(me.data) && (
                  <Link className="rewards-next" to="/business">
                    <span>
                      <strong>Here on behalf of a business?</strong>
                      <small>
                        Manage your licensing requests in Business workspace.
                      </small>
                    </span>
                    <ArrowUpRight size={20} />
                  </Link>
                )}
              </>
            )}
            <p className="fine-print rewards-separation">
              <Gift size={15} /> Quest points and Perks stay separate from
              money. Sidequest does not offer automatic withdrawals.
            </p>
          </>
        )}
      </section>
    </div>
  );
}

function PaymentRow({
  offer,
  paid,
  pending,
}: {
  offer: LicenseOffer;
  paid: boolean;
  pending: boolean;
}) {
  const terms = offer.acceptedTerms;
  const date =
    offer.fulfillment?.completedAt || offer.acceptedAt || offer.createdAt;
  return (
    <article className="payment-row">
      <div className="payment-row-heading">
        <div>
          <strong>{offer.brandName}</strong>
          <p>{offer.postTitle}</p>
        </div>
        <span className={`payment-state ${paid ? "paid" : "pending"}`}>
          {paid
            ? "Payment verified"
            : pending
              ? "Awaiting payment"
              : "Needs verification"}
        </span>
      </div>
      <div className="payment-row-amount">
        <strong>
          {terms ? money(terms.paymentMinor) : "Amount unverified"}
        </strong>
        <time dateTime={date}>
          {new Date(date).toLocaleDateString(undefined, {
            dateStyle: "medium",
          })}
        </time>
      </div>
      {paid && offer.fulfillment && (
        <p className="payment-reference">
          Payment reference: {offer.fulfillment.paymentReference}
        </p>
      )}
      {terms && (
        <p className="fine-print">
          Agreed platform fee: {money(terms.platformFeeMinor)}. See the accepted
          agreement for its terms.
        </p>
      )}
      {offer.suspended && (
        <p className="support">
          Usage suspended. Recorded payment history is preserved.
        </p>
      )}
      <Link to={`/offers/${offer.id}`}>
        View {paid || pending ? "agreement" : "record"}{" "}
        <ArrowUpRight size={15} />
      </Link>
    </article>
  );
}

function OfferGroup({
  title,
  offers,
}: {
  title: string;
  offers: LicenseOffer[];
}) {
  if (!offers.length) return null;
  return (
    <section className="offer-group">
      <h3>{title}</h3>
      <div className="community-list">
        {offers.map((offer) => (
          <Link
            className="community-list-link rewards-offer-link"
            key={offer.id}
            to={`/offers/${offer.id}`}
          >
            <span>
              <strong>{offer.postTitle}</strong>
              <small>
                {offer.brandName} ·{" "}
                {money((offer.acceptedTerms ?? offer.terms).paymentMinor)}
              </small>
            </span>
            <span className="offer-link-state">
              {offer.suspended
                ? "Usage suspended"
                : offer.state === "pending_fulfillment"
                  ? "Accepted · pending"
                  : offer.state === "completed"
                    ? "Verified"
                    : words(offer.state)}
              <ArrowUpRight size={17} />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
