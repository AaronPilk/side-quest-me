import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_PREFERENCES } from "../shared/domain";

const firstAccount = "11111111-1111-4111-8111-111111111111";
const secondAccount = "22222222-2222-4222-8222-222222222222";

/** Mount the real gate/router/API transport with a small route consumer. This
 * isolates auth races from the independent quest/preferences page workflows. */
async function gateFixture(
  page: Page,
  options: {
    actor?: string | null;
    completed?: boolean;
    demo?: boolean;
    failedReads?: number;
    holdFirstRead?: boolean;
  } = {},
) {
  const initialActor =
    options.actor === undefined ? firstAccount : options.actor;
  const profiles = new Map<string, boolean>([
    [firstAccount, options.completed ?? false],
    [secondAccount, false],
  ]);
  const calls: { actor: string | null; method: string; input?: unknown }[] = [];
  let failures = options.failedReads ?? 0;
  let release = () => {};
  const heldRead = new Promise<void>((resolve) => {
    release = resolve;
  });
  let hold = options.holdFirstRead ?? false;
  await page.route(/\/src\/lib\/auth\.ts(?:\?.*)?$/, (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `export const DEMO = false;
      let actor = ${JSON.stringify(initialActor)};
      const session = () => actor ? {access_token:"gate-"+actor,user:{id:actor}} : null;
      export const supabase={auth:{getSession:async()=>({data:{session:session()},error:null})}};
      export const accessToken=async()=>session()?.access_token;
      addEventListener("gate-test-account",event=>{actor=event.detail});`,
    }),
  );
  await page.route(/\/src\/App\.tsx(?:\?.*)?$/, async (route) => {
    const original = await (await route.fetch()).text();
    const dependency = (name: string) => {
      const url = original.match(
        new RegExp(`from ["']([^"']*/${name}\\.js[^"']*)["']`),
      )?.[1];
      if (!url) throw new Error(`Missing observed Vite dependency ${name}`);
      return JSON.stringify(url);
    };
    return route.fulfill({
      contentType: "application/javascript",
      body: `import React from ${dependency("react")};
        const {createElement:h,useEffect,useState}=React;
        import {Routes,Route,useLocation,useNavigate,Link} from ${dependency("react-router-dom")};
        import {OnboardingGate} from "/src/components/OnboardingGate.tsx";
        import {api} from "/src/lib/api.ts";
        import {consumeReturnTo,validateReturnTo} from "/src/lib/internal-return.ts";
        function Content(){const location=useLocation();return h("p",{"data-testid":"protected-content"},"App screen: "+location.pathname)}
        function Setup(){const location=useLocation();return h("p",{"data-testid":"setup-content"},"Setup screen: "+location.pathname)}
        function Onboarding(){const location=useLocation();const navigate=useNavigate();
          const finish=async()=>{await api.updateProfile({onboardingCompleted:true});
            const target=validateReturnTo(new URLSearchParams(location.search).get("returnTo"));
            navigate(consumeReturnTo(target||"/create"),{replace:true})};
          return h("section",{"data-testid":"onboarding-content"},h("h1",null,"Onboarding setup"),
            h("button",{onClick:finish},"Finish setup"),h("button",{onClick:finish},"Skip setup"))}
        export default function App(){const [actor,setActor]=useState(${JSON.stringify(initialActor)});
          useEffect(()=>{const listener=event=>setActor(event.detail);addEventListener("gate-test-account",listener);return()=>removeEventListener("gate-test-account",listener)},[]);
          return h("main",null,h(OnboardingGate,{signedIn:Boolean(actor),identity:actor,demo:${Boolean(options.demo)}},
            h(Routes,null,h(Route,{path:"/onboarding",element:h(Onboarding)}),
              ...["/preferences","/settings","/account/security"].map(path=>h(Route,{key:path,path,element:h(Setup)})),
              h(Route,{path:"*",element:h(Content)}))))}`,
    });
  });
  await page.route("**/api/me", async (route) => {
    const actor =
      route.request().headers().authorization?.replace("Bearer gate-", "") ||
      null;
    const method = route.request().method();
    const input =
      method === "PATCH" ? route.request().postDataJSON() : undefined;
    calls.push({ actor, method, input });
    if (!actor)
      return route.fulfill({
        status: 401,
        json: { error: "Sign in to continue." },
      });
    if (method === "GET" && hold) {
      hold = false;
      await heldRead;
    }
    if (method === "GET" && failures > 0) {
      failures--;
      return route.fulfill({
        status: 503,
        json: { error: "Account setup is temporarily unavailable." },
      });
    }
    if (method === "PATCH") profiles.set(actor, input.onboardingCompleted);
    return route.fulfill({
      json: {
        profile: {
          accountType: "personal",
          displayName: "Test account",
          timezone: "UTC",
          locale: "en",
          summary: "",
          preferences: DEFAULT_PREFERENCES,
          onboardingCompleted: profiles.get(actor) ?? false,
        },
        wallet: { xp: 0, points: 0, version: 0 },
        roles: [],
      },
    });
  });
  return { calls, release, profiles };
}

async function switchAccount(page: Page, actor: string | null) {
  await page.evaluate(
    (actor) =>
      window.dispatchEvent(
        new CustomEvent("gate-test-account", { detail: actor }),
      ),
    actor,
  );
}

test("a new signed-in account is guided to onboarding before app content", async ({
  page,
}) => {
  const fixture = await gateFixture(page);
  await page.goto("/discover");
  await expect(page.getByTestId("onboarding-content")).toBeVisible();
  await expect(page.getByTestId("protected-content")).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe("/discover");
  expect(fixture.calls.filter((call) => call.method === "GET")).toHaveLength(1);
});

test("completed accounts, guests, and explicit demo exploration bypass setup", async ({
  page,
}) => {
  const complete = await gateFixture(page, { completed: true });
  await page.goto("/discover");
  await expect(page.getByTestId("protected-content")).toBeVisible();
  expect(complete.calls.filter((call) => call.method === "GET")).toHaveLength(
    1,
  );
});

for (const options of [{ actor: null }, { demo: true }]) {
  test(`${options.actor === null ? "guest public browsing" : "explicit demo exploration"} does not read a private profile`, async ({
    page,
  }) => {
    const fixture = await gateFixture(page, options);
    await page.goto("/discover");
    await expect(page.getByTestId("protected-content")).toBeVisible();
    expect(fixture.calls).toHaveLength(0);
  });
}

test("a failed profile check blocks app content and can be retried", async ({
  page,
}) => {
  const fixture = await gateFixture(page, { completed: true, failedReads: 1 });
  await page.goto("/create");
  await expect(page.getByRole("alert")).toContainText(
    "Account setup is temporarily unavailable.",
  );
  await expect(page.getByTestId("protected-content")).toHaveCount(0);
  await page.getByRole("button", { name: "Retry setup check" }).click();
  await expect(page.getByTestId("protected-content")).toBeVisible();
  expect(fixture.calls.filter((call) => call.method === "GET")).toHaveLength(2);
});

for (const action of ["Finish setup", "Skip setup"]) {
  test(`${action} saves completion and returns to the validated intended route without looping after refresh`, async ({
    page,
  }) => {
    const fixture = await gateFixture(page);
    const intended =
      "/runs/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?resume=1#camera";
    await page.goto(intended);
    await expect(page.getByTestId("onboarding-content")).toBeVisible();
    expect(new URL(page.url()).searchParams.get("returnTo")).toBe(intended);
    await page.getByRole("button", { name: action, exact: true }).click();
    await expect(page.getByTestId("protected-content")).toBeVisible();
    await expect(page).toHaveURL(
      new RegExp(`${intended.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
    );
    expect(
      fixture.calls.some(
        (call) =>
          call.method === "PATCH" &&
          JSON.stringify(call.input) ===
            JSON.stringify({ onboardingCompleted: true }),
      ),
    ).toBe(true);
    await page.reload();
    await expect(page.getByTestId("protected-content")).toBeVisible();
    await expect(page.getByTestId("onboarding-content")).toHaveCount(0);
  });
}

test("switching account cannot reuse a previous account's completed status", async ({
  page,
}) => {
  const fixture = await gateFixture(page, { completed: true });
  await page.goto("/discover");
  await expect(page.getByTestId("protected-content")).toBeVisible();
  await switchAccount(page, secondAccount);
  await expect(page.getByTestId("onboarding-content")).toBeVisible();
  await expect(page.getByTestId("protected-content")).toHaveCount(0);
  expect(
    fixture.calls
      .filter((call) => call.method === "GET")
      .map((call) => call.actor),
  ).toEqual([firstAccount, secondAccount]);
});

test("a delayed profile response from the previous identity cannot unlock the new account", async ({
  page,
}) => {
  const fixture = await gateFixture(page, {
    completed: true,
    holdFirstRead: true,
  });
  await page.goto("/discover");
  await expect
    .poll(() => fixture.calls.filter((call) => call.method === "GET").length)
    .toBe(1);
  await switchAccount(page, secondAccount);
  await expect(page.getByTestId("onboarding-content")).toBeVisible();
  fixture.release();
  await expect
    .poll(() => fixture.calls.filter((call) => call.method === "GET").length)
    .toBe(2);
  await expect(page.getByTestId("protected-content")).toHaveCount(0);
  await expect(page.getByTestId("onboarding-content")).toBeVisible();
});

test("setup, preferences, settings, and account safety remain reachable without a setup read", async ({
  page,
}) => {
  const fixture = await gateFixture(page, { failedReads: 100 });
  for (const path of [
    "/onboarding",
    "/preferences",
    "/settings",
    "/account/security",
  ]) {
    await page.goto(path);
    await expect(
      page.getByTestId(
        path === "/onboarding" ? "onboarding-content" : "setup-content",
      ),
    ).toBeVisible();
  }
  expect(fixture.calls).toHaveLength(0);
});

test("a setup failure still offers a working route to account settings", async ({
  page,
}) => {
  await gateFixture(page, { failedReads: 1 });
  await page.goto("/profile");
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("link", { name: "Account settings" }).click();
  await expect(page.getByTestId("setup-content")).toContainText("/settings");
});

test("unknown intended routes use a safe app fallback", async ({ page }) => {
  await gateFixture(page);
  await page.goto("/unrecognized-route?returnTo=https://attacker.invalid");
  await expect(page.getByTestId("onboarding-content")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe("/create");
  await page.getByRole("button", { name: "Skip setup" }).click();
  await expect(page.getByTestId("protected-content")).toBeVisible();
  await expect(page).toHaveURL(/\/create$/);
});
