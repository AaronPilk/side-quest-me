import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Share2, UserCheck, UserPlus, Clapperboard } from "lucide-react";
import type { CommunityPost } from "../../shared/community";
import { socialApi } from "../lib/social-api";
import { rememberReturnTo } from "../lib/internal-return";
import { publicUrl } from "../lib/runtime";
import { isShareCancellation, sharePublicLink } from "../lib/native-share";

export function PostSocialActions({
  post,
  viewerId,
  returnTo,
  detail,
  onFollow,
}: {
  post: CommunityPost;
  viewerId?: string;
  returnTo: string;
  detail: boolean;
  onFollow?: () => void;
}) {
  const [following, setFollowing] = useState(Boolean(post.viewerFollowing));
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [copyFallback, setCopyFallback] = useState(false);
  const url = publicUrl(`/posts/${post.id}`);
  useEffect(
    () => setFollowing(Boolean(post.viewerFollowing)),
    [post.viewerFollowing],
  );
  return (
    <div className="post-social">
      <div className="post-social-actions">
        {!detail && (
          <Link to={`/posts/${post.id}`} state={{ returnTo }}>
            <Clapperboard size={19} /> Watch reel
          </Link>
        )}
        {viewerId && viewerId !== post.creator.id ? (
          <button
            type="button"
            aria-pressed={following}
            disabled={busy}
            onClick={async () => {
              if (running.current) return;
              running.current = true;
              setBusy(true);
              setError("");
              setMessage("");
              try {
                const result = await socialApi.follow(
                  post.creator.id,
                  !following,
                );
                setFollowing(result.isFollowing);
                setMessage(
                  result.isFollowing
                    ? `Following ${post.creator.displayName}.`
                    : `Unfollowed ${post.creator.displayName}.`,
                );
                onFollow?.();
              } catch {
                setError("Could not update your follow. Please try again.");
              } finally {
                running.current = false;
                setBusy(false);
              }
            }}
          >
            {following ? <UserCheck size={19} /> : <UserPlus size={19} />}{" "}
            {busy ? "Saving…" : following ? "Following" : "Follow"}
          </button>
        ) : !viewerId ? (
          <Link
            to="/account"
            onClick={() => rememberReturnTo(`/posts/${post.id}`)}
          >
            <UserPlus size={19} /> Sign in to follow
          </Link>
        ) : null}
        <button
          type="button"
          onClick={async () => {
            setError("");
            setMessage("");
            setCopyFallback(false);
            try {
              if (
                (await sharePublicLink({ title: post.quest.title, url })) ===
                "copied"
              ) {
                setMessage("Reel link copied.");
              }
            } catch (cause) {
              if (!isShareCancellation(cause)) {
                setCopyFallback(true);
                setError("Copy this public reel link to share it.");
              }
            }
          }}
        >
          <Share2 size={19} /> Share reel
        </button>
      </div>
      {message && (
        <p role="status" className="support">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="support">
          {error}
        </p>
      )}
      {copyFallback && (
        <label className="share-fallback">
          Public reel link
          <input
            readOnly
            value={url}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
    </div>
  );
}
