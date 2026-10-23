import { Suspense } from "react";
import { PurchaseScreen } from "@/components/PurchaseScreen";
import { Spinner } from "@/components/ui";

export default function PurchasePage({ params }: PageProps<"/purchase/[id]">) {
  return (
    <Suspense fallback={<Spinner label="Loading…" />}>
      <PurchaseScreen params={params} />
    </Suspense>
  );
}
