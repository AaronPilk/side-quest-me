import { useState } from "react";
import { Link } from "react-router-dom";
import type { CommunityPost } from "../../shared/community";
import type { Run } from "../lib/types";
import { useCommunity, useCommunityAction } from "./Community";
import { Button, Notice } from "./ui";

export default function PublishReel({ run }: { run: Run }) {
  const me = useCommunity("me");
  const action = useCommunityAction(me.refresh);
  const [caption, setCaption] = useState("");
  const [brandOptIn, setBrandOptIn] = useState(false);
  const [post, setPost] = useState<CommunityPost>();
  const [kept, setKept] = useState(false);
  const publication = me.data?.publications?.find(
    (item) => item.runId === run.id,
  );
  const existing =
    post || me.data?.posts.find((item) => item.id === publication?.postId);
  if (run.status !== "finalized" || run.render?.status !== "ready") return null;
  return (
    <section className="section publish-reel">
      <h2>Your reel. Your choice.</h2>
      <p className="support">
        Keeping it private earns the same progress. Publishing shares this
        finished video, your public creator profile, caption and quest
        instructions after publication review. Raw clips, profile answers and
        outing details stay private.
      </p>
      {existing ? (
        <Notice>
          {existing.state === "pending"
            ? "Submitted for publication review. Your video stays private until approved. "
            : existing.state === "rejected"
              ? `Changes are needed before publication. ${existing.reviewNotes || "Review your post and submit it again."} `
              : `This run has a ${existing.state} post. `}
          Your original reel stays in your private journal.{" "}
          <Link to={`/posts/${existing.id}`}>
            Edit caption or manage publication
          </Link>
        </Notice>
      ) : (
        <>
          <Button secondary onClick={() => setKept(true)}>
            Keep private
          </Button>
          {kept && (
            <Notice>
              Kept in your private journal. You can publish later.
            </Notice>
          )}
          {!me.data?.creator ? (
            <p>
              <Link to="/profile">Create a public creator profile</Link> before
              publishing.
            </p>
          ) : (
            <details className="community-panel">
              <summary>Publish to Sidequest</summary>
              <p>
                Submit your finished video for review before it appears in
                Discover. Edits are reviewed again. You can keep filming and use
                your private journal while it is pending.
              </p>
              <label>
                Public caption
                <textarea
                  maxLength={1000}
                  rows={3}
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
                Open this video to brand offers
              </label>
              <p className="support">
                This only allows inquiries when your creator profile is also
                open to brands. It gives no advertising permission or account
                access.
              </p>
              <Button
                busy={action.busy}
                onClick={async () => {
                  const saved = await action.run<CommunityPost>(
                    "post_publish",
                    {
                      runId: run.id,
                      assetId: run.render!.id,
                      caption,
                      brandOptIn,
                    },
                    "Submitted for publication review. Your original stays private.",
                  );
                  if (saved) setPost(saved);
                }}
              >
                Submit for review
              </Button>
            </details>
          )}
        </>
      )}
      {me.error && <Notice error>{me.error}</Notice>}
      {action.feedback}
    </section>
  );
}
