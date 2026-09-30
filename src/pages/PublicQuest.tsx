import { useNavigate, useParams } from "react-router-dom";
import { useState } from "react";
import { ArrowRight, Check, Clock3, Share2, Users, Video } from "lucide-react";
import {
  CATEGORIES,
  INTENSITIES,
  type QuestVariant,
} from "../../shared/domain";
import { api } from "../lib/api";
import {
  Back,
  Button,
  Loading,
  Notice,
  PageTitle,
  QuestArt,
  useResource,
} from "../components/ui";
import "../consumer-audit.css";
export default function PublicQuest() {
  const { templateId } = useParams();
  const navigate = useNavigate();
  const [shareMessage, setShareMessage] = useState("");
  const [shareError, setShareError] = useState(false);
  const { data, error, refresh } =
    useResource(async (): Promise<QuestVariant> => {
      return api.quest(templateId!);
    }, [templateId]);
  if (error)
    return (
      <>
        <Back to="/discover">Discover</Back>
        <Notice error>{error}</Notice>
        <Button secondary onClick={refresh}>
          Retry quest
        </Button>
      </>
    );
  if (!data) return <Loading />;
  return (
    <>
      <Back to="/discover">Discover</Back>
      <QuestArt variant={data.category} small />
      <PageTitle
        eyebrow={`${CATEGORIES.find((c) => c.id === data.category)?.label} · ${INTENSITIES.find((item) => item.id === data.intensity)?.label}`}
        title={data.title}
      >
        {data.hook}
      </PageTitle>
      {data.sponsorDisclosure && (
        <Notice>Sponsored · {data.sponsorDisclosure}</Notice>
      )}
      <div className="meta-row">
        <span>
          <Clock3 size={16} />
          {data.durationMinutes} minutes plus travel
        </span>
        <span>
          <Users size={16} />
          {data.minParticipants}–{data.maxParticipants} people
        </span>
      </div>
      <section className="section">
        <h2>Your three moments</h2>
        <ol className="beats-preview">
          {data.beats.map((beat, i) => (
            <li key={beat.label}>
              <span className="step-num">{i + 1}</span>
              <div>
                <h3>{beat.label}</h3>
                <p>{beat.action}</p>
                <p className="shot">
                  <Video size={15} aria-hidden="true" />
                  {beat.filming}
                </p>
              </div>
            </li>
          ))}
        </ol>
        <p className="support">{data.cost.note}</p>
      </section>
      <details className="public-quest-preparation">
        <summary>What you’ll need</summary>
        <ul className="clean-list">
          {[...data.requirements, ...data.materials].map((item, index) => (
            <li key={index}>
              <Check size={16} aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
        <p className="support">{data.fallback}</p>
      </details>
      <Button
        onClick={() => {
          navigate(`/create?template=${encodeURIComponent(data.id)}`);
        }}
      >
        Try this quest <ArrowRight size={18} />
      </Button>
      <Button
        secondary
        onClick={async () => {
          setShareMessage("");
          setShareError(false);
          const url = `${window.location.origin}/quests/${encodeURIComponent(data.id)}`;
          try {
            if (navigator.share) {
              await navigator.share({
                title: data.title,
                text: data.hook,
                url,
              });
            } else {
              await navigator.clipboard.writeText(url);
              setShareMessage("Quest link copied. Send it to your people.");
            }
          } catch (cause) {
            if (cause instanceof Error && cause.name === "AbortError") return;
            setShareError(true);
            setShareMessage(
              "Sharing is unavailable here. Copy this page’s address to share the quest.",
            );
          }
        }}
      >
        <Share2 size={18} /> Share quest
      </Button>
      {shareMessage && <Notice error={shareError}>{shareMessage}</Notice>}
      <p className="fine-print">
        Set your own group, budget and setting before accepting. This is the
        published quest; nobody else’s private clips or account are shared.
      </p>
    </>
  );
}
