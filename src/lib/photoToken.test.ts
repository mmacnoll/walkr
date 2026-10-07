import { beforeEach, describe, expect, it } from "vitest";
import { signPhotoName, verifyPhotoToken } from "./photoToken";

const name = "places/ChIJ4zGFAZpYwokRGUGph3Mf37k/photos/AUc7tXV-abc_123";

beforeEach(() => {
  process.env.GOOGLE_MAPS_SERVER_KEY = "test-key";
});

describe("photo tokens", () => {
  it("round-trips a photo name", () => {
    expect(verifyPhotoToken(signPhotoName(name))).toBe(name);
  });

  it("rejects a token signed with a different key", () => {
    const token = signPhotoName(name);
    process.env.GOOGLE_MAPS_SERVER_KEY = "other-key";
    expect(verifyPhotoToken(token)).toBeNull();
  });

  it("rejects a swapped photo name", () => {
    const [, signature] = signPhotoName(name).split(".");
    const forged = `${Buffer.from("places/X/photos/Y").toString("base64url")}.${signature}`;
    expect(verifyPhotoToken(forged)).toBeNull();
  });

  it("rejects junk and non-photo paths", () => {
    expect(verifyPhotoToken("")).toBeNull();
    expect(verifyPhotoToken("abc")).toBeNull();
    expect(verifyPhotoToken("a.b.c")).toBeNull();
    expect(verifyPhotoToken(signPhotoName("places/X/../../v1/other"))).toBeNull();
  });
});
