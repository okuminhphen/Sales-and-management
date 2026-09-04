import "./App.scss";
import { BrowserRouter as Router, useLocation } from "react-router-dom";
import { ToastContainer, Bounce } from "react-toastify";
import { useState, useEffect } from "react";
import Bot from "./components/ChatBot/Bot";
import ChatRealTime from "./components/ChatRealTime/ChatRealTime";
import AppRoutes from "./routes/AppRoutes";
import { loadLocalStorageCart, fetchCart } from "./store/slices/cartSlice";
import { useAppDispatch, useAppSelector } from "./store/hooks";
import "./index.css";

const AppContent = () => {
  const [openWidget, setOpenWidget] = useState<"bot" | "chat" | null>(null);
  const location = useLocation();
  const dispatch = useAppDispatch();
  const userId = useAppSelector((state) => state.user.currentUser?.userId);

  const authHiddenPaths = ["/login", "/register", "/admin/login"];
  const isAdminRoute = location.pathname.startsWith("/admin");
  const hideChatOnThisPage =
    isAdminRoute || authHiddenPaths.includes(location.pathname);

  const showChatWidget = !hideChatOnThisPage;

  // Load cart on app initialization
  useEffect(() => {
    if (userId) {
      // If user is logged in, fetch from API
      dispatch(fetchCart());
    } else {
      // If user is not logged in, load from localStorage
      dispatch(loadLocalStorageCart());
    }
  }, [dispatch, userId]);

  return (
    <>
      <AppRoutes />
      <ToastContainer
        position="bottom-center"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick={false}
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="light"
        transition={Bounce}
      />
      {showChatWidget && (
        <Bot
          isOpen={openWidget === "bot"}
          onToggle={(open: boolean) => setOpenWidget(open ? "bot" : null)}
          onOpen={() => setOpenWidget("bot")}
        />
      )}
      {showChatWidget && (
        <ChatRealTime
          isOpen={openWidget === "chat"}
          onToggle={(open: boolean) => setOpenWidget(open ? "chat" : null)}
          onOpen={() => setOpenWidget("chat")}
        />
      )}
    </>
  );
};

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
