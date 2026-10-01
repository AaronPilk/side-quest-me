import { useEffect, useId, useRef, useState } from "react";
import { LocateFixed, MapPin, Check } from "lucide-react";
import type { Outing } from "../../shared/domain";
import type { ApplePlace } from "../lib/apple-maps";
import { currentArea } from "../lib/location";
import {
  discoverNearbyPlaces,
  type DiscoveryCenter,
} from "../lib/nearby-discovery";
import { ApplePlacePicker } from "./ApplePlaces";
import { Button, Notice } from "./ui";

export function QuestLocationChooser({
  outing,
  update,
  center,
  places,
  onAreaReady,
}: {
  outing: Outing;
  update: (patch: Partial<Outing>) => void;
  center?: DiscoveryCenter;
  places: ApplePlace[];
  onAreaReady: (
    center: DiscoveryCenter | undefined,
    places: ApplePlace[],
  ) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [specific, setSpecific] = useState(Boolean(outing.applePlaceId));
  const [manualArea, setManualArea] = useState(
    Boolean(outing.area.trim() && !center),
  );
  const townId = useId();
  const placeId = useId();
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function search(useLocation: boolean) {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    try {
      const near = useLocation ? await currentArea() : undefined;
      if (controller.signal.aborted) return;
      const found = await discoverNearbyPlaces(
        { ...outing, applePlaceId: null },
        near,
        AbortSignal.any([controller.signal, AbortSignal.timeout(16000)]),
      );
      if (controller.signal.aborted) return;
      onAreaReady(near, found);
      update({ applePlaceId: null });
      if (near) setManualArea(false);
      if (!found.length)
        setError(
          "No nearby listings came back. Try a nearby town, or let us suggest an experience without a named place.",
        );
    } catch (cause) {
      if (!controller.signal.aborted) setError((cause as Error).message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <section className="quest-area-choice" aria-label="Quest area">
      <Button type="button" busy={busy} onClick={() => void search(true)}>
        <LocateFixed size={18} />{" "}
        {center ? "Refresh my current area" : "Use my current area"}
      </Button>
      <div className="quest-area-alternatives">
        <button
          type="button"
          className="text-button"
          aria-expanded={manualArea}
          aria-controls={townId}
          onClick={() => setManualArea((value) => !value)}
        >
          Choose a town
        </button>
        <button
          type="button"
          className="text-button specific-place-toggle"
          aria-expanded={specific}
          aria-controls={placeId}
          onClick={() => setSpecific((value) => !value)}
        >
          Have a specific place?
        </button>
      </div>
      {manualArea && (
        <label id={townId}>
          Town or neighborhood
          <input
            value={outing.area}
            maxLength={100}
            placeholder="Town or neighborhood"
            onChange={(event) => {
              pending.current?.abort();
              setBusy(false);
              setError("");
              update({ area: event.target.value, applePlaceId: null });
              onAreaReady(undefined, []);
            }}
          />
        </label>
      )}
      {manualArea && outing.area.trim() && !center && (
        <Button
          type="button"
          secondary
          busy={busy}
          onClick={() => void search(false)}
        >
          <MapPin size={16} /> Explore this area
        </Button>
      )}
      {places.length > 0 && (
        <p className="quest-area-ready" role="status">
          <Check size={17} /> {places.length} nearby places to inspire your
          quest. We’ll pick a fit.
        </p>
      )}
      {error && <Notice error>{error}</Notice>}
      {specific && (
        <div id={placeId}>
          <ApplePlacePicker
            area={outing.area}
            setting={outing.setting === "outside" ? "outside" : "venue"}
            placeId={outing.applePlaceId}
            onAreaChange={(area) => {
              update({ area });
              onAreaReady(undefined, []);
            }}
            onChange={(applePlaceId) => {
              update({ applePlaceId });
              onAreaReady(center, []);
            }}
          />
        </div>
      )}
      {!center && !outing.area && !outing.applePlaceId && (
        <p className="fine-print">
          No location? Continue for an adventure without a named place.
        </p>
      )}
    </section>
  );
}
