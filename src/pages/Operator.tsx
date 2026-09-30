import { useEffect, useRef, useState } from "react";
import { api, request } from "../lib/api";
import { DEMO } from "../lib/auth";
import { AuthVideo } from "../components/PrivateMedia";
import {
  Button,
  PageTitle,
  Notice,
  useResource,
  Loading,
  Back,
  Chips,
} from "../components/ui";
import {
  CATEGORIES,
  type Category,
  type QuestVariant,
} from "../../shared/domain";
import { catalog } from "../../shared/catalog";

type Provider = { id: string; name: string; area: string; approved: boolean };
type OperatorState = {
  quests: { id: string; title: string; published: boolean }[];
  reviews: { id: string; title: string }[];
  offers: {
    id: string;
    title: string;
    active: boolean;
    stock_available: number;
  }[];
  sponsors: Provider[];
  campaigns?: CampaignRecord[];
  redemptions: { id: string; state: string }[];
};
type ReviewEvidence = {
  run_id: string;
  snapshot: Partial<QuestVariant>;
  review_deadline?: string;
  evidence_manifest: {
    declaration?: {
      attempted?: boolean;
      consent?: boolean;
      statement?: string;
    };
    clips: {
      asset_id: string;
      slot: number;
      start_ms: number;
      end_ms: number;
      label?: string;
      generation: number;
    }[];
  };
};
const emptyProvider = {
  name: "",
  area: "",
  contact_notes: "",
  funding_reference: "",
  approved: false,
};
const emptyOffer = {
  merchant_id: "",
  title: "",
  terms: "",
  area: "",
  point_cost: 40,
  stock_total: 0,
  funded: false,
  active: false,
  funding_reference: "",
  starts_at: "",
  ends_at: "",
  per_user_limit: 1,
  reservation_minutes: 60,
  notes: "",
};

export default function Operator() {
  const me = useResource(api.me);
  const operator = !!me.data?.roles.includes("operator");
  const allowed = !!me.data?.roles.some((role) =>
    ["operator", "merchant"].includes(role),
  );
  const [state, setState] = useState<OperatorState>();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState(emptyProvider);
  const [offer, setOffer] = useState(emptyOffer);
  const [evidence, setEvidence] = useState<ReviewEvidence>();
  const [evidenceBusy, setEvidenceBusy] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const pendingMutation = useRef<{ input: string; key: string } | null>(null);
  async function load() {
    if (!operator) return;
    setLoading(true);
    setError("");
    try {
      setState(await request<OperatorState>("/api/operator"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (!DEMO && operator) void load();
  }, [operator]);
  async function act<T>(url: string, body: unknown): Promise<T | undefined> {
    setBusy(true);
    setError("");
    setMessage("");
    const input = JSON.stringify({ url, body });
    if (pendingMutation.current?.input !== input)
      pendingMutation.current = { input, key: crypto.randomUUID() };
    try {
      const result = await request<T>(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": pendingMutation.current.key,
        },
        body: JSON.stringify(body),
      });
      pendingMutation.current = null;
      return result;
    } catch (e) {
      setError((e as Error).message);
      return undefined;
    } finally {
      setBusy(false);
    }
  }
  async function publication(id: string, published: boolean) {
    const result = await act("/api/operator/quests", { id, published });
    if (result !== undefined) {
      setMessage(
        published
          ? "Quest published. Existing accepted plans are unchanged."
          : "Quest paused for new acceptances. Existing accepted plans are unchanged.",
      );
      await load();
    }
  }
  async function openEvidence(runId: string) {
    setError("");
    setEvidence(undefined);
    setReviewed(false);
    setEvidenceBusy(runId);
    try {
      setEvidence(
        await request<ReviewEvidence>(`/api/operator/reviews/${runId}`),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEvidenceBusy("");
    }
  }
  async function decide(decision: "approve" | "reject") {
    if (!evidence || !reviewed) return;
    const result = await act("/api/operator/reviews", {
      runId: evidence.run_id,
      decision,
    });
    if (result !== undefined) {
      setEvidence(undefined);
      setReviewed(false);
      setMessage(
        decision === "approve"
          ? "Attempt approved. The server finalized its award eligibility using the current cap and cooldown."
          : "Review closed without an award. The completion decision is recorded.",
      );
      await load();
    }
  }
  if (!me.data)
    return me.error ? <Notice error>{me.error}</Notice> : <Loading />;
  if (DEMO || !allowed)
    return (
      <>
        <Back to="/profile" />
        <PageTitle title="Operator access required" />
        <Notice>
          This route requires a current database membership. Local preferences
          and account metadata cannot grant access. Bootstrap instructions are
          in the database guide.
        </Notice>
      </>
    );
  const approvedProviders = (state?.sponsors || []).filter(
    (item) => item.approved,
  );
  return (
    <>
      <Back to="/profile" />
      <PageTitle eyebrow="RESTRICTED OPERATIONS" title="Keep the promise.">
        Real agreements. Careful reviews. Rewards that can actually be
        fulfilled.
      </PageTitle>
      {operator && (
        <Button secondary busy={loading} onClick={load}>
          Refresh operations
        </Button>
      )}
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      <section className="section">
        <h2>Merchant confirmation</h2>
        <p className="support">
          Confirm only when you are providing the promised benefit. A used token
          cannot provide a second benefit.
        </p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const result = await act<{
              state: string;
              already_consumed?: boolean;
            }>("/api/merchant/consume", { token: token.trim() });
            if (result !== undefined) {
              setToken("");
              setMessage(
                result.already_consumed
                  ? "Already used. This reward was consumed earlier; do not fulfill it again."
                  : result.state === "consumed"
                    ? "Fulfillment confirmed. This reward is now consumed and cannot be used again."
                    : "The redemption status was updated. Refresh before providing a benefit.",
              );
              if (operator) await load();
            }
          }}
        >
          <label>
            Private redemption token
            <textarea
              rows={3}
              required
              maxLength={4096}
              autoComplete="off"
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
          </label>
          <Button type="submit" busy={busy} disabled={!token.trim()}>
            Confirm fulfillment
          </Button>
        </form>
      </section>
      {operator && (
        <>
          <section className="section">
            <h2>Attempts needing review</h2>
            <p className="support">
              Review the frozen submission. Valid video does not prove every
              real-world claim, and a genuine failed attempt can qualify.
            </p>
            {state?.reviews.length === 0 && (
              <p className="support">No pending reviews.</p>
            )}
            {state?.reviews.map((item) => (
              <div className="operator-row" key={item.id}>
                <span>{item.title}</span>
                <Button
                  secondary
                  busy={evidenceBusy === item.id}
                  disabled={!!evidenceBusy}
                  onClick={() => openEvidence(item.id)}
                >
                  Open evidence
                </Button>
              </div>
            ))}
            {evidence && (
              <article className="review-evidence">
                <h3>{evidence.snapshot.title || "Submitted quest"}</h3>
                {evidence.snapshot.hook && <p>{evidence.snapshot.hook}</p>}
                {evidence.review_deadline && (
                  <p className="support">
                    Review deadline:{" "}
                    {new Date(evidence.review_deadline).toLocaleString()}
                  </p>
                )}
                <h3>Completion requirements</h3>
                <ul className="clean-list">
                  {evidence.snapshot.completionQuestions?.map((question) => (
                    <li key={question}>{question}</li>
                  ))}
                </ul>
                <h3>Submitted declaration</h3>
                <p className="support">
                  Attempt confirmed:{" "}
                  {evidence.evidence_manifest.declaration?.attempted
                    ? "Yes"
                    : "No"}{" "}
                  · Recording permission confirmed:{" "}
                  {evidence.evidence_manifest.declaration?.consent
                    ? "Yes"
                    : "No"}
                </p>
                <blockquote>
                  {evidence.evidence_manifest.declaration?.statement ||
                    "No additional statement was provided."}
                </blockquote>
                <div className="evidence-clips">
                  {evidence.evidence_manifest.clips.map((clip) => (
                    <div key={clip.asset_id}>
                      <h3>
                        Moment {clip.slot}: {clip.label || "Submitted clip"}
                      </h3>
                      <p className="support">
                        Selected range: {(clip.start_ms / 1000).toFixed(1)}–
                        {(clip.end_ms / 1000).toFixed(1)} seconds · Saved
                        generation {clip.generation}
                      </p>
                      <AuthVideo
                        controls
                        playsInline
                        src={`/api/operator/reviews/${evidence.run_id}/media/${clip.asset_id}`}
                        aria-label={`Frozen evidence moment ${clip.slot}`}
                        onLoadedMetadata={(event) => {
                          event.currentTarget.currentTime =
                            clip.start_ms / 1000;
                        }}
                      />
                    </div>
                  ))}
                </div>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={reviewed}
                    onChange={(event) => setReviewed(event.target.checked)}
                  />
                  <span>
                    I reviewed the submitted evidence and the accepted
                    completion requirements.
                  </span>
                </label>
                <div className="button-row">
                  <Button
                    disabled={!reviewed || busy}
                    busy={busy}
                    onClick={() => decide("approve")}
                  >
                    Approve attempt
                  </Button>
                  <Button
                    secondary
                    disabled={!reviewed || busy}
                    onClick={() => decide("reject")}
                  >
                    Close without award
                  </Button>
                </div>
                <button
                  className="text-button"
                  onClick={() => {
                    setEvidence(undefined);
                    setReviewed(false);
                  }}
                >
                  Close evidence
                </button>
              </article>
            )}
          </section>
          <section className="section">
            <h2>Provider agreements</h2>
            <p className="support">
              Record an actual provider and agreement. Private contact and
              funding details stay out of the consumer catalog.
            </p>
            {(state?.sponsors || []).map((item) => (
              <div className="operator-row" key={item.id}>
                <span>
                  <strong>{item.name}</strong>
                  <small className="support"> · {item.area}</small>
                </span>
                <span className="pill">
                  {item.approved ? "Approved" : "Not approved"}
                </span>
              </div>
            ))}
            <details className="operator-form-panel">
              <summary>Add a provider agreement</summary>
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  const result = await act("/api/operator/sponsors", provider);
                  if (result !== undefined) {
                    setProvider(emptyProvider);
                    setMessage(
                      "Provider agreement saved. Only approved providers can back an active offer.",
                    );
                    await load();
                  }
                }}
              >
                <label>
                  Provider name
                  <input
                    required
                    minLength={2}
                    maxLength={120}
                    value={provider.name}
                    onChange={(event) =>
                      setProvider({ ...provider, name: event.target.value })
                    }
                  />
                </label>
                <label>
                  Launch area
                  <input
                    required
                    maxLength={100}
                    value={provider.area}
                    onChange={(event) =>
                      setProvider({ ...provider, area: event.target.value })
                    }
                    placeholder="Use the configured launch area"
                  />
                </label>
                <label>
                  Agreement / funding reference
                  <input
                    required
                    minLength={3}
                    maxLength={300}
                    value={provider.funding_reference}
                    onChange={(event) =>
                      setProvider({
                        ...provider,
                        funding_reference: event.target.value,
                      })
                    }
                    placeholder="Reference to the real agreement"
                  />
                </label>
                <label>
                  Private contact and agreement notes
                  <textarea
                    rows={3}
                    maxLength={3000}
                    value={provider.contact_notes}
                    onChange={(event) =>
                      setProvider({
                        ...provider,
                        contact_notes: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={provider.approved}
                    onChange={(event) =>
                      setProvider({
                        ...provider,
                        approved: event.target.checked,
                      })
                    }
                  />
                  <span>
                    I verified the provider and approve this agreement.
                  </span>
                </label>
                <Button type="submit" busy={busy}>
                  Save provider agreement
                </Button>
              </form>
            </details>
          </section>
          <section className="section">
            <h2>Funded offers</h2>
            <p className="support">
              Pausing stops new claims. Previously issued reservations keep
              their agreed terms.
            </p>
            {state?.offers.length === 0 && (
              <p className="support">
                No live offers. Consumers see an honest empty catalog.
              </p>
            )}
            {state?.offers.map((item) => (
              <div className="operator-row" key={item.id}>
                <span>
                  <strong>{item.title}</strong>
                  <small className="support">
                    {" "}
                    · {item.stock_available} available ·{" "}
                    {item.active ? "Active" : "Paused"}
                  </small>
                </span>
                {item.active && (
                  <Button
                    secondary
                    busy={busy}
                    onClick={async () => {
                      const result = await act("/api/operator/offers/pause", {
                        id: item.id,
                      });
                      if (result !== undefined) {
                        setMessage(
                          "New claims paused. Issued reservations are preserved.",
                        );
                        await load();
                      }
                    }}
                  >
                    Pause new claims
                  </Button>
                )}
              </div>
            ))}
            <details className="operator-form-panel">
              <summary>Create a funded offer</summary>
              {approvedProviders.length === 0 ? (
                <Notice>
                  Add and approve a real provider agreement before creating an
                  offer.
                </Notice>
              ) : (
                <form
                  onSubmit={async (event) => {
                    event.preventDefault();
                    setError("");
                    const startsAt = new Date(offer.starts_at),
                      endsAt = new Date(offer.ends_at);
                    if (
                      !Number.isFinite(startsAt.getTime()) ||
                      !Number.isFinite(endsAt.getTime()) ||
                      endsAt <= startsAt
                    ) {
                      setError("Choose a valid start and a later expiration.");
                      return;
                    }
                    const result = await act("/api/operator/offers", {
                      ...offer,
                      currency: "USD",
                      starts_at: startsAt.toISOString(),
                      ends_at: endsAt.toISOString(),
                    });
                    if (result !== undefined) {
                      setOffer(emptyOffer);
                      setMessage(
                        offer.active
                          ? "Offer published after server validation. Its confirmed inventory is now available to eligible users."
                          : "Offer saved as inactive. It is not visible for new claims.",
                      );
                      await load();
                    }
                  }}
                >
                  <label>
                    Approved provider
                    <select
                      required
                      value={offer.merchant_id}
                      onChange={(event) => {
                        const chosen = approvedProviders.find(
                          (item) => item.id === event.target.value,
                        );
                        setOffer({
                          ...offer,
                          merchant_id: event.target.value,
                          area: chosen?.area || offer.area,
                        });
                      }}
                    >
                      <option value="">Choose a provider</option>
                      {approvedProviders.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Benefit title
                    <input
                      required
                      minLength={3}
                      maxLength={120}
                      value={offer.title}
                      onChange={(event) =>
                        setOffer({ ...offer, title: event.target.value })
                      }
                      placeholder="Describe the actual benefit"
                    />
                  </label>
                  <label>
                    Public terms and redemption instructions
                    <textarea
                      required
                      minLength={20}
                      maxLength={3000}
                      rows={5}
                      value={offer.terms}
                      onChange={(event) =>
                        setOffer({ ...offer, terms: event.target.value })
                      }
                      placeholder="State what is included, location, fulfillment steps, extra purchases, exclusions, and cancellation/expiry rules."
                    />
                  </label>
                  <div className="form-grid">
                    <label>
                      Point cost
                      <input
                        required
                        type="number"
                        min={1}
                        max={1000000}
                        step={1}
                        value={offer.point_cost}
                        onChange={(event) =>
                          setOffer({
                            ...offer,
                            point_cost: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      Confirmed inventory
                      <input
                        required
                        type="number"
                        min={0}
                        max={100000}
                        step={1}
                        value={offer.stock_total}
                        onChange={(event) =>
                          setOffer({
                            ...offer,
                            stock_total: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                  <label>
                    Launch area
                    <input
                      required
                      maxLength={100}
                      value={offer.area}
                      onChange={(event) =>
                        setOffer({ ...offer, area: event.target.value })
                      }
                    />
                  </label>
                  <p className="support">
                    Currency: USD. State any required dollar purchase clearly in
                    the public terms; points are not cash.
                  </p>
                  <div className="form-grid">
                    <label>
                      Available from (local time)
                      <input
                        required
                        type="datetime-local"
                        value={offer.starts_at}
                        onChange={(event) =>
                          setOffer({ ...offer, starts_at: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Offer ends (local time)
                      <input
                        required
                        type="datetime-local"
                        value={offer.ends_at}
                        onChange={(event) =>
                          setOffer({ ...offer, ends_at: event.target.value })
                        }
                      />
                    </label>
                  </div>
                  <div className="form-grid">
                    <label>
                      Claims per person
                      <input
                        required
                        type="number"
                        min={1}
                        max={100}
                        step={1}
                        value={offer.per_user_limit}
                        onChange={(event) =>
                          setOffer({
                            ...offer,
                            per_user_limit: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      Reservation lasts (minutes)
                      <input
                        required
                        type="number"
                        min={5}
                        max={1440}
                        step={1}
                        value={offer.reservation_minutes}
                        onChange={(event) =>
                          setOffer({
                            ...offer,
                            reservation_minutes: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                  <label>
                    Funding reference
                    <input
                      required
                      minLength={3}
                      maxLength={300}
                      value={offer.funding_reference}
                      onChange={(event) =>
                        setOffer({
                          ...offer,
                          funding_reference: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Private inventory notes
                    <textarea
                      rows={3}
                      maxLength={3000}
                      value={offer.notes}
                      onChange={(event) =>
                        setOffer({ ...offer, notes: event.target.value })
                      }
                    />
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={offer.funded}
                      onChange={(event) =>
                        setOffer({
                          ...offer,
                          funded: event.target.checked,
                          ...(!event.target.checked ? { active: false } : {}),
                        })
                      }
                    />
                    <span>
                      The funding and usable inventory are confirmed with this
                      provider.
                    </span>
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={offer.active}
                      disabled={!offer.funded || offer.stock_total < 1}
                      onChange={(event) =>
                        setOffer({ ...offer, active: event.target.checked })
                      }
                    />
                    <span>
                      Activate for new claims after server validation.
                    </span>
                  </label>
                  <Button type="submit" busy={busy}>
                    {offer.active
                      ? "Validate & publish offer"
                      : "Save inactive offer"}
                  </Button>
                </form>
              )}
            </details>
          </section>
          <CampaignPanel
            providers={approvedProviders}
            campaigns={state?.campaigns || []}
            busy={busy}
            onSave={async (payload) => {
              const result = await act("/api/operator/campaigns", payload);
              if (result === undefined) return false;
              setMessage(
                payload.state === "active"
                  ? "Funded campaign activated. Sponsorship is disclosed only on matching, eligible quests."
                  : "Campaign saved. Inactive campaigns do not appear on new recommendations.",
              );
              await load();
              return true;
            }}
            onPause={async (id) => {
              const result = await act("/api/operator/campaigns/pause", { id });
              if (result !== undefined) {
                setMessage(
                  "Campaign paused for new recommendations. Accepted quests retain their original disclosure.",
                );
                await load();
              }
            }}
          />
          <section className="section">
            <h2>Quest publication</h2>
            {state?.quests.map((item) => (
              <div className="operator-row" key={item.id}>
                <span>{item.title}</span>
                <Button
                  secondary
                  busy={busy}
                  onClick={() => publication(item.id, !item.published)}
                >
                  {item.published ? "Pause" : "Publish"}
                </Button>
              </div>
            ))}
          </section>
          <section className="section">
            <h2>Recent redemptions</h2>
            {state?.redemptions.length === 0 && (
              <p className="support">
                No reservations or fulfilled rewards yet.
              </p>
            )}
            {state?.redemptions.map((item) => (
              <div className="operator-row" key={item.id}>
                <span>Reservation {item.id.slice(0, 8)}</span>
                <span className="pill">{item.state}</span>
              </div>
            ))}
          </section>
        </>
      )}
    </>
  );
}

type CampaignRecord = {
  id: string;
  sponsor_id: string;
  title: string;
  disclosure: string;
  area: string;
  state: "draft" | "active" | "paused" | "ended";
};
type CampaignPayload = {
  sponsor_id: string;
  title: string;
  disclosure: string;
  area: string;
  state: "draft" | "active" | "paused";
  categories: Category[];
  family_ids: string[];
  funded: boolean;
  starts_at: string;
  ends_at: string;
  funding_reference: string;
  notes: string;
};
const emptyCampaign: CampaignPayload = {
  sponsor_id: "",
  title: "",
  disclosure: "",
  area: "",
  state: "draft",
  categories: [],
  family_ids: [],
  funded: false,
  starts_at: "",
  ends_at: "",
  funding_reference: "",
  notes: "",
};
const questFamilies = catalog.filter(
  (quest, index) =>
    catalog.findIndex((candidate) => candidate.familyId === quest.familyId) ===
    index,
);
function CampaignPanel({
  providers,
  campaigns,
  busy,
  onSave,
  onPause,
}: {
  providers: Provider[];
  campaigns: CampaignRecord[];
  busy: boolean;
  onSave: (payload: CampaignPayload) => Promise<boolean>;
  onPause: (id: string) => Promise<void>;
}) {
  const [campaign, setCampaign] = useState(emptyCampaign);
  const [error, setError] = useState("");
  const familyOptions = questFamilies
    .filter((quest) => campaign.categories.includes(quest.category))
    .map((quest) => ({ id: quest.familyId, label: quest.title }));
  return (
    <section className="section">
      <h2>Sponsored quest campaigns</h2>
      <p className="support">
        Funding does not buy a different set of rules. Sponsored quests still
        have to fit the person’s boundaries, budget, and readiness.
      </p>
      {campaigns.length === 0 && (
        <p className="support">
          No campaigns recorded. Recommendations remain entirely from the
          authored catalog.
        </p>
      )}
      {campaigns.map((item) => (
        <div className="operator-row" key={item.id}>
          <span>
            <strong>{item.title}</strong>
            <small className="support">
              {" "}
              · {item.area} · {item.state}
            </small>
            <small className="campaign-disclosure">{item.disclosure}</small>
          </span>
          {item.state === "active" && (
            <Button secondary busy={busy} onClick={() => onPause(item.id)}>
              Pause campaign
            </Button>
          )}
        </div>
      ))}
      <details className="operator-form-panel">
        <summary>Add a funded campaign</summary>
        {providers.length === 0 ? (
          <Notice>
            Approve a real provider agreement first. No sample business can fund
            a live campaign.
          </Notice>
        ) : (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setError("");
              if (!campaign.categories.length || !campaign.family_ids.length) {
                setError(
                  "Choose at least one category and one matching quest family.",
                );
                return;
              }
              const starts = new Date(campaign.starts_at),
                ends = new Date(campaign.ends_at);
              if (
                !Number.isFinite(starts.getTime()) ||
                !Number.isFinite(ends.getTime()) ||
                ends <= starts
              ) {
                setError(
                  "Choose a valid campaign start and a later expiration.",
                );
                return;
              }
              if (
                await onSave({
                  ...campaign,
                  starts_at: starts.toISOString(),
                  ends_at: ends.toISOString(),
                })
              )
                setCampaign(emptyCampaign);
            }}
          >
            <label>
              Campaign provider
              <select
                required
                value={campaign.sponsor_id}
                onChange={(event) => {
                  const chosen = providers.find(
                    (item) => item.id === event.target.value,
                  );
                  setCampaign({
                    ...campaign,
                    sponsor_id: event.target.value,
                    area: chosen?.area || campaign.area,
                  });
                }}
              >
                <option value="">Choose an approved provider</option>
                {providers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Campaign title
              <input
                required
                minLength={3}
                maxLength={120}
                value={campaign.title}
                onChange={(event) =>
                  setCampaign({ ...campaign, title: event.target.value })
                }
              />
            </label>
            <label>
              Disclosure (include sponsor name)
              <input
                required
                minLength={3}
                maxLength={120}
                value={campaign.disclosure}
                onChange={(event) =>
                  setCampaign({ ...campaign, disclosure: event.target.value })
                }
                placeholder="Sponsored by [business]"
              />
            </label>
            <p className="support">
              This plain-text disclosure appears beside matching sponsored
              content and in its exported reel. It grants no filming permission.
            </p>
            <label>
              Campaign area
              <input
                required
                maxLength={100}
                value={campaign.area}
                onChange={(event) =>
                  setCampaign({ ...campaign, area: event.target.value })
                }
              />
            </label>
            <div className="field">
              <span className="field-label">Eligible categories</span>
              <Chips
                label="Campaign categories"
                options={CATEGORIES}
                multi
                value={campaign.categories}
                onChange={(value) => {
                  const categories = value as Category[];
                  setCampaign({
                    ...campaign,
                    categories,
                    family_ids: campaign.family_ids.filter((id) =>
                      questFamilies.some(
                        (quest) =>
                          quest.familyId === id &&
                          categories.includes(quest.category),
                      ),
                    ),
                  });
                }}
              />
            </div>
            <div className="field">
              <span className="field-label">Eligible quest families</span>
              {familyOptions.length ? (
                <>
                  <Chips
                    label="Campaign quest families"
                    options={familyOptions}
                    multi
                    value={campaign.family_ids}
                    onChange={(value) =>
                      setCampaign({
                        ...campaign,
                        family_ids: value as string[],
                      })
                    }
                  />
                  <button
                    className="text-button"
                    type="button"
                    onClick={() =>
                      setCampaign({
                        ...campaign,
                        family_ids: familyOptions.map((item) => item.id),
                      })
                    }
                  >
                    Select all shown families
                  </button>
                </>
              ) : (
                <p className="support">
                  Choose categories to see their authored families.
                </p>
              )}
            </div>
            <div className="form-grid">
              <label>
                Campaign starts (local time)
                <input
                  required
                  type="datetime-local"
                  value={campaign.starts_at}
                  onChange={(event) =>
                    setCampaign({ ...campaign, starts_at: event.target.value })
                  }
                />
              </label>
              <label>
                Campaign ends (local time)
                <input
                  required
                  type="datetime-local"
                  value={campaign.ends_at}
                  onChange={(event) =>
                    setCampaign({ ...campaign, ends_at: event.target.value })
                  }
                />
              </label>
            </div>
            <label>
              Campaign funding reference
              <input
                required
                minLength={3}
                maxLength={300}
                value={campaign.funding_reference}
                onChange={(event) =>
                  setCampaign({
                    ...campaign,
                    funding_reference: event.target.value,
                  })
                }
              />
            </label>
            <label>
              Private campaign notes
              <textarea
                rows={3}
                maxLength={3000}
                value={campaign.notes}
                onChange={(event) =>
                  setCampaign({ ...campaign, notes: event.target.value })
                }
              />
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={campaign.funded}
                onChange={(event) =>
                  setCampaign({
                    ...campaign,
                    funded: event.target.checked,
                    ...(!event.target.checked && campaign.state === "active"
                      ? { state: "draft" as const }
                      : {}),
                  })
                }
              />
              <span>This campaign has a confirmed agreement and funding.</span>
            </label>
            <label>
              Campaign status
              <select
                value={campaign.state}
                onChange={(event) =>
                  setCampaign({
                    ...campaign,
                    state: event.target.value as CampaignPayload["state"],
                  })
                }
              >
                <option value="draft">Draft — keep it private</option>
                <option value="active" disabled={!campaign.funded}>
                  Active — validate and disclose
                </option>
                <option value="paused">Paused — no new placements</option>
              </select>
            </label>
            {error && <Notice error>{error}</Notice>}
            <Button type="submit" busy={busy}>
              {campaign.state === "active"
                ? "Validate & activate campaign"
                : "Save campaign"}
            </Button>
          </form>
        )}
      </details>
    </section>
  );
}
