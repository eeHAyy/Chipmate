import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ChipMate render error", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main role="alert" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "var(--bg)", color: "var(--text)" }}>
        <section style={{ width: "min(520px, 100%)", padding: 24, border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-card)", textAlign: "center" }}>
          <h1 style={{ margin: "0 0 8px", fontSize: 20 }}>页面遇到错误</h1>
          <p style={{ margin: "0 0 18px", color: "var(--text-muted)", lineHeight: 1.6 }}>当前界面无法继续运行，请重新加载。</p>
          <button onClick={() => window.location.reload()} style={{ padding: "8px 16px", border: "none", borderRadius: 6, background: "var(--accent)", color: "#fff", cursor: "pointer", fontWeight: 600 }}>重新加载</button>
        </section>
      </main>
    );
  }
}
