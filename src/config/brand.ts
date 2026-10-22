// The product name isn't final. Everything user-facing reads it from here,
// so renaming is one env var (or one line), not a refactor.
export const brand = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME || "Working Title",
  tagline: process.env.NEXT_PUBLIC_BRAND_TAGLINE || "Shopping help you control.",
  /** Demo personas. */
  ownerName: process.env.NEXT_PUBLIC_DEMO_OWNER_NAME || "Mom",
  contactName: process.env.NEXT_PUBLIC_DEMO_CONTACT_NAME || "Sarah",
};
