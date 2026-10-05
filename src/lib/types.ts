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
  /** On the short list shown first (hand-picked). */
  popular?: boolean;
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
  /**
   * Outline from OpenStreetMap. A park can have several pieces, so this is a list of
   * closed polygons ("rings"); the last point of each ring connects back to its first.
   */
  boundary: LatLng[][];
  /** Centerline, for linear parks only. */
  path?: LatLng[];
  entrances: Entrance[];
  landmarks: Landmark[];
};

/**
 * A point of interest from Google Places. Per Google's terms we store only the place ID,
 * coordinates (refreshed at least every 30 days) and our own mood tags — the name is
 * looked up live via /api/place/[placeId].
 */
export type Sight = {
  placeId: string;
  location: LatLng;
  moods: Mood[];
  /** false = outside the park but within a short walk (small and linear parks). */
  inPark: boolean;
};
