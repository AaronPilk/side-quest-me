import { describe, expect, it } from "vitest";
import { TakeClock, filmingGuide } from "../src/lib/capture-session";
import { catalog } from "../shared/catalog";

describe("segmented capture", () => {
  it("counts filmed time across takes, excluding paused and background time", () => {
    const clock = new TakeClock();
    clock.resume(1000);
    clock.pause(4000);
    expect(clock.seconds(60000)).toBe(3);
    clock.pause(60000);
    clock.resume(61000);
    clock.resume(63000);
    expect(clock.seconds(65000)).toBe(7);
    clock.pause(65000);
    expect(clock.takes).toEqual([3, 4]);
    expect(clock.seconds(500000)).toBe(7);
  });

  it("starts empty and finalizes an interrupted take only once", () => {
    const clock = new TakeClock();
    expect(clock.seconds(5000)).toBe(0);
    clock.pause(5000);
    clock.resume(6000);
    clock.pause(7600);
    clock.pause(8000);
    expect(clock.takes).toEqual([1.6]);
    expect(clock.seconds(10000)).toBe(1.6);
  });

  it("uses each quest's actual hook, actions and filming directions", () => {
    for (const quest of catalog) {
      const opening = filmingGuide(quest, 0);
      const action = filmingGuide(quest, 1);
      const ending = filmingGuide(quest, 2);
      expect(opening.prompt).toBe(quest.hook);
      expect(opening.shot).toBe(quest.beats[0].filming);
      expect(action.prompt).toBe(quest.beats[1].action);
      expect(action.shot).toBe(quest.beats[1].filming);
      expect(ending.prompt).toBe(quest.beats[2].action);
      expect(ending.shot).toBe(quest.beats[2].filming);
      expect(ending.tip).toContain(quest.beats[0].label);
      expect(ending.tip).toContain("Keep reactions real");
    }
  });
});
