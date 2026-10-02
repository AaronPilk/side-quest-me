import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowUpRight, Play, Clock3, Layers } from "lucide-react";
import { api } from "../lib/api";
import { hasReadyVideo } from "../lib/recording-session";
import "./journal-design.css";
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
  const [params, setParams] = useSearchParams();
  const requestedFilter = params.get("filter");
  const filter =
    requestedFilter === "progress" || requestedFilter === "completed"
      ? requestedFilter
      : "all";
  function setFilter(value: string) {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (value === "all") next.delete("filter");
      else next.set("filter", value);
      return next;
    });
  }
  const [query, setQuery] = useState("");
  const visible = data?.filter((run) => {
    const matches =
      filter === "all" ||
      (filter === "progress" &&
        ["accepted", "in_progress"].includes(run.status)) ||
      (filter === "completed" &&
        ["finalized", "review_needed"].includes(run.status));
    return (
      matches &&
      run.quest.title
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase())
    );
  });
  return (
    <>
      <PageTitle
        eyebrow="YOUR PRIVATE COLLECTION"
        title={
          filter === "progress" ? "Your open quests" : "Stories worth keeping."
        }
      >
        {filter === "progress"
          ? "Pick up your quest and keep the story going."
          : "The plans you made. The moments you actually lived."}
      </PageTitle>
      {error && (
        <>
          <Notice error>{error}</Notice>
          <button className="text-button" onClick={refresh}>
            Try again
          </button>
        </>
      )}
      {!!data?.length && (
        <section className="journal-tools" aria-label="Find a private story">
          <div
            className="journal-filters"
            role="group"
            aria-label="Filter stories"
          >
            {[
              ["all", "All stories"],
              ["progress", "In progress"],
              ["completed", "Completed"],
            ].map(([value, label]) => (
              <button
                key={value}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="journal-search">
            Search your stories
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a quest by name"
            />
          </label>
        </section>
      )}
      {!data && !error ? (
        <Loading />
      ) : !data?.length && !error ? (
        <Empty
          title={
            filter === "progress"
              ? "No open quests right now"
              : "Your first story starts here"
          }
          to="/create"
          action="Find a quest"
        >
          Your quests and videos live here. Any quest can become the first part
          of a series.
        </Empty>
      ) : data?.length && !visible?.length ? (
        <div className="journal-no-results" role="status">
          <h2>
            {filter === "progress" && !query
              ? "No open quests right now"
              : "No stories here yet"}
          </h2>
          <p>Try another title or see your full collection.</p>
          <button
            className="button secondary"
            onClick={() => {
              setFilter("all");
              setQuery("");
            }}
          >
            Show all stories
          </button>
        </div>
      ) : (
        <div className="journal-grid">
          {visible?.map((r) => (
            <article className="journal-card" key={r.id}>
              <Link className="journal-main-link" to={`/runs/${r.id}`}>
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
                  {["accepted", "in_progress"].includes(r.status) && (
                    <p className="journal-next-step">
                      {hasReadyVideo(r.clips)
                        ? "Ready to review and finish"
                        : "Record or import your quest video"}
                    </p>
                  )}
                  <div className="card-footer">
                    <span>
                      {new Date(r.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}{" "}
                      ·{" "}
                      {r.clips.length === 1 && r.clips[0].mode === "session"
                        ? "1 video"
                        : `${r.clips.length} saved moments`}
                    </span>
                    <ArrowUpRight size={18} />
                  </div>
                </div>
              </Link>
              {r.status !== "abandoned" && (
                <div className="journal-series-action">
                  <Link
                    className="button secondary"
                    to={
                      r.series
                        ? `/series/${r.series.id}`
                        : `/series/new?run=${r.id}`
                    }
                  >
                    <Layers size={16} aria-hidden="true" />
                    {r.series ? "View series" : "Turn into a series"}
                  </Link>
                  {r.series && (
                    <p>
                      Part {r.series.position} · {r.series.title}
                    </p>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
