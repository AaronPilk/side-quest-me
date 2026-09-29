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
} from "lucide-react";
import {
  useCommunity,
  useCommunityAction,
  words,
} from "../components/Community";
import { Button, Loading, Notice, PageTitle } from "../components/ui";

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
};

export default function Activity() {
  const { data, error, refresh } = useCommunity("activity");
  const action = useCommunityAction(refresh);
  if (error) return <Notice error>{error}</Notice>;
  if (!data) return <Loading />;
  return (
    <div className="activity-page">
      <div className="activity-heading">
        <PageTitle title="Activity">
          Your quests, connections, and creator updates.
        </PageTitle>
        <span className="activity-count">
          {data.unreadCount ? `${data.unreadCount} unread` : "All caught up"}
        </span>
      </div>
      {action.feedback}
      {data.items.length ? (
        <div className="activity-list">
          {data.items.map((item) => {
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
          <h2>Nothing to catch up on.</h2>
          <p>
            Inspired attempts, quest reviews, and brand offers will appear here.
          </p>
          <Link className="button secondary" to="/discover">
            Discover quests <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>
      )}
    </div>
  );
}
