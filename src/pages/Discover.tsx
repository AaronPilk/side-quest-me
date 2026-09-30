import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Clapperboard,
  Layers2,
  MoreHorizontal,
  Plus,
  Sparkles,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  Link,
  useParams,
  useSearchParams,
  useNavigate,
  useLocation,
} from "react-router-dom";
import type {
  CommunityPost,
  CommunityMe,
  CommunityReadResults,
} from "../../shared/community";
import { communityApi } from "../lib/community-api";
import { Button, Empty, Loading, Notice, Back } from "../components/ui";
import {
  CreatorAvatar,
  Planning,
  PublicVideo,
  TryQuest,
  useCommunity,
  useCommunityAction,
} from "../components/Community";
import { LicenseTermsForm } from "../components/LicenseTermsForm";
import { validateReturnTo } from "../lib/internal-return";
import "../reel-design.css";
import { SeriesEpisodeNav } from "../components/SeriesEpisodeNav";

export function DiscoverPostCard({
  post,
  viewer,
  refresh,
  detail = false,
}: {
  post: CommunityPost;
  viewer?: CommunityMe;
  refresh?: () => void;
  detail?: boolean;
}) {
  const navigate = useNavigate();
  const action = useCommunityAction(refresh);
  const [caption, setCaption] = useState(post.caption);
  const [brandOptIn, setBrandOptIn] = useState(post.brandOptIn);
  const own = viewer?.userId === post.creator.id;
  const openForInquiries =
    post.state === "published" && post.brandOptIn && post.creator.openToBrands;
  return (
    <article className="public-post">
      <div className="public-post-creator">
        <Link to={`/creators/${post.creator.id}`}>
          <CreatorAvatar
            avatar={post.creator.avatarKey}
            name={post.creator.displayName}
            photoUrl={post.creator.photoUrl}
          />
          <span>
            <strong>{post.creator.displayName}</strong>
            {post.creator.username && <small>@{post.creator.username}</small>}
            {(post.demo || post.creator.demo) && (
              <small>Isolated demo creator · fixture footage</small>
            )}
          </span>
        </Link>
        {openForInquiries && (
          <span className="community-state">Open to brand offers</span>
        )}
        {!detail && (
          <Link
            className="post-more"
            to={`/posts/${post.id}`}
            aria-label={`View ${post.quest.title} details`}
          >
            <MoreHorizontal size={21} />
          </Link>
        )}
      </div>
      {post.state === "published" ? (
        <PublicVideo
          src={post.mediaUrl}
          poster={post.thumbnailUrl}
          title={`${post.quest.title} by ${post.creator.displayName}`}
        />
      ) : (
        <div className="community-card">
          <p>This video is no longer public.</p>
          {own && (
            <Link to="/journal">
              Watch your private original in the journal
            </Link>
          )}
        </div>
      )}
      <div className="public-post-body">
        {post.state !== "published" && (
          <Notice>
            This post is {post.state}. Your private original remains in your
            journal.
          </Notice>
        )}
        {post.sponsorDisclosure && (
          <p className="sponsor-disclosure">
            Sponsored · {post.sponsorDisclosure}
          </p>
        )}
        <h2>
          <Link to={`/posts/${post.id}`}>{post.quest.title}</Link>
        </h2>
        <p>{post.quest.hook}</p>
        {post.caption && <p className="post-caption">{post.caption}</p>}
        {post.series && (
          <Link className="series-post-link" to={`/series/${post.series.id}`}>
            <Layers2 size={18} />
            <span>
              <strong>{post.series.title}</strong>
              <small>
                Part {post.series.position} · {post.series.partTitle}
              </small>
            </span>
            <ArrowRight size={17} />
          </Link>
        )}
        {detail && post.series && <SeriesEpisodeNav source={post.series} />}
        <Planning quest={post.quest} />
        {post.questAuthor && (
          <p className="support">
            Quest by{" "}
            <Link to={`/creators/${post.questAuthor.id}`}>
              {post.questAuthor.displayName}
            </Link>
          </p>
        )}
        {post.inspiredByPostId && (
          <p className="support">
            Inspired by{" "}
            <Link to={`/posts/${post.inspiredByPostId}`}>another attempt</Link>.
          </p>
        )}
        <TryQuest
          id={post.quest.id}
          postId={post.state === "published" ? post.id : undefined}
          seriesPartId={post.series?.partId}
        />
        <div className="post-secondary">
          <Link to={`/discover?template=${encodeURIComponent(post.quest.id)}`}>
            <Layers2 size={17} /> Other attempts · {post.attemptCount}
          </Link>
          <Link to={`/quests/${post.quest.id}`}>
            <BookOpen size={17} /> Read the quest
          </Link>
        </div>
        {detail && own && (
          <details className="community-panel">
            <summary>Edit this public post</summary>
            <p className="support">
              Unpublishing removes this public post. Your private original stays
              in your journal.
            </p>
            <label>
              Public caption
              <textarea
                rows={3}
                maxLength={1000}
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
              />
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={brandOptIn}
                onChange={(event) => setBrandOptIn(event.target.checked)}
              />
              Open this video to brand inquiries
            </label>
            <p className="support">
              Publishing and receiving inquiries do not grant advertising
              permission.
            </p>
            <Button
              secondary
              busy={action.busy}
              onClick={() =>
                action.run(
                  "post_update",
                  {
                    id: post.id,
                    expectedVersion: post.version,
                    caption,
                    brandOptIn,
                    published: post.state === "published",
                  },
                  "Public post updated.",
                )
              }
            >
              Save post changes
            </Button>
            <button
              className="text-button danger"
              disabled={action.busy}
              onClick={async () => {
                const result = await action.run(
                  "post_update",
                  {
                    id: post.id,
                    expectedVersion: post.version,
                    caption,
                    brandOptIn: false,
                    published: false,
                  },
                  "Post unpublished. Private original kept.",
                );
                if (result) navigate("/profile");
              }}
            >
              Unpublish post
            </button>
          </details>
        )}
        {detail &&
          !own &&
          openForInquiries &&
          (viewer?.brand?.state === "approved" ? (
            <details className="community-panel">
              <summary>Request to use video</summary>
              <p className="support">
                Proposal from {viewer.brand.name}. Permission and payment remain
                pending until both sides agree and fulfillment is verified.
              </p>
              <LicenseTermsForm
                busy={action.busy}
                onSubmit={async (terms) => {
                  const result = await action.run<{ id: string }>(
                    "offer_create",
                    { postId: post.id, terms },
                    "Licensing proposal sent.",
                  );
                  if (result?.id) navigate(`/offers/${result.id}`);
                }}
              />
            </details>
          ) : (
            <Link className="text-button" to="/business">
              Request to use video · set up your business
            </Link>
          ))}
        {detail && !own && viewer?.userId && (
          <details className="community-panel">
            <summary>Report or block</summary>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void action.run(
                  "report",
                  { postId: post.id, reason: String(form.get("reason")) },
                  "Report sent to the review team.",
                );
              }}
            >
              <label>
                Reason for reporting
                <textarea
                  name="reason"
                  rows={2}
                  minLength={3}
                  maxLength={1000}
                  required
                />
              </label>
              <Button secondary type="submit" busy={action.busy}>
                Report post
              </Button>
            </form>
            <button
              className="text-button danger"
              disabled={action.busy}
              onClick={async () => {
                const result = await action.run(
                  "block",
                  { userId: post.creator.id, blocked: true },
                  "Creator blocked.",
                );
                if (result) navigate("/discover");
              }}
            >
              Block this creator
            </button>
          </details>
        )}
        {action.feedback}
      </div>
    </article>
  );
}
function DiscoverFeed({
  templateId,
  brandOnly,
  viewer,
}: {
  templateId?: string;
  brandOnly: boolean;
  viewer?: CommunityMe;
}) {
  const [posts, setPosts] = useState<CommunityPost[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const pending = useRef(false);
  const load = useCallback(
    async (before?: string) => {
      if (pending.current) return;
      pending.current = true;
      const currentRequest = ++requestId.current;
      setBusy(true);
      setError("");
      try {
        const page = await communityApi.read<CommunityReadResults["feed"]>(
          "feed",
          {
            ...(templateId ? { templateId } : {}),
            ...(brandOnly ? { brandOnly: true } : {}),
            ...(before ? { before } : {}),
            limit: 30,
          },
        );
        if (currentRequest !== requestId.current) return;
        if (before && page.nextCursor === before)
          throw new Error(
            "The next page could not be loaded. Please try again.",
          );
        setPosts((previous) => {
          const unique = new Map(
            (before ? previous || [] : []).map((post) => [post.id, post]),
          );
          for (const post of page.posts) unique.set(post.id, post);
          return [...unique.values()];
        });
        setNextCursor(page.nextCursor);
      } catch (cause) {
        if (currentRequest === requestId.current)
          setError((cause as Error).message);
      } finally {
        if (currentRequest === requestId.current) {
          pending.current = false;
          setBusy(false);
        }
      }
    },
    [templateId, brandOnly],
  );
  useEffect(() => {
    void load();
    return () => {
      // A filter change unmounts this keyed feed. Neither successful nor failed
      // responses from its old requests can affect the next feed.
      requestId.current++;
      pending.current = false;
    };
  }, [load]);

  if (posts === null)
    return (
      <div className="feed-loading">
        {error ? (
          <>
            <Notice error>{error}</Notice>
            <Button secondary busy={busy} onClick={() => void load()}>
              Try again
            </Button>
          </>
        ) : (
          <Loading />
        )}
      </div>
    );
  if (!posts.length)
    return (
      <Empty
        title={
          brandOnly
            ? "No videos open to brands yet."
            : templateId
              ? "No public attempts yet."
              : "The first story could be yours."
        }
        to={
          templateId
            ? `/create?template=${encodeURIComponent(templateId)}`
            : "/create"
        }
        action={templateId ? "Try this quest" : "Find a quest"}
      >
        {brandOnly
          ? "Creators choose whether each video is open to inquiries. You can still explore all quests."
          : "Complete a quest and choose whether to publish your reel. Private participation is always welcome."}
      </Empty>
    );
  return (
    <>
      <div className="discover-feed" aria-busy={busy}>
        {posts.map((item) => (
          <DiscoverPostCard key={item.id} post={item} viewer={viewer} />
        ))}
      </div>
      <div className="feed-pagination">
        {error && <Notice error>{error}</Notice>}
        {nextCursor ? (
          <Button secondary busy={busy} onClick={() => void load(nextCursor)}>
            {busy
              ? "Loading more…"
              : error
                ? "Try loading more again"
                : "Load more videos"}
          </Button>
        ) : (
          <p className="support" role="status">
            You’re all caught up.
          </p>
        )}
      </div>
    </>
  );
}

export default function Discover() {
  const { id } = useParams();
  const location = useLocation();
  const closeLink = useRef<HTMLAnchorElement>(null);
  const [params, setParams] = useSearchParams();
  const templateId = params.get("template") || undefined;
  const brandOnly = params.get("view") === "brands";
  const post = useCommunity("post", { id }, Boolean(id));
  const me = useCommunity("me");
  useEffect(() => {
    if (id && post.data) closeLink.current?.focus({ preventScroll: true });
  }, [id, post.data?.id]);
  if (id && post.error)
    return (
      <>
        <Back to="/discover" />
        <Notice error>{post.error}</Notice>
        <Link className="button secondary" to="/create">
          Find an available quest
        </Link>
      </>
    );
  if (id && !post.data) return <Loading />;
  if (id && post.data)
    return (
      <section className="reel-viewer" aria-label="Reel viewer">
        <header className="reel-viewer-header">
          <Link
            ref={closeLink}
            className="reel-close"
            aria-label="Close reel"
            to={
              validateReturnTo(
                (location.state as { returnTo?: string } | null)?.returnTo,
              ) || "/discover"
            }
          >
            <X size={22} /> <span>Close</span>
          </Link>
          <span>Sidequest</span>
        </header>
        <DiscoverPostCard
          post={post.data}
          viewer={me.data}
          refresh={post.refresh}
          detail
        />
      </section>
    );
  return (
    <div className="discover-layout">
      <section className="discover-main" aria-label="Quest videos">
        <header className="discover-heading">
          <div>
            <h1>{templateId ? "Every version." : "Discover"}</h1>
            <p>
              {templateId
                ? "One quest. A different story every time."
                : "A little inspiration. Your next great story."}
            </p>
          </div>
          <Link
            className="feed-create"
            to="/create"
            aria-label="Create a quest"
          >
            <Plus size={22} />
          </Link>
        </header>
        <div className="feed-tabs" role="group" aria-label="Discover feed">
          <button
            aria-pressed={!brandOnly}
            onClick={() => {
              const next = new URLSearchParams(params);
              next.delete("view");
              setParams(next);
            }}
          >
            <Clapperboard size={17} />
            {templateId ? "All attempts" : "All quests"}
          </button>
          <button
            aria-pressed={brandOnly}
            onClick={() => {
              const next = new URLSearchParams(params);
              next.set("view", "brands");
              setParams(next);
            }}
          >
            <Sparkles size={17} />
            Open to brands
          </button>
          {templateId && (
            <Link to="/discover">
              Back to Discover <ArrowUpRight size={15} />
            </Link>
          )}
        </div>
        <DiscoverFeed
          key={JSON.stringify([templateId, brandOnly])}
          templateId={templateId}
          brandOnly={brandOnly}
          viewer={me.data}
        />
        <p className="feed-footnote">
          <ShieldCheck size={14} /> Your version can always stay private.
        </p>
      </section>
      <aside className="discover-aside" aria-label="Your next quest">
        {me.data?.creator && (
          <Link className="aside-identity" to="/profile">
            <CreatorAvatar
              name={me.data.creator.displayName}
              avatar={me.data.creator.avatarKey}
            />
            <span>
              <strong>{me.data.creator.displayName}</strong>
              <small>Your creator profile</small>
            </span>
            <ArrowUpRight size={17} />
          </Link>
        )}
        <div className="inspiration-card">
          <span className="aside-symbol">
            <Sparkles size={24} />
          </span>
          <span className="eyebrow">FROM WATCHING TO DOING</span>
          <h2>
            Your turn
            <br />
            to make a story.
          </h2>
          <p>
            Find a quest that fits your people, your plans, and your kind of
            fun.
          </p>
          <Link className="button" to="/create">
            Find your quest <ArrowRight size={17} />
          </Link>
          <Link className="aside-text-link" to="/originals/new">
            Have an idea? Draft a quest <ArrowUpRight size={15} />
          </Link>
        </div>
        <Link className="studio-invite" to="/studio">
          <span className="aside-symbol">
            <Clapperboard size={20} />
          </span>
          <span>
            <strong>Brand & creator studio</strong>
            <small>Your stories. New possibilities.</small>
          </span>
          <ArrowUpRight size={17} />
        </Link>
        <p className="aside-note">
          Go somewhere. Try something.
          <br />
          Keep the story.
        </p>
      </aside>
    </div>
  );
}
