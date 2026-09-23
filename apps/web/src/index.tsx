import React from "react";
import ReactDOM from "react-dom/client";
import "bootstrap/dist/css/bootstrap.min.css";
import App from "./App";
import { Provider } from "react-redux"; // 🔥 Import Provider từ react-redux
import store from "./store/store"; // 🔥 Import store của bạn
import { GoogleOAuthProviderBoundary } from "./providers/GoogleOAuthProviderBoundary";
import { RecaptchaProviderBoundary } from "./providers/RecaptchaProviderBoundary";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element was not found");
const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <RecaptchaProviderBoundary>
      <GoogleOAuthProviderBoundary>
        <Provider store={store}>
          <App />
        </Provider>
      </GoogleOAuthProviderBoundary>
    </RecaptchaProviderBoundary>
  </React.StrictMode>
);
