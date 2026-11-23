import { useState, type ReactNode } from "react";

export function Card({ title, step, right, children, tone }: { title: ReactNode; step?: string; right?: ReactNode; children: ReactNode; tone?: "warn" | "ok" | "muted" }) {
  return (
    <section className={`card ${tone ? `card-${tone}` : ""}`}>
      <header className="card-head">
        <h2>
          {step && <span className="step">{step}</span>}
          {title}
        </h2>
        {right}
      </header>
      <div className="card-body">{children}</div>
    </section>
  );
}

export function Badge({ tone, children }: { tone: "ok" | "warn" | "err" | "info" | "muted"; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Field({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="field">
      <dt>{label}</dt>
      <dd className={mono ? "mono" : undefined}>{children}</dd>
    </div>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  reason,
  kind = "secondary",
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  reason?: string;
  kind?: "primary" | "secondary" | "ghost" | "danger";
  title?: string;
}) {
  return (
    <span className="btn-wrap">
      <button className={`btn btn-${kind}`} onClick={onClick} disabled={disabled} title={disabled ? reason : title}>
        {children}
      </button>
      {disabled && reason && <span className="btn-reason">{reason}</span>}
    </span>
  );
}

export function Collapsible({ label, children, defaultOpen = false }: { label: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="collapsible">
      <button className="collapsible-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="chev">{open ? "▾" : "▸"}</span> {label}
      </button>
      {open && <div className="collapsible-body">{children}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: Array<{ id: T; label: ReactNode }> }) {
  return (
    <div className="subtabs" role="tablist">
      {items.map((it) => (
        <button key={it.id} role="tab" aria-selected={value === it.id} className={value === it.id ? "active" : ""} onClick={() => onChange(it.id)}>
          {it.label}
        </button>
      ))}
    </div>
  );
}
