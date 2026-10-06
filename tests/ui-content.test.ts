import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Link } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { Empty, PageTitle } from "../src/components/ui";

describe("shared UI description content", () => {
  it("keeps paragraphs and actions valid in an empty state", () => {
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(Empty, {
          title: "A series starts with a quest you did.",
          children: [
            createElement(
              "p",
              { key: "description" },
              "Film your first quest.",
            ),
            createElement(
              Link,
              { key: "action", to: "/create", className: "button" },
              "Find a quest",
            ),
          ],
        }),
      ),
    );
    expect(markup).toContain("<p>Film your first quest.</p>");
    expect(markup).toContain('href="/create"');
    expect(markup).not.toMatch(/<p>\s*<p>/);
    expect(markup).not.toMatch(/<\/a>\s*<\/p>/);
  });

  it("accepts block content in a page title without enclosing it in a paragraph", () => {
    const markup = renderToStaticMarkup(
      createElement(PageTitle, {
        title: "Your story",
        children: createElement(
          "section",
          null,
          createElement("p", null, "Your next chapter."),
          createElement("button", { type: "button" }, "Continue"),
        ),
      }),
    );
    expect(markup).toContain("<section><p>Your next chapter.</p><button");
    expect(markup).not.toMatch(/<p>\s*<section>/);
  });

  it("retains simple descriptions and optional empty-state actions", () => {
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(Empty, {
          title: "No stories yet",
          children: "Your finished stories will appear here.",
          to: "/create",
          action: "Create a story",
        }),
        createElement(PageTitle, {
          title: "Rewards",
          children: "Your progress.",
        }),
      ),
    );
    expect(markup).toContain("Your finished stories will appear here.");
    expect(markup).toContain('href="/create"');
    expect(markup).toContain("Create a story");
    expect(markup).toContain("Your progress.");
  });
});
