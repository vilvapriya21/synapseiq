import { Component, ErrorInfo, ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("SynapseIQ render error", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <main style={{ color: "#a4161a", fontFamily: "Arial, sans-serif", padding: 24 }}>
          <h1>SynapseIQ failed to render</h1>
          <pre style={{ whiteSpace: "pre-wrap" }}>{this.state.error.message}</pre>
        </main>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
