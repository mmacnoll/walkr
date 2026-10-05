export type LatLng = { lat: number; lng: number };

export type Mood = "scenic" | "quiet" | "coffee" | "lunch";

/**
 * large  = the loop stays inside the park boundary.
 * small  = short walks stay inside; longer walks may use nearby streets (the "walk zone").
 * linear = long and narrow (High Line, Promenade); walk along it, return on parallel streets.
 */
export type ParkKind = "large" | "small" | "linear";

export type Entrance = {
  id: string;
  name: string;
  location: LatLng;
  isDefault?: boolean;
};

export type Landmark = {
  id: string;
  name: string;
  location: LatLng;
  moods: Mood[];
};

export type Park = {
  id: string;
  name: string;
  borough: "Manhattan" | "Brooklyn";
  kind: ParkKind;
  center: LatLng;
  /** Rough outline, as a closed polygon (last point connects back to the first). */
  boundary: LatLng[];
  /** Centerline, for linear parks only. */
  path?: LatLng[];
  entrances: Entrance[];
  landmarks: Landmark[];
};
