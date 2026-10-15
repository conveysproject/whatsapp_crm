const mockSetBadge = jest.fn();
jest.mock("expo-notifications", () => ({ setBadgeCountAsync: (...a: unknown[]) => mockSetBadge(...a) }));
jest.mock("./api-context", () => ({ useApi: () => jest.fn() }));
import { setBadgeFromCount } from "./badge";

describe("setBadgeFromCount", () => {
  beforeEach(() => mockSetBadge.mockReset());
  it("sets the OS badge to the count", async () => {
    await setBadgeFromCount(4);
    expect(mockSetBadge).toHaveBeenCalledWith(4);
  });
  it("does nothing until the count is known and never throws", async () => {
    await setBadgeFromCount(undefined);
    expect(mockSetBadge).not.toHaveBeenCalled();
    mockSetBadge.mockRejectedValueOnce(new Error("no permission"));
    await expect(setBadgeFromCount(1)).resolves.toBeUndefined();
  });
});
