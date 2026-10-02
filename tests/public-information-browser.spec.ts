import { expect, test } from "@playwright/test";

const pages = [
  ["/privacy", "Privacy policy"],
  ["/support", "Help & support"],
  ["/terms", "Terms of use"],
  ["/community-guidelines", "Community guidelines"],
] as const;

for (const state of ["guest", "failed-session", "incomplete-account"]) {
  test(`public help and policies remain reachable for ${state}`, async ({
    page,
  }) => {
    let accountReads = 0;
    await page.route(/\/src\/lib\/auth\.ts(?:\?.*)?$/, (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: `export const DEMO = false;
          const session = ${
            state === "incomplete-account"
              ? '{access_token:"policy-fixture",user:{id:"11111111-1111-4111-8111-111111111111"}}'
              : "null"
          };
          export const supabase = {auth:{
            getSession:async()=>({data:{session},error:${state === "failed-session" ? 'new Error("Sign-in unavailable")' : "null"}}),
            onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})
          }};
          export const accessToken = async()=>session?.access_token;`,
      }),
    );
    await page.route("**/api/me", (route) => {
      accountReads++;
      return route.fulfill({
        status: 503,
        json: { error: "Account preferences unavailable." },
      });
    });
    for (const [path, heading] of pages) {
      await page.goto(path);
      await expect(
        page.getByRole("heading", { level: 1, name: heading, exact: true }),
      ).toBeVisible();
      await expect(page).toHaveTitle(`${heading} · Sidequest`);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(
        page.getByRole("navigation", { name: "Primary", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Retry setup check" }),
      ).toHaveCount(0);
      await expect(
        page
          .getByRole("navigation", { name: "Help and policies" })
          .getByRole("link"),
      ).toHaveCount(4);
    }
    expect(accountReads).toBe(0);
  });
}

for (const width of [320, 430]) {
  test(`policy pages fit ${width}px with enlarged text and accessible links`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/privacy");
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await expect(
      page.getByRole("heading", { name: "Privacy policy", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    const footer = page.getByRole("navigation", { name: "Help and policies" });
    for (const link of await footer.getByRole("link").all()) {
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await footer
      .getByRole("link", { name: "Help & support", exact: true })
      .click();
    await expect(page).toHaveURL(/\/support$/);
    await expect(
      page.getByRole("heading", { name: "Help & support", exact: true }),
    ).toBeVisible();
  });
}

test("signed-out welcome links open each public information page", async ({
  page,
}) => {
  await page.goto("/");
  const footer = page.locator(".welcome-policies");
  await expect(footer.getByRole("link")).toHaveCount(4);
  for (const [path, heading] of pages) {
    await footer.getByRole("link", { name: heading, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await page.goto("/");
  }
});
