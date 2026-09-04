import React from "react";
import ReactDOM from "react-dom/client";
import "bootstrap/dist/css/bootstrap.min.css";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { GOOGLE_CLIENT_ID, RECAPTCHA_SITE_KEY } from "./config/auth";
import App from "./App";
import { Provider } from "react-redux"; // 🔥 Import Provider từ react-redux
import store from "./store/store"; // 🔥 Import store của bạn
import { GoogleReCaptchaProvider } from "react-google-recaptcha-v3";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element was not found");
const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <GoogleReCaptchaProvider
      reCaptchaKey={RECAPTCHA_SITE_KEY}
    >
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <Provider store={store}>
          <App />
        </Provider>
      </GoogleOAuthProvider>
    </GoogleReCaptchaProvider>
  </React.StrictMode>
);
