import { useEffect, useRef, useState } from "react";
import { apiUrl } from "../lib/runtime";
import { CalendarDays, ExternalLink } from "lucide-react";
import {
  eventbriteBrowseUrl,
  type NearbyResult,
  type SearchCenter,
} from "../../shared/events";
import { Button, Notice } from "./ui";

export default function NearbyEvents({
  area,
  center,
}: {
  area: string;
  center?: SearchCenter;
}) {
  const [configured, setConfigured] = useState<boolean>();
  const [result, setResult] = useState<NearbyResult>();
  const [days, setDays] = useState<1 | 7 | 30>(7);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(apiUrl("/api/events/config"), {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const config = (await response.json()) as { configured: boolean };
        if (!controller.signal.aborted)
          setConfigured(config.configured === true);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Event search couldn’t connect. You can retry below.");
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    pending.current?.abort();
    setResult(undefined);
    setBusy(false);
    setError("");
    return () => pending.current?.abort();
  }, [area, center, days]);
  async function search() {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    setResult(undefined);
    try {
      const response = await fetch(apiUrl("/api/events/nearby"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ area, ...(center ? { center } : {}), days }),
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(12000),
        ]),
      });
      if (!response.ok) throw new Error();
      const next = (await response.json()) as NearbyResult;
      if (!controller.signal.aborted) {
        setConfigured(next.configured);
        setResult(next);
      }
    } catch {
      if (!controller.signal.aborted)
        setError(
          "Nearby events couldn’t load. Try again or browse the event sites below.",
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <section className="nearby-events" aria-label="Events nearby">
      <h3>
        <CalendarDays size={18} /> What’s happening nearby
      </h3>
      <p className="support">A show, a pop-up, a reason to go somewhere new.</p>
      {configured !== false && (
        <>
          <label>
            When
            <select
              value={days}
              onChange={(event) =>
                setDays(Number(event.target.value) as 1 | 7 | 30)
              }
            >
              <option value={1}>Next 24 hours</option>
              <option value={7}>Next 7 days</option>
              <option value={30}>Next 30 days</option>
            </select>
          </label>
          <Button
            type="button"
            secondary
            busy={busy}
            disabled={!center && area.trim().length < 2}
            onClick={search}
          >
            Find nearby events
          </Button>
          {!center && area.trim().length < 2 && (
            <p className="fine-print">
              Use your current area above or enter a town first.
            </p>
          )}
        </>
      )}
      {configured === false && (
        <p className="support" role="status">
          Live event listings aren’t connected yet. Browse events below while we
          connect the feed.
        </p>
      )}
      {error && <Notice error>{error}</Notice>}
      {result?.configured && (
        <div aria-live="polite" className="nearby-event-results">
          {!result.events.length && (
            <p>
              No listings found for this area and date range. Try a wider date
              range or check Eventbrite.
            </p>
          )}
          {result.events.map((event) => (
            <article className="nearby-event" key={event.id}>
              <span className="eyebrow">
                {event.source} · {event.date}
                {event.time
                  ? ` · ${event.time.slice(0, 5)} venue time`
                  : " · Time to be confirmed"}
              </span>
              <h4>{event.name}</h4>
              <p>
                {event.venue}
                {event.city ? ` · ${event.city}` : ""}
              </p>
              <p className="fine-print">
                {event.price || "Check ticket price and availability"}
              </p>
              <a href={event.url} target="_blank" rel="noreferrer">
                View event <ExternalLink size={14} />
              </a>
            </article>
          ))}
          {result.events.length > 0 && (
            <p className="fine-print">
              Listings via Ticketmaster Discovery.
              {result.checkedAt && Number.isFinite(Date.parse(result.checkedAt))
                ? ` Checked ${new Date(result.checkedAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}.`
                : ""}{" "}
              Confirm the event’s total cost, availability and recording rules.
              Event listings don’t change your quest answers.
            </p>
          )}
        </div>
      )}
      <div className="place-links">
        <a href={eventbriteBrowseUrl(area)} target="_blank" rel="noreferrer">
          Browse Eventbrite <ExternalLink size={14} />
        </a>
        <a
          href={`https://www.ticketmaster.com/search?${new URLSearchParams({ q: area.trim() || "events near me" })}`}
          target="_blank"
          rel="noreferrer"
        >
          Browse Ticketmaster <ExternalLink size={14} />
        </a>
      </div>
    </section>
  );
}
