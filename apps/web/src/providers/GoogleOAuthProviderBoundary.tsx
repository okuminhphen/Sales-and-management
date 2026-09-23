import { GoogleOAuthProvider } from "@react-oauth/google";
import type { PropsWithChildren } from "react";
import { GOOGLE_CLIENT_ID } from "../config/auth";

interface GoogleOAuthProviderBoundaryProps extends PropsWithChildren {
  clientId?: string;
}

export const GoogleOAuthProviderBoundary = ({
  children,
  clientId = GOOGLE_CLIENT_ID,
}: GoogleOAuthProviderBoundaryProps) => {
  const normalizedClientId = clientId.trim();

  if (!normalizedClientId) {
    return <>{children}</>;
  }

  return (
    <GoogleOAuthProvider clientId={normalizedClientId}>
      {children}
    </GoogleOAuthProvider>
  );
};
