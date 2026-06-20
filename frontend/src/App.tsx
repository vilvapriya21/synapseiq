import { BrowserRouter } from "react-router-dom";
import { PageTitleProvider } from "./context/PageTitleContext";
import AppRoutes from "./routes/AppRoutes";

function App() {
  return (
    <BrowserRouter>
      <PageTitleProvider>
        <AppRoutes />
      </PageTitleProvider>
    </BrowserRouter>
  );
}

export default App;
