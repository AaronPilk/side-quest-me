import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { UserRound, ArrowRight, Clock3, Users } from "lucide-react";
import type { QuestVariant } from "../../shared/domain";
import type {
  CommunityAction,
  CommunityReadResults,
  CommunityView,
} from "../../shared/community";
import { communityApi } from "../lib/community-api";
import { Button, Notice } from "./ui";

export function useCommunity<V extends CommunityView>(
  view: V,
  input: Record<string, unknown> = {},
  enabled = true,
  identity = "",
) {
  type T = CommunityReadResults[V];
  const inputKey = JSON.stringify(input);
  const [revision, setRevision] = useState(0);
  const resourceKey = JSON.stringify([view, inputKey, enabled, identity]);
  const [response, setResponse] = useState<{ key: string; data: T }>();
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setError("");
    setResponse(undefined);
    communityApi
      .read<T>(view, JSON.parse(inputKey))
      .then((value) => {
        if (active) setResponse({ key: resourceKey, data: value });
      })
      .catch((cause) => {
        if (active) setError((cause as Error).message);
      });
    return () => {
      active = false;
    };
  }, [view, inputKey, revision, enabled, resourceKey]);
  return {
    data: enabled && response?.key === resourceKey ? response.data : undefined,
    error: enabled ? error : "",
    refresh: () => setRevision((value) => value + 1),
  };
}

export function useCommunityAction(refresh?: () => void) {
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const keys = useRef(new Map<string, ReturnType<typeof crypto.randomUUID>>());
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function run<T>(
    action: CommunityAction,
    input: Record<string, unknown>,
    success: string,
  ): Promise<T | undefined> {
    if (running.current) return;
    running.current = true;
    const fingerprint = JSON.stringify([action, input]);
    const key = keys.current.get(fingerprint) ?? crypto.randomUUID();
    keys.current.set(fingerprint, key);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await communityApi.mutate<T>(action, input, key);
      keys.current.delete(fingerprint);
      setMessage(success);
      refresh?.();
      return result;
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return {
    busy,
    run,
    feedback: (
      <>
        {message && <Notice>{message}</Notice>}
        {error && <Notice error>{error}</Notice>}
      </>
    ),
  };
}

export function money(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    value / 100,
  );
}
export function words(value: string) {
  return value.replaceAll("_", " ");
}
export function CreatorAvatar({
  avatar,
  name,
  photoUrl,
}: {
  avatar?: string;
  name: string;
  photoUrl?: string | null;
}) {
  return (
    <span
      className={`creator-avatar avatar-${avatar || "coral"}`}
      aria-hidden="true"
    >
      {photoUrl ? (
        <img src={photoUrl} alt="" loading="lazy" />
      ) : name ? (
        name.trim().slice(0, 1).toUpperCase()
      ) : (
        <UserRound size={20} />
      )}
    </span>
  );
}
export function StateTag({ state }: { state: string }) {
  return (
    <span className={`community-state state-${state}`}>{words(state)}</span>
  );
}
export function PublicVideo({
  src,
  poster,
  title,
}: {
  src: string;
  poster?: string;
  title: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  return (
    <div className="public-video">
      <video
        ref={ref}
        src={src}
        poster={poster}
        aria-label={title}
        controls
        playsInline
        preload="metadata"
        onError={() => setFailed(true)}
        onPlay={(event) => {
          document.querySelectorAll("video").forEach((video) => {
            if (video !== event.currentTarget) video.pause();
          });
        }}
      />
      {failed && (
        <div className="video-failure">
          <p>This video could not play. Your place is saved.</p>
          <Button
            secondary
            onClick={() => {
              setFailed(false);
              ref.current?.load();
            }}
          >
            Retry video
          </Button>
        </div>
      )}
    </div>
  );
}
export function Planning({
  quest,
}: {
  quest: Pick<
    QuestVariant,
    | "intensity"
    | "durationMinutes"
    | "minParticipants"
    | "maxParticipants"
    | "cost"
  >;
}) {
  return (
    <div className="public-planning">
      <span>{words(quest.intensity)}</span>
      <span>
        <Clock3 size={14} />
        {quest.durationMinutes} min + travel
      </span>
      <span>
        <Users size={14} />
        {quest.minParticipants}–{quest.maxParticipants}
      </span>
      <span>
        {money(quest.cost.minMinor)}–{money(quest.cost.maxMinor)}{" "}
        {words(quest.cost.scope)}
        {quest.cost.venueCostUnknown ? " + venue" : ""}
      </span>
    </div>
  );
}
export function TryQuest({
  id,
  postId,
  seriesPartId,
  children = "Try this quest",
}: {
  id: string;
  postId?: string;
  seriesPartId?: string;
  children?: ReactNode;
}) {
  return (
    <Link
      className="button"
      to={`/create?template=${encodeURIComponent(id)}${postId ? `&from=${encodeURIComponent(postId)}` : ""}${seriesPartId ? `&seriesPart=${encodeURIComponent(seriesPartId)}` : ""}`}
    >
      {children}
      <ArrowRight size={18} />
    </Link>
  );
}
