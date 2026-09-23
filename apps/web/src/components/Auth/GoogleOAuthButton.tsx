import { useGoogleLogin } from "@react-oauth/google";
import type { TokenResponse } from "@react-oauth/google";
import { FaGoogle } from "react-icons/fa";
import { toast } from "react-toastify";

interface GoogleOAuthButtonProps {
  label: string;
  errorMessage: string;
  onSuccess: (credential: TokenResponse) => void | Promise<void>;
}

export const GoogleOAuthButton = ({
  label,
  errorMessage,
  onSuccess,
}: GoogleOAuthButtonProps) => {
  const startGoogleLogin = useGoogleLogin({
    onSuccess,
    onError: () => toast.error(errorMessage),
  });

  return (
    <button
      type="button"
      onClick={() => startGoogleLogin()}
      className="btn google-btn"
    >
      <FaGoogle className="google-icon" />
      {label}
    </button>
  );
};
