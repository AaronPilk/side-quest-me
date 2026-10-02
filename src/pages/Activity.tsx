import { useState } from "react";
import { communityApi } from "../lib/community-api";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Bell,
  BriefcaseBusiness,
  CheckCircle2,
  Flag,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
  Layers2,
  UserPlus,
} from "lucide-react";
import {
  useCommunity,
  useCommunityAction,
  words,
} from "../components/Community";
import { Button, Loading, Notice, PageTitle } from "../components/ui";
import { OpenQuestShortcut } from "../components/OpenQuestShortcut";

const activityIcons: Record<string, LucideIcon> = {
  inspired_attempt: Sparkles,
  quest_submitted: Flag,
  quest_reviewed: CheckCircle2,
  brand_reviewed: BriefcaseBusiness,
  offer_received: BriefcaseBusiness,
  offer_updated: BriefcaseBusiness,
  fulfillment_recorded: CheckCircle2,
  post_removed: ShieldCheck,
  offer_suspended: ShieldCheck,
  creator_followed: UserPlus,
  creator_follow: UserPlus,
  series_part_published: Layers2,
};

export default function Activity() {
  return (
    <div className="activity-page">
      <OpenQuestShortcut />
      <ActivityUpdates />
    </div>
  );
}

function ActivityUpdates() {
  const { data, error, refresh } = useCommunity("activity");
  const action = useCommunityAction(refresh);
  const [filter, setFilter] = useState("all");
  const [reading, setReading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [readError, setReadError] = useState("");
  if (error)
    return (
      <>
        <Notice error>{error}</Notice>
        <Button secondary onClick={refresh}>
          Retry activity
        </Button>
      </>
    );
  if (!data) return <Loading />;
  const items = data.items.filter(
    (item) =>
      filter === "all" ||
      (filter === "unread"
        ? !item.readAt
        : filter === "connections"
          ? /follow|inspired/.test(item.kind)
          : /offer|licens|fulfillment|brand/.test(item.kind)),
  );
  const unread = items.filter((item) => !item.readAt);
  return (
    <div className="activity-updates">
      <div className="activity-heading">
        <PageTitle title="Activity">
          Your quests, connections, and creator updates.
        </PageTitle>
        <span className="activity-count">
          {data.unreadCount ? `${data.unreadCount} unread` : "All caught up"}
        </span>
      </div>
      <div className="feed-tabs" role="group" aria-label="Activity filters">
        {[
          ["all", "All"],
          ["unread", "Unread"],
          ["connections", "Connections"],
          ["offers", "Brand offers"],
        ].map(([value, label]) => (
          <button
            type="button"
            key={value}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {unread.length > 0 && (
        <Button
          secondary
          busy={reading}
          disabled={action.busy}
          onClick={async () => {
            setReading(true);
            setFeedback("");
            setReadError("");
            try {
              for (const item of unread)
                await communityApi.mutate("activity_read", { id: item.id });
              setFeedback("Shown updates marked as read.");
            } catch {
              setReadError(
                "Some updates could not be marked as read. Your saved changes are kept; try the remaining updates again.",
              );
            } finally {
              setReading(false);
              refresh();
            }
          }}
        >
          Mark shown as read
        </Button>
      )}
      {feedback && <Notice>{feedback}</Notice>}
      {readError && <Notice error>{readError}</Notice>}
      {action.feedback}
      {items.length ? (
        <div className="activity-list">
          {items.map((item) => {
            const Icon = activityIcons[item.kind] || Bell;
            return (
              <article
                key={item.id}
                className={`activity-item ${item.readAt ? "" : "unread"}`}
              >
                <span className="activity-icon" aria-hidden="true">
                  <Icon size={21} />
                </span>
                <div className="activity-content">
                  <div className="activity-meta">
                    <span className="activity-kind">{words(item.kind)}</span>
                    {!item.readAt && (
                      <span className="activity-unread">New</span>
                    )}
                  </div>
                  <p>{item.text}</p>
                  <time dateTime={item.createdAt}>
                    {new Date(item.createdAt).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </time>
                  <div className="post-secondary activity-actions">
                    <Link
                      to={item.href}
                      onClick={() => {
                        if (!item.readAt)
                          void action.run(
                            "activity_read",
                            { id: item.id },
                            "Marked as read.",
                          );
                      }}
                    >
                      Review update
                      <ArrowRight size={14} aria-hidden="true" />
                    </Link>
                    {!item.readAt && (
                      <Button
                        secondary
                        busy={action.busy}
                        disabled={reading}
                        onClick={() =>
                          action.run(
                            "activity_read",
                            { id: item.id },
                            "Marked as read.",
                          )
                        }
                      >
                        Mark read
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty activity-empty">
          <div className="empty-icon">
            <Bell size={28} aria-hidden="true" />
          </div>
          <h2>
            {filter === "all"
              ? "Nothing to catch up on."
              : "No updates in this view."}
          </h2>
          <p>
            {filter === "all"
              ? "Inspired attempts, quest reviews, and brand offers will appear here."
              : "Switch to All to see your recent activity."}
          </p>
          <Link className="button secondary" to="/discover">
            Discover quests <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>
      )}
    </div>
  );
}
