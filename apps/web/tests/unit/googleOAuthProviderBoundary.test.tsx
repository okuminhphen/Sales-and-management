import { cleanup, render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

vi.mock("@react-oauth/google", () => ({
  GoogleOAuthProvider: ({
    children,
    clientId,
  }: PropsWithChildren<{ clientId: string }>) => (
    <div data-client-id={clientId} data-testid="google-oauth-provider">
      {children}
    </div>
  ),
}));

import { GoogleOAuthProviderBoundary } from "../../src/providers/GoogleOAuthProviderBoundary";

describe("GoogleOAuthProviderBoundary", () => {
  it.each(["", "   "])(
    "does not initialize Google OAuth when client id is %j",
    (clientId) => {
      render(
        <GoogleOAuthProviderBoundary clientId={clientId}>
          <span>Ứng dụng</span>
        </GoogleOAuthProviderBoundary>,
      );

      expect(screen.getByText("Ứng dụng")).toBeInTheDocument();
      expect(screen.queryByTestId("google-oauth-provider")).not.toBeInTheDocument();
    },
  );

  it("initializes Google OAuth with a normalized client id", () => {
    render(
      <GoogleOAuthProviderBoundary clientId="  test-client-id  ">
        <span>Ứng dụng</span>
      </GoogleOAuthProviderBoundary>,
    );

    expect(screen.getByTestId("google-oauth-provider")).toHaveAttribute(
      "data-client-id",
      "test-client-id",
    );
  });
});
