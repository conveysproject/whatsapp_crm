import { renderHook } from "@testing-library/react-native";
import { useResetOnUserChange } from "./use-reset-on-user-change";

async function setup(initialId: string | null | undefined) {
  const onChange = jest.fn();
  const hook = await renderHook(({ id }: { id: string | null | undefined }) => useResetOnUserChange(id, onChange), {
    initialProps: { id: initialId },
  });
  return { onChange, rerender: (id: string | null | undefined) => hook.rerender({ id }) };
}

describe("useResetOnUserChange", () => {
  it("does not call onChange on the first render", async () => {
    const { onChange } = await setup("A");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not call onChange when the same user id re-renders", async () => {
    const { onChange, rerender } = await setup("A");
    await rerender("A");
    await rerender("A");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("calls onChange once when the user signs out (A -> null)", async () => {
    const { onChange, rerender } = await setup("A");
    await rerender(null);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("calls onChange once when a user signs in (null -> B)", async () => {
    const { onChange, rerender } = await setup(null);
    await rerender("B");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("calls onChange once when a different user signs in (A -> B)", async () => {
    const { onChange, rerender } = await setup("A");
    await rerender("B");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("does not call onChange while the user is still loading (undefined -> A)", async () => {
    const { onChange, rerender } = await setup(undefined);
    await rerender("A");
    expect(onChange).not.toHaveBeenCalled();
  });
});
