import { useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Clock3, Users } from "lucide-react";
import { catalog } from "../../shared/catalog";
import {
  CATEGORIES,
  DEFAULT_OUTING,
  type QuestVariant,
} from "../../shared/domain";
import { request } from "../lib/api";
import { DEMO } from "../lib/auth";
import {
  Back,
  Button,
  Loading,
  Notice,
  PageTitle,
  QuestArt,
  useResource,
} from "../components/ui";
export default function PublicQuest() {
  const { templateId } = useParams();
  const navigate = useNavigate();
  const { data, error } = useResource(async (): Promise<QuestVariant> => {
    if (DEMO) {
      const quest = catalog.find((q) => q.id === templateId);
      if (!quest) throw new Error("This quest is unavailable.");
      return quest;
    }
    return request(`/api/quests/${encodeURIComponent(templateId!)}`);
  }, [templateId]);
  if (error)
    return (
      <>
        <Back />
        <Notice error>{error}</Notice>
      </>
    );
  if (!data) return <Loading />;
  return (
    <>
      <Back />
      <QuestArt variant={data.category} small />
      <PageTitle
        eyebrow={CATEGORIES.find((c) => c.id === data.category)?.label}
        title={data.title}
      >
        {data.hook}
      </PageTitle>
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
              </div>
            </li>
          ))}
        </ol>
        <p className="support">{data.cost.note}</p>
      </section>
      <Button
        onClick={() => {
          sessionStorage.setItem(
            "sq-outing",
            JSON.stringify({
              ...DEFAULT_OUTING,
              category: data.category,
              intensity: data.intensity,
            }),
          );
          navigate("/");
        }}
      >
        Try this quest <ArrowRight size={18} />
      </Button>
      <p className="fine-print">
        Set your own group, budget and setting before accepting. This is the
        published quest; nobody else’s private clips or account are shared.
      </p>
    </>
  );
}
