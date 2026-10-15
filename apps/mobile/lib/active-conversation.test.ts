import { getActiveConversation, notificationPresentation, setActiveConversation } from "./active-conversation";

describe("active conversation", () => {
  afterEach(() => setActiveConversation(null));
  it("remembers the chat on screen", () => {
    setActiveConversation("c-1");
    expect(getActiveConversation()).toBe("c-1");
    setActiveConversation(null);
    expect(getActiveConversation()).toBeNull();
  });
});

describe("notificationPresentation", () => {
  it("hides the banner and sound for the chat already open", () => {
    expect(notificationPresentation({ type: "new_message", conversationId: "c-1" }, "c-1")).toEqual({
      shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: true,
    });
  });
  it("shows everything for other chats and other types", () => {
    const shown = { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true };
    expect(notificationPresentation({ type: "new_message", conversationId: "c-2" }, "c-1")).toEqual(shown);
    expect(notificationPresentation({ type: "closure_overdue", contactId: "x" }, "c-1")).toEqual(shown);
    expect(notificationPresentation(null, null)).toEqual(shown);
  });
});
