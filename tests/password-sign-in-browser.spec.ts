import { test, expect } from "@playwright/test";

for (const outcome of ["success", "invalid", "network"]) {
  test(`ordinary password sign-in handles ${outcome} through the existing auth flow`, async ({
    page,
  }) => {
    await page.route(/\/src\/lib\/auth\.ts(?:\?.*)?$/, (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: `
          export const DEMO=false;
          let session=null;
          const listeners=new Set();
          window.__sqPasswordCalls=0;
          export const accessToken=async()=>session?.access_token;
          export const supabase={auth:{
            getSession:async()=>({data:{session},error:null}),
            onAuthStateChange:handler=>{
              listeners.add(handler);
              return {data:{subscription:{unsubscribe(){listeners.delete(handler)}}}};
            },
            signInWithOtp:async()=>({error:null}),
            signInWithPassword:async credentials=>{
              window.__sqPasswordCalls++;
              window.__sqCredentialsCorrect=credentials.email==='existing@example.test'&&credentials.password==='fixture-password';
              await new Promise(resolve=>{window.__sqReleasePassword=resolve});
              ${outcome === "network" ? 'throw Error("private-provider-detail")' : ""}
              ${outcome === "invalid" ? 'return {error:{code:"invalid_credentials",message:"private-provider-detail"}}' : ""}
              session={access_token:'password-fixture-token',user:{id:'11111111-1111-4111-8111-111111111111'}};
              for(const listener of listeners)listener('SIGNED_IN',session);
              return {data:{session},error:null};
            }
          }};
        `,
      }),
    );
    // Account security is reachable even for an account without onboarding.
    // Successful authentication must use the ordinary requested route.
    await page.goto("/account/security");
    const disclosure = page.locator(".email-password-sign-in");
    const summary = disclosure.locator("summary");
    await expect(disclosure.getByLabel("Account email")).not.toBeVisible();
    expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await summary.click();
    const form = page.getByRole("form", { name: "Password sign-in" });
    await expect(form.getByLabel("Account email")).toHaveAttribute(
      "autocomplete",
      "username",
    );
    await expect(form.getByLabel("Password", { exact: true })).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
    await form.getByLabel("Account email").fill("existing@example.test");
    await form.getByLabel("Password", { exact: true }).fill("fixture-password");
    await form.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      form.getByRole("button", { name: "Signing in…" }),
    ).toBeDisabled();
    await form.dispatchEvent("submit");
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { __sqPasswordCalls: number })
            .__sqPasswordCalls,
      ),
    ).toBe(1);
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { __sqCredentialsCorrect: boolean })
            .__sqCredentialsCorrect,
      ),
    ).toBe(true);
    await page.evaluate(() =>
      (
        window as unknown as { __sqReleasePassword: () => void }
      ).__sqReleasePassword(),
    );
    if (outcome === "success") {
      await expect(
        page.getByRole("heading", { name: "Account settings", exact: true }),
      ).toBeVisible();
      await expect(page).toHaveURL(/\/account\/security$/);
      await expect(
        page.getByRole("button", { name: "Sign out" }),
      ).toBeVisible();
      await expect(disclosure).toHaveCount(0);
    } else {
      await expect(form.getByRole("alert")).toHaveText(
        "Could not sign in. Check your email and password, then try again.",
      );
      await expect(form.getByRole("alert")).not.toContainText(
        "private-provider-detail",
      );
      await expect(
        form.getByRole("button", { name: "Sign in", exact: true }),
      ).toBeEnabled();
      await expect(
        page.getByRole("heading", { name: "Account settings", exact: true }),
      ).toHaveCount(0);
      await page.setViewportSize({ width: 320, height: 844 });
      await page.addStyleTag({
        content: "html { font-size: 170% !important; }",
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
    }
  });
}
