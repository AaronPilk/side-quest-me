import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchMediaBlob } from "../components/PrivateMedia";
import { Back, Button, Loading, Notice, PageTitle } from "../components/ui";
import {
  StateTag,
  useCommunity,
  useCommunityAction,
} from "../components/Community";
import {
  LicenseTermsForm,
  LicenseTermsView,
} from "../components/LicenseTermsForm";
export default function LicenseOfferPage() {
  const { id } = useParams();
  const offer = useCommunity("offer", { id });
  const me = useCommunity("me");
  const action = useCommunityAction(offer.refresh);
  const [downloadError, setDownloadError] = useState("");
  if (offer.error)
    return (
      <>
        <Back to="/activity" />
        <Notice error>{offer.error}</Notice>
      </>
    );
  if (!offer.data) return <Loading />;
  const data = offer.data;
  const pending =
    !data.suspended && ["proposed", "countered"].includes(data.state);
  const isProposer = data.proposerId === me.data?.userId;
  const canRespond = Boolean(
    me.data &&
    (data.creatorId === me.data.userId || me.data.brand?.id === data.brandId),
  );
  return (
    <>
      <Back to="/activity">Activity</Back>
      <PageTitle
        eyebrow={
          data.demo ? "ISOLATED DEMO OFFER · NO REAL MONEY" : "VIDEO LICENSING"
        }
        title={data.postTitle}
      >
        {data.brandName} × {data.creatorName}
      </PageTitle>
      <StateTag state={data.state} />
      {data.suspended && (
        <Notice error>
          This offer is suspended. {data.moderationReason} Negotiation,
          fulfillment and commercial downloads are unavailable.
        </Notice>
      )}
      <p>
        <Link to={`/posts/${data.postId}`}>View the exact public post</Link>
      </p>
      {data.state === "pending_fulfillment" && (
        <Notice>
          Both sides accepted these terms. Payment and permission checks are
          still pending manual verification. This is not a paid transaction yet.
        </Notice>
      )}
      {data.state === "completed" && (
        <Notice>
          {data.demo
            ? "Demo fulfillment recorded; no real payment occurred."
            : "Manual payment and permissions were verified by an operator."}{" "}
          Commercial access is limited to the agreed usage period.
        </Notice>
      )}
      <section className="community-card">
        <h2>
          {data.acceptedTerms
            ? "Accepted terms"
            : `Proposal · version ${data.version}`}
        </h2>
        <LicenseTermsView terms={data.acceptedTerms ?? data.terms} />
        <p className="support">
          This license concerns this video only. It gives no access to the
          creator’s social accounts. XP, points and rewards are separate.
        </p>
      </section>
      {pending && canRespond && (
        <section className="section">
          <h2>
            {isProposer ? "Waiting for the other party" : "Your decision"}
          </h2>
          {!isProposer && (
            <Button
              busy={action.busy}
              onClick={() =>
                action.run(
                  "offer_respond",
                  {
                    id: data.id,
                    expectedVersion: data.version,
                    decision: "accept",
                  },
                  "Terms accepted. Manual fulfillment is pending.",
                )
              }
            >
              Accept exact terms
            </Button>
          )}
          {!isProposer && (
            <details className="community-panel">
              <summary>Counter with different terms</summary>
              <LicenseTermsForm
                key={data.version}
                initial={data.terms}
                busy={action.busy}
                submitLabel="Send counteroffer"
                onSubmit={(terms) =>
                  action.run(
                    "offer_respond",
                    {
                      id: data.id,
                      expectedVersion: data.version,
                      decision: "counter",
                      terms,
                    },
                    "Counteroffer sent. The other party must accept these terms.",
                  )
                }
              />
            </details>
          )}
          <button
            className="text-button danger"
            disabled={action.busy}
            onClick={() =>
              action.run(
                "offer_respond",
                {
                  id: data.id,
                  expectedVersion: data.version,
                  decision: isProposer ? "cancel" : "decline",
                },
                isProposer ? "Proposal canceled." : "Offer declined.",
              )
            }
          >
            {isProposer ? "Cancel proposal" : "Decline offer"}
          </button>
        </section>
      )}
      {data.fulfillment && (
        <section className="section">
          <h2>Verified manual fulfillment</h2>
          <dl className="license-terms">
            <div>
              <dt>Payment record</dt>
              <dd>{data.fulfillment.paymentReference}</dd>
            </div>
            <div>
              <dt>Permission record</dt>
              <dd>{data.fulfillment.permissionReference}</dd>
            </div>
            <div>
              <dt>Usage starts (UTC)</dt>
              <dd>
                {new Date(data.fulfillment.usageStartsAt)
                  .toISOString()
                  .replace("T", " ")
                  .replace(".000Z", " UTC")}
              </dd>
            </div>
            <div>
              <dt>Usage ends (UTC)</dt>
              <dd>
                {new Date(data.fulfillment.usageEndsAt)
                  .toISOString()
                  .replace("T", " ")
                  .replace(".000Z", " UTC")}
              </dd>
            </div>
          </dl>
        </section>
      )}
      {data.mediaUrl && !data.suspended && (
        <Button
          secondary
          onClick={async () => {
            setDownloadError("");
            try {
              const blob = await fetchMediaBlob(data.mediaUrl!);
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = `sidequest-licensed-${data.id}.mp4`;
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            } catch (cause) {
              setDownloadError((cause as Error).message);
            }
          }}
        >
          Download licensed video
        </Button>
      )}
      {downloadError && <Notice error>{downloadError}</Notice>}
      {action.feedback}
      <details className="community-panel">
        <summary>Offer history · {data.history.length} versions</summary>
        {data.history.map((revision) => (
          <section key={revision.version} className="offer-history">
            <h3>
              Version {revision.version} ·{" "}
              {revision.proposerId === data.creatorId ? "Creator" : "Brand"}
            </h3>
            <p className="support">
              {new Date(revision.createdAt).toLocaleString()}
            </p>
            <LicenseTermsView terms={revision.terms} />
          </section>
        ))}
      </details>
      {me.data?.roles.includes("operator") && !data.suspended && (
        <details className="community-panel">
          <summary>Operator: suspend commercial request</summary>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void action.run(
                "offer_moderate",
                {
                  id: data.id,
                  expectedVersion: data.version,
                  reason: String(form.get("reason")),
                },
                "Commercial request suspended. Accepted terms and payment history are preserved.",
              );
            }}
          >
            <label>
              Reason for suspension
              <textarea
                name="reason"
                required
                minLength={3}
                maxLength={1000}
                rows={3}
              />
            </label>
            <Button secondary busy={action.busy} type="submit">
              Suspend offer & commercial access
            </Button>
          </form>
        </details>
      )}
      {canRespond && (
        <button
          className="text-button danger"
          disabled={action.busy}
          onClick={() =>
            action.run(
              "block",
              {
                userId:
                  data.creatorId === me.data?.userId
                    ? data.brandId
                    : data.creatorId,
                blocked: true,
              },
              "Account blocked. Existing offer history remains available.",
            )
          }
        >
          Block this account
        </button>
      )}
      <details className="community-panel">
        <summary>Report this commercial request</summary>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void action.run(
              "report",
              { offerId: data.id, reason: String(form.get("reason")) },
              "Commercial request reported for review.",
            );
          }}
        >
          <label>
            Reason
            <textarea
              name="reason"
              minLength={3}
              maxLength={1000}
              required
              rows={3}
            />
          </label>
          <Button secondary busy={action.busy} type="submit">
            Report request
          </Button>
        </form>
      </details>
    </>
  );
}
