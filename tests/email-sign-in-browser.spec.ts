import { test, expect } from "@playwright/test";

for (const rateLimited of [false, true]) {
  test(`email sign-in ${rateLimited ? "rate limiting explains recovery" : "success prevents immediate resends"}`, async ({
    page,
  }) => {
    await page.clock.install();
    await page.route(/\/src\/lib\/auth\.ts(?:\?.*)?$/, (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: `
          export const DEMO=false;
          export const accessToken=async()=>undefined;
          window.__sqOtpSends=0;
          export const supabase={auth:{
            getSession:async()=>({data:{session:null}}),
            onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
            signInWithOtp:async()=>{
              window.__sqOtpSends++;
              return {error:${rateLimited ? '{code:"over_email_send_rate_limit",message:"private-provider-detail"}' : "null"}};
            }
          }};
        `,
      }),
    );
    await page.goto("/");
    await page
      .getByRole("textbox", { name: "Your email" })
      .fill("auth-fixture@example.test");
    await page.getByRole("button", { name: "Find my first quest" }).click();
    const cooldown = page.getByRole("button", { name: /^Resend in \d+s$/ });
    await expect(cooldown).toBeDisabled();
    if (rateLimited) {
      await expect(page.getByRole("alert")).toContainText(
        "Open the newest sign-in link if you have one",
      );
      await expect(page.getByRole("alert")).not.toContainText(
        "private-provider-detail",
      );
    } else {
      await expect(page.getByRole("status")).toContainText("Check your email");
    }
    // Even a form submit dispatched outside the disabled button cannot resend.
    await page.locator(".welcome > form").dispatchEvent("submit");
    expect(
      await page.evaluate(
        () => (window as unknown as { __sqOtpSends: number }).__sqOtpSends,
      ),
    ).toBe(1);
    await page.clock.runFor(60_000);
    await expect(
      page.getByRole("button", { name: "Find my first quest" }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Find my first quest" }).click();
    expect(
      await page.evaluate(
        () => (window as unknown as { __sqOtpSends: number }).__sqOtpSends,
      ),
    ).toBe(2);
  });
}
