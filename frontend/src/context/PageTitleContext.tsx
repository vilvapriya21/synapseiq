import { createContext, useContext, useState, type ReactNode } from "react";

interface PageTitleState {
  eyebrow: string;
  heading: string;
}

interface PageTitleContextValue {
  title: PageTitleState | null;
  setTitle: (title: PageTitleState) => void;
}

const PageTitleContext = createContext<PageTitleContextValue | undefined>(undefined);

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState<PageTitleState | null>(null);
  return (
    <PageTitleContext.Provider value={{ title, setTitle }}>
      {children}
    </PageTitleContext.Provider>
  );
}

export function usePageTitle() {
  const ctx = useContext(PageTitleContext);
  if (!ctx) {
    throw new Error("usePageTitle must be used within a PageTitleProvider");
  }
  return ctx;
}
