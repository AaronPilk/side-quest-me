import { isNativeApp } from "./runtime";

const options = { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 };

/** Request once, only after the user taps. Never watch or persist their position. */
export async function currentArea(): Promise<{
  latitude: number;
  longitude: number;
}> {
  let coords: { latitude: number; longitude: number };
  if (isNativeApp()) {
    const { Geolocation } = await import("@capacitor/geolocation");
    const permission = await Geolocation.checkPermissions();
    if (permission.location === "denied")
      throw new Error(
        "Location access is off. You can still search by town or place name.",
      );
    coords = (await Geolocation.getCurrentPosition(options)).coords;
  } else {
    if (!navigator.geolocation)
      throw new Error(
        "Location isn’t available. Type your town or neighborhood in Area instead.",
      );
    coords = await new Promise<GeolocationCoordinates>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => resolve(position.coords),
        reject,
        options,
      );
    });
  }
  if (
    !Number.isFinite(coords.latitude) ||
    !Number.isFinite(coords.longitude) ||
    Math.abs(coords.latitude) > 90 ||
    Math.abs(coords.longitude) > 180
  )
    throw new Error(
      "Your location could not be determined. Search by town or place name.",
    );
  return { latitude: coords.latitude, longitude: coords.longitude };
}
