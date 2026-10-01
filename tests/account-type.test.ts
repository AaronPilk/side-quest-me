import { describe, expect, it } from "vitest";
import {
  hasBusinessWorkspace,
  isBrandAccount,
  normalizeAccountType,
} from "../shared/account";
import {
  DEFAULT_PREFERENCES,
  profilePatchSchema,
  profileSchema,
} from "../shared/domain";
import { profileDto } from "../worker/services";

describe("account intent remains distinct from approval", () => {
  it("keeps missing historical choices unknown except an actual approved brand", () => {
    expect(normalizeAccountType(undefined)).toBeNull();
    expect(normalizeAccountType(null, { state: "pending" })).toBeNull();
    expect(normalizeAccountType(undefined, { state: "rejected" })).toBeNull();
    expect(normalizeAccountType(undefined, { state: "approved" })).toBe(
      "brand",
    );
    expect(isBrandAccount({ accountType: null, brand: null })).toBe(false);
  });
  it("honors an explicit personal selection over an approved business", () => {
    expect(
      isBrandAccount({ accountType: "personal", brand: { state: "approved" } }),
    ).toBe(false);
    expect(
      isBrandAccount({ accountType: "brand", brand: { state: "pending" } }),
    ).toBe(true);
    expect(normalizeAccountType("operator", { state: "approved" })).toBeNull();
    expect(normalizeAccountType("merchant")).toBeNull();
  });
  it("defaults full legacy profiles to unknown without making PATCH reset them", () => {
    const value = profileSchema.parse({
      displayName: "Alex",
      timezone: "UTC",
      locale: "en-US",
      summary: "",
      preferences: DEFAULT_PREFERENCES,
      onboardingCompleted: true,
    });
    expect(value.accountType).toBeNull();
    expect(profilePatchSchema.parse({ summary: "Edited" })).toEqual({
      summary: "Edited",
    });
    expect(profilePatchSchema.parse({ accountType: "brand" })).toEqual({
      accountType: "brand",
    });
    expect(profilePatchSchema.parse({ accountType: null })).toEqual({
      accountType: null,
    });
    expect(profilePatchSchema.safeParse({}).success).toBe(false);
    expect(
      profilePatchSchema.safeParse({ accountType: "operator" }).success,
    ).toBe(false);
  });
  it("serializes only the database account intent, not a role or imported prose", () => {
    expect(profileDto({ account_type: "brand" }).accountType).toBe("brand");
    expect(
      profileDto({
        account_type: "personal",
        imported_summary: "We run a brand",
      }).accountType,
    ).toBe("personal");
    expect(
      profileDto({ account_type: null, role: "operator" }).accountType,
    ).toBeNull();
    expect(profileDto({}).accountType).toBeNull();
  });
});

describe("business workspace access is routing, not approval", () => {
  it("opens for explicit brand accounts and for unstated accounts that already applied", () => {
    expect(hasBusinessWorkspace({ accountType: "brand", brand: null })).toBe(
      true,
    );
    for (const state of ["pending", "rejected", "approved"])
      expect(
        hasBusinessWorkspace({ accountType: null, brand: { state } }),
      ).toBe(true);
    expect(hasBusinessWorkspace({ accountType: undefined, brand: null })).toBe(
      false,
    );
    expect(hasBusinessWorkspace(null)).toBe(false);
  });
  it("never opens for an explicit personal choice, whatever the business state", () => {
    expect(
      hasBusinessWorkspace({
        accountType: "personal",
        brand: { state: "approved" },
      }),
    ).toBe(false);
    // Workspace routing stays separate from the product-intent inference.
    expect(
      isBrandAccount({ accountType: null, brand: { state: "pending" } }),
    ).toBe(false);
  });
});
