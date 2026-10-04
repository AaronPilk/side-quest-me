import { expect, test } from "@playwright/test";
import { MAX_QUEST_ACTIVITY_MINUTES } from "../shared/domain";

for (const minimumAge of [18, 21] as const)
  test(`editing a saved ${minimumAge}+ original preserves its age floor and overnight duration`, async ({
    page,
  }) => {
    await page.addInitScript(() =>
      sessionStorage.setItem("sq-demo-started", "1"),
    );
    await page.goto("/originals/new");
    await expect(page.getByLabel("Quest title", { exact: true })).toBeVisible();
    const id = await page.evaluate(async (age) => {
      const apiPath = "/src/lib/community-api.ts";
      const catalogPath = "/shared/catalog.ts";
      const identityPath = "/shared/community.ts";
      const { communityApi } = await import(apiPath);
      const { catalog } = await import(catalogPath);
      const { originalQuestIdentity } = await import(identityPath);
      const id = crypto.randomUUID();
      await communityApi.mutate("draft_save", {
        id,
        expectedVersion: 0,
        quest: {
          ...catalog[0],
          ...originalQuestIdentity(id, 1),
          title: "Synthetic overnight original",
          minimumAge: age,
          adultOnly: true,
          durationMinutes: 1440,
        },
      });
      return id;
    }, minimumAge);

    await page.goto(`/originals/${id}`);
    const duration = page.getByLabel("Duration before travel (minutes)", {
      exact: true,
    });
    await expect(duration).toHaveValue("1440");
    await expect(duration).toHaveAttribute(
      "max",
      String(MAX_QUEST_ACTIVITY_MINUTES),
    );
    expect(
      await duration.evaluate((input: HTMLInputElement) =>
        input.checkValidity(),
      ),
    ).toBe(true);
    await page
      .getByLabel("Quest title", { exact: true })
      .fill("Edited overnight original");
    await duration.fill("1500");
    await page
      .getByRole("button", { name: "Save original quest", exact: true })
      .click();

    await expect
      .poll(async () =>
        page.evaluate(async (draftId) => {
          const apiPath = "/src/lib/community-api.ts";
          const { communityApi } = await import(apiPath);
          const draft = await communityApi.read("draft", { id: draftId });
          return {
            title: draft.quest.title,
            minimumAge: draft.quest.minimumAge,
            durationMinutes: draft.quest.durationMinutes,
            state: draft.state,
          };
        }, id),
      )
      .toEqual({
        title: "Edited overnight original",
        minimumAge,
        durationMinutes: 1500,
        state: "draft",
      });

    await page.reload();
    await expect(duration).toHaveValue("1500");
    await duration.fill(String(MAX_QUEST_ACTIVITY_MINUTES + 1));
    expect(
      await duration.evaluate(
        (input: HTMLInputElement) => input.validity.rangeOverflow,
      ),
    ).toBe(true);
  });
