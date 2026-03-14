import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

type ErrorBoundaryState = { hasError: boolean; errorMessage?: string };

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const msg = error instanceof Error ? error.message : String(error);
    return { hasError: true, errorMessage: msg };
  }

  componentDidCatch(error: unknown) {
    try {
      const msg = error instanceof Error ? error.stack || error.message : String(error);
      localStorage.setItem(
        "cliphist:last_error",
        JSON.stringify({ at: new Date().toISOString(), error: msg }),
      );
    } catch {
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen bg-background text-foreground flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="text-base font-semibold">界面异常</div>
            <div className="mt-2 text-sm text-muted-foreground">
              应用界面渲染出现异常，点击下方按钮可刷新恢复。
            </div>
            {this.state.errorMessage ? (
              <div className="mt-3 text-xs text-muted-foreground break-words">
                {this.state.errorMessage}
              </div>
            ) : null}
            <div className="mt-4 flex gap-2">
              <button
                className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm"
                onClick={() => window.location.reload()}
              >
                重新加载
              </button>
              <button
                className="h-9 px-3 rounded-md border border-border bg-background text-sm"
                onClick={() => {
                  try {
                    localStorage.removeItem("cliphist:last_error");
                  } catch {
                  }
                  window.location.reload();
                }}
              >
                清理并重启
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);
