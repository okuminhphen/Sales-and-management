import { cleanup, render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

vi.mock("react-google-recaptcha-v3", () => ({
  GoogleReCaptchaProvider: ({
    children,
    reCaptchaKey,
  }: PropsWithChildren<{ reCaptchaKey: string }>) => (
    <div data-site-key={reCaptchaKey} data-testid="recaptcha-provider">
      {children}
    </div>
  ),
}));

import { RecaptchaProviderBoundary } from "../../src/providers/RecaptchaProviderBoundary";

describe("RecaptchaProviderBoundary", () => {
  it.each(["", "   "])("does not initialize reCAPTCHA when site key is %j", (siteKey) => {
    render(
      <RecaptchaProviderBoundary siteKey={siteKey}>
        <span>Ứng dụng</span>
      </RecaptchaProviderBoundary>,
    );

    expect(screen.getByText("Ứng dụng")).toBeInTheDocument();
    expect(screen.queryByTestId("recaptcha-provider")).not.toBeInTheDocument();
  });

  it("initializes reCAPTCHA with a normalized site key", () => {
    render(
      <RecaptchaProviderBoundary siteKey="  test-site-key  ">
        <span>Ứng dụng</span>
      </RecaptchaProviderBoundary>,
    );

    expect(screen.getByTestId("recaptcha-provider")).toHaveAttribute(
      "data-site-key",
      "test-site-key",
    );
  });
});
