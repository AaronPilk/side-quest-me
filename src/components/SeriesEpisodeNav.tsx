import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { SeriesContext } from "../../shared/series";
import { seriesApi } from "../lib/series-api";
import { useResource } from "./ui";

/** Watching navigates source parts only; it never changes an attempt's progress. */
export function SeriesEpisodeNav({ source }: { source: SeriesContext }) {
  const { data, error, refresh } = useResource(
    () => seriesApi.detail(source.id),
    [source.id],
  );
  if (error)
    return (
      <div className="support">
        <p>Series navigation couldn’t load.</p>
        <button className="text-button" onClick={refresh}>
          Retry series navigation
        </button>
      </div>
    );
  if (!data)
    return (
      <p className="support" role="status">
        Loading series parts…
      </p>
    );
  const parts = data.parts.filter((part) => part.published);
  const current = parts.findIndex((part) => part.id === source.partId);
  if (current < 0) return null;
  const previous = parts[current - 1],
    next = parts[current + 1];
  return (
    <nav className="series-episode-navigation" aria-label="Series episodes">
      {previous && (
        <Link to={`/series/${source.id}#part-${previous.id}`}>
          <ArrowLeft size={16} />
          <span>
            Previous part<small>{previous.title}</small>
          </span>
        </Link>
      )}
      {next && (
        <Link to={`/series/${source.id}#part-${next.id}`}>
          <span>
            Next part<small>{next.title}</small>
          </span>
          <ArrowRight size={16} />
        </Link>
      )}
    </nav>
  );
}
