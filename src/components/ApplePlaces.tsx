import { useCallback, useEffect, useRef, useState } from "react";
import type { MapKit, Place } from "@apple/mapkit-loader";
import { ExternalLink, LocateFixed, MapPin, Search, X } from "lucide-react";
import {
  appleDirectionsUrl,
  applePlaceUrl,
  appleSearchUrl,
} from "../../shared/places";
import type { ApplePlace } from "../lib/apple-maps";
import {
  loadApplePlaceService,
  type ApplePlaceService,
} from "../lib/apple-place-service";
import { isNativeApp } from "../lib/runtime";
import { currentArea } from "../lib/location";
import { rememberApplePlaceContext } from "../lib/place-context";
import { Button, Notice } from "./ui";
import NearbyEvents from "./NearbyEvents";

function PlaceMap({ place, mapkit }: { place: ApplePlace; mapkit: MapKit }) {
  const element = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!element.current || !place.coordinate) return;
    let map: InstanceType<MapKit["Map"]> | undefined;
    try {
      map = new mapkit.Map(element.current, {
        center: (place as Place).coordinate!,
        showsUserLocation: false,
        isRotationEnabled: false,
      });
      // Only the browser service supplies MapKit and its complete Place objects.
      map.showItems([new mapkit.PlaceAnnotation(place as Place)]);
      setError(false);
    } catch {
      setError(true);
    }
    return () => map?.destroy();
  }, [place, mapkit]);
  return (
    <>
      {error && (
        <p className="support">
          Map preview unavailable. Open the place in Apple Maps below.
        </p>
      )}
      <div
        ref={element}
        className="apple-place-map"
        role="region"
        aria-label={`Map of ${place.name || "selected place"}`}
      />
    </>
  );
}

export function ApplePlaceCard({
  placeId,
  transport = "none",
  onRemove,
}: {
  placeId: string;
  transport?: string;
  onRemove?: () => void;
}) {
  const [place, setPlace] = useState<ApplePlace>();
  const [mapkit, setMapkit] = useState<MapKit | null>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setPlace(undefined);
    setError("");
    loadApplePlaceService()
      .then(async (kit) => {
        if (controller.signal.aborted) return;
        setMapkit(kit?.mapkit ?? null);
        if (kit) {
          const value = await kit.lookup(placeId, {
            signal: controller.signal,
          });
          if (!controller.signal.aborted) {
            rememberApplePlaceContext(value);
            setPlace(value);
          }
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            "This place’s latest details aren’t available. Check it in Apple Maps before heading out.",
          );
      });
    return () => controller.abort();
  }, [placeId, attempt]);
  return (
    <section className="apple-place-card" aria-label="Your quest location">
      <div className="section-heading">
        <h3>
          <MapPin size={18} />
          {place?.name || "Your selected place"}
        </h3>
        {onRemove && (
          <button
            type="button"
            className="icon-button"
            onClick={onRemove}
            aria-label="Remove selected place"
          >
            <X size={18} />
          </button>
        )}
      </div>
      {place?.formattedAddress && (
        <p className="support">{place.formattedAddress}</p>
      )}
      {mapkit && place && <PlaceMap place={place} mapkit={mapkit} />}
      {error && (
        <>
          <p className="support" role="status">
            {error}
          </p>
          <button
            type="button"
            className="text-button"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Retry place details
          </button>
        </>
      )}
      <div className="place-links">
        <a href={applePlaceUrl(placeId)} target="_blank" rel="noreferrer">
          Open in Apple Maps <ExternalLink size={15} />
        </a>
        {place?.coordinate && (
          <a
            href={appleDirectionsUrl(placeId, place.coordinate, transport)}
            target="_blank"
            rel="noreferrer"
          >
            Get directions <ExternalLink size={15} />
          </a>
        )}
      </div>
      <p className="fine-print">
        Check access, costs and filming permission before you go.
      </p>
    </section>
  );
}

export function ApplePlacePicker({
  area,
  setting,
  placeId,
  onChange,
  onAreaChange,
}: {
  area: string;
  setting: "outside" | "venue";
  placeId?: string | null;
  onChange: (id: string | null) => void;
  onAreaChange?: (value: string) => void;
}) {
  const [query, setQuery] = useState(setting === "outside" ? "parks" : "cafés");
  const [kit, setKit] = useState<ApplePlaceService | null>();
  const [error, setError] = useState("");
  const [places, setPlaces] = useState<ApplePlace[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [center, setCenter] = useState<{
    latitude: number;
    longitude: number;
  }>();
  const [attempt, setAttempt] = useState(0);
  const [searchAfterLocation, setSearchAfterLocation] = useState(false);
  const generation = useRef(0);
  const locationRequest = useRef(0);
  const searchRequest = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const searchQuery = [query.trim(), center ? "" : area.trim()]
    .filter(Boolean)
    .join(" in ");
  useEffect(() => {
    mounted.current = true;
    let active = true;
    setError("");
    loadApplePlaceService()
      .then((value) => {
        if (active) setKit(value);
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
      mounted.current = false;
      generation.current++;
      searchRequest.current?.abort();
    };
  }, [attempt]);
  useEffect(() => {
    generation.current++;
    searchRequest.current?.abort();
    setPlaces(null);
    setBusy(false);
  }, [query, area, center]);
  const search = useCallback(
    async (near = center) => {
      if (!kit || !query.trim()) return;
      searchRequest.current?.abort();
      const controller = new AbortController();
      searchRequest.current = controller;
      const request = ++generation.current;
      setBusy(true);
      setError("");
      setPlaces(null);
      try {
        const response = await kit.search(near ? query.trim() : searchQuery, {
          ...(near ? { coordinate: near } : {}),
          signal: controller.signal,
        });
        if (request === generation.current) setPlaces(response);
      } catch {
        if (!controller.signal.aborted && request === generation.current)
          setError(
            "Places couldn’t load. Try searching again, or open Apple Maps.",
          );
      } finally {
        if (request === generation.current) setBusy(false);
      }
    },
    [center, kit, query, searchQuery],
  );
  useEffect(() => {
    if (!searchAfterLocation || !center || !kit) return;
    setSearchAfterLocation(false);
    void search(center);
  }, [center, kit, search, searchAfterLocation]);
  async function locate() {
    const request = ++locationRequest.current;
    setLocating(true);
    setError("");
    try {
      const near = await currentArea();
      if (mounted.current && request === locationRequest.current) {
        setCenter(near);
        setSearchAfterLocation(true);
      }
    } catch {
      if (mounted.current && request === locationRequest.current)
        setError(
          "Location access is off or unavailable. You can still search by town or place name.",
        );
    } finally {
      if (mounted.current && request === locationRequest.current)
        setLocating(false);
    }
  }
  return (
    <div className="apple-place-picker">
      <h3>Find a place near you</h3>
      <p className="support">
        Start with what’s around you, or search a town or place. Your budget,
        time and group stay the same.
      </p>
      <Button type="button" busy={locating} onClick={() => void locate()}>
        <LocateFixed size={17} />
        {locating ? "Finding your area…" : "Use my current area"}
      </Button>
      {onAreaChange && (
        <label>
          Area
          <input
            value={area}
            maxLength={100}
            placeholder="Or enter a neighborhood or town"
            onChange={(event) => {
              locationRequest.current++;
              setLocating(false);
              setSearchAfterLocation(false);
              setCenter(undefined);
              onAreaChange(event.target.value);
            }}
          />
        </label>
      )}
      <label>
        Search Apple Maps
        <input
          value={query}
          maxLength={150}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="A park, café, or venue"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void search();
            }
          }}
        />
      </label>
      <div className="place-search-actions">
        {kit && (
          <Button
            type="button"
            secondary
            busy={busy}
            disabled={!query.trim()}
            onClick={() => void search()}
          >
            <Search size={17} />
            Find places
          </Button>
        )}
      </div>
      {center && (
        <p className="fine-print">
          Using your current area for nearby searches. Your precise location
          stays off your profile.
          <button
            type="button"
            className="text-button"
            onClick={() => {
              locationRequest.current++;
              setLocating(false);
              setSearchAfterLocation(false);
              setCenter(undefined);
            }}
          >
            Use entered area instead
          </button>
        </p>
      )}
      {kit === undefined && !error && (
        <p className="support" role="status">
          Connecting to Apple Maps…
        </p>
      )}
      {kit === null && (
        <p className="support" role="status">
          {isNativeApp()
            ? "In-app place search needs iOS 18 or later. You can still browse Apple Maps and enter your area above."
            : "In-app place search isn’t connected yet. You can still browse Apple Maps and enter your area above."}
        </p>
      )}
      {error && (
        <Notice error>
          {error}{" "}
          {!kit && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setKit(undefined);
                setAttempt((n) => n + 1);
              }}
            >
              Retry Apple Maps
            </button>
          )}
        </Notice>
      )}
      {places && (
        <div className="apple-place-results" aria-live="polite">
          {places.length ? (
            places.map((place) => (
              <button
                type="button"
                key={place.id!}
                className={`apple-place-result ${place.id === placeId ? "selected" : ""}`}
                aria-pressed={place.id === placeId}
                onClick={() => {
                  rememberApplePlaceContext(place);
                  onChange(place.id!);
                  setPlaces(null);
                }}
              >
                <MapPin size={18} />
                <span>
                  <strong>{place.name}</strong>
                  <small>{place.formattedAddress}</small>
                </span>
                <span>{place.id === placeId ? "Selected" : "Choose"}</span>
              </button>
            ))
          ) : (
            <p>No places found. Try a town name or a different search.</p>
          )}
        </div>
      )}
      <a
        className="text-button"
        href={appleSearchUrl(searchQuery, center)}
        target="_blank"
        rel="noreferrer"
      >
        Browse in Apple Maps <ExternalLink size={15} />
      </a>
      {placeId && (
        <ApplePlaceCard placeId={placeId} onRemove={() => onChange(null)} />
      )}
      <p className="fine-print">
        Search and map data by Apple Maps. When a place type is available, it
        helps sort quest ideas. Check access and rules before you go.
      </p>
      <NearbyEvents area={area} center={center} />
    </div>
  );
}
