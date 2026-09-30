export const DEMO_PEOPLE = {
  creator: {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Demo creator",
    role: "Creator",
  },
  viewer: {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Another demo creator",
    role: "Second creator",
  },
  brand: {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Demo brand representative",
    role: "Brand",
  },
  operator: {
    id: "44444444-4444-4444-8444-444444444444",
    name: "Demo operator",
    role: "Operator",
  },
} as const;
export type DemoPersona = keyof typeof DEMO_PEOPLE;
export function demoPersona(): DemoPersona {
  try {
    const value = localStorage.getItem("sidequest-demo-persona");
    return value && value in DEMO_PEOPLE ? (value as DemoPersona) : "creator";
  } catch {
    return "creator";
  }
}
export function demoActor() {
  return DEMO_PEOPLE[demoPersona()];
}
export function demoDataKey(persona: DemoPersona = demoPersona()) {
  return persona === "creator"
    ? "sidequest-demo-v1"
    : `sidequest-demo-v1:${persona}`;
}

/** The local renderer is shared by all four personas; resetting it resets their browser records together. */
export function resetDemoState() {
  for (const persona of Object.keys(DEMO_PEOPLE) as DemoPersona[])
    localStorage.removeItem(demoDataKey(persona));
  localStorage.removeItem("sidequest-community-demo-v1");
  localStorage.removeItem("sidequest-series-demo-v1");
  localStorage.removeItem("sidequest-social-demo-v1");
  localStorage.removeItem("sidequest-demo-persona");
  for (const key of [
    "sq-profile-draft",
    "sq-outing",
    "sq-quest-flow",
    "sq-demo-started",
    "sq-return-to",
  ])
    sessionStorage.removeItem(key);
  window.dispatchEvent(new Event("sidequest-change"));
}
export function switchDemoPersona(value: DemoPersona) {
  localStorage.setItem("sidequest-demo-persona", value);
  sessionStorage.removeItem("sq-profile-draft");
  sessionStorage.removeItem("sq-outing");
  sessionStorage.removeItem("sq-quest-flow");
  sessionStorage.removeItem("sq-return-to");
  sessionStorage.setItem("sq-demo-started", "1");
  location.assign("/discover");
}
