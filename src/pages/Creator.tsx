import { Link, useParams } from "react-router-dom";
import {
  BookOpen,
  BriefcaseBusiness,
  Film,
  Gift,
  PenLine,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { DiscoverPostCard } from "./Discover";
import {
  CreatorAvatar,
  StateTag,
  TryQuest,
  useCommunity,
  useCommunityAction,
} from "../components/Community";
import { Button, Empty, Loading, Notice } from "../components/ui";

export default function Creator() {
  const { id } = useParams();
  const me = useCommunity("me");
  const publicProfile = useCommunity("creator", { id }, Boolean(id));
  const action = useCommunityAction(() => {
    me.refresh();
    if (id) publicProfile.refresh();
  });
  const own = !id || me.data?.userId === id;
  const creator = id ? publicProfile.data?.creator : me.data?.creator;
  const posts = id
    ? publicProfile.data?.posts
    : me.data?.posts.filter((post) => post.state === "published");
  const quests = id
    ? publicProfile.data?.quests
    : me.data?.drafts
        .filter((draft) => draft.state === "approved")
        .map((draft) => draft.quest);
  const loading = id ? !publicProfile.data : !me.data;
  const error = id ? publicProfile.error : me.error;
  const drafts = own
    ? me.data?.drafts.filter((draft) => draft.state !== "approved")
    : [];
  if (error) return <Notice error>{error}</Notice>;
  if (loading) return <Loading />;
  return (
    <div className="creator-profile-page">
      <section className="creator-identity-card" aria-labelledby="creator-name">
        <header className="creator-header">
          <CreatorAvatar
            avatar={creator?.avatarKey}
            name={creator?.displayName || ""}
          />
          <div className="creator-bio">
            <div className="eyebrow">
              {creator?.demo ? "ISOLATED DEMO CREATOR" : "PUBLIC PROFILE"}
            </div>
            <h1 id="creator-name">
              {creator?.displayName || "Your public profile"}
            </h1>
            {creator?.bio ? (
              <p>{creator.bio}</p>
            ) : (
              <p className="support">
                {own
                  ? "A little about you. The stories you choose to share."
                  : "No bio added."}
              </p>
            )}
            {creator?.openToBrands && (
              <span className="community-state">
                Open to brand opportunities
              </span>
            )}
          </div>
        </header>
        {creator && (
          <div className="creator-counts">
            <div>
              <strong>{creator.publishedCount}</strong>
              <span>Published videos</span>
            </div>
            <div>
              <strong>{creator.attemptCount}</strong>
              <span>Inspired attempts</span>
            </div>
            <div>
              <strong>{creator.authoredCount}</strong>
              <span>Authored quests</span>
            </div>
          </div>
        )}
      </section>
      {own && (
        <>
          <nav
            className="community-links creator-tools"
            aria-label="Profile tools"
          >
            <Link to="/journal">
              <BookOpen size={17} aria-hidden="true" />
              Private journal
            </Link>
            <Link to="/rewards">
              <Gift size={17} aria-hidden="true" />
              Rewards
            </Link>
            <Link to="/account">
              <SlidersHorizontal size={17} aria-hidden="true" />
              Account & preferences
            </Link>
            <Link to="/studio">
              <BriefcaseBusiness size={17} aria-hidden="true" />
              Brand & creator studio
            </Link>
          </nav>
          <details
            className="community-panel profile-edit-panel"
            open={!creator}
          >
            <summary>
              <PenLine size={17} aria-hidden="true" />
              {creator ? "Edit public profile" : "Create your public profile"}
            </summary>
            <p className="support">
              Only this name, avatar and bio appear publicly. Your imported
              summary and private answers stay private.
            </p>
            <form
              className="community-form"
              key={creator?.version ?? "new"}
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void action.run(
                  "creator_save",
                  {
                    displayName: String(form.get("displayName")),
                    avatarKey: String(form.get("avatarKey")),
                    bio: String(form.get("bio")),
                    openToBrands: form.get("openToBrands") === "on",
                    expectedVersion: creator?.version ?? 0,
                  },
                  "Public profile saved.",
                );
              }}
            >
              <label>
                Public display name
                <input
                  name="displayName"
                  maxLength={60}
                  required
                  defaultValue={creator?.displayName}
                />
              </label>
              <label>
                Avatar color
                <select
                  name="avatarKey"
                  defaultValue={creator?.avatarKey ?? "coral"}
                >
                  <option value="coral">Coral</option>
                  <option value="mint">Mint</option>
                  <option value="violet">Violet</option>
                  <option value="sunset">Sunset</option>
                </select>
              </label>
              <label>
                Short public bio
                <textarea
                  name="bio"
                  rows={3}
                  maxLength={280}
                  defaultValue={creator?.bio}
                />
              </label>
              <label className="check-row">
                <input
                  name="openToBrands"
                  type="checkbox"
                  defaultChecked={creator?.openToBrands}
                />
                Open to brand opportunities
              </label>
              <p className="support">
                You choose availability separately for every published video.
                This setting does not authorize advertising.
              </p>
              <Button type="submit" busy={action.busy}>
                Save public profile
              </Button>
            </form>
          </details>
          {action.feedback}
        </>
      )}
      <section
        className="section creator-section"
        aria-labelledby="published-videos"
      >
        <div className="section-heading">
          <h2 id="published-videos" className="section-title">
            <Film size={19} aria-hidden="true" />
            Published videos
          </h2>
          {own && <Link to="/create">Make your version</Link>}
        </div>
        {posts?.length ? (
          <div className="discover-feed">
            {posts.map((post) => (
              <DiscoverPostCard key={post.id} post={post} viewer={me.data} />
            ))}
          </div>
        ) : (
          <Empty title="No public videos yet.">
            Private reels stay in the journal until their creator explicitly
            publishes them.
          </Empty>
        )}
      </section>
      <section
        className="section creator-section"
        aria-labelledby="authored-quests"
      >
        <div className="section-heading">
          <h2 id="authored-quests" className="section-title">
            <Sparkles size={19} aria-hidden="true" />
            Authored quests
          </h2>
          {own && <Link to="/originals/new">Draft an original</Link>}
        </div>
        {quests?.length ? (
          <div className="community-list">
            {quests.map((quest) => (
              <article className="community-card" key={quest.id}>
                <h3>{quest.title}</h3>
                <p>{quest.hook}</p>
                <TryQuest id={quest.id} />
              </article>
            ))}
          </div>
        ) : (
          <p className="support">Reviewed original quests will appear here.</p>
        )}
        {!!drafts?.length && (
          <div className="creator-drafts">
            <h3>Your drafts & submissions</h3>
            {drafts.map((draft) => (
              <Link
                className="community-list-link"
                to={`/originals/${draft.id}`}
                key={draft.id}
              >
                <strong>{draft.quest.title}</strong>
                <StateTag state={draft.state} />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
