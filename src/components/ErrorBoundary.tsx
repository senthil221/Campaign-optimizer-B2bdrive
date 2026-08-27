import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  /** Shown in the heading, e.g. "Domain management". */
  label: string
  /** Changing this resets the boundary — used to retry on page switch. */
  resetKey?: string
  children: ReactNode
}

interface State {
  error: Error | null
  componentStack: string
}

/**
 * Without this, any error thrown while rendering unmounts the whole tree and
 * leaves a blank page with nothing to report — which is exactly what makes a
 * production crash so slow to diagnose. Catch it, name the failing area, and
 * put the message and stack somewhere the operator can copy from.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: '' }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep it in the console too, so it survives a copy-paste of the page.
    console.error(`[${this.props.label}] render failed`, error, info)
    this.setState({ componentStack: info.componentStack ?? '' })
  }

  componentDidUpdate(prev: Props): void {
    // Switching pages clears the error so a crash in one area does not strand
    // the rest of the app behind it.
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null, componentStack: '' })
    }
  }

  private details(): string {
    const { error, componentStack } = this.state
    return [
      `${this.props.label} — ${error?.name ?? 'Error'}: ${error?.message ?? ''}`,
      error?.stack ?? '',
      componentStack ? `Component stack:${componentStack}` : '',
    ]
      .filter(Boolean)
      .join('\n\n')
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <section className="rounded-2xl border border-critical/30 bg-critical/[0.06] p-6">
        <div className="flex items-start gap-4">
          <span
            aria-hidden="true"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-critical/20 bg-critical/10 text-lg text-critical"
          >
            !
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-semibold text-ink">
              {this.props.label} could not be displayed
            </h2>
            <p className="mt-1 text-[12px] text-muted">
              Something in this page threw while rendering. The rest of the app
              still works — switch tabs and come back, or reload.
            </p>

            <pre className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-panel-2 p-3 text-[11px] leading-relaxed text-critical">
              {error.name}: {error.message}
            </pre>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard
                    ?.writeText(this.details())
                    .catch(() => undefined)
                }}
                className="h-9 rounded-lg border border-line px-3 text-[11px] font-medium text-muted transition hover:text-ink"
              >
                Copy error details
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="h-9 rounded-lg bg-lime-fill px-4 text-[11px] font-semibold text-[#18200c] shadow-glow transition hover:bg-lime-fill-hover"
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      </section>
    )
  }
}
