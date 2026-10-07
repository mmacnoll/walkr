"use client";

import { useState } from "react";
import { type PhotoRef, photoSrc } from "@/lib/walk";

/** A Google photo with the photographer credit Google requires. Hides itself if it can't load. */
export default function PlacePhoto({ photo, alt }: { photo?: PhotoRef; alt: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!photo || failed === photo.token) return null;
  return (
    <figure className="mt-2">
      {/* Plain <img>: the image comes from Google via a redirect, so Next's optimizer can't help. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photoSrc(photo)}
        alt={alt}
        loading="lazy"
        onError={() => setFailed(photo.token)}
        className="h-32 w-full rounded-md bg-zinc-100 object-cover"
      />
      {photo.credit && (
        <figcaption className="mt-0.5 truncate text-[10px] text-zinc-500">
          Photo:{" "}
          {photo.credit.uri ? (
            <a href={photo.credit.uri} target="_blank" rel="noreferrer" className="underline">
              {photo.credit.name}
            </a>
          ) : (
            photo.credit.name
          )}
        </figcaption>
      )}
    </figure>
  );
}
