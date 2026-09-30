import { useState, useEffect, useRef } from "react";
import { QuestWizard, editQuestPlans } from "../components/QuestWizard";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  Clock3,
  Users,
  ChevronRight,
  Check,
  Video,
  Flag,
  Sparkles,
} from "lucide-react";
import {
  CATEGORIES,
  INTENSITIES,
  DEFAULT_OUTING,
  outingSchema,
  type Outing,
  type Candidate,
} from "../../shared/domain";
import { api, eligibility } from "../lib/api";
import { DEMO } from "../lib/auth";
import { seriesApi } from "../lib/series-api";
import type { QuestViability, QuestRecovery } from "../../shared/viability";
import { QuestFit } from "../components/QuestFit";
import { ApplePlaceCard } from "../components/ApplePlaces";
import {
  Button,
  Notice,
  QuestArt,
  useResource,
  Loading,
  money,
  localReset,
} from "../components/ui";
export default function Quest() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const requestedTemplate = params.get("template") || undefined;
  const inspiredBy = params.get("from") || undefined;
  const seriesPartId = params.get("seriesPart") || undefined;
  const seriesPart = useResource(
    () => (seriesPartId ? seriesApi.part(seriesPartId) : Promise.resolve(null)),
    [seriesPartId],
  );
  const seriesBlocked = Boolean(
    seriesPartId &&
    (seriesPart.data?.part.id !== seriesPartId ||
      !seriesPart.data?.canStart ||
      seriesPart.data.part.templateId !== requestedTemplate),
  );
  const target = useResource(
    () =>
      requestedTemplate ? api.quest(requestedTemplate) : Promise.resolve(null),
    [requestedTemplate],
  );
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
  const [fit, setFit] = useState<QuestViability>();
  const [alternatives, setAlternatives] = useState<Candidate[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const discoveryGeneration = useRef(0);
  const resultsVisible = candidates !== null && !selected;
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const [acceptKey] = useState(crypto.randomUUID());
  useEffect(() => {
    if (seriesPartId) {
      setCandidates(null);
      setSelected(undefined);
    }
  }, [seriesPartId]);
  useEffect(() => {
    if (target.data) {
      setOuting((current) => ({
        ...current,
        category: target.data!.category,
        intensity: target.data!.intensity,
      }));
      setCandidates(null);
      setSelected(undefined);
    }
  }, [target.data]);
  useEffect(() => {
    // Keep the last valid plans if a numeric input is temporarily incomplete.
    if (outingSchema.safeParse(outing).success)
      sessionStorage.setItem("sq-outing", JSON.stringify(outing));
  }, [outing]);
  useEffect(
    () => () => {
      discoveryGeneration.current++;
    },
    [],
  );
  useEffect(() => {
    if (resultsVisible) {
      resultsHeading.current?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
  }, [resultsVisible]);
  function update(patch: Partial<Outing>) {
    discoveryGeneration.current++;
    setOuting((current) => ({
      ...current,
      ...patch,
      ...(patch.setting && patch.setting !== current.setting
        ? {
            applePlaceId: null,
            venuePermission: false,
            confirmedVenueCostMinor: null,
            adultEligible: false,
            adultContext: false,
            ...(patch.setting === "home"
              ? {
                  transport: "none" as const,
                  travelMinutes: 0,
                  travelCostMinor: 0,
                }
              : {}),
          }
        : {}),
    }));
    setCandidates(null);
    setError("");
  }
  async function discover() {
    const generation = ++discoveryGeneration.current;
    setBusy(true);
    setError("");
    try {
      outingSchema.parse(outing);
      const choices = await api.quests(outing, requestedTemplate);
      const [assessment, others] = await Promise.all([
        choices.length
          ? Promise.resolve(undefined)
          : api.viability(
              outing,
              Object.keys(outingSchema.shape) as (keyof Outing)[],
              requestedTemplate,
            ),
        requestedTemplate && !choices.length
          ? api.quests(outing)
          : Promise.resolve([]),
      ]);
      if (generation !== discoveryGeneration.current) return;
      setFit(assessment);
      setAlternatives(others);
      setCandidates(choices);
      setHasMore(!requestedTemplate && choices.length === 3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check your outing details.");
    } finally {
      setBusy(false);
    }
  }
  async function moreIdeas() {
    if (busy || !candidates) return;
    const generation = ++discoveryGeneration.current;
    setBusy(true);
    setError("");
    try {
      const next = await api.quests(outing, undefined, candidates.length);
      if (generation !== discoveryGeneration.current) return;
      setCandidates((previous) => {
        const unique = new Map(
          (previous || []).map((quest) => [quest.familyId, quest]),
        );
        next.forEach((quest) => unique.set(quest.familyId, quest));
        return [...unique.values()];
      });
      setHasMore(next.length === 3);
    } catch (cause) {
      if (generation === discoveryGeneration.current)
        setError((cause as Error).message);
    } finally {
      if (generation === discoveryGeneration.current) setBusy(false);
    }
  }
  function recover(recovery: QuestRecovery) {
    editQuestPlans(
      outing,
      recovery.requiresConfirmation ? recovery.fields : [],
      requestedTemplate,
    );
    update(recovery.patch);
  }
  async function accept() {
    setBusy(true);
    setError("");
    try {
      if (seriesBlocked)
        throw new Error(
          seriesPart.error ||
            seriesPart.data?.reason ||
            "Open the series to review this part before starting.",
        );
      const run = await api.accept(
        selected!,
        outing,
        acceptKey,
        selected!.id === requestedTemplate ? inspiredBy : undefined,
        selected!.id === requestedTemplate ? seriesPartId : undefined,
      );
      sessionStorage.removeItem("sq-quest-flow");
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
        {outing.applePlaceId && outing.setting !== "home" && (
          <ApplePlaceCard
            placeId={outing.applePlaceId}
            transport={outing.transport}
          />
        )}
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
      {requestedTemplate && (
        <Notice>
          {target.data ? (
            <>
              Make your version of <strong>{target.data.title}</strong>. Confirm
              your own plans below.{" "}
              {inspiredBy && (
                <Link to={`/posts/${encodeURIComponent(inspiredBy)}`}>
                  View the inspiring post
                </Link>
              )}
            </>
          ) : (
            target.error || "Loading this quest…"
          )}
        </Notice>
      )}
      {requestedTemplate && (
        <button
          className="text-button"
          disabled={busy}
          onClick={() => {
            setParams({});
            setCandidates(null);
            setSelected(undefined);
          }}
        >
          Show other quests
        </button>
      )}
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
      {seriesPartId && (
        <Notice
          error={Boolean(
            seriesPart.error || (seriesPart.data && seriesBlocked),
          )}
        >
          {seriesPart.error ||
            (seriesPart.data ? (
              <>
                <Link to={`/series/${seriesPart.data.series.id}`}>
                  {seriesPart.data.series.title}
                </Link>
                {" · "}Part {seriesPart.data.part.position}:{" "}
                {seriesPart.data.part.title}
                {seriesBlocked && (
                  <p>
                    {seriesPart.data.reason ||
                      "This link does not match the selected quest. Open the series to choose its current part."}
                  </p>
                )}
              </>
            ) : (
              "Checking this series part…"
            ))}
        </Notice>
      )}
      {candidates === null &&
        !seriesBlocked &&
        (!requestedTemplate || target.data) && (
          <QuestWizard
            key={`${requestedTemplate || "new-quest"}:${seriesPartId || "standalone"}`}
            outing={outing}
            update={update}
            onFind={discover}
            targetId={requestedTemplate}
            target={target.data}
            busy={busy}
            error={error || runs.error || me.error}
            needsProfile={Boolean(
              me.data && !me.data.profile.onboardingCompleted,
            )}
          />
        )}
      {candidates !== null && (
        <section className="section results quest-results">
          <button
            className="back"
            aria-label="Edit plans"
            disabled={busy}
            onClick={() => {
              setError("");
              setCandidates(null);
            }}
          >
            ← Edit plans
          </button>
          <div className="section-heading">
            <h1 ref={resultsHeading} tabIndex={-1}>
              {candidates.length
                ? "This could be a good story."
                : "Nothing quite fits. Yet."}
            </h1>
            <span className="support">
              {candidates.length}{" "}
              {candidates.length === 1 ? "choice" : "choices"}
            </span>
          </div>
          {error && <Notice error>{error}</Notice>}
          {candidates.length === 0 ? (
            fit ? (
              <QuestFit
                fit={fit}
                final
                onChoose={recover}
                onEdit={() => {
                  editQuestPlans(outing, [], requestedTemplate);
                  setCandidates(null);
                }}
              />
            ) : (
              <Notice>Review your answers to find a plan that fits.</Notice>
            )
          ) : (
            candidates.map((q) => (
              <button
                className="quest-card"
                key={q.id}
                disabled={busy}
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
          {candidates.length > 0 && !requestedTemplate && (
            <div className="quest-more-ideas">
              {hasMore ? (
                <Button secondary busy={busy} onClick={moreIdeas}>
                  More quest ideas
                </Button>
              ) : (
                <p className="support">
                  You’ve seen all the activities that fit this plan.
                </p>
              )}
              <p className="fine-print">
                Every choice keeps your setting, intensity, group and budget.
              </p>
            </div>
          )}
          {!candidates.length && alternatives.length > 0 && (
            <div className="section">
              <h3>Other quests that fit your plans</h3>
              {alternatives.map((quest) => (
                <button
                  key={quest.id}
                  className="text-button"
                  onClick={() => {
                    setParams({});
                    setSelected(quest);
                    setCandidates(alternatives);
                  }}
                >
                  Review {quest.title} <ArrowRight size={16} />
                </button>
              ))}
            </div>
          )}
        </section>
      )}
      {!runs.data && !runs.error && <Loading />}
    </>
  );
}
