jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { version: "1.2.3" } } }));

import { __resetUpgradeForTests, appHeaders, isUpgradeRequired, noteResponseStatus, subscribeUpgradeRequired } from "./app-headers";

beforeEach(() => __resetUpgradeForTests());

describe("appHeaders", () => {
  it("identifies the mobile client and its version", () => {
    expect(appHeaders()).toEqual({ "X-App-Client": "mobile", "X-App-Version": "1.2.3" });
  });
});

describe("upgrade-required store", () => {
  it("flips once on a 426 and notifies listeners", () => {
    const listener = jest.fn();
    const unsubscribe = subscribeUpgradeRequired(listener);
    noteResponseStatus(200);
    noteResponseStatus(401);
    expect(isUpgradeRequired()).toBe(false);
    noteResponseStatus(426);
    noteResponseStatus(426);
    expect(isUpgradeRequired()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
