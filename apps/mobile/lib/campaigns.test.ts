import { availableActions, progress, statusStyle, type CampaignStats } from "./campaigns";

const stats = (p: Partial<CampaignStats>): CampaignStats => ({ sent: 0, accepted: 0, delivered: 0, played: 0, read: 0, failed: 0, pending: 0, expired: 0, ...p });

describe("statusStyle", () => {
  it("labels every display status", () => {
    expect(statusStyle("running").label).toBe("Running");
    expect(statusStyle("upcoming").label).toBe("Scheduled");
    expect(statusStyle("aborted").label).toBe("Aborted");
  });
});

describe("availableActions", () => {
  it("running → pause and abort; paused → resume and abort", () => {
    expect(availableActions("running", stats({}))).toEqual(["pause", "abort"]);
    expect(availableActions("paused", stats({}))).toEqual(["resume", "abort"]);
  });
  it("offers retry when messages failed and the campaign isn't aborted", () => {
    expect(availableActions("completed", stats({ failed: 3 }))).toEqual(["retry"]);
    expect(availableActions("running", stats({ failed: 1 }))).toEqual(["pause", "abort", "retry"]);
    expect(availableActions("aborted", stats({ failed: 2 }))).toEqual([]);
    expect(availableActions("completed", null)).toEqual([]);
  });
});

describe("progress", () => {
  it("counts every recipient that left pending", () => {
    expect(progress(stats({ sent: 10, delivered: 50, read: 20, failed: 5, pending: 15 }))).toEqual({ done: 85, total: 100, percent: 85 });
    expect(progress(stats({}))).toEqual({ done: 0, total: 0, percent: 0 });
  });
});
