import { beforeEach, describe, expect, it } from "vitest";
import reducer, {
  logout,
  setUser,
  updateUserThunk,
} from "../../src/store/slices/userSlice";
import type { UserSession } from "../../src/types/auth";

const session: UserSession = {
  userId: 5,
  email: "user@example.com",
  userRole: { id: 1, name: "CUSTOMER" },
  token: "signed-token",
};

describe("user session state", () => {
  beforeEach(() => sessionStorage.clear());

  it("persists login and keeps auth claims when profile data changes", () => {
    let state = reducer(undefined, setUser(session));
    state = reducer(
      state,
      updateUserThunk.fulfilled(
        {
          id: 5,
          username: "new-name",
          email: "user@example.com",
          fullname: "Updated User",
        },
        "request-id",
        { userId: 5, updatedData: { fullname: "Updated User" } },
      ),
    );

    expect(state.currentUser).toMatchObject({
      token: "signed-token",
      userRole: { name: "CUSTOMER" },
      fullname: "Updated User",
    });
    expect(JSON.parse(sessionStorage.getItem("user") ?? "{}").token).toBe(
      "signed-token",
    );
  });

  it("clears every authentication key on logout", () => {
    sessionStorage.setItem("token", "signed-token");
    sessionStorage.setItem("role", "CUSTOMER");
    sessionStorage.setItem("userId", "5");
    const authenticated = reducer(undefined, setUser(session));

    const state = reducer(authenticated, logout());

    expect(state.isAuthenticated).toBe(false);
    expect(sessionStorage.length).toBe(0);
  });
});
