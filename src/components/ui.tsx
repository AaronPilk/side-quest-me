import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  AlertCircle,
  Sparkles,
  Check,
} from "lucide-react";
import { Link } from "react-router-dom";
import { BrandMark } from "./BrandMark";
export function Button({
  children,
  busy,
  secondary,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean;
  secondary?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      className={`${secondary ? "button secondary" : "button"} ${props.className || ""}`}
    >
      {busy ? <span className="spinner" /> : null}
      {children}
    </button>
  );
}
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={`notice ${error ? "error" : ""}`}
      role={error ? "alert" : "status"}
    >
      <AlertCircle size={18} />
      <div>{children}</div>
    </div>
  );
}
export function Empty({
  title,
  children,
  to,
  action,
}: {
  title: string;
  children: ReactNode;
  to?: string;
  action?: string;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <BrandMark size={30} />
      </div>
      <h2>{title}</h2>
      <p>{children}</p>
      {to && (
        <Link className="button" to={to}>
          {action}
          <ArrowRight size={18} />
        </Link>
      )}
    </div>
  );
}
export function PageTitle({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-title">
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <h1>{title}</h1>
      {children && <p>{children}</p>}
    </header>
  );
}
export function Back({
  to = "/",
  children = "Back",
}: {
  to?: string;
  children?: ReactNode;
}) {
  return (
    <Link className="back" to={to}>
      <ArrowLeft size={18} />
      {children}
    </Link>
  );
}
export function Chips({
  options,
  value,
  onChange,
  multi = false,
  label,
}: {
  options: readonly { id: string; label: string }[];
  value: string | string[];
  onChange: (value: string | string[]) => void;
  multi?: boolean;
  label: string;
}) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((o) => {
        const selected = multi ? value.includes(o.id) : value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            className={`chip ${selected ? "selected" : ""}`}
            aria-pressed={selected}
            onClick={() =>
              onChange(
                multi
                  ? selected
                    ? (value as string[]).filter((v) => v !== o.id)
                    : [...(value as string[]), o.id]
                  : o.id,
              )
            }
          >
            {selected && multi && <Check size={14} />} {o.label}
          </button>
        );
      })}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <span className="spinner" />
      Loading your next chapter…
    </div>
  );
}
export function useResource<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let active = true;
    fn()
      .then((d) => {
        if (active) {
          setData(d);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [...deps, nonce]);
  return { data, error, refresh: () => setNonce((n) => n + 1), setData };
}
export function QuestArt({
  variant = "date_night",
  small = false,
}: {
  variant?: string;
  small?: boolean;
}) {
  return (
    <div
      className={`quest-art art-${variant} ${small ? "small" : ""}`}
      aria-hidden="true"
    >
      <div className="art-orbit orbit-one" />
      <div className="art-orbit orbit-two" />
      <div className="art-card art-card-back">
        <span>THE PLAN</span>
        <BrandMark size={small ? 24 : 40} />
      </div>
      <div className="art-card art-card-front">
        <Sparkles size={small ? 24 : 42} />
        <span>THE STORY</span>
        <div className="art-lines">
          <i />
          <i />
        </div>
      </div>
      <div className="art-spark">✦</div>
    </div>
  );
}
export const money = (minor: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: minor % 100 ? 2 : 0,
  }).format(minor / 100);
export const localReset = () => {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
};
