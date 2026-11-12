import { vi } from "vitest";

// React's `cache` is only meaningful inside a React server request; in tests it
// must behave as identity so repeated calls hit the DB.
vi.mock("react", async (orig) => {
  const actual = await orig<typeof import("react")>();
  return { ...actual, cache: <T>(fn: T) => fn };
});
