import { Suspense } from "react";
import { PurchaseScreen } from "@/components/PurchaseScreen";
import { Spinner } from "@/components/ui";

export default function PurchasePage({ params }: PageProps<"/purchase/[id]">) {
  return (
    <Suspense fallback={<Spinner label="Loading…" />}>
      <WithId params={params} />
    </Suspense>
  );
}

/** Read the id on the server, so the screen gets a plain string rather than a promise. */
async function WithId({ params }: { params: PageProps<"/purchase/[id]">["params"] }) {
  const { id } = await params;
  return <PurchaseScreen id={id} />;
}
