import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { reviewQuestPlans } from "./quest-wizard-helpers";
import { selectDemoPersona } from "./demo-persona-helper";

test.use({ actionTimeout: 15_000 });

const fixturePost = "55555555-5555-4555-8555-555555555555";
const fixtureCreator = "22222222-2222-4222-8222-222222222222";
const fixtureVideo = path.resolve(".local/fixtures/landscape-with-audio.mp4");
async function openDemo(page: Page, route = "/discover") {
  await page.addInitScript(() =>
    sessionStorage.setItem("sq-demo-started", "1"),
  );
  await page.goto(route);
}
async function persona(
  page: Page,
  value: "creator" | "viewer" | "brand" | "operator",
) {
  await selectDemoPersona(page, value);
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
}
async function createOffer(page: Page) {
  await page.goto(`/posts/${fixturePost}`);
  await page
    .locator("summary")
    .filter({ hasText: /^Request to use video$/ })
    .click();
  const form = page.locator("form").filter({
    has: page.getByRole("button", { name: "Send proposal", exact: true }),
  });
  await form.getByLabel("Proposed payment (USD)", { exact: true }).fill("60");
  await expect(form.getByLabel("Agreed Sidequest fee (USD)")).toHaveValue("");
  await form.getByLabel("Agreed Sidequest fee (USD)").fill("5");
  await form.getByRole("checkbox", { name: "paid social" }).check();
  await form
    .getByLabel("Proposed start date")
    .fill(new Date().toISOString().slice(0, 10));
  await form.getByLabel("Usage duration (days)").fill("30");
  await form
    .getByLabel("Short message & any agreed edits")
    .fill(
      "Demo proposal: use the exact reel in a brand advertisement. No account access.",
    );
  await form.getByRole("button", { name: "Send proposal" }).click();
  await expect(page).toHaveURL(/\/offers\/[a-f0-9-]+$/);
  return page.url();
}

test("mobile discovery creates a separate personal attempt, keeps the reel private, then publishes explicitly", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openDemo(page);
  await expect(page.locator(".public-post")).toHaveCount(1);
  const video = page.locator(".public-post video").first();
  await expect
    .poll(() =>
      video.evaluate((element: HTMLVideoElement) => element.readyState),
    )
    .toBeGreaterThan(0);
  expect(
    await video.evaluate((element: HTMLVideoElement) => element.duration),
  ).toBeGreaterThan(5);
  expect(
    await video.evaluate(
      (element: HTMLVideoElement) => element.paused && !element.autoplay,
    ),
  ).toBe(true);
  await expect(
    page.getByText("Isolated demo creator · fixture footage"),
  ).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("discover-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: "Try this quest", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`from=${fixturePost}`));
  await expect(
    page.getByRole("heading", { name: "Who’s coming?", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Solo", exact: true }).click();
  await reviewQuestPlans(page);
  await page.getByRole("button", { name: "Check this quest" }).click();
  await expect(page.getByRole("button", { name: "Edit plans" })).toBeVisible();
  await expect(page.locator(".quest-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Edit plans" }).click();
  await page.getByRole("button", { name: "Edit group", exact: true }).click();
  await page.getByRole("button", { name: "Couple", exact: true }).click();
  await reviewQuestPlans(page);
  await page.getByRole("button", { name: "Edit budget", exact: true }).click();
  await page
    .getByRole("button", { name: "Enter exact amount", exact: true })
    .click();
  await page.getByRole("spinbutton", { name: "Budget in dollars" }).fill("17");
  await reviewQuestPlans(page);
  await page.getByRole("button", { name: "Check this quest" }).click();
  await expect(page.locator(".quest-card")).toHaveCount(1);
  await page.locator(".quest-card").click();
  await page.getByRole("button", { name: "Accept quest", exact: true }).click();
  await expect(page).toHaveURL(/\/runs\/[a-f0-9-]+$/);
  const runUrl = page.url();
  const stored = await page.evaluate(
    () => JSON.parse(localStorage.getItem("sidequest-demo-v1")!).runs[0],
  );
  expect(stored.id).not.toBe("77777777-7777-4777-8777-777777777777");
  expect(stored.inspiredByPostId).toBe(fixturePost);
  expect(stored.outing.budgetMinor).toBe(1700);
  expect(stored.clips).toHaveLength(0);
  await page
    .getByRole("button", { name: "Record or import video", exact: true })
    .click();
  const capture = page.getByRole("dialog", { name: "Record your quest" });
  await capture.getByLabel("Import video").setInputFiles(fixtureVideo);
  await capture
    .getByRole("button", { name: "Save video", exact: true })
    .click();
  await expect(capture).toBeHidden();
  await expect(page.getByLabel("Saved quest video")).toBeVisible();
  await page
    .getByRole("checkbox", { name: "I genuinely attempted", exact: false })
    .check();
  await page
    .getByRole("checkbox", { name: "I have permission", exact: false })
    .check();
  await page
    .getByRole("button", { name: "Complete quest", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Save video", exact: true }),
  ).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "Keep private", exact: true }).click();
  await expect(
    page.getByText("Kept in your private journal.", { exact: false }),
  ).toBeVisible();
  await page.goto("/discover");
  await expect(page.locator(".public-post")).toHaveCount(1);
  await page.goto(runUrl);
  await page
    .locator("summary")
    .filter({ hasText: /^Publish to Sidequest$/ })
    .click();
  await page
    .getByRole("textbox", { name: "Public caption", exact: true })
    .fill("My own version, published deliberately.");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page
    .getByRole("link", { name: "Edit caption or manage publication" })
    .click();
  const postUrl = page.url();
  await expect(page.locator(".public-post")).toContainText(
    "My own version, published deliberately.",
  );
  await page
    .locator("summary")
    .filter({ hasText: /^Edit this public post$/ })
    .click();
  await page
    .getByRole("textbox", { name: "Public caption", exact: true })
    .fill("Caption edited and persisted.");
  await page.getByRole("button", { name: "Save post changes" }).click();
  await expect(page.locator(".post-caption")).toHaveText(
    "Caption edited and persisted.",
  );
  await page.reload();
  await expect(page.locator(".post-caption")).toHaveText(
    "Caption edited and persisted.",
  );
  await page.goto("/discover");
  await expect(page.locator(".public-post video")).toHaveCount(2);
  await page
    .locator("video")
    .first()
    .evaluate((element: HTMLVideoElement) => element.play());
  await page
    .locator("video")
    .nth(1)
    .evaluate((element: HTMLVideoElement) => element.play());
  expect(
    await page
      .locator("video")
      .first()
      .evaluate((element: HTMLVideoElement) => element.paused),
  ).toBe(true);
  await page.goto(postUrl);
  await page
    .locator("summary")
    .filter({ hasText: /^Edit this public post$/ })
    .click();
  await page
    .getByRole("button", { name: "Unpublish post", exact: true })
    .click();
  await expect(page).toHaveURL(/\/profile$/);
  await page.goto("/discover");
  await expect(page.locator(".public-post")).toHaveCount(1);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("sidequest-demo-v1")!).runs[0].render
          .status,
    ),
  ).toBe("ready");
  await persona(page, "viewer");
  await page.goto("/activity");
  await expect(page.locator(".activity-item")).toContainText("attempt");
  expect(errors).toEqual([]);
});

test("an authored quest stays private through submission and becomes available only after operator review", async ({
  page,
}, testInfo) => {
  await openDemo(page, "/originals/new");
  await page
    .getByLabel("Quest title", { exact: true })
    .fill("The tabletop color hunt");
  await page
    .getByLabel("The premise in one sentence")
    .fill(
      "Find three familiar objects and build a miniature gallery together.",
    );
  await page
    .getByLabel("What does the estimate include?")
    .fill("Use objects already owned. No purchase needed.");
  await page
    .getByLabel("Instructions & participation requirements · one per line")
    .fill(
      "Choose three objects from your own home.\nAsk before using someone else’s belongings.\nArrange the objects into a tiny gallery.",
    );
  await page
    .getByLabel("Materials · one per line")
    .fill("Three objects you already own");
  for (let index = 0; index < 3; index++) {
    const beat = page.locator(".original-beat").nth(index);
    await beat
      .getByLabel("Short label")
      .fill(["Find", "Arrange", "Reveal"][index]);
    await beat
      .getByLabel("What happens")
      .fill(
        [
          "Find three interesting objects you own.",
          "Arrange your objects into a tabletop gallery.",
          "Explain your favorite detail to your group.",
        ][index],
      );
    await beat
      .getByLabel("What to film")
      .fill("Film the objects and any willing participants, with permission.");
  }
  await page
    .getByLabel("Completion check")
    .fill("Did you make your own three-object gallery?");
  await page
    .getByLabel("Fallback if the plan cannot go ahead")
    .fill("Draw three objects on paper and arrange the drawings.");
  await page.getByRole("button", { name: "Save original quest" }).click();
  await expect(page).toHaveURL(/\/originals\/[a-f0-9-]+$/);
  const draftUrl = page.url();
  await page
    .getByRole("button", { name: "Submit saved quest for review" })
    .click();
  await expect(
    page.getByText("Your quest is waiting for review.", { exact: false }),
  ).toBeVisible();
  await persona(page, "operator");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/studio");
  const review = page.locator("details").filter({
    has: page
      .locator("summary")
      .filter({ hasText: /^The tabletop color hunt$/ }),
  });
  await review.locator("summary").click();
  await review.getByLabel("Review decision").selectOption("approve");
  await review
    .getByLabel("Review notes")
    .fill(
      "Reviewed all three beats, existing-material costs and participation requirements.",
    );
  await review.getByRole("checkbox").check();
  await page.screenshot({
    path: testInfo.outputPath("operator-original-review.png"),
    fullPage: true,
  });
  await review.getByRole("button", { name: "Record quest review" }).click();
  await expect(review).toHaveCount(0);
  await persona(page, "creator");
  await page.goto(draftUrl);
  await expect(page.getByText("approved", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Try this quest", exact: true }).click();
  await expect(
    page.getByText("Make your version of", { exact: false }),
  ).toContainText("The tabletop color hunt");
  await reviewQuestPlans(page);
  await page.getByRole("button", { name: "Check this quest" }).click();
  await expect(page.locator(".quest-card")).toHaveCount(1);
  await page.locator(".quest-card").click();
  await page.getByRole("button", { name: "Accept quest", exact: true }).click();
  await expect(page).toHaveURL(/\/runs\/[a-f0-9-]+$/);
  await expect(
    page.getByRole("heading", { name: "The tabletop color hunt", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Record or import video", exact: true }),
  ).toHaveCount(1);
  await expect(page.locator(".quest-action-plan")).not.toHaveAttribute(
    "open",
    "",
  );
  const cameraButton = await page
    .getByRole("button", { name: "Record or import video", exact: true })
    .boundingBox();
  expect(cameraButton!.y + cameraButton!.height).toBeLessThan(
    page.viewportSize()!.height - 70,
  );
  await page.locator(".quest-action-plan > summary").click();
  for (const label of ["Find", "Arrange", "Reveal"])
    await expect(
      page.locator(".quest-action-plan").getByText(label, { exact: true }),
    ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "The tabletop color hunt", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Record or import video", exact: true }),
  ).toHaveCount(1);
  await page.locator(".quest-action-plan > summary").click();
  for (const label of ["Find", "Arrange", "Reveal"])
    await expect(
      page.locator(".quest-action-plan").getByText(label, { exact: true }),
    ).toBeVisible();
  const accepted = await page.evaluate(
    () => JSON.parse(localStorage.getItem("sidequest-demo-v1")!).runs[0],
  );
  await expect(page.locator(".quest-action-plan")).toContainText(
    "Arrange your objects into a tabletop gallery.",
  );
  await page.getByText("What you need & backup plan", { exact: true }).click();
  await expect(page.locator(".quest-action-plan")).toContainText(
    "Three objects you already own",
  );
  await expect(page.locator(".quest-action-plan")).toContainText(
    "Ask before using someone else’s belongings.",
  );
  await expect(page.locator(".quest-action-plan")).toContainText(
    "Draw three objects on paper and arrange the drawings.",
  );
  expect(accepted.quest.title).toBe("The tabletop color hunt");
  expect(
    accepted.quest.beats.map((beat: { label: string }) => beat.label),
  ).toEqual(["Find", "Arrange", "Reveal"]);
  await noOverflow(page);
});

test("brand proposal, creator counter, mutual terms, manual fulfillment, commercial download and suspension remain distinct", async ({
  page,
}, testInfo) => {
  await openDemo(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await persona(page, "brand");
  const offerUrl = await createOffer(page);
  await expect(
    page.getByRole("button", { name: "Accept exact terms" }),
  ).toHaveCount(0);
  await persona(page, "viewer");
  await page.goto(offerUrl);
  await page
    .locator("summary")
    .filter({ hasText: /^Counter with different terms$/ })
    .click();
  await page.getByLabel("Proposed payment (USD)", { exact: true }).fill("75");
  await page.getByRole("button", { name: "Send counteroffer" }).click();
  await expect(page.getByText("countered", { exact: true })).toBeVisible();
  await persona(page, "brand");
  await page.goto(offerUrl);
  await expect(page.getByText("$75.00", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Accept exact terms" }).click();
  await expect(
    page.getByText("pending fulfillment", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("This is not a paid transaction yet.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download licensed video" }),
  ).toHaveCount(0);
  await persona(page, "operator");
  await page.goto("/studio");
  const fulfillment = page.locator("details").filter({
    has: page
      .locator("button")
      .filter({ hasText: "Record verified fulfillment" }),
  });
  await fulfillment.locator("summary").click();
  await fulfillment
    .getByLabel("Verified payment record")
    .fill("DEMO payment verification only: no money transferred");
  await fulfillment
    .getByLabel("Verified permission or agreement record")
    .fill("DEMO agreement version 2; no real commercial permission");
  await fulfillment
    .getByRole("checkbox", {
      name: "I verified that the agreed payment is complete.",
    })
    .check();
  await fulfillment
    .getByRole("checkbox", {
      name: "I verified the accepted permissions and agreed usage period.",
    })
    .check();
  await fulfillment
    .getByRole("button", { name: "Record verified fulfillment" })
    .click();
  await expect(fulfillment).toHaveCount(0);
  await persona(page, "brand");
  await page.goto(offerUrl);
  await expect(page.getByText("completed", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Demo fulfillment recorded; no real payment occurred.", {
      exact: false,
    }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download licensed video" }).click();
  const download = await downloadPromise;
  const output = testInfo.outputPath("licensed-fixture.mp4");
  await download.saveAs(output);
  const metadata = JSON.parse(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "json",
        output,
      ],
      { encoding: "utf8" },
    ),
  );
  expect(Number(metadata.format.duration)).toBeGreaterThan(5);
  await page.screenshot({
    path: testInfo.outputPath("completed-demo-license.png"),
    fullPage: true,
  });
  await persona(page, "operator");
  await page.goto(offerUrl);
  await page
    .locator("summary")
    .filter({ hasText: /^Operator: suspend commercial request$/ })
    .click();
  await page
    .getByLabel("Reason for suspension")
    .fill(
      "Demo moderation test: stop commercial access while preserving the accepted history.",
    );
  await page
    .getByRole("button", { name: "Suspend offer & commercial access" })
    .click();
  await expect(
    page.getByText("This offer is suspended.", { exact: false }),
  ).toBeVisible();
  await persona(page, "brand");
  await page.goto(offerUrl);
  await expect(
    page.getByRole("button", { name: "Download licensed video" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("This offer is suspended.", { exact: false }),
  ).toBeVisible();
  await noOverflow(page);
});

test("creators can decline an inquiry and change profile/video availability without granting advertising use", async ({
  page,
}) => {
  await openDemo(page);
  await persona(page, "brand");
  const offerUrl = await createOffer(page);
  await persona(page, "viewer");
  await page.goto(offerUrl);
  await page
    .getByRole("button", { name: "Decline offer", exact: true })
    .click();
  await expect(page.getByText("declined", { exact: true })).toBeVisible();
  await page.goto("/profile");
  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Open to brand opportunities", exact: true })
    .uncheck();
  await page.getByRole("button", { name: "Save public profile" }).click();
  await expect(
    page.getByText("Public profile saved.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
  await expect(
    page.getByRole("checkbox", {
      name: "Open to brand opportunities",
      exact: true,
    }),
  ).not.toBeChecked();
  await persona(page, "brand");
  await page.goto(`/posts/${fixturePost}`);
  await expect(
    page.locator("summary").filter({ hasText: /^Request to use video$/ }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Open to brand offers", { exact: true }),
  ).toHaveCount(0);
  await persona(page, "viewer");
  await page.goto(`/posts/${fixturePost}`);
  await page
    .locator("summary")
    .filter({ hasText: /^Edit this public post$/ })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Open this video to brand inquiries" }),
  ).toBeChecked();
  await page
    .getByRole("checkbox", { name: "Open this video to brand inquiries" })
    .uncheck();
  await page.getByRole("button", { name: "Save post changes" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        (postId) =>
          JSON.parse(
            localStorage.getItem("sidequest-community-demo-v1")!,
          ).posts.find(
            (post: { id: string; brandOptIn: boolean }) => post.id === postId,
          ).brandOptIn,
        fixturePost,
      ),
    )
    .toBe(false);
  await expect(
    page.getByText("Open to brand offers", { exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByText("Open to brand offers", { exact: true }),
  ).toHaveCount(0);
  await persona(page, "brand");
  await page.goto(`/posts/${fixturePost}`);
  await expect(
    page.locator("summary").filter({ hasText: /^Request to use video$/ }),
  ).toHaveCount(0);
  await page.goto(`/creators/${fixtureCreator}`);
  await expect(page.locator(".creator-counts")).toContainText("1");
});
