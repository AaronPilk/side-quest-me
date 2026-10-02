import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { publicUrl } from "../lib/runtime";
import { isShareCancellation, sharePublicLink } from "../lib/native-share";
import {
  Link,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  Camera,
  ChevronRight,
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
import { ContentReviewPermission } from "../components/ContentReviewPermission";
import { Button, Empty, Loading, Notice, useResource } from "../components/ui";
import { socialApi } from "../lib/social-api";
import { api } from "../lib/api";
import { DEMO } from "../lib/auth";
import { QuestProgress } from "../components/QuestProgress";
import { preferenceProgress } from "../../shared/preference-progress";
import { rememberReturnTo, validateReturnTo } from "../lib/internal-return";
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
  const progress = useResource(
    () => (own ? api.me() : Promise.resolve(null)),
    [own],
  );
  const me = useCommunity("me", {}, own);
  const publicProfile = useCommunity("creator", { id }, Boolean(id));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [edit, setEdit] = useState(false);
  const [contentReviewConsent, setContentReviewConsent] = useState(false);
  const socialRequest = useRef(0);
  useEffect(() => {
    let active = true;
    const request = ++socialRequest.current;
    setSocial(undefined);
    setSocialError("");
    setEdit(false);
    setContentReviewConsent(false);
    setMessage("");
    setError("");
    socialApi
      .read(id)
      .then((value) => {
        if (active && request === socialRequest.current) {
          setSocial(value);
          setSocialError("");
        }
      })
      .catch((cause) => {
        if (active && request === socialRequest.current)
          setSocialError((cause as Error).message);
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
  const seriesReturn = validateReturnTo(location.state?.seriesReturn);
  async function mutate(
    operation: () => Promise<SocialProfile>,
    success: string,
    refreshProfile = true,
  ) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const updated = await operation();
      // Mutation replies contain fresh social details. An older read must not
      // replace them or resurrect a load error after the successful save.
      socialRequest.current += 1;
      setSocial(updated);
      setSocialError("");
      setMessage(success);
      if (refreshProfile) {
        me.refresh();
        if (id) publicProfile.refresh();
      }
      return true;
    } catch (cause) {
      setError((cause as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (loadError || loading)
    return (
      <div className="social-profile-page">
        {own && (
          <div className="social-profile-recovery">
            <Link
              className="button secondary"
              to="/settings"
              aria-label="Profile settings"
            >
              <SlidersHorizontal size={18} aria-hidden="true" />
              Settings
            </Link>
          </div>
        )}
        {loadError ? (
          <Notice error>
            {loadError}{" "}
            <button
              className="text-button"
              onClick={() => (id ? publicProfile.refresh() : me.refresh())}
            >
              Retry profile
            </button>
          </Notice>
        ) : (
          <Loading />
        )}
      </div>
    );
  return (
    <div className="social-profile-page creator-profile-page">
      {own && creator && seriesReturn?.startsWith("/series/new") && (
        <Link className="button secondary" to={seriesReturn}>
          Continue series setup <ChevronRight size={18} aria-hidden="true" />
        </Link>
      )}
      <section
        className="social-profile-identity"
        aria-labelledby="creator-name"
      >
        <div className="social-profile-top">
          <CreatorAvatar
            avatar={creator?.avatarKey}
            name={creator?.displayName || ""}
            photoUrl={
              social
                ? social.photoUrl || undefined
                : creator?.photoUrl || undefined
            }
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
            <Button
              secondary
              aria-haspopup="dialog"
              onClick={() => {
                setError("");
                setMessage("");
                setContentReviewConsent(false);
                setEdit(true);
              }}
            >
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
                const url = publicUrl(`/creators/${creatorId}`);
                setMessage("");
                setError("");
                try {
                  if (
                    (await sharePublicLink({
                      title: creator?.displayName || "Sidequest profile",
                      url,
                    })) === "copied"
                  ) {
                    setMessage("Profile link copied.");
                  }
                } catch (cause) {
                  if (!isShareCancellation(cause))
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
        {error && !edit && (
          <Notice error>
            {error}
            {creatorId && error.startsWith("Sharing") && (
              <a href={`/creators/${creatorId}`}>
                {publicUrl(`/creators/${creatorId}`)}
              </a>
            )}
          </Notice>
        )}
        {message && !edit && <Notice>{message}</Notice>}
      </section>
      {own && tab !== "private" && progress.data && (
        <>
          <Link
            className="button secondary profile-preferences-shortcut"
            to="/preferences?returnTo=%2Fprofile"
            onClick={() => rememberReturnTo("/profile")}
          >
            <SlidersHorizontal size={18} aria-hidden="true" />
            <span>
              Account & quest preferences
              <small>
                {preferenceProgress(progress.data.profile.preferences).answered}{" "}
                of 11 answered · Make quests more your style
              </small>
            </span>
            <ChevronRight size={18} aria-hidden="true" />
          </Link>
        </>
      )}
      {own &&
        tab !== "private" &&
        progress.data?.completedQuestCount !== undefined && (
          <QuestProgress
            completedQuestCount={progress.data.completedQuestCount}
            xp={progress.data.wallet.xp}
            demo={DEMO}
          />
        )}
      {own && edit && (
        <ProfileEditor
          busy={busy}
          canShare={contentReviewConsent}
          onClose={() => setEdit(false)}
        >
          <p className="support" id="profile-editor-privacy">
            Your photo, name, username and bio are public. Your journal and
            preferences stay private.
          </p>
          {error && <Notice error>{error}</Notice>}
          {message && <Notice>{message}</Notice>}
          <ProfileForm
            key={creator?.version || 0}
            creator={creator}
            social={social}
            busy={busy}
            onSave={async (input) => {
              if (
                await mutate(
                  () => socialApi.save(input, contentReviewConsent),
                  "Public profile saved.",
                )
              )
                setEdit(false);
            }}
          />
          <ContentReviewPermission
            scope="profile"
            checked={contentReviewConsent}
            onChange={setContentReviewConsent}
            disabled={busy}
          />
          {creator && (
            <div className="profile-photo-actions">
              <label className="button secondary photo-upload-control">
                <Camera size={17} aria-hidden="true" />
                {busy ? "Saving photo…" : "Upload profile photo"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  aria-label="Profile photo"
                  disabled={busy || !contentReviewConsent}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = "";
                    if (file)
                      void mutate(
                        () => socialApi.uploadPhoto(file, contentReviewConsent),
                        "Profile photo saved.",
                        false,
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
                    void mutate(
                      socialApi.removePhoto,
                      "Profile photo removed.",
                      false,
                    )
                  }
                >
                  Remove profile photo
                </button>
              )}
            </div>
          )}
        </ProfileEditor>
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
          <PrivateEntries />
        </section>
      )}
    </div>
  );
}
function ProfileEditor({
  children,
  busy,
  canShare,
  onClose,
}: {
  children: ReactNode;
  busy: boolean;
  canShare: boolean;
  onClose: () => void;
}) {
  const element = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = element.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const app = document.getElementById("root");
    const previousHidden = app?.getAttribute("aria-hidden");
    const nativeDialog = typeof dialog.showModal === "function";
    if (nativeDialog) dialog.showModal();
    else {
      dialog.setAttribute("open", "");
      app?.setAttribute("aria-hidden", "true");
    }
    document.body.style.overflow = "hidden";
    const viewport = window.visualViewport;
    let resizeFrame: number | undefined;
    const resize = () => {
      dialog.style.setProperty(
        "--profile-editor-height",
        `${viewport?.height || window.innerHeight}px`,
      );
      dialog.style.setProperty(
        "--profile-editor-top",
        `${viewport?.offsetTop || 0}px`,
      );
      if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        const focused = document.activeElement as HTMLElement | null;
        if (focused && dialog.contains(focused))
          focused.scrollIntoView({ block: "nearest" });
      });
    };
    resize();
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    window.addEventListener("resize", resize);
    const focusFirst = () =>
      (
        dialog.querySelector<HTMLInputElement>("input:not(:disabled)") || dialog
      ).focus({ preventScroll: true });
    const containFocus = (event: FocusEvent) => {
      if (!dialog.contains(event.target as Node)) focusFirst();
      else if (
        event.target instanceof HTMLElement &&
        event.target.matches("input, textarea, select")
      ) {
        if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame);
        const field = event.target;
        resizeFrame = requestAnimationFrame(() =>
          field.scrollIntoView({ block: "nearest" }),
        );
      }
    };
    document.addEventListener("focusin", containFocus);
    focusFirst();
    return () => {
      document.removeEventListener("focusin", containFocus);
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
      window.removeEventListener("resize", resize);
      if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame);
      if (nativeDialog) dialog.close();
      if (!nativeDialog && app) {
        if (previousHidden === null) app.removeAttribute("aria-hidden");
        else if (previousHidden !== undefined)
          app.setAttribute("aria-hidden", previousHidden);
      }
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <>
      <div className="profile-editor-scrim" aria-hidden="true" />
      <dialog
        ref={element}
        className="profile-editor-dialog"
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby="profile-editor-title"
        aria-describedby="profile-editor-privacy"
        onCancel={(event) => {
          event.preventDefault();
          if (!busy) onClose();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            if (!busy) onClose();
          }
          if (event.key !== "Tab") return;
          const fields = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>(
              "button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href]",
            ),
          ).filter((field) => field.getClientRects().length);
          if (!fields.length) {
            event.preventDefault();
            event.currentTarget.focus();
            return;
          }
          const target = event.shiftKey ? fields.at(-1) : fields[0];
          const edge = event.shiftKey ? fields[0] : fields.at(-1);
          if (document.activeElement === edge) {
            event.preventDefault();
            target?.focus();
          }
        }}
      >
        <header className="profile-editor-header">
          <h2 id="profile-editor-title">Edit profile</h2>
        </header>
        <div className="profile-editor-body">{children}</div>
        <footer className="profile-editor-actions">
          <Button type="button" secondary disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="profile-editor-form"
            busy={busy}
            disabled={!canShare}
          >
            Save public profile
          </Button>
        </footer>
      </dialog>
    </>,
    document.body,
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
      id="profile-editor-form"
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
          disabled={busy}
          maxLength={60}
          required
          defaultValue={creator?.displayName}
        />
      </label>
      <label>
        Username
        <input
          name="username"
          disabled={busy}
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
        <select
          name="avatarKey"
          disabled={busy}
          defaultValue={creator?.avatarKey || "coral"}
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
          disabled={busy}
          rows={3}
          maxLength={280}
          defaultValue={creator?.bio}
        />
      </label>
      <label className="check-row">
        <input
          name="openToBrands"
          disabled={busy}
          type="checkbox"
          defaultChecked={creator?.openToBrands}
        />
        Open to brand opportunities
      </label>
      <p className="support">
        Video availability is separate. This does not authorize advertising.
      </p>
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
