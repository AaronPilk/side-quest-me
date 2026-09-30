import {
  type SocialProfile,
  type SocialProfileInput,
  socialProfileInput,
} from "../../shared/social";
import { demoActor } from "./demo-identity";
import { demoMutate, demoRead, demoNotify } from "./demo-community";
import type { CommunityReadResults } from "../../shared/community";
const KEY = "sidequest-social-demo-v1";
type State = {
  profiles: Record<
    string,
    { username: string | null; photoUrl: string | null }
  >;
  follows: { followerId: string; creatorId: string }[];
};
function read(): State {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (saved?.profiles && Array.isArray(saved.follows)) return saved;
  } catch {
    /* An old or interrupted demo can start with empty social records. */
  }
  return { profiles: {}, follows: [] };
}
function write(state: State) {
  localStorage.setItem(KEY, JSON.stringify(state));
  window.dispatchEvent(new Event("sidequest-change"));
}
function blocked(a: string, b: string) {
  const community = JSON.parse(
    localStorage.getItem("sidequest-community-demo-v1") || "null",
  );
  return (community?.blocks || []).some(
    (item: { by: string; target: string }) =>
      (item.by === a && item.target === b) ||
      (item.by === b && item.target === a),
  );
}
export function demoSocialIdentity(id: string) {
  return read().profiles[id] || { username: null, photoUrl: null };
}
export function demoSocialBlock(first: string, second: string) {
  const state = read();
  state.follows = state.follows.filter(
    (item) =>
      !(
        (item.followerId === first && item.creatorId === second) ||
        (item.followerId === second && item.creatorId === first)
      ),
  );
  write(state);
}
export function demoSocialRead(id: string = demoActor().id): SocialProfile {
  const actor = demoActor().id;
  demoRead<CommunityReadResults["creator"]>("creator", { id });
  const state = read(),
    identity = state.profiles[id];
  const follows = state.follows.filter(
    (item) => !blocked(item.followerId, item.creatorId),
  );
  return {
    creatorId: id,
    username: identity?.username || null,
    photoUrl: identity?.photoUrl || null,
    followersCount: follows.filter((item) => item.creatorId === id).length,
    followingCount: follows.filter((item) => item.followerId === id).length,
    isFollowing: follows.some(
      (item) => item.followerId === actor && item.creatorId === id,
    ),
    isOwn: actor === id,
  };
}
async function transaction<T>(fn: () => Promise<T> | T) {
  return navigator.locks
    ? navigator.locks.request("sidequest-social-demo", fn)
    : fn();
}
export async function demoSocialSave(raw: SocialProfileInput) {
  return transaction(async () => {
    const input = socialProfileInput.parse(raw),
      state = read(),
      actor = demoActor().id;
    if (
      input.username &&
      Object.entries(state.profiles).some(
        ([id, profile]) => id !== actor && profile.username === input.username,
      )
    )
      throw new Error("That username is already taken. Try another.");
    const { username, ...core } = input;
    const previousCommunity = localStorage.getItem(
      "sidequest-community-demo-v1",
    );
    // Two records live in the same browser. Roll back the core profile if the
    // social write fails (for example a quota error), matching the SQL transaction.
    await demoMutate("creator_save", core, crypto.randomUUID());
    state.profiles[actor] = {
      ...state.profiles[actor],
      username: username || null,
      photoUrl: state.profiles[actor]?.photoUrl || null,
    };
    try {
      write(state);
    } catch (error) {
      if (previousCommunity === null)
        localStorage.removeItem("sidequest-community-demo-v1");
      else
        localStorage.setItem("sidequest-community-demo-v1", previousCommunity);
      throw error;
    }
    return demoSocialRead(actor);
  });
}
export async function demoSocialFollow(target: string, following: boolean) {
  return transaction(() => {
    const actor = demoActor().id;
    if (target === actor)
      throw new Error("You cannot follow your own profile.");
    demoSocialRead(target); // Checks availability and both block directions.
    const state = read();
    state.follows = state.follows.filter(
      (item) => item.followerId !== actor || item.creatorId !== target,
    );
    if (following) state.follows.push({ followerId: actor, creatorId: target });
    write(state);
    if (following)
      demoNotify(
        target,
        actor,
        "creator_follow",
        actor,
        "Someone followed your profile.",
        `/creators/${actor}`,
      );
    return demoSocialRead(target);
  });
}
export async function demoSocialPhoto(photoUrl: string | null) {
  return transaction(() => {
    const state = read(),
      actor = demoActor().id;
    state.profiles[actor] = {
      username: state.profiles[actor]?.username || null,
      photoUrl,
    };
    write(state);
    return demoSocialRead(actor);
  });
}
