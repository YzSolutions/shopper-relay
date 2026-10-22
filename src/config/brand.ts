// User-facing names live here so renaming is one env var, not a refactor.
export const brand = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME || "ShopperRelay",
  tagline: process.env.NEXT_PUBLIC_BRAND_TAGLINE || "Shopping help you control.",
};
