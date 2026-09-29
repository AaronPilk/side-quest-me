import { useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Clock3, Users } from "lucide-react";
import { CATEGORIES, type QuestVariant } from "../../shared/domain";
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
export default function PublicQuest() {
  const { templateId } = useParams();
  const navigate = useNavigate();
  const { data, error } = useResource(async (): Promise<QuestVariant> => {
    return api.quest(templateId!);
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
          navigate(`/create?template=${encodeURIComponent(data.id)}`);
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
