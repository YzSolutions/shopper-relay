// User-facing names live here so renaming is one env var, not a refactor.
export const brand = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME || "ShopperRelay",
  tagline: process.env.NEXT_PUBLIC_BRAND_TAGLINE || "Shopping help you control.",
};

/** The demo video on YouTube (the same link as the hackathon submission). */
export const VIDEO_ID = "rewtmUjOegY";
export const videoUrl = (seconds?: number) => `https://www.youtube.com/watch?v=${VIDEO_ID}${seconds ? `&t=${seconds}s` : ""}`;
