import { useRef } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  FileVideo,
  PenLine,
  Settings2,
  UserRound,
} from "lucide-react";
import { hasBusinessWorkspace } from "../../shared/account";
import type {
  CommunityPost,
  CommunityReport,
  LicenseOffer,
} from "../../shared/community";
import { Button, Empty, Loading, Notice, PageTitle } from "../components/ui";
import { LicenseTermsView } from "../components/LicenseTermsForm";
import {
  StateTag,
  useCommunity,
  useCommunityAction,
  money,
  words,
} from "../components/Community";
import { DiscoverPostCard } from "./Discover";
import { AuthVideo } from "../components/PrivateMedia";
import "./business-workspace.css";

function ReelPublicationReview({
  post,
  own,
  refresh,
}: {
  post: CommunityPost;
  own: boolean;
  refresh: () => void;
}) {
  const action = useCommunityAction(refresh);
  return (
    <details className="community-panel reel-publication-review">
      <summary>
        {post.quest.title} · {post.creator.displayName}
      </summary>
      <p className="support">
        Private submission · version {post.version}. Approval applies only to
        this exact reel and caption.
      </p>
      <AuthVideo
        src={post.mediaUrl}
        poster={post.thumbnailUrl}
        controls
        playsInline
        preload="metadata"
        eager={false}
        aria-label={`Review video: ${post.quest.title}`}
      />
      <h4>Public caption</h4>
      <p>{post.caption || "No caption."}</p>
      <h4>Shared quest instructions</h4>
      <p>{post.quest.hook}</p>
      <ol>
        {post.quest.beats.map((beat, index) => (
          <li key={index}>
            <strong>{beat.label}</strong>
            <p>{beat.action}</p>
            <p className="support">Film: {beat.filming}</p>
          </li>
        ))}
      </ol>
      <ul>
        {post.quest.requirements.map((line, index) => (
          <li key={index}>{line}</li>
        ))}
      </ul>
      <p className="support">
        Adults-only quest: {post.quest.adultOnly ? "yes" : "no"}. Reject
        explicit sexual material, abusive or hateful content, exploitation,
        dangerous instructions, and videos that expose someone without
        permission. Review the whole video and its audio, caption, and shared
        instructions before deciding. Private completion and rewards do not
        establish publication approval.
      </p>
      {own ? (
        <Notice>Another operator must review your own submission.</Notice>
      ) : (
        <form
          className="community-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void action.run(
              "post_review",
              {
                id: post.id,
                expectedVersion: post.version,
                decision: String(form.get("decision")),
                notes: String(form.get("notes")),
                reviewedContent: true,
              },
              "Publication review recorded.",
            );
          }}
        >
          <label>
            Publication decision
            <select name="decision">
              <option value="reject">Return for changes</option>
              <option value="approve">Approve for public availability</option>
            </select>
          </label>
          <label>
            Publication review notes
            <textarea
              name="notes"
              rows={3}
              minLength={3}
              maxLength={1000}
              required
            />
          </label>
          <label className="check-row">
            <input type="checkbox" required />I watched the entire video with
            audio and reviewed the caption, shared quest instructions and
            participation consent.
          </label>
          <Button secondary type="submit" busy={action.busy}>
            Record publication review
          </Button>
        </form>
      )}
      {action.feedback}
    </details>
  );
}

function FulfillmentForm({
  offer,
  refresh,
}: {
  offer: LicenseOffer;
  refresh: () => void;
}) {
  const action = useCommunityAction(refresh);
  return (
    <details className="community-panel">
      <summary>
        {offer.postTitle} · {offer.brandName}
      </summary>
      <LicenseTermsView terms={offer.acceptedTerms ?? offer.terms} />
      <p className="support">
        Record completion only after independently checking the payment and
        permissions. The agreed usage dates above remain fixed.
      </p>
      <form
        className="community-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void action.run(
            "offer_fulfill",
            {
              id: offer.id,
              expectedVersion: offer.version,
              paymentReference: String(form.get("paymentReference")),
              permissionReference: String(form.get("permissionReference")),
              paid: true,
              permissionsConfirmed: true,
            },
            "Manual fulfillment recorded. Access is restricted to the agreed period.",
          );
        }}
      >
        <label>
          Verified payment record
          <input
            name="paymentReference"
            minLength={3}
            maxLength={300}
            required
          />
        </label>
        <label>
          Verified permission or agreement record
          <input
            name="permissionReference"
            minLength={3}
            maxLength={300}
            required
          />
        </label>
        <label className="check-row">
          <input type="checkbox" required />I verified that the agreed payment
          is complete.
        </label>
        <label className="check-row">
          <input type="checkbox" required />I verified the accepted permissions
          and agreed usage period.
        </label>
        <Button type="submit" busy={action.busy}>
          Record verified fulfillment
        </Button>
      </form>
      {action.feedback}
    </details>
  );
}
function ReportReview({
  report,
  refresh,
}: {
  report: CommunityReport;
  refresh: () => void;
}) {
  const post = useCommunity(
    "post",
    { id: report.postId },
    Boolean(report.postId),
  );
  const action = useCommunityAction(refresh);
  return (
    <article className="community-card">
      <p>{report.reason}</p>
      <p className="support">
        Reported {new Date(report.createdAt).toLocaleString()}
      </p>
      {report.postId ? (
        <>
          <Link to={`/posts/${report.postId}`}>Inspect reported post</Link>
          {post.data && post.data.state === "published" && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void action.run(
                  "post_moderate",
                  {
                    id: post.data!.id,
                    expectedVersion: post.data!.version,
                    reason: String(form.get("reason")),
                  },
                  "Public post removed by operator. Its private original is unchanged.",
                );
              }}
            >
              <label>
                Moderation reason
                <textarea
                  name="reason"
                  rows={2}
                  minLength={3}
                  maxLength={1000}
                  required
                  defaultValue={report.reason}
                />
              </label>
              <Button secondary busy={action.busy} type="submit">
                Remove public post
              </Button>
            </form>
          )}
        </>
      ) : (
        <Link to={`/offers/${report.offerId}`}>
          Review reported commercial request
        </Link>
      )}
      {action.feedback}
    </article>
  );
}
type Workspace = "business" | "admin";

export default function CommunityStudio() {
  const me = useCommunity("me");
  if (me.error)
    return (
      <Notice error>
        {me.error}{" "}
        <button className="text-button" onClick={me.refresh}>
          Retry workspace
        </button>
      </Notice>
    );
  if (!me.data) return <Loading />;
  return (
    <Navigate
      replace
      to={
        me.data.roles.includes("operator")
          ? "/admin"
          : hasBusinessWorkspace(me.data)
            ? "/business"
            : "/rewards?tab=offers"
      }
    />
  );
}
export function BusinessWorkspace() {
  return <WorkspacePage workspace="business" />;
}
export function CommunityAdmin() {
  return <WorkspacePage workspace="admin" />;
}
function WorkspacePage({ workspace }: { workspace: Workspace }) {
  const me = useCommunity("me");
  const profileForm = useRef<HTMLDetailsElement>(null);
  const operator = useCommunity(
    "operator",
    {},
    workspace === "admin" && Boolean(me.data?.roles.includes("operator")),
  );
  const businessFeed = useCommunity(
    "brand",
    {},
    workspace === "business" && me.data?.brand?.state === "approved",
  );
  const action = useCommunityAction(() => {
    me.refresh();
    if (operator.data) operator.refresh();
  });
  if (me.error)
    return (
      <Notice error>
        {me.error}{" "}
        <button className="text-button" onClick={me.refresh}>
          Retry workspace
        </button>
      </Notice>
    );
  if (!me.data) return <Loading />;
  if (workspace === "admin" && !me.data.roles.includes("operator"))
    return (
      <>
        <PageTitle title="Admin" />
        <Notice>
          Staff access is required. Your account does not have this role.
        </Notice>
        <Link className="button secondary" to="/settings">
          Back to settings
        </Link>
      </>
    );
  const brand = me.data.brand;
  return (
    <div
      className={
        workspace === "business" ? "business-workspace" : "admin-workspace"
      }
    >
      <PageTitle
        eyebrow="CLEAR TERMS. GOOD STORIES."
        title={workspace === "admin" ? "Admin" : "Business workspace"}
      >
        {workspace === "admin"
          ? "Review approvals, reports, and recorded payment evidence."
          : "Find videos, agree usage terms, and manage your business’s licenses."}
      </PageTitle>
      <nav
        className="community-links workspace-links"
        aria-label="Workspace shortcuts"
      >
        <Link to="/settings">
          <Settings2 size={16} /> Settings
        </Link>
        <Link to="/rewards?tab=offers">
          <FileVideo size={16} /> Your creator offers
        </Link>
        <Link to="/profile">
          <UserRound size={16} /> Your public profile
        </Link>
        <Link to="/originals/new">
          <PenLine size={16} /> Draft an original quest
        </Link>
        {workspace === "admin" && me.data.roles.includes("operator") && (
          <Link to="/operator">Funded quests & rewards tools</Link>
        )}
      </nav>
      {workspace === "business" && (
        <section
          className="community-card business-next-step"
          aria-labelledby="business-next-step"
        >
          <div className="business-identity">
            <span className="business-workspace-icon">
              <BriefcaseBusiness size={25} />
            </span>
            <div>
              <span className="eyebrow">{brand?.name || "YOUR BUSINESS"}</span>
              {brand && <StateTag state={brand.state} />}
            </div>
          </div>
          <h2 id="business-next-step">
            {brand?.state === "approved"
              ? "Find your next story"
              : brand?.state === "pending"
                ? "Your business is in review"
                : "Start with your business profile"}
          </h2>
          <p>
            {brand?.state === "approved"
              ? "Discover real quest videos from creators open to working with you. Agree a price, channels and usage period for the exact video."
              : brand?.state === "pending"
                ? "An operator will review your business before licensing requests become available. Your existing requests remain below."
                : "Tell us about your business, then submit it for review. Once approved, you can propose terms on videos that creators make available."}
          </p>
          <div className="business-next-actions">
            {brand?.state === "approved" && (
              <a className="button" href="#brand-videos">
                Explore available videos <ArrowUpRight size={18} />
              </a>
            )}
            <Button
              secondary={brand?.state === "approved"}
              onClick={() => {
                if (!profileForm.current) return;
                profileForm.current.open = true;
                profileForm.current.scrollIntoView({
                  block: "start",
                  behavior: "smooth",
                });
                profileForm.current
                  .querySelector<HTMLInputElement>('input[name="name"]')
                  ?.focus({ preventScroll: true });
              }}
            >
              {brand?.state === "approved"
                ? "Edit business profile"
                : brand?.state === "pending"
                  ? "Review submitted details"
                  : brand
                    ? "Update business profile"
                    : "Set up business profile"}
            </Button>
          </div>
          <p className="support">
            Payments and permissions are verified manually before licensed
            downloads become available. Ad launching and sales tracking are not
            connected.
          </p>
        </section>
      )}
      {workspace === "business" && (
        <section
          className="section business-requests"
          aria-labelledby="business-requests-heading"
        >
          <h2 id="business-requests-heading">
            Your business’s licensing requests
          </h2>
          <p className="support">
            Review proposals and accepted terms for each exact video.
          </p>
          {me.data.offers.some((offer) => offer.brandId === brand?.id) ? (
            <div className="community-list">
              {me.data.offers
                .filter((offer) => offer.brandId === brand?.id)
                .map((offer) => (
                  <Link
                    className="community-list-link"
                    to={`/offers/${offer.id}`}
                    key={offer.id}
                  >
                    <span>
                      <strong>{offer.postTitle}</strong>
                      <small>
                        {offer.brandName} · {money(offer.terms.paymentMinor)}
                      </small>
                    </span>
                    <StateTag state={offer.state} />
                  </Link>
                ))}
            </div>
          ) : (
            <p className="support">
              Your business’s licensing requests will appear here after you
              propose terms for a creator’s opted-in video.
            </p>
          )}
        </section>
      )}
      {workspace === "business" && (
        <details
          ref={profileForm}
          id="business-profile"
          className="community-panel business-profile-form"
          open={!brand || brand.state === "rejected"}
        >
          <summary>
            {brand
              ? `Business profile · ${brand.state}`
              : "Set up a business profile"}
          </summary>
          {brand && (
            <>
              <StateTag state={brand.state} />
              {brand.reviewNotes && <Notice>{brand.reviewNotes}</Notice>}
            </>
          )}
          <p className="support">
            An operator must approve your business before you can send licensing
            proposals. Contact details are kept out of public creator and post
            responses.
          </p>
          {brand?.state === "approved" && (
            <Notice>
              Submitting changes sends your business back for review. New
              licensing proposals pause until it is approved again.
            </Notice>
          )}
          <form
            className="community-form"
            key={brand?.version ?? "new"}
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void action.run(
                "brand_save",
                {
                  name: String(form.get("name")),
                  website: String(form.get("website")),
                  contactEmail: String(form.get("contactEmail")),
                  expectedVersion: brand?.version ?? 0,
                },
                "Business profile saved for operator review.",
              );
            }}
          >
            <label>
              Business name
              <input
                name="name"
                minLength={2}
                maxLength={100}
                required
                defaultValue={brand?.name}
              />
            </label>
            <label>
              Business website
              <input
                name="website"
                type="url"
                pattern="https://.*"
                required
                maxLength={400}
                placeholder="https://"
                defaultValue={brand?.website}
              />
            </label>
            <label>
              Business contact email
              <input
                name="contactEmail"
                type="email"
                maxLength={254}
                required
                defaultValue={brand?.contactEmail}
              />
            </label>
            <Button type="submit" busy={action.busy}>
              Submit business for review
            </Button>
          </form>
        </details>
      )}
      {action.feedback}
      {workspace === "business" && brand?.state === "approved" && (
        <section
          className="section business-available"
          id="brand-videos"
          aria-labelledby="brand-videos-heading"
        >
          <h2 id="brand-videos-heading">Videos open to brand inquiries</h2>
          <p className="support">
            Creators have chosen to make these videos available. Open a video to
            propose its usage terms.
          </p>
          {businessFeed.error ? (
            <Notice error>
              {businessFeed.error}{" "}
              <button className="text-button" onClick={businessFeed.refresh}>
                Retry available videos
              </button>
            </Notice>
          ) : !businessFeed.data ? (
            <Loading />
          ) : businessFeed.data.posts.length ? (
            <div className="discover-feed">
              {businessFeed.data.posts.map((post) => (
                <DiscoverPostCard
                  key={post.id}
                  post={post}
                  viewer={me.data}
                  detail
                />
              ))}
            </div>
          ) : (
            <Empty title="No opted-in videos yet.">
              Only creators who explicitly make a published video available
              appear here.
            </Empty>
          )}
        </section>
      )}
      {workspace === "admin" && me.data.roles.includes("operator") && (
        <section className="operator-community section">
          <h2>Operator review</h2>
          <p className="support">
            These actions require an operator role on the server. Approval and
            manual fulfillment are recorded separately.
          </p>
          {operator.error && (
            <Notice error>
              {operator.error}{" "}
              <button className="text-button" onClick={operator.refresh}>
                Retry operator review
              </button>
            </Notice>
          )}
          {!operator.data && !operator.error && <Loading />}
          {operator.data && (
            <>
              <h3>Videos awaiting publication review</h3>
              <p className="support">
                Submissions stay private until an independent operator approves
                them. Caption edits and republication return here for a new
                review.
              </p>
              {!operator.data.reviewPosts?.length && (
                <p className="support">
                  No videos are awaiting publication review.
                </p>
              )}
              {(operator.data.reviewPosts ?? []).map((post) => (
                <ReelPublicationReview
                  key={`${post.id}:${post.version}`}
                  post={post}
                  own={post.creator.id === me.data!.userId}
                  refresh={() => {
                    operator.refresh();
                    me.refresh();
                  }}
                />
              ))}
              <h3>Original quests awaiting review</h3>
              {!operator.data.drafts.some(
                (draft) => draft.state === "submitted",
              ) && (
                <p className="support">
                  No original quests are awaiting review.
                </p>
              )}
              {operator.data.drafts
                .filter((draft) => draft.state === "submitted")
                .map((draft) => (
                  <details className="community-panel" key={draft.id}>
                    <summary>{draft.quest.title}</summary>
                    <p>{draft.quest.hook}</p>
                    <p className="support">
                      {words(draft.quest.intensity)} ·{" "}
                      {draft.quest.durationMinutes} minutes ·{" "}
                      {draft.quest.minParticipants}–
                      {draft.quest.maxParticipants} people ·{" "}
                      {draft.quest.settings.join(", ")} ·{" "}
                      {words(draft.quest.preparation)}
                    </p>
                    <p>
                      Expected cost: {money(draft.quest.cost.minMinor)}–
                      {money(draft.quest.cost.maxMinor)}{" "}
                      {words(draft.quest.cost.scope)}
                      {draft.quest.cost.venueCostUnknown
                        ? "; additional venue cost needs confirmation"
                        : ""}
                      .
                    </p>
                    <p>{draft.quest.cost.note}</p>
                    <h4>Instructions & requirements</h4>
                    <ul>
                      {draft.quest.requirements.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                    <h4>Filming moments</h4>
                    {draft.quest.beats.map((beat) => (
                      <p key={beat.label}>
                        <strong>{beat.label}:</strong> {beat.action}
                        <br />
                        <span className="support">Film: {beat.filming}</span>
                      </p>
                    ))}
                    <p className="support">
                      Materials:{" "}
                      {draft.quest.materials.join(", ") || "None listed"}.
                      Involves:{" "}
                      {draft.quest.conflicts.map(words).join(", ") ||
                        "No listed exclusions"}
                      . Venue permission:{" "}
                      {draft.quest.venuePermissionRequired
                        ? "required"
                        : "not required"}
                      . Arrangements:{" "}
                      {draft.quest.arrangementRequired
                        ? "required"
                        : "not required"}
                      . Volunteer:{" "}
                      {draft.quest.requiresVolunteer
                        ? "required"
                        : "not required"}
                      . Adults only: {draft.quest.adultOnly ? "yes" : "no"}.
                    </p>
                    <p className="support">Fallback: {draft.quest.fallback}</p>
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        const form = new FormData(event.currentTarget);
                        void action.run(
                          "draft_review",
                          {
                            id: draft.id,
                            expectedVersion: draft.version,
                            decision: String(form.get("decision")),
                            notes: String(form.get("notes")),
                          },
                          "Original quest review recorded.",
                        );
                      }}
                    >
                      <label>
                        Review decision
                        <select name="decision">
                          <option value="reject">Return for changes</option>
                          <option value="approve">
                            Approve for public availability
                          </option>
                        </select>
                      </label>
                      <label>
                        Review notes
                        <textarea
                          name="notes"
                          rows={3}
                          maxLength={1500}
                          required
                        />
                      </label>
                      <label className="check-row">
                        <input type="checkbox" required />I reviewed the
                        instructions, filming moments and participation
                        requirements.
                      </label>
                      <Button secondary type="submit" busy={action.busy}>
                        Record quest review
                      </Button>
                    </form>
                  </details>
                ))}
              <h3>Business approvals</h3>
              {!operator.data.businesses.some(
                (business) => business.state === "pending",
              ) && (
                <p className="support">
                  No business profiles are awaiting review.
                </p>
              )}
              {operator.data.businesses
                .filter((business) => business.state === "pending")
                .map((business) => (
                  <details className="community-panel" key={business.id}>
                    <summary>{business.name}</summary>
                    <p>
                      <a
                        href={business.website}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Review business website
                      </a>
                    </p>
                    <p>{business.contactEmail}</p>
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        const form = new FormData(event.currentTarget);
                        void action.run(
                          "brand_review",
                          {
                            id: business.id,
                            expectedVersion: business.version,
                            decision: String(form.get("decision")),
                            notes: String(form.get("notes")),
                          },
                          "Business review recorded.",
                        );
                      }}
                    >
                      <label>
                        Review decision
                        <select name="decision">
                          <option value="reject">Not approved</option>
                          <option value="approve">Approve business</option>
                        </select>
                      </label>
                      <label>
                        Verification notes
                        <textarea
                          name="notes"
                          rows={3}
                          maxLength={1500}
                          required
                        />
                      </label>
                      <Button secondary busy={action.busy} type="submit">
                        Record business review
                      </Button>
                    </form>
                  </details>
                ))}
              <h3>Manual fulfillment</h3>
              {operator.data.offers
                .filter(
                  (offer) =>
                    offer.state === "pending_fulfillment" && !offer.suspended,
                )
                .map((offer) => (
                  <FulfillmentForm
                    key={offer.id}
                    offer={offer}
                    refresh={operator.refresh}
                  />
                ))}
              {!operator.data.offers.some(
                (offer) =>
                  offer.state === "pending_fulfillment" && !offer.suspended,
              ) && (
                <p className="support">
                  No mutually accepted offers are awaiting fulfillment.
                </p>
              )}
              <h3>Reports</h3>
              {operator.data.reports.length ? (
                operator.data.reports.map((report) => (
                  <ReportReview
                    key={report.id}
                    report={report}
                    refresh={operator.refresh}
                  />
                ))
              ) : (
                <p className="support">No reports awaiting review.</p>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
