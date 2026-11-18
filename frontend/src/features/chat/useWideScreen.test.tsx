import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useWideScreen } from "./useWideScreen";
it("uses the current viewport even if it changes before the listener attaches", () => {
  const original = Object.getOwnPropertyDescriptor(window, "matchMedia");
  let wide = true;
  let listener: () => void = () => {};
  const remove = vi.fn();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({
      get matches() {
        return wide;
      },
      addEventListener: (_name: string, callback: () => void) => {
        wide = false;
        listener = callback;
      },
      removeEventListener: remove,
    }),
  });
  try {
    const view = renderHook(useWideScreen);
    expect(view.result.current).toBe(false);
    act(() => {
      wide = true;
      listener();
    });
    expect(view.result.current).toBe(true);
    act(() => {
      wide = false;
      listener();
    });
    expect(view.result.current).toBe(false);
    view.unmount();
    expect(remove).toHaveBeenCalledWith("change", listener);
  } finally {
    if (original) Object.defineProperty(window, "matchMedia", original);
    else Reflect.deleteProperty(window, "matchMedia");
  }
});
