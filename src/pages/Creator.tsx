import { useEffect, useState } from "react";
import {
  Link,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  BookOpen,
  Camera,
  Film,
  Grid2X2,
  LockKeyhole,
  PenLine,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Users,
  Layers3,
} from "lucide-react";
import {
  CreatorAvatar,
  StateTag,
  TryQuest,
  useCommunity,
} from "../components/Community";
import { AuthImage } from "../components/PrivateMedia";
import { Button, Empty, Loading, Notice, useResource } from "../components/ui";
import { socialApi } from "../lib/social-api";
import { api } from "../lib/api";
import { rememberReturnTo } from "../lib/internal-return";
import type { SocialProfile } from "../../shared/social";
import type { CreatorProfile } from "../../shared/community";
import { SeriesProfileList } from "./Series";
import "../profile-design.css";

export default function Creator({ signedIn }: { signedIn: boolean }) {
  const { id } = useParams();
  // Identity changes remount the page before any previous owner's data can render.
  return <CreatorPage key={`${id || "me"}:${signedIn}`} signedIn={signedIn} />;
}

function CreatorPage({ signedIn }: { signedIn: boolean }) {
  const { id } = useParams();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [social, setSocial] = useState<SocialProfile>();
  const [socialError, setSocialError] = useState("");
  const [revision, setRevision] = useState(0);
  const own = signedIn && (!id || social?.isOwn === true);
  const me = useCommunity("me", {}, own);
  const publicProfile = useCommunity("creator", { id }, Boolean(id));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [edit, setEdit] = useState(false);
  useEffect(() => {
    let active = true;
    setSocial(undefined);
    setSocialError("");
    setEdit(false);
    setMessage("");
    setError("");
    socialApi
      .read(id)
      .then((value) => {
        if (active) setSocial(value);
      })
      .catch((cause) => {
        if (active) setSocialError((cause as Error).message);
      });
    return () => {
      active = false;
    };
  }, [id, revision]);
  const creator = id ? publicProfile.data?.creator : me.data?.creator;
  const posts =
    (id ? publicProfile.data?.posts : me.data?.posts)?.filter(
      (post) => post.state === "published",
    ) || [];
  const quests = id
    ? publicProfile.data?.quests
    : me.data?.drafts
        .filter((draft) => draft.state === "approved")
        .map((draft) => draft.quest);
  const drafts = own
    ? me.data?.drafts.filter((draft) => draft.state !== "approved")
    : [];
  const loading = id ? !publicProfile.data : !me.data;
  const loadError = id ? publicProfile.error : me.error;
  const requested = params.get("tab");
  const tab =
    requested === "quests" ||
    requested === "series" ||
    (requested === "private" && own)
      ? requested
      : "videos";
  const creatorId = id || social?.creatorId || me.data?.userId;
  async function mutate(
    operation: () => Promise<SocialProfile>,
    success: string,
  ) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      setSocial(await operation());
      setMessage(success);
      me.refresh();
      if (id) publicProfile.refresh();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (loadError)
    return (
      <Notice error>
        {loadError}{" "}
        <button
          className="text-button"
          onClick={() => (id ? publicProfile.refresh() : me.refresh())}
        >
          Retry profile
        </button>
      </Notice>
    );
  if (loading) return <Loading />;
  return (
    <div className="social-profile-page creator-profile-page">
      <section
        className="social-profile-identity"
        aria-labelledby="creator-name"
      >
        <div className="social-profile-top">
          <CreatorAvatar
            avatar={creator?.avatarKey}
            name={creator?.displayName || ""}
            photoUrl={social?.photoUrl || creator?.photoUrl || undefined}
          />
          <div className="social-profile-name">
            <h1 id="creator-name">
              {creator?.displayName || "Your public profile"}
            </h1>
            <p className="social-handle">
              {social?.username
                ? `@${social.username}`
                : creator?.username
                  ? `@${creator.username}`
                  : own
                    ? "Choose your @username"
                    : "Sidequest creator"}
            </p>
            {creator?.demo && (
              <span className="support">Local demo profile</span>
            )}
          </div>
          {own && (
            <Link
              className="icon-button"
              to="/settings"
              aria-label="Profile settings"
            >
              <SlidersHorizontal size={21} />
            </Link>
          )}
        </div>
        {creator?.bio && <p className="social-profile-bio">{creator.bio}</p>}
        {creator?.openToBrands && (
          <span className="community-state">Open to brand opportunities</span>
        )}
        <div className="social-counts creator-counts">
          <div>
            <strong>{creator?.publishedCount ?? posts.length}</strong>
            <span>Videos</span>
          </div>
          <div>
            <strong>{social ? social.followersCount : "—"}</strong>
            <span>Followers</span>
          </div>
          <div>
            <strong>{social ? social.followingCount : "—"}</strong>
            <span>Following</span>
          </div>
        </div>
        {socialError && (
          <Notice error>
            {socialError}{" "}
            <button
              type="button"
              className="text-button"
              onClick={() => setRevision((value) => value + 1)}
            >
              Retry profile details
            </button>
          </Notice>
        )}
        <div className="social-profile-actions">
          {own ? (
            <Button secondary onClick={() => setEdit((value) => !value)}>
              <PenLine size={17} />
              Edit profile
            </Button>
          ) : !signedIn ? (
            <Link
              className="button secondary"
              to="/account"
              onClick={() =>
                rememberReturnTo(location.pathname + location.search)
              }
            >
              <Users size={17} />
              Sign in to follow
            </Link>
          ) : (
            <Button
              busy={busy}
              disabled={!social}
              secondary={social?.isFollowing}
              onClick={() => {
                if (creatorId && social)
                  void mutate(
                    () => socialApi.follow(creatorId, !social.isFollowing),
                    social.isFollowing
                      ? "Unfollowed."
                      : "Following this creator.",
                  );
              }}
            >
              <Users size={17} />
              {social?.isFollowing ? "Following" : "Follow"}
            </Button>
          )}
          {creatorId && (
            <Button
              secondary
              onClick={async () => {
                const url = `${window.location.origin}/creators/${creatorId}`;
                try {
                  if (navigator.share)
                    await navigator.share({
                      title: creator?.displayName || "Sidequest profile",
                      url,
                    });
                  else {
                    await navigator.clipboard.writeText(url);
                    setMessage("Profile link copied.");
                  }
                } catch (cause) {
                  if ((cause as Error).name !== "AbortError")
                    setError(
                      "Sharing is unavailable. Copy the profile link below.",
                    );
                }
              }}
            >
              <Share2 size={17} />
              Share profile
            </Button>
          )}
        </div>
        {error && (
          <Notice error>
            {error}
            {creatorId && error.startsWith("Sharing") && (
              <a href={`/creators/${creatorId}`}>
                {window.location.origin}/creators/{creatorId}
              </a>
            )}
          </Notice>
        )}
        {message && <Notice>{message}</Notice>}
      </section>
      {own && (
        <details
          className="community-panel social-edit-panel"
          open={edit || !creator}
          onToggle={(event) => setEdit(event.currentTarget.open)}
        >
          <summary>
            <PenLine size={17} />
            {creator ? "Edit public profile" : "Create your public profile"}
          </summary>
          <p className="support">
            Your photo, name, username and bio are public. Preferences, private
            drafts and earnings stay private.
          </p>
          <ProfileForm
            key={`${creator?.version || 0}:${social?.username || ""}`}
            creator={creator}
            social={social}
            busy={busy}
            onSave={(input) =>
              mutate(() => socialApi.save(input), "Public profile saved.")
            }
          />
          {creator && (
            <div className="profile-photo-actions">
              <label className="button secondary photo-upload-control">
                <Camera size={17} />
                {busy ? "Saving photo…" : "Upload profile photo"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  aria-label="Profile photo"
                  disabled={busy}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = "";
                    if (file)
                      void mutate(
                        () => socialApi.uploadPhoto(file),
                        "Profile photo saved.",
                      );
                  }}
                />
              </label>
              <p className="support">
                JPEG, PNG or WebP, up to 5 MB. Cropped to a square; location
                metadata is removed.
              </p>
              {social?.photoUrl && (
                <button
                  className="text-button danger"
                  disabled={busy}
                  onClick={() =>
                    void mutate(socialApi.removePhoto, "Profile photo removed.")
                  }
                >
                  Remove profile photo
                </button>
              )}
            </div>
          )}
        </details>
      )}
      <nav className="social-profile-tabs" aria-label="Profile content">
        {[
          { key: "videos", label: "Videos", icon: Grid2X2 },
          { key: "quests", label: "Quests", icon: Sparkles },
          { key: "series", label: "Series", icon: Layers3 },
          ...(own
            ? [{ key: "private", label: "Private", icon: LockKeyhole }]
            : []),
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            aria-current={tab === item.key ? "page" : undefined}
            onClick={() =>
              setParams(item.key === "videos" ? {} : { tab: item.key })
            }
          >
            <item.icon size={19} />
            {item.label}
          </button>
        ))}
      </nav>
      {tab === "videos" && (
        <section aria-label="Published videos">
          {posts.length ? (
            <div className="profile-video-grid">
              {posts.map((post) => (
                <Link
                  className="profile-video-tile"
                  key={post.id}
                  to={`/posts/${post.id}`}
                  state={{ returnTo: location.pathname + location.search }}
                  aria-label={`Watch ${post.quest.title}`}
                >
                  {post.thumbnailUrl ? (
                    <AuthImage src={post.thumbnailUrl} alt="" />
                  ) : (
                    <span className="profile-cover-fallback">
                      <Film size={26} />
                      Cover unavailable
                    </span>
                  )}
                  <span className="profile-video-title">
                    {post.quest.title}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <Empty title="No public videos yet.">
              <p>
                Finished reels stay private until you choose to publish them.
              </p>
              {own && (
                <Link className="button" to="/create">
                  Create your first story
                </Link>
              )}
            </Empty>
          )}
        </section>
      )}
      {tab === "quests" && (
        <section aria-label="Authored quests" className="social-quest-list">
          {own && (
            <Link className="text-button" to="/originals/new">
              Draft an original quest
            </Link>
          )}
          {quests?.length ? (
            quests.map((quest) => (
              <article className="community-card" key={quest.id}>
                <h3>{quest.title}</h3>
                <p>{quest.hook}</p>
                <TryQuest id={quest.id} />
              </article>
            ))
          ) : (
            <Empty title="No published quests yet.">
              Reviewed original quests will appear here.
            </Empty>
          )}
        </section>
      )}
      {tab === "series" && creatorId && (
        <SeriesProfileList creatorId={creatorId} own={own} />
      )}
      {tab === "private" && own && (
        <section
          aria-label="Your private space"
          className="social-private-space"
        >
          <p className="support">
            <LockKeyhole size={15} />
            Only you can see this tab.
          </p>
          <div className="community-links">
            <Link to="/journal">
              <BookOpen size={17} />
              Private journal
            </Link>
            <Link to="/account">
              <SlidersHorizontal size={17} />
              Account & preferences
            </Link>
          </div>
          <h2>Drafts & submissions</h2>
          {drafts?.length ? (
            drafts.map((draft) => (
              <Link
                className="community-list-link"
                key={draft.id}
                to={`/originals/${draft.id}`}
              >
                <strong>{draft.quest.title}</strong>
                <StateTag state={draft.state} />
              </Link>
            ))
          ) : (
            <p className="support">
              No quest drafts.{" "}
              <Link to="/originals/new">Start an original.</Link>
            </p>
          )}
          <PrivateEntries />
        </section>
      )}
    </div>
  );
}
function ProfileForm({
  creator,
  social,
  busy,
  onSave,
}: {
  creator?: CreatorProfile | null;
  social?: SocialProfile;
  busy: boolean;
  onSave: (input: Parameters<typeof socialApi.save>[0]) => Promise<void>;
}) {
  return (
    <form
      className="community-form"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void onSave({
          username: String(form.get("username") || "")
            .trim()
            .toLowerCase(),
          displayName: String(form.get("displayName")),
          avatarKey: String(form.get("avatarKey")) as "coral",
          bio: String(form.get("bio")),
          openToBrands: form.get("openToBrands") === "on",
          expectedVersion: creator?.version ?? 0,
        });
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
        Username
        <input
          name="username"
          minLength={3}
          maxLength={24}
          pattern="[a-zA-Z][a-zA-Z0-9_]*"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          defaultValue={social?.username || creator?.username || ""}
          placeholder="your_name"
        />
      </label>
      <p className="support">
        Unique to you. 3–24 letters, numbers or underscores; start with a
        letter.
      </p>
      <label>
        Avatar color
        <select name="avatarKey" defaultValue={creator?.avatarKey || "coral"}>
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
        Video availability is separate. This does not authorize advertising.
      </p>
      <Button type="submit" busy={busy}>
        Save public profile
      </Button>
    </form>
  );
}
function PrivateEntries() {
  const runs = useResource(api.runs);
  if (runs.error)
    return (
      <Notice error>
        {runs.error}{" "}
        <button className="text-button" onClick={runs.refresh}>
          Retry journal
        </button>
      </Notice>
    );
  if (!runs.data) return <Loading />;
  return (
    <>
      <h2>Your journal</h2>
      {runs.data.length ? (
        runs.data.map((run) => (
          <Link
            className="community-list-link"
            key={run.id}
            to={`/runs/${run.id}`}
          >
            <strong>{run.quest.title}</strong>
            <StateTag state={run.status} />
          </Link>
        ))
      ) : (
        <p className="support">
          Your completed stories and quests in progress will appear here.
        </p>
      )}
    </>
  );
}
