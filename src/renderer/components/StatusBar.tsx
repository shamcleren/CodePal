import type { ReactNode } from "react";

type StatusBarProps = {
  usage?: ReactNode;
};

export function StatusBar({ usage }: StatusBarProps) {
  if (!usage) {
    return null;
  }

  return (
    <section className="status-bar" aria-label="Usage summary">
      <div className="status-bar__usage">
        {usage}
      </div>
    </section>
  );
}
