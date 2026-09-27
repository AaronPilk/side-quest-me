import { Link } from "react-router-dom";
import { ArrowUpRight, Play, Clock3 } from "lucide-react";
import { api } from "../lib/api";
import { AuthImage } from "../components/PrivateMedia";
import { CATEGORIES } from "../../shared/domain";
import {
  PageTitle,
  Empty,
  Loading,
  Notice,
  QuestArt,
  useResource,
} from "../components/ui";
export default function Journal() {
  const { data, error, refresh } = useResource(api.runs);
  return (
    <>
      <PageTitle
        eyebrow="YOUR PRIVATE COLLECTION"
        title="Stories worth keeping."
      >
        The plans you made. The moments you actually lived.
      </PageTitle>
      {error && (
        <>
          <Notice error>{error}</Notice>
          <button className="text-button" onClick={refresh}>
            Try again
          </button>
        </>
      )}
      {!data && !error ? (
        <Loading />
      ) : !data?.length ? (
        <Empty
          title="Your first story starts here"
          to="/"
          action="Find a quest"
        >
          Three little moments can make a very good story. Yours will live here.
        </Empty>
      ) : (
        <div className="journal-grid">
          {data.map((r) => (
            <Link className="journal-card" to={`/runs/${r.id}`} key={r.id}>
              <div className="journal-image">
                {r.render?.thumbnailUrl ? (
                  <AuthImage
                    src={r.render.thumbnailUrl}
                    alt={`A frame from ${r.quest.title}`}
                    width="320"
                    height="400"
                  />
                ) : (
                  <QuestArt variant={r.quest.category} small />
                )}
                <span className="journal-status">
                  {r.render?.status === "ready" ? (
                    <>
                      <Play size={12} /> Reel ready
                    </>
                  ) : r.status === "finalized" ? (
                    r.render?.status === "failed" ? (
                      "Render needs a retry"
                    ) : (
                      "Quest complete"
                    )
                  ) : r.status === "review_needed" ? (
                    "Submitted for review"
                  ) : r.status === "abandoned" ? (
                    "Abandoned"
                  ) : (
                    <>
                      <Clock3 size={12} /> In progress
                    </>
                  )}
                </span>
              </div>
              <div className="journal-info">
                <span className="eyebrow">
                  {CATEGORIES.find((c) => c.id === r.quest.category)?.label}
                </span>
                <h2>{r.quest.title}</h2>
                <div className="card-footer">
                  <span>
                    {new Date(r.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    · {r.clips.length} moments
                  </span>
                  <ArrowUpRight size={18} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
