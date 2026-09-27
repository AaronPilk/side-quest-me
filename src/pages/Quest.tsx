import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Clock3,
  Users,
  MapPin,
  ChevronRight,
  Check,
  SlidersHorizontal,
  Video,
  Flag,
  Sparkles,
} from "lucide-react";
import {
  CATEGORIES,
  INTENSITIES,
  DEFAULT_OUTING,
  effectiveBudget,
  outingSchema,
  type Outing,
  type Candidate,
} from "../../shared/domain";
import { api, eligibility } from "../lib/api";
import { DEMO } from "../lib/auth";
import {
  Button,
  Chips,
  Notice,
  PageTitle,
  QuestArt,
  useResource,
  Loading,
  money,
  localReset,
} from "../components/ui";
export default function Quest() {
  const navigate = useNavigate();
  const runs = useResource(api.runs);
  const me = useResource(api.me);
  const [outing, setOuting] = useState<Outing>(() => {
    try {
      return outingSchema.parse(
        JSON.parse(sessionStorage.getItem("sq-outing") || "null"),
      );
    } catch {
      return DEFAULT_OUTING;
    }
  });
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [selected, setSelected] = useState<Candidate>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [details, setDetails] = useState(false);
  const [acceptKey] = useState(crypto.randomUUID());
  function update(patch: Partial<Outing>) {
    const value = { ...outing, ...patch };
    setOuting(value);
    sessionStorage.setItem("sq-outing", JSON.stringify(value));
    setCandidates(null);
  }
  async function discover(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      outingSchema.parse(outing);
      setCandidates(await api.quests(outing));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check your outing details.");
    } finally {
      setBusy(false);
    }
  }
  async function accept() {
    setBusy(true);
    setError("");
    try {
      const run = await api.accept(selected!, outing, acceptKey);
      navigate(`/runs/${run.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const active = runs.data?.find((r) =>
    ["accepted", "in_progress"].includes(r.status),
  );
  const label = CATEGORIES.find((c) => c.id === outing.category)?.label;
  if (selected) {
    const reason = DEMO
      ? eligibility(runs.data || [], selected.familyId)
      : selected.rewardEligibility.reason;
    return (
      <>
        <button className="back" onClick={() => setSelected(undefined)}>
          ← Your choices
        </button>
        <QuestArt variant={selected.category} small />
        <div className="eyebrow space-top">
          {label} ·{" "}
          {INTENSITIES.find((i) => i.id === selected.intensity)?.label}
        </div>
        <h1 className="quest-detail-title">{selected.title}</h1>
        <p className="lead">{selected.hook}</p>
        {selected.sponsorDisclosure && (
          <p className="support">Sponsored · {selected.sponsorDisclosure}</p>
        )}
        <div className="meta-row">
          <span>
            <Clock3 size={16} />
            {selected.durationMinutes + outing.travelMinutes} min
          </span>
          <span>
            <Users size={16} />
            {selected.minParticipants}–{selected.maxParticipants} people
          </span>
          <span>{money(selected.estimatedCostMaxMinor)} group estimate</span>
        </div>
        <section className="section">
          <h2>The three moments</h2>
          <ol className="beats-preview">
            {selected.beats.map((b, i) => (
              <li key={b.label}>
                <span className="step-num">{i + 1}</span>
                <div>
                  <h3>{b.label}</h3>
                  <p>{b.action}</p>
                  <p className="shot">
                    <Video size={15} />
                    {b.filming}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
        <section className="section">
          <h2>Before you say yes</h2>
          <ul className="clean-list">
            {[...selected.requirements, ...selected.materials].map((r, i) => (
              <li key={i}>
                <Check size={16} />
                {r}
              </li>
            ))}
          </ul>
          <p className="support">{selected.cost.note}</p>
          <p className="support">{selected.fallback}</p>
        </section>
        <div className="award-panel">
          <Sparkles size={22} />
          <div>
            <strong>
              {reason === "eligible"
                ? `Complete to earn ${selected.award.xp} XP + ${selected.award.points} points`
                : "For the story — no XP or points this time"}
            </strong>
            <p>
              {reason === "family_cooldown"
                ? "This family has a 30-day award cooldown across all levels."
                : reason === "daily_cap"
                  ? `Your daily award limit resets ${localReset()}.`
                  : "Three valid clips and an honest attempt. A real flop counts, too."}
            </p>
          </div>
        </div>
        <p className="fine-print">
          Up to 3 rewarded completions per UTC day. Each family earns once in 30
          days. Next daily reset: {localReset()}.{" "}
          {DEMO && "Progress here is simulated."}
        </p>
        {error && <Notice error>{error}</Notice>}
        {active ? (
          <Link className="button" to={`/runs/${active.id}`}>
            Continue your active quest <ArrowRight size={18} />
          </Link>
        ) : (
          <Button onClick={accept} busy={busy}>
            Accept quest <ArrowRight size={18} />
          </Button>
        )}
      </>
    );
  }
  return (
    <>
      <PageTitle
        eyebrow="A LITTLE OUT OF THE ORDINARY"
        title={active ? "Your story is in motion." : "What’s the plan?"}
      >
        {active
          ? "You have a quest in progress. Pick up where you left off."
          : "A good plan. A little nerve. Something to remember."}
      </PageTitle>
      {active && (
        <Link className="active-card" to={`/runs/${active.id}`}>
          <span className="icon-box">
            <Flag />
          </span>
          <div>
            <span className="eyebrow">YOUR ACTIVE QUEST</span>
            <h2>{active.quest.title}</h2>
            <p>{active.clips.length} of 3 moments saved</p>
          </div>
          <ChevronRight />
        </Link>
      )}
      {me.data && !me.data.profile.onboardingCompleted && (
        <Link className="profile-nudge" to="/onboarding">
          <Sparkles size={18} />
          <span>
            Make it your kind of quest{" "}
            <small>A few taps to find your fit</small>
          </span>
          <ChevronRight size={18} />
        </Link>
      )}
      <form onSubmit={discover}>
        <section className="section">
          <div className="section-heading">
            <h2>Pick your scene</h2>
            <span className="support">01</span>
          </div>
          <div className="category-grid">
            {CATEGORIES.map((c, i) => (
              <button
                key={c.id}
                type="button"
                className={`category ${outing.category === c.id ? "selected" : ""}`}
                aria-pressed={outing.category === c.id}
                onClick={() => update({ category: c.id })}
              >
                <span className="category-symbol" aria-hidden="true">
                  {["♡", "☀", "☾", "↗", "♧"][i]}
                </span>
                {c.label}
              </button>
            ))}
          </div>
        </section>
        <section className="section">
          <div className="section-heading">
            <h2>How far are we taking this?</h2>
            <span className="support">02</span>
          </div>
          <div className="intensity-group">
            {INTENSITIES.map((v, i) => (
              <button
                type="button"
                key={v.id}
                aria-pressed={outing.intensity === v.id}
                className={`intensity ${outing.intensity === v.id ? "selected" : ""}`}
                onClick={() => update({ intensity: v.id })}
              >
                <span className="intensity-bars" aria-hidden="true">
                  {[0, 1, 2].map((n) => (
                    <i key={n} className={n <= i ? "on" : ""} />
                  ))}
                </span>
                {v.label}
              </button>
            ))}
          </div>
          <p className="support level-description">
            {INTENSITIES.find((i) => i.id === outing.intensity)?.description}
          </p>
        </section>
        <section className="details-card">
          <div className="section-heading">
            <h2>
              <SlidersHorizontal size={18} /> Today’s details
            </h2>
            <span className="pill">
              {outing.setting === "home" ? "At home" : "Heading out"}
            </span>
          </div>
          <div className="field">
            <span className="field-label">Who’s in?</span>
            <Chips
              label="Group"
              options={[
                { id: "solo", label: "Solo" },
                { id: "couple", label: "Couple" },
                { id: "friends", label: "Friends" },
              ]}
              value={outing.group}
              onChange={(v) =>
                update({
                  group: v as Outing["group"],
                  participants: v === "solo" ? 1 : v === "couple" ? 2 : 4,
                })
              }
            />
          </div>
          {outing.group === "friends" && (
            <label>
              Group size
              <input
                type="number"
                min="2"
                max="12"
                value={outing.participants}
                onChange={(e) =>
                  update({ participants: Number(e.target.value) })
                }
              />
            </label>
          )}
          <div className="form-grid">
            <label>
              Budget (USD)
              <div className="money-input">
                <span>$</span>
                <input
                  aria-label="Budget in dollars"
                  type="number"
                  min="0"
                  max="10000"
                  step="1"
                  value={outing.budgetMinor / 100}
                  onChange={(e) =>
                    update({
                      budgetMinor: Math.round(Number(e.target.value) * 100),
                    })
                  }
                />
              </div>
            </label>
            <label>
              Budget is for
              <select
                value={outing.budgetScope}
                onChange={(e) =>
                  update({
                    budgetScope: e.target.value as Outing["budgetScope"],
                  })
                }
              >
                <option value="total">The whole group</option>
                <option value="per_person">Each person</option>
              </select>
            </label>
          </div>
          <p className="budget-total">
            {money(effectiveBudget(outing))} total group ceiling{" "}
            <span>· Including required costs</span>
          </p>
          <div className="field">
            <span className="field-label">How much time?</span>
            <Chips
              label="Available time"
              options={[
                { id: "30", label: "30 min" },
                { id: "60", label: "1 hour" },
                { id: "120", label: "2 hours" },
                { id: "flexible", label: "Flexible" },
              ]}
              value={String(outing.durationMinutes || "flexible")}
              onChange={(v) =>
                update({ durationMinutes: v === "flexible" ? null : Number(v) })
              }
            />
          </div>
          <div className="field">
            <span className="field-label">At home or heading out?</span>
            <Chips
              label="Setting"
              options={[
                { id: "home", label: "At home" },
                { id: "outside", label: "Outside" },
                { id: "venue", label: "At a venue" },
              ]}
              value={outing.setting}
              onChange={(v) =>
                update({
                  setting: v as Outing["setting"],
                  ...(v === "home"
                    ? {
                        travelMinutes: 0,
                        travelCostMinor: 0,
                        transport: "none" as const,
                        adultContext: false,
                      }
                    : {}),
                })
              }
            />
          </div>
          {outing.setting !== "home" && (
            <>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  if (!navigator.geolocation) {
                    setError(
                      "Location isn’t available. Enter your area manually.",
                    );
                    return;
                  }
                  navigator.geolocation.getCurrentPosition(
                    (position) =>
                      update({
                        area: `${position.coords.latitude.toFixed(1)}, ${position.coords.longitude.toFixed(1)} (approximate)`,
                      }),
                    () =>
                      setError(
                        "Location access is off. Enter your area manually; your quest does not need GPS.",
                      ),
                    { enableHighAccuracy: false, timeout: 8000, maximumAge: 0 },
                  );
                }}
              >
                Use approximate device location
              </button>
              <label>
                Area
                <input
                  value={outing.area}
                  maxLength={100}
                  placeholder="A neighborhood or town is enough"
                  onChange={(e) => update({ area: e.target.value })}
                />
              </label>
              <div className="form-grid">
                <label>
                  Round-trip travel (min)
                  <input
                    type="number"
                    min="0"
                    max="240"
                    value={outing.travelMinutes}
                    onChange={(e) =>
                      update({ travelMinutes: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Travel estimate (USD)
                  <input
                    type="number"
                    min="0"
                    value={outing.travelCostMinor / 100}
                    onChange={(e) =>
                      update({
                        travelCostMinor: Math.round(
                          Number(e.target.value) * 100,
                        ),
                      })
                    }
                  />
                </label>
              </div>
              <label>
                Getting there
                <select
                  value={outing.transport}
                  onChange={(e) =>
                    update({ transport: e.target.value as Outing["transport"] })
                  }
                >
                  {["none", "walk", "bike", "transit", "car"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
            </>
          )}
          <button
            className="disclosure"
            type="button"
            onClick={() => setDetails(!details)}
            aria-expanded={details}
          >
            Arrangements & setting options{" "}
            <ChevronRight className={details ? "rotate" : ""} size={18} />
          </button>
          {details && (
            <div className="extra-details">
              <label>
                Custom available time (minutes)
                <input
                  type="number"
                  min="15"
                  max="720"
                  value={outing.durationMinutes ?? ""}
                  placeholder="Flexible"
                  onChange={(e) =>
                    update({
                      durationMinutes:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </label>
              {outing.setting !== "venue" &&
                outing.category === "street_challenges" && (
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={outing.adultEligible}
                      onChange={(e) =>
                        update({ adultEligible: e.target.checked })
                      }
                    />
                    <span>
                      The volunteers and organizers are adults who can freely
                      choose to participate.
                    </span>
                  </label>
                )}
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={outing.arrangementConfirmed}
                  onChange={(e) =>
                    update({ arrangementConfirmed: e.target.checked })
                  }
                />
                <span>
                  We’ve arranged the required people, equipment or performance
                  slot.
                </span>
              </label>
              {outing.setting === "venue" && (
                <>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={outing.venuePermission}
                      onChange={(e) =>
                        update({ venuePermission: e.target.checked })
                      }
                    />
                    <span>
                      We have permission for the activity and filming.
                    </span>
                  </label>
                  <label>
                    Confirmed total admission / room cost (USD)
                    <input
                      type="number"
                      min="0"
                      value={
                        outing.confirmedVenueCostMinor === null
                          ? ""
                          : outing.confirmedVenueCostMinor / 100
                      }
                      placeholder="Unknown until confirmed"
                      onChange={(e) =>
                        update({
                          confirmedVenueCostMinor:
                            e.target.value === ""
                              ? null
                              : Math.round(Number(e.target.value) * 100),
                        })
                      }
                    />
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={outing.adultEligible}
                      onChange={(e) =>
                        update({
                          adultEligible: e.target.checked,
                          ...(!e.target.checked ? { adultContext: false } : {}),
                        })
                      }
                    />
                    <span>
                      All participants meet the venue’s legal age requirement.
                    </span>
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={outing.adultContext}
                      disabled={!outing.adultEligible}
                      onChange={(e) =>
                        update({ adultContext: e.target.checked })
                      }
                    />
                    <span>
                      Include explicitly agreed adult nightlife contexts.
                    </span>
                  </label>
                </>
              )}
              <p className="support">
                <MapPin size={15} /> Manual setting works without location
                permission. Photo interpretation is not configured; no photo is
                required or uploaded.
              </p>
            </div>
          )}
        </section>
        {(error || runs.error || me.error) && (
          <Notice error>{error || runs.error || me.error}</Notice>
        )}
        <Button type="submit" busy={busy}>
          Find my quests <ArrowRight size={18} />
        </Button>
        <p className="fine-print centered">
          Made for your plans. Never a pressure to spend.
        </p>
      </form>
      {candidates !== null && (
        <section className="section results" aria-live="polite">
          <div className="section-heading">
            <h2>
              {candidates.length
                ? "This could be a good story."
                : "Nothing quite fits. Yet."}
            </h2>
            <span className="support">
              {candidates.length}{" "}
              {candidates.length === 1 ? "choice" : "choices"}
            </span>
          </div>
          {candidates.length === 0 ? (
            <Notice>
              {me.data?.profile.preferences.otherExclusion
                ? "Your custom boundary needs review. Replace it with matching listed exclusions or edit it before choosing a quest; we won’t guess what it means."
                : "Try more time, a different group, or a private setting. Required arrangements and unknown venue costs must be confirmed. Your boundaries stay in place."}
            </Notice>
          ) : (
            candidates.map((q) => (
              <button
                className="quest-card"
                key={q.id}
                onClick={() => {
                  setSelected(q);
                  window.scrollTo(0, 0);
                }}
              >
                <QuestArt variant={q.category} small />
                <div className="quest-card-body">
                  <div className="eyebrow">
                    {label} ·{" "}
                    {INTENSITIES.find((i) => i.id === q.intensity)?.label}
                  </div>
                  <h2>{q.title}</h2>
                  <p>{q.hook}</p>
                  {q.sponsorDisclosure && (
                    <p className="support">Sponsored · {q.sponsorDisclosure}</p>
                  )}
                  <div className="meta-row">
                    <span>
                      <Clock3 size={15} />
                      {q.durationMinutes + outing.travelMinutes} min
                    </span>
                    <span>{money(q.estimatedCostMaxMinor)} group estimate</span>
                  </div>
                  <div className="fit-line">
                    <Check size={15} />
                    {q.whyFits.slice(0, 2).join(" · ")}
                  </div>
                  <div className="card-footer">
                    <span>Meet your quest</span>
                    <ArrowRight size={18} />
                  </div>
                </div>
              </button>
            ))
          )}
        </section>
      )}
      {!runs.data && !runs.error && <Loading />}
    </>
  );
}
