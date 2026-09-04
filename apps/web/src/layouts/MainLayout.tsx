import type { ReactNode } from "react";
import Nav from "../components/Navigation/Nav";
import Footer from "../components/Footer/Footer";

interface MainLayoutProps {
  children: ReactNode;
}

const MainLayout = ({ children }: MainLayoutProps) => {
  return (
    <>
      <div className="app-header">
        <Nav />
      </div>
      <div className="app-container">{children}</div>
      <div className="app-footer">
        <Footer />
      </div>
    </>
  );
};

export default MainLayout;
