import { GoogleReCaptchaProvider } from "react-google-recaptcha-v3";
import type { PropsWithChildren } from "react";
import { RECAPTCHA_SITE_KEY } from "../config/auth";

interface RecaptchaProviderBoundaryProps extends PropsWithChildren {
  siteKey?: string;
}

export const RecaptchaProviderBoundary = ({
  children,
  siteKey = RECAPTCHA_SITE_KEY,
}: RecaptchaProviderBoundaryProps) => {
  const normalizedSiteKey = siteKey.trim();

  if (!normalizedSiteKey) return <>{children}</>;

  return (
    <GoogleReCaptchaProvider reCaptchaKey={normalizedSiteKey}>
      {children}
    </GoogleReCaptchaProvider>
  );
};
