import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_PREFERENCES, type Profile } from "../shared/domain";

const accountA = "11111111-1111-4111-8111-111111111111";
const accountB = "22222222-2222-4222-8222-222222222222";
const secret = "Account A private imported summary";
const keys = ["sq-profile-draft", "sq-preference-wizard-draft"];
const saved: Profile = {
  accountType: "personal",
  displayName: "Account B",
  timezone: "America/New_York",
  locale: "en-US",
  summary: "",
  onboardingCompleted: true,
  preferences: DEFAULT_PREFERENCES,
};

async function fixture(
  page: Page,
  {
    unowned = false,
    holdInitial = false,
    currentProfile = saved,
  }: {
    unowned?: boolean;
    holdInitial?: boolean;
    currentProfile?: Profile;
  } = {},
) {
  const patches: { actor: string; body: Record<string, unknown> }[] = [];
  await page.addInitScript(
    ({ keys, accountA, saved, secret, unowned }) => {
      for (const key of keys)
        sessionStorage.setItem(
          key,
          JSON.stringify({
            version: 2,
            baselineProfile: saved,
            ...(unowned ? {} : { ownerId: `user:${accountA}` }),
            profile: {
              ...saved,
              summary: secret,
              preferences: {
                ...saved.preferences,
                role: "mastermind",
                sources: { role: "survey" },
              },
            },
            step: key === "sq-profile-draft" ? -1 : 4,
            reviewingAnswer: false,
          }),
        );
    },
    { keys, accountA, saved, secret, unowned },
  );
  await page.route(/\/src\/lib\/auth\.ts(?:\?.*)?$/, (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `export const DEMO=false;
      let actor="${accountA}",calls=0;const listeners=new Set(),initialResolvers=[];
      const session=()=>actor?{access_token:"test-"+actor,user:{id:actor}}:null;
      export const supabase={auth:{
        getSession:async()=>{const initial=session();if(++calls<=2&&${holdInitial})return new Promise(resolve=>{initialResolvers.push(()=>resolve({data:{session:initial}}));window.__releaseInitial=()=>initialResolvers.forEach(release=>release())});return {data:{session:session()}}},
        onAuthStateChange(callback){listeners.add(callback);return {data:{subscription:{unsubscribe(){listeners.delete(callback)}}}}}
      }};
      export const accessToken=async()=>session()?.access_token;
      addEventListener("draft-test-auth",event=>{actor=event.detail.actor;for(const callback of listeners)callback(event.detail.event,session())});`,
    }),
  );
  await page.route("**/api/me", async (route) => {
    const actor =
      route.request().headers().authorization?.replace("Bearer test-", "") ??
      "";
    if (route.request().method() === "PATCH") {
      patches.push({ actor, body: route.request().postDataJSON() });
      return route.fulfill({ json: {} });
    }
    return route.fulfill({
      json: {
        profile: currentProfile,
        wallet: { xp: 0, points: 0, version: 0 },
        roles: [],
      },
    });
  });
  return patches;
}

async function emit(page: Page, actor: string, event: string) {
  await page.evaluate(
    ({ actor, event }) => {
      window.dispatchEvent(
        new CustomEvent("draft-test-auth", { detail: { actor, event } }),
      );
    },
    { actor, event },
  );
}
async function drafts(page: Page) {
  return page.evaluate(
    (keys) => keys.map((key) => sessionStorage.getItem(key)),
    keys,
  );
}

for (const preferencesOnly of [false, true]) {
  test(`${preferencesOnly ? "preference wizard" : "original summary flow"} isolates drafts after a direct native-like A to B SIGNED_IN`, async ({
    page,
  }) => {
    const patches = await fixture(page);
    await page.goto(
      preferencesOnly ? "/onboarding?preferences=1" : "/onboarding",
    );
    await expect(
      page.getByText(preferencesOnly ? "5 of 11" : "Optional context", {
        exact: true,
      }),
    ).toBeVisible();
    expect((await drafts(page)).join()).toContain(secret);
    await emit(page, accountB, "SIGNED_IN");
    await expect(
      page.getByRole("heading", {
        name: preferencesOnly
          ? "What are you here for?"
          : "Make Sidequest yours.",
        exact: true,
      }),
    ).toBeVisible();
    await expect
      .poll(async () => (await drafts(page)).join())
      .not.toContain(secret);
    await expect
      .poll(async () => (await drafts(page)).join())
      .toContain(`user:${accountB}`);
    await expect(page.getByText(secret, { exact: true })).toHaveCount(0);
    if (!preferencesOnly) {
      await expect(
        page.getByRole("radio", { name: /^Personal account/ }),
      ).toBeChecked();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page
        .getByRole("button", { name: "Continue to preferences", exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "What are you here for?",
          exact: true,
        }),
      ).toBeVisible();
    }
    if (preferencesOnly) {
      // A skip never writes; an explicit "No preference" + Continue does, and
      // that write must belong to B.
      const before = patches.length;
      await page
        .getByRole("button", { name: "Skip this question", exact: true })
        .click();
      await expect(page.getByText("2 of 11", { exact: true })).toBeVisible();
      expect(patches.length).toBe(before);
      await page.getByRole("button", { name: "Back", exact: true }).click();
      await expect(page.getByText("1 of 11", { exact: true })).toBeVisible();
      await page
        .getByRole("button", {
          name: "No preference for this question",
          exact: true,
        })
        .click();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await expect(page.getByText("2 of 11", { exact: true })).toBeVisible();
      expect(patches.at(-1)).toMatchObject({
        actor: accountB,
        body: { preferences: { categories: [], role: null } },
      });
      expect(JSON.stringify(patches)).not.toContain(secret);
    }
  });
  test(`${preferencesOnly ? "preference wizard" : "original summary flow"} discards unowned legacy draft honestly and preserves the saved personal choice`, async ({
    page,
  }) => {
    await fixture(page, { unowned: true });
    await page.goto(
      preferencesOnly ? "/onboarding?preferences=1" : "/onboarding",
    );
    await expect(
      page.getByRole("heading", {
        name: preferencesOnly
          ? "What are you here for?"
          : "Make Sidequest yours.",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "An older draft could not be matched to this account. We loaded your saved preferences instead.",
        { exact: true },
      ),
    ).toBeVisible();
    const key = preferencesOnly ? keys[1] : keys[0];
    const draft = await page.evaluate(
      (key) => JSON.parse(sessionStorage.getItem(key)!),
      key,
    );
    expect(draft).toMatchObject({
      ownerId: `user:${accountA}`,
      profile: {
        summary: "",
        accountType: "personal",
        preferences: { role: null },
      },
    });
  });
}

test("same-user TOKEN_REFRESHED retains progress and imported-text draft without forcing a restart", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/onboarding?preferences=1");
  await expect(page.getByText("5 of 11", { exact: true })).toBeVisible();
  const before = await drafts(page);
  await emit(page, accountA, "TOKEN_REFRESHED");
  await expect(page.getByText("5 of 11", { exact: true })).toBeVisible();
  expect(await drafts(page)).toEqual(before);
  await expect(
    page.getByRole("button", { name: "Mastermind", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("a late initial A getSession cannot replace newer B SIGNED_IN or restore A draft", async ({
  page,
}) => {
  await fixture(page, { holdInitial: true });
  await page.goto("/onboarding?preferences=1");
  await emit(page, accountB, "SIGNED_IN");
  await expect(
    page.getByRole("heading", { name: "What are you here for?", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    (
      window as typeof window & { __releaseInitial: () => void }
    ).__releaseInitial();
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  await expect
    .poll(async () => (await drafts(page)).join())
    .toContain(`user:${accountB}`);
  expect((await drafts(page)).join()).not.toContain(secret);
});

test("a same-account stale wizard cannot restore removed summary or erase newer confirmed answers", async ({
  page,
}) => {
  const currentProfile: Profile = {
    ...saved,
    preferences: {
      ...DEFAULT_PREFERENCES,
      role: "camera_person",
      exclusions: ["alcohol"],
      sources: { role: "survey", exclusions: "survey" },
    },
  };
  const patches = await fixture(page, { currentProfile });
  await page.goto("/onboarding?preferences=1");
  await expect(
    page.getByRole("heading", { name: "What are you here for?", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Your saved profile changed since this draft.", {
      exact: false,
    }),
  ).toBeVisible();
  const current = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("sq-preference-wizard-draft")!),
  );
  expect(current).toMatchObject({
    ownerId: `user:${accountA}`,
    profile: {
      summary: "",
      preferences: { role: "camera_person", exclusions: ["alcohol"] },
    },
  });
  expect((await drafts(page)).join()).not.toContain(secret);
  await page
    .getByRole("button", {
      name: "No preference for this question",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText("2 of 11", { exact: true })).toBeVisible();
  expect(patches.at(-1)).toMatchObject({
    actor: accountA,
    body: {
      preferences: {
        categories: [],
        role: "camera_person",
        exclusions: ["alcohol"],
      },
    },
  });
  expect(JSON.stringify(patches)).not.toContain(secret);
  await page.goto("/onboarding");
  await expect(
    page.getByRole("heading", { name: "Make Sidequest yours.", exact: true }),
  ).toBeVisible();
  const alternate = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("sq-profile-draft")!),
  );
  expect(alternate.profile).toMatchObject({
    summary: "",
    preferences: { role: "camera_person", exclusions: ["alcohol"] },
  });
  expect((await drafts(page)).join()).not.toContain(secret);
});
