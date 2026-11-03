"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui";

export default function ShopperError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="max-w-xl space-y-5">
      <h1 className="text-[2.125rem] font-extrabold">This page didn&apos;t load</h1>
      <p className="text-xl text-ink-soft">Nothing was charged. Try again, or go back to shopping.</p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={retry}>Try again</Button>
        <ButtonLink href="/shop" tone="quiet">
          Back to shopping
        </ButtonLink>
      </div>
    </div>
  );
}
