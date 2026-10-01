import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_OUTING, outingSchema, type Outing } from "../shared/domain";

async function prepare(
  page: Page,
  configured = true,
  failFirst = false,
  holdFirst = false,
  provider: "xai" | "openai" = "xai",
  initialOuting?: Outing,
) {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore the demo first" }).click();
  // Load the actual lazy client module before mocking it. A running Vite server
  // may use a timestamped module URL after other AI source edits.
  await page.getByRole("link", { name: "Draft with AI", exact: true }).click();
  await expect(page.locator(".ai-draft-helper")).toBeVisible();
  await page.evaluate(
    async ({ configured, failFirst, holdFirst, provider }) => {
      const apiPath =
        performance
          .getEntriesByType("resource")
          .filter(
            (entry) =>
              new URL(entry.name).pathname === "/src/lib/ai-quest-api.ts",
          )
          .reverse()[0]?.name ?? "/src/lib/ai-quest-api.ts";
      const catalogPath = "/shared/catalog.ts";
      const communityPath = "/shared/community.ts";
      const { aiQuestApi } = await import(apiPath);
      const { catalog } = await import(catalogPath);
      const { originalQuestIdentity } = await import(communityPath);
      const fixtureWindow = window as typeof window & {
        __aiDraftCalls: Record<string, unknown>[];
        __resolveAiDraft?: () => void;
        __rejectAiDraft?: (error: Error) => void;
      };
      fixtureWindow.__aiDraftCalls = [];
      aiQuestApi.config = async () => ({
        configured,
        provider: configured ? provider : null,
        model: configured
          ? provider === "openai"
            ? "mocked-openai-model"
            : "grok-4.7"
          : null,
      });
      aiQuestApi.draft = async (input: Record<string, unknown>) => {
        fixtureWindow.__aiDraftCalls.push(input);
        if (holdFirst && fixtureWindow.__aiDraftCalls.length === 1)
          await new Promise<void>((resolve, reject) => {
            fixtureWindow.__resolveAiDraft = resolve;
            fixtureWindow.__rejectAiDraft = reject;
          });
        if (failFirst && fixtureWindow.__aiDraftCalls.length === 1)
          throw new Error(
            "Mocked provider unavailable. Your draft is unchanged.",
          );
        const outing = input.outing as {
          category: string;
          intensity: string;
          participants: number;
          setting: string;
          group: string;
        };
        const base =
          catalog.find(
            (quest: { category: string; intensity: string }) =>
              quest.category === outing.category &&
              quest.intensity === outing.intensity,
          ) || catalog[0];
        return {
          draftId: input.draftId,
          provider,
          model: provider === "openai" ? "mocked-openai-model" : "grok-4.7",
          generatedAt: "2026-10-01T14:00:00.000Z",
          quest: {
            ...base,
            ...originalQuestIdentity(input.draftId, 1),
            title: "The violet trail reveal",
            hook: "Use three patterns you spot to make one reveal.",
            category: outing.category,
            intensity: outing.intensity,
            minParticipants: outing.participants,
            maxParticipants: outing.participants,
            allowedGroups: [outing.group],
            settings: [outing.setting],
            cost: {
              minMinor: 0,
              maxMinor: 0,
              scope: "total",
              currency: "USD",
              venueCostUnknown: false,
              note: "No purchase needed.",
            },
            materials: [],
            requirements: [
              "Stay in a permitted area and film only your own group.",
            ],
            completionQuestions: ["Did you finish the reveal?"],
            fallback: "Try the same pattern game at home.",
            beats: [
              {
                label: "The goal",
                action: "Agree on a pattern to find together.",
                filming: "Show the blank three-item list before filling it.",
                caption: "Can we find all three?",
              },
              {
                label: "The search",
                action:
                  "Find and note three matching patterns without approaching bystanders.",
                filming: "Record your own examples and group's reactions.",
                caption: "One more to go",
              },
              {
                label: "The reveal",
                action:
                  "Compare your examples and pick your favorite together.",
                filming:
                  "Return to the same list framing and reveal the completed items.",
                caption: "Three patterns, one reveal",
              },
            ],
          },
        };
      };
    },
    { configured, failFirst, holdFirst, provider },
  );
  if (initialOuting)
    await page.evaluate(
      (outing) => sessionStorage.setItem("sq-outing", JSON.stringify(outing)),
      initialOuting,
    );
  await page.getByRole("link", { name: "Create", exact: true }).first().click();
  await page.getByRole("link", { name: "Draft with AI", exact: true }).click();
}
const calls = (page: Page) =>
  page.evaluate(
    () =>
      (window as typeof window & { __aiDraftCalls: Record<string, unknown>[] })
        .__aiDraftCalls,
  );

test("AI quest proposal requires Grok consent and stays unsaved until the editable original is saved", async ({
  page,
}) => {
  await prepare(page);
  await page
    .getByRole("textbox", { name: "Your idea", exact: true })
    .fill("An outdoor date with a pattern reveal");
  await page.getByRole("button", { name: "Shape the plan" }).click();
  await page
    .getByRole("group", { name: "AI quest energy", exact: true })
    .getByRole("button", { name: "Full Send", exact: true })
    .click();
  await page
    .getByRole("group", { name: "AI quest group", exact: true })
    .getByRole("button", { name: "A couple", exact: true })
    .click();
  await page
    .getByRole("group", { name: "AI quest setting", exact: true })
    .getByRole("button", { name: "Outside", exact: true })
    .click();
  const create = page.getByRole("button", {
    name: "Create a proposal",
    exact: true,
  });
  await expect(create).toBeDisabled();
  expect(await calls(page)).toEqual([]);
  await page
    .getByRole("checkbox", {
      name: /Send my brief, this plan and confirmed preferences to xAI/,
    })
    .check();
  await create.click();
  await expect(
    page.getByRole("heading", { name: "The violet trail reveal", exact: true }),
  ).toBeVisible();
  expect(await calls(page)).toHaveLength(1);
  expect((await calls(page))[0]).toMatchObject({
    provider: "xai",
    providerConsent: true,
    outing: {
      participants: 2,
      group: "couple",
      intensity: "full_send",
      setting: "outside",
      adultEligible: false,
      adultContext: false,
      venuePermission: false,
      arrangementConfirmed: false,
    },
  });
  await expect(
    page.getByRole("button", { name: "Save original quest", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Use editable draft", exact: true })
    .click();
  await expect(page.getByLabel("Quest title", { exact: true })).toHaveValue(
    "The violet trail reveal",
  );
  await expect(
    page.getByText("Nothing has been saved or published yet.", {
      exact: false,
    }),
  ).toBeVisible();
  await page
    .getByLabel("Quest title", { exact: true })
    .fill("Our pattern trail");
  await page
    .getByRole("button", { name: "Save original quest", exact: true })
    .click();
  await expect(page).toHaveURL(/\/originals\/[a-f0-9-]+$/);
  await expect(
    page.getByRole("button", {
      name: "Submit saved quest for review",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Quest title", { exact: true })).toHaveValue(
    "Our pattern trail",
  );
  await expect(
    page.getByLabel("Minimum participants", { exact: true }),
  ).toHaveValue("2");
  await expect(
    page.getByLabel("On-screen caption", { exact: true }).first(),
  ).toHaveValue("Can we find all three?");
});

test("venue AI drafts default to no adult context and send only explicitly confirmed nightlife choices", async ({
  page,
}) => {
  await prepare(page);
  await page
    .getByRole("textbox", { name: "Your idea", exact: true })
    .fill("A lively night out for five friends");
  await page.getByRole("button", { name: "Shape the plan" }).click();
  await page
    .getByRole("group", { name: "AI quest group", exact: true })
    .getByRole("button", { name: "Friends", exact: true })
    .click();
  await page.getByRole("spinbutton", { name: "Number of people" }).fill("5");
  await page
    .getByRole("group", { name: "AI quest setting", exact: true })
    .getByRole("button", { name: "At a venue", exact: true })
    .click();
  const age = page.getByRole("group", {
    name: "AI quest age eligibility",
    exact: true,
  });
  const permission = page.getByRole("group", {
    name: "AI quest venue permission",
    exact: true,
  });
  const nightlife = page.getByRole("group", {
    name: "AI quest adult nightlife",
    exact: true,
  });
  await expect(
    age.getByRole("button", { name: "Not confirmed" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(permission).toHaveCount(0);
  await expect(nightlife).toHaveCount(0);
  await page.getByRole("checkbox", { name: /Send my brief/ }).check();
  await page
    .getByRole("button", { name: "Create a proposal", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Change the plan" }),
  ).toBeVisible();
  expect(outingSchema.parse((await calls(page))[0].outing)).toMatchObject({
    group: "friends",
    participants: 5,
    setting: "venue",
    adultEligible: false,
    adultContext: false,
    venuePermission: false,
  });
  await page.getByRole("button", { name: "Change the plan" }).click();
  await age.getByRole("button", { name: "Adults and eligible" }).click();
  await expect(nightlife).toHaveCount(0);
  await expect(
    permission.getByRole("button", { name: "Not confirmed" }),
  ).toHaveAttribute("aria-pressed", "true");
  await permission.getByRole("button", { name: "We have permission" }).click();
  await expect(
    nightlife.getByRole("button", { name: "Skip it" }),
  ).toHaveAttribute("aria-pressed", "true");
  await nightlife.getByRole("button", { name: "Include it" }).click();
  await nightlife.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: ".local/ai-evidence/ai-draft-adult-options-mocked.png",
  });
  await page
    .getByRole("button", { name: "Create a proposal", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Change the plan" }),
  ).toBeVisible();
  expect(outingSchema.parse((await calls(page))[1].outing)).toMatchObject({
    group: "friends",
    participants: 5,
    adultEligible: true,
    adultContext: true,
    venuePermission: true,
  });
  await page.getByRole("button", { name: "Change the plan" }).click();
  await age.getByRole("button", { name: "Not confirmed" }).click();
  await expect(nightlife).toHaveCount(0);
  await page
    .getByRole("button", { name: "Create a proposal", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Change the plan" }),
  ).toBeVisible();
  expect(outingSchema.parse((await calls(page))[2].outing)).toMatchObject({
    adultEligible: false,
    adultContext: false,
  });
});

for (const change of ["group", "participants", "outside", "home"] as const) {
  test(`changing AI draft ${change} clears inherited confirmations while unchanged selections keep them`, async ({
    page,
  }) => {
    await prepare(page, true, false, false, "xai", {
      ...DEFAULT_OUTING,
      group: "friends",
      participants: 5,
      setting: "venue",
      adultEligible: true,
      adultContext: true,
      venuePermission: true,
      arrangementConfirmed: true,
      confirmedVenueCostMinor: 1200,
      transport: "transit",
      travelMinutes: 20,
      travelCostMinor: 500,
    });
    await page
      .getByRole("textbox", { name: "Your idea", exact: true })
      .fill("An unexpected challenge for our group");
    await page.getByRole("button", { name: "Shape the plan" }).click();
    const group = page.getByRole("group", {
      name: "AI quest group",
      exact: true,
    });
    const setting = page.getByRole("group", {
      name: "AI quest setting",
      exact: true,
    });
    await group.getByRole("button", { name: "Friends", exact: true }).click();
    await page.getByRole("spinbutton", { name: "Number of people" }).fill("5");
    await setting
      .getByRole("button", { name: "At a venue", exact: true })
      .click();
    await expect(
      page
        .getByRole("group", { name: "AI quest adult nightlife", exact: true })
        .getByRole("button", { name: "Include it" }),
    ).toHaveAttribute("aria-pressed", "true");
    if (change === "group")
      await group.getByText("Just me", { exact: true }).click();
    else if (change === "participants")
      await page
        .getByRole("spinbutton", { name: "Number of people" })
        .fill("6");
    else
      await setting
        .getByText(change === "home" ? "At home" : "Outside", { exact: true })
        .click();
    await expect(
      page.getByRole("group", {
        name: "AI quest adult nightlife",
        exact: true,
      }),
    ).toHaveCount(0);
    await page.getByRole("checkbox", { name: /Send my brief/ }).check();
    await page
      .getByRole("button", { name: "Create a proposal", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Use editable draft" }),
    ).toBeVisible();
    const outing = outingSchema.parse((await calls(page))[0].outing);
    expect(outing).toMatchObject({
      adultEligible: false,
      adultContext: false,
      venuePermission: false,
      arrangementConfirmed: false,
      confirmedVenueCostMinor: null,
    });
    if (change === "home")
      expect(outing).toMatchObject({
        setting: "home",
        travelMinutes: 0,
        travelCostMinor: 0,
        transport: "none",
      });
  });
}

test("AI draft failure preserves the brief and offers another try", async ({
  page,
}) => {
  await prepare(page, true, true);
  await page
    .getByRole("textbox", { name: "Your idea", exact: true })
    .fill("A pattern reveal date");
  await page.getByRole("button", { name: "Shape the plan" }).click();
  await page.getByRole("checkbox", { name: /Send my brief/ }).check();
  await page
    .getByRole("button", { name: "Create a proposal", exact: true })
    .click();
  await expect(
    page.getByText("Mocked provider unavailable. Your draft is unchanged.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Your idea", exact: true }),
  ).toHaveValue("A pattern reveal date");
  await page.getByRole("button", { name: "Shape the plan" }).click();
  await page
    .getByRole("button", { name: "Create a proposal", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Use editable draft", exact: true }),
  ).toBeVisible();
});

test("unconfigured AI offers a working manual draft without pretending to generate", async ({
  page,
}) => {
  await prepare(page, false);
  await expect(
    page.getByText("AI quest drafting isn’t connected yet.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Write my own quest", exact: true })
    .click();
  await expect(page.getByLabel("Quest title", { exact: true })).toBeVisible();
  expect(await calls(page)).toEqual([]);
});

test("AI draft explains a pending comparison without inventing progress or accepting duplicate requests", async ({
  page,
}) => {
  await prepare(page, true, false, true, "openai");
  await page
    .getByRole("textbox", { name: "Your idea", exact: true })
    .fill("A creative outdoor date with one unexpected reveal");
  await page.getByRole("button", { name: "Shape the plan" }).click();
  await page
    .getByRole("checkbox", {
      name: /Send my brief, this plan and confirmed preferences to OpenAI/,
    })
    .check();
  const create = page.getByRole("button", {
    name: "Create a proposal",
    exact: true,
  });
  await create.click();
  const status = page.locator(".ai-draft-busy");
  await expect(status).toHaveAttribute("role", "status");
  await expect(status).toHaveAttribute("aria-live", "polite");
  await expect(status).toHaveAttribute("aria-atomic", "true");
  await expect(status).toHaveText(
    "Comparing ideas and checking the plan. This can take up to 90 seconds.",
  );
  await expect(status).toBeVisible();
  await status.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: ".local/ai-evidence/ai-draft-busy-mocked.png",
  });
  await expect(create).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Back", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("checkbox", { name: /Send my brief/ }),
  ).toBeDisabled();
  await expect(
    page.getByRole("slider", { name: "AI quest budget" }),
  ).toBeDisabled();
  await expect(page.locator(".ai-draft-progress")).toHaveAttribute(
    "aria-label",
    "Step 2 of 3",
  );
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  // Disabled controls also reject scripted activation while the request is pending.
  await create.evaluate((button: HTMLButtonElement) => button.click());
  expect(await calls(page)).toHaveLength(1);
  expect((await calls(page))[0]).toMatchObject({
    provider: "openai",
    providerConsent: true,
  });
  await expect(
    page.getByRole("button", { name: "Save original quest", exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() =>
    (
      window as typeof window & { __resolveAiDraft?: () => void }
    ).__resolveAiDraft?.(),
  );
  await expect(status).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Use editable draft", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".ai-draft-progress")).toHaveAttribute(
    "aria-label",
    "Step 3 of 3",
  );
  expect(await calls(page)).toHaveLength(1);
});

test("a pending AI draft failure clears its busy state and permits a real retry", async ({
  page,
}) => {
  await prepare(page, true, false, true);
  await page
    .getByRole("textbox", { name: "Your idea", exact: true })
    .fill("A pattern reveal date");
  await page.getByRole("button", { name: "Shape the plan" }).click();
  await page.getByRole("checkbox", { name: /Send my brief/ }).check();
  const create = page.getByRole("button", {
    name: "Create a proposal",
    exact: true,
  });
  await create.click();
  await expect(page.locator(".ai-draft-busy")).toBeVisible();
  await page.evaluate(() =>
    (
      window as typeof window & {
        __rejectAiDraft?: (error: Error) => void;
      }
    ).__rejectAiDraft?.(new Error("Mocked comparison unavailable. Try again.")),
  );
  await expect(page.locator(".ai-draft-busy")).toHaveCount(0);
  await expect(
    page.getByRole("alert").filter({
      hasText: "Mocked comparison unavailable. Try again.",
    }),
  ).toBeVisible();
  await expect(create).toBeEnabled();
  await create.click();
  await expect(
    page.getByRole("button", { name: "Use editable draft", exact: true }),
  ).toBeVisible();
  expect(await calls(page)).toHaveLength(2);
});
