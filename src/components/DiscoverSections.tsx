import { Layers2 } from "lucide-react";
import { Link } from "react-router-dom";
import "./discover-sections.css";

export function DiscoverSections({
  current,
}: {
  current: "quests" | "series";
}) {
  return (
    <nav className="discover-sections" aria-label="Discover sections">
      <Link
        to="/discover"
        aria-current={current === "quests" ? "page" : undefined}
      >
        Quests
      </Link>
      <Link
        to="/series"
        aria-current={current === "series" ? "page" : undefined}
      >
        <Layers2 size={18} aria-hidden="true" /> Series
      </Link>
    </nav>
  );
}
