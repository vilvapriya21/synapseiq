import { BrowserRouter } from "react-router-dom";
import { PageTitleProvider } from "./context/PageTitleContext";
import AppRoutes from "./routes/AppRoutes";
import cognineLogo from "./assets/cognine.png";
import styles from "./App.module.css";

function App() {
  return (
    <BrowserRouter>
      <PageTitleProvider>
        <AppRoutes />
        <div aria-label="Powered by Cognine" className={styles.poweredBy}>
          <span>Powered by</span>
          <img alt="Cognine" src={cognineLogo} />
        </div>
      </PageTitleProvider>
    </BrowserRouter>
  );
}

export default App;
