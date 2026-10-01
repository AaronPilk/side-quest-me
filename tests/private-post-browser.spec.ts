import { expect, test, type Page } from "@playwright/test";
const privateId = "private_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const postId = "55555555-5555-4555-8555-555555555555";
async function sharedPrivateStory(page: Page, owner = false) {
  await page.addInitScript((isOwner) => {
    sessionStorage.setItem("sq-demo-started", "1");
    localStorage.setItem(
      "sidequest-demo-persona",
      isOwner ? "viewer" : "creator",
    );
  }, owner);
  // Supply a public-post snapshot through the normal read transport. Private
  // template reads remain untouched so a bad owner-only link would be caught.
  await page.route("**/src/lib/community-api.ts*", async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    await route.fulfill({
      response,
      body: `${body}\n
      const originalRead = communityApi.read;
      const sharedGeneratedPost = (post) => ({ ...post, quest: { ...post.quest,
        id: ${JSON.stringify(privateId)}, familyId: "private_date_night_competition",
        privateGenerated: true, award: { xp: 0, points: 0 }, title: "Our shared private adventure",
        beats: post.quest.beats.map((beat, index) => index === 1 ? { ...beat, action: "Make a genuine attempt at the operator-led group challenge and record its honest result." } : beat)
      }});
      communityApi.read = async (view, input = {}) => {
        const result = await originalRead(view, input);
        if (view === "post") return sharedGeneratedPost(result);
        if (view === "feed") return { ...result, posts: result.posts.map(sharedGeneratedPost) };
        return result;
      };`,
    });
  });
}
for (const owner of [false, true])
  test(`a published generated story gives ${owner ? "its owner" : "another viewer"} a fresh Create path and readable shared instructions`, async ({
    page,
  }) => {
    await sharedPrivateStory(page, owner);
    const requests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes(privateId)) requests.push(request.url());
    });
    await page.goto(`/posts/${postId}`);
    const post = page.locator(".public-post");
    await expect(
      post.getByRole("heading", { name: "Our shared private adventure" }),
    ).toBeVisible();
    await expect(
      post.getByRole("link", { name: "Find my own quest", exact: true }),
    ).toHaveAttribute("href", "/create");
    await expect(
      post.getByRole("link", { name: "Try this quest", exact: true }),
    ).toHaveCount(0);
    await expect(post.locator(`a[href="/quests/${privateId}"]`)).toHaveCount(0);
    const details = post.locator("details").filter({
      has: page.locator("summary", { hasText: "Read the shared quest" }),
    });
    await details.locator("summary").click();
    await expect(details).toContainText(
      "Make a genuine attempt at the operator-led group challenge",
    );
    await expect(details.locator("ol > li")).toHaveCount(3);
    expect(
      requests.filter((url) => url.includes(`/api/quests/${privateId}`)),
    ).toEqual([]);
    if (owner)
      await expect(
        post.locator("summary", { hasText: "Edit this public post" }),
      ).toBeVisible();
    await post
      .getByRole("link", { name: "Find my own quest", exact: true })
      .click();
    await expect(page).toHaveURL(/\/create$/);
  });
test("published catalog stories retain their specific quest and inspiration links", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("sq-demo-started", "1"),
  );
  await page.goto(`/posts/${postId}`);
  const post = page.locator(".public-post");
  await expect(
    post.getByRole("link", { name: "Try this quest", exact: true }),
  ).toHaveAttribute("href", new RegExp(`/create\\?template=.*&from=${postId}`));
  await expect(
    post.getByRole("link", { name: "Read the quest", exact: true }),
  ).toHaveAttribute("href", /^\/quests\//);
  await expect(
    post.locator("summary", { hasText: "Read the shared quest" }),
  ).toHaveCount(0);
});
