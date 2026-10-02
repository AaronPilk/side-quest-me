import type { PlaceContext } from "../../shared/place-matching";
import { discoverExperience } from "../lib/experience-api";
import { aiQuestApi } from "../lib/ai-quest-api";
import {
  discoverNearbyPlaces,
  type DiscoveryCenter,
} from "../lib/nearby-discovery";
import type { ApplePlace } from "../lib/apple-maps";
import type {
  DiscoveryProposal,
  ExperienceDiscoveryRequest,
  ExperienceDiscoveryResult,
} from "../../shared/experience-discovery";
import { estimateCost, ineligibilityIssues } from "../../shared/recommend";
import { selectedPlaceContext } from "../lib/place-context";
import { useState, useEffect, useRef } from "react";
import { QuestWizard, editQuestPlans } from "../components/QuestWizard";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
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
import { currentActivityTemplateId } from "../../shared/activity-history";
import { DEMO } from "../lib/auth";
import { seriesApi } from "../lib/series-api";
import type { QuestViability, QuestRecovery } from "../../shared/viability";
import { QuestFit } from "../components/QuestFit";
import { ApplePlaceCard } from "../components/ApplePlaces";
import { preferenceProgress } from "../../shared/preference-progress";
import { PreferenceReminder } from "../components/PreferenceReminder";
import { AiQuestAssist } from "../components/AiQuestAssist";
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
  const aiConfig = useResource(aiQuestApi.config);
  const [center, setCenter] = useState<DiscoveryCenter>();
  const [nearbyPlaces, setNearbyPlaces] = useState<ApplePlace[]>([]);
  const [experience, setExperience] = useState<ExperienceDiscoveryResult>();
  const [locationNotice, setLocationNotice] = useState("");
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [selected, setSelected] = useState<Candidate>();
  const [fit, setFit] = useState<QuestViability>();
  const [alternatives, setAlternatives] = useState<Candidate[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const discoveryGeneration = useRef(0);
  const discoveryKey = useRef(crypto.randomUUID());
  const discoveryAttempt = useRef<{
    key: string;
    input: ExperienceDiscoveryRequest;
    completed: boolean;
  } | null>(null);
  const previousProposalIds = useRef<string[]>([]);
  const discoveryPlace = useRef<PlaceContext | null>(null);
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
        ...(target.data!.privateGenerated && target.data!.privatePlan
          ? {
              ...target.data!.privatePlan,
              confirmedVenueCostMinor: null,
              venuePermission: false,
              arrangementConfirmed: false,
              adultEligible: false,
              adultContext: false,
            }
          : {}),
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
    discoveryKey.current = crypto.randomUUID();
    discoveryAttempt.current = null;
    previousProposalIds.current = [];
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
    if (
      patch.category ||
      patch.intensity ||
      patch.setting ||
      patch.area !== undefined
    )
      setNearbyPlaces([]);
    if (patch.setting === "home") setCenter(undefined);
    setExperience(undefined);
    setCandidates(null);
    setError("");
  }
  async function discover() {
    const generation = ++discoveryGeneration.current;
    setBusy(true);
    setError("");
    try {
      outingSchema.parse(outing);
      if (
        !requestedTemplate &&
        aiConfig.data?.configured &&
        aiConfig.data.provider
      ) {
        let attempt = discoveryAttempt.current;
        if (!attempt || attempt.key !== discoveryKey.current) {
          let places = nearbyPlaces;
          setLocationNotice("");
          if (
            outing.setting !== "home" &&
            (outing.applePlaceId ||
              (!places.length && (center || outing.area.trim())))
          ) {
            try {
              places = await discoverNearbyPlaces(outing, center);
            } catch (cause) {
              setLocationNotice((cause as Error).message);
              places = [];
            }
          }
          if (generation !== discoveryGeneration.current) return;
          attempt = {
            key: discoveryKey.current,
            completed: false,
            // A retry must replay the same request, including its transient
            // listings, even if a later Maps search would return new results.
            input: structuredClone({
              outing,
              provider: aiConfig.data.provider,
              consent: true,
              nearbyPlaces: places
                .flatMap((place) =>
                  place.id && place.name && place.coordinate
                    ? [
                        {
                          id: place.id,
                          name: place.name.slice(0, 160),
                          address: (place.formattedAddress || "").slice(0, 300),
                          category: place.pointOfInterestCategory,
                          ...place.coordinate,
                        },
                      ]
                    : [],
                )
                .slice(0, 12),
              ...(previousProposalIds.current.length
                ? { previousProposalIds: [...previousProposalIds.current] }
                : {}),
            }),
          };
          discoveryAttempt.current = attempt;
        }
        const result = await discoverExperience(attempt.input, attempt.key);
        if (generation !== discoveryGeneration.current) return;
        attempt.completed = true;
        previousProposalIds.current = [
          ...new Set([
            ...previousProposalIds.current,
            ...result.proposals.map(({ proposalId }) => proposalId),
          ]),
        ].slice(-5);
        setExperience(result);
        setCandidates(result.candidates);
        setFit(undefined);
        setAlternatives([]);
        setHasMore(false);
        return;
      }
      const placeContext = await selectedPlaceContext(outing.applePlaceId);
      if (generation !== discoveryGeneration.current) return;
      const choices = await api.quests(
        outing,
        requestedTemplate,
        0,
        placeContext,
      );
      const [assessment, others] = await Promise.all([
        choices.length
          ? Promise.resolve(undefined)
          : api.viability(
              outing,
              Object.keys(outingSchema.shape) as (keyof Outing)[],
              requestedTemplate,
            ),
        requestedTemplate && !choices.length
          ? api.quests(outing, undefined, 0, placeContext)
          : Promise.resolve([]),
      ]);
      if (generation !== discoveryGeneration.current) return;
      discoveryPlace.current = placeContext;
      setFit(assessment);
      setAlternatives(others);
      setCandidates(choices);
      setHasMore(!requestedTemplate && choices.length === 3);
    } catch (e) {
      if (generation === discoveryGeneration.current)
        setError(e instanceof Error ? e.message : "Check your outing details.");
    } finally {
      if (generation === discoveryGeneration.current) setBusy(false);
    }
  }
  async function moreIdeas() {
    if (busy || !candidates) return;
    const generation = ++discoveryGeneration.current;
    setBusy(true);
    setError("");
    try {
      const next = await api.quests(
        outing,
        undefined,
        candidates.length,
        discoveryPlace.current,
      );
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
  const updatedTemplate =
    requestedTemplate && currentActivityTemplateId(requestedTemplate);
  if (updatedTemplate)
    return (
      <section className="section">
        <h1>This quest has a new edition.</h1>
        <p>
          The original story stays as it was. Start a fresh attempt with the
          updated challenge and filming ideas.
        </p>
        <Link className="button" to={`/create?template=${updatedTemplate}`}>
          View updated quest <ArrowRight size={18} />
        </Link>
      </section>
    );
  if (selected) {
    const selectedCost = estimateCost(selected, outing);
    const proposal = experience?.proposals.find(
      (value) => value.templateId === selected.id,
    );
    const pending =
      selected.privateGenerated && me.data
        ? ineligibilityIssues(selected, outing, me.data.profile.preferences)
        : [];
    const reason = selected.privateGenerated
      ? "private_generated"
      : DEMO
        ? eligibility(runs.data || [], selected.familyId)
        : selected.rewardEligibility.reason;
    return (
      <>
        <button className="back" onClick={() => setSelected(undefined)}>
          ← Your choices
        </button>
        <QuestArt variant={selected.category} seed={selected.familyId} small />
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
          <span>
            {selectedCost.known
              ? `${money(selectedCost.maxMinor)} group estimate`
              : "Booking price to check"}
          </span>
        </div>
        {(proposal?.location?.id || outing.applePlaceId) &&
          outing.setting !== "home" && (
            <ApplePlaceCard
              placeId={proposal?.location?.id || outing.applePlaceId!}
              transport={outing.transport}
            />
          )}
        <section className="section">
          <h2>Your challenge</h2>
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
        {!selected.privateGenerated && (
          <AiQuestAssist key={selected.id} quest={selected} outing={outing} />
        )}
        {proposal && (
          <GeneratedQuestChecks
            proposal={proposal}
            outing={outing}
            onChange={(patch) => setOuting((value) => ({ ...value, ...patch }))}
            pending={pending}
          />
        )}
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
                  : reason === "private_generated"
                    ? "This is your private generated quest. Film it and save your story; it does not award redeemable points or XP."
                    : "Save your video and confirm your attempt. A real flop counts, too."}
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
          <Button
            onClick={accept}
            busy={busy}
            disabled={
              pending.length > 0 || !outingSchema.safeParse(outing).success
            }
          >
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
      {active && candidates !== null && (
        <Link className="active-card" to={`/runs/${active.id}`}>
          <span className="icon-box">
            <Flag />
          </span>
          <div>
            <span className="eyebrow">YOUR ACTIVE QUEST</span>
            <h2>{active.quest.title}</h2>
            <p>
              {active.clips.length === 1 && active.clips[0].mode === "session"
                ? "Your video is saved"
                : active.clips.length
                  ? "Continue your story"
                  : "Ready when you are"}
            </p>
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
            center={center}
            nearbyPlaces={nearbyPlaces}
            onAreaReady={(nextCenter, places) => {
              setCenter(nextCenter);
              setNearbyPlaces(places);
            }}
            discoveryConsent={
              !requestedTemplate &&
              aiConfig.data?.configured && (
                <div className="quest-discovery-consent">
                  <strong>
                    Personalized with{" "}
                    {aiConfig.data.provider === "openai"
                      ? "OpenAI"
                      : aiConfig.data.provider === "anthropic"
                        ? "Claude"
                        : "Grok"}
                  </strong>
                  <p className="fine-print">
                    Find my quests sends your confirmed preferences, this plan
                    and nearby Apple Maps listings to{" "}
                    {aiConfig.data.provider === "openai"
                      ? "OpenAI"
                      : aiConfig.data.provider === "anthropic"
                        ? "Anthropic"
                        : "xAI"}{" "}
                    to create an experience. Your imported summary and exact
                    device location aren’t sent. Check opening hours, prices and
                    availability before you go.
                  </p>
                  {busy && (
                    <p role="status" className="support">
                      Building your experience and checking the fit…
                    </p>
                  )}
                </div>
              )
            }
            targetId={requestedTemplate}
            target={target.data}
            busy={busy}
            error={error || runs.error || me.error}
            needsProfile={Boolean(
              me.data &&
              !preferenceProgress(me.data.profile.preferences).complete,
            )}
            resumeQuestId={active?.id}
            firstRun={Boolean(
              me.data &&
              me.data.profile.accountType === null &&
              !me.data.profile.onboardingCompleted,
            )}
          />
        )}
      {candidates !== null && (
        <section className="section results quest-results">
          <button
            type="button"
            className="button secondary quest-edit-plans"
            disabled={busy}
            onClick={() => {
              setError("");
              setCandidates(null);
            }}
          >
            <ArrowLeft size={18} aria-hidden="true" />
            Edit plans
          </button>
          <div className="section-heading">
            <h1 ref={resultsHeading} tabIndex={-1}>
              {candidates.length
                ? "This could be a good story."
                : "Let’s find a different route."}
            </h1>
            <span className="support">
              {candidates.length}{" "}
              {candidates.length === 1 ? "choice" : "choices"}
            </span>
          </div>
          {error && <Notice error>{error}</Notice>}
          {locationNotice && <Notice>{locationNotice}</Notice>}
          {experience?.source === "curated_fallback" && (
            <Notice>
              AI couldn’t finish a strong idea this time. Here’s a ready-to-plan
              experience selected for your outing.
            </Notice>
          )}
          {me.data && (
            <PreferenceReminder
              profile={me.data.profile}
              returnTo={"/create" + (params.toString() ? `?${params}` : "")}
              compact
            />
          )}
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
            candidates.map((q) => {
              const proposal = experience?.proposals.find(
                (value) => value.templateId === q.id,
              );
              const cost = estimateCost(
                q,
                proposal
                  ? { ...outing, confirmedVenueCostMinor: null }
                  : outing,
              );
              return (
                <button
                  className="quest-card"
                  key={q.id}
                  disabled={busy}
                  onClick={() => {
                    if (q.privateGenerated && proposal) {
                      setOuting((current) => ({
                        ...current,
                        applePlaceId: proposal?.location?.id || null,
                        venuePermission: false,
                        confirmedVenueCostMinor: null,
                        arrangementConfirmed: false,
                        adultEligible: false,
                        adultContext: false,
                      }));
                    }
                    setSelected(q);
                    window.scrollTo(0, 0);
                  }}
                >
                  <QuestArt variant={q.category} seed={q.familyId} small />
                  <div className="quest-card-body">
                    <div className="eyebrow">
                      {label} ·{" "}
                      {INTENSITIES.find((i) => i.id === q.intensity)?.label}
                    </div>
                    <h2>{q.title}</h2>
                    <p>{q.hook}</p>
                    {q.sponsorDisclosure && (
                      <p className="support">
                        Sponsored · {q.sponsorDisclosure}
                      </p>
                    )}
                    <div className="meta-row">
                      <span>
                        <Clock3 size={15} />
                        {q.durationMinutes + outing.travelMinutes} min
                      </span>
                      <span>
                        {cost.known
                          ? `${money(cost.maxMinor)} group estimate`
                          : "Booking price to check"}
                      </span>
                    </div>
                    <div className="fit-line">
                      <Check size={15} />
                      {q.ready
                        ? q.whyFits.slice(0, 2).join(" · ")
                        : "Fits your plan · Confirm booking details before starting"}
                    </div>
                    <div className="card-footer">
                      <span>Meet your quest</span>
                      <ArrowRight size={18} />
                    </div>
                  </div>
                </button>
              );
            })
          )}
          {candidates.length > 0 && !requestedTemplate && (
            <div className="quest-more-ideas">
              {experience ? (
                <Button
                  secondary
                  busy={busy}
                  onClick={() => {
                    // A failed reroll may have completed server-side. Replay
                    // its exact key/request before starting another paid idea.
                    if (discoveryAttempt.current?.completed) {
                      discoveryKey.current = crypto.randomUUID();
                      discoveryAttempt.current = null;
                    }
                    return discover();
                  }}
                >
                  {error
                    ? "Retry finding an experience"
                    : "Find another experience"}
                </Button>
              ) : hasMore ? (
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

function GeneratedQuestChecks({
  proposal,
  outing,
  onChange,
  pending,
}: {
  proposal: DiscoveryProposal;
  outing: Outing;
  onChange: (patch: Partial<Outing>) => void;
  pending: ReturnType<typeof ineligibilityIssues>;
}) {
  const codes = new Set(
    [...proposal.requirements, ...pending].map(
      (requirement) => requirement.code,
    ),
  );
  return (
    <section
      className="quest-generated-plan"
      aria-label="Check your quest details"
    >
      <h3>Make this plan yours</h3>
      {proposal.location && (
        <p className="support">
          Suggested stop: <strong>{proposal.location.name}</strong> · Apple Maps
          listing. Availability and prices still need checking.
        </p>
      )}
      {codes.has("venue_cost") && (
        <label>
          {outing.setting === "venue"
            ? "Total confirmed venue cost (USD)"
            : "Total confirmed activity cost (USD)"}
          <input
            type="number"
            inputMode="decimal"
            min="0"
            max="10000"
            step="0.01"
            value={
              outing.confirmedVenueCostMinor === null
                ? ""
                : outing.confirmedVenueCostMinor / 100
            }
            placeholder="Check the full group price"
            onChange={(event) =>
              onChange({
                confirmedVenueCostMinor:
                  event.target.value === ""
                    ? null
                    : Math.round(Number(event.target.value) * 100),
              })
            }
          />
        </label>
      )}
      {codes.has("arrangements") && (
        <label className="check-row">
          <input
            type="checkbox"
            checked={outing.arrangementConfirmed}
            onChange={(event) =>
              onChange({ arrangementConfirmed: event.target.checked })
            }
          />
          <span>
            We’ve checked the booking, equipment and participants this quest
            needs.
          </span>
        </label>
      )}
      {codes.has("venue_permission") && (
        <label className="check-row">
          <input
            type="checkbox"
            checked={outing.venuePermission}
            onChange={(event) =>
              onChange({ venuePermission: event.target.checked })
            }
          />
          <span>
            {outing.setting === "venue"
              ? "The venue allows this activity and our filming."
              : "We have the required permission for this activity and our filming."}
          </span>
        </label>
      )}
      {codes.has("adults") && (
        <label className="check-row">
          <input
            type="checkbox"
            checked={outing.adultEligible}
            onChange={(event) =>
              onChange({ adultEligible: event.target.checked })
            }
          />
          <span>
            Everyone taking part meets this activity’s age requirement.
          </span>
        </label>
      )}
      {pending.some((issue) => issue.code === "budget") && (
        <Notice error>
          The confirmed cost exceeds your budget. Edit your plan or choose
          another quest.
        </Notice>
      )}
      <p className="fine-print">
        Your idea is private. You can read the plan now and start after these
        specific details are confirmed.
      </p>
    </section>
  );
}
