import type { Metadata } from "next";
import { Suspense } from "react";
import { PhoneShell } from "@/components/PhoneShell";
import { ReviewScreen } from "@/components/ReviewScreen";
import { Spinner } from "@/components/ui";

export const metadata: Metadata = { title: "Review a purchase", robots: { index: false } };

export default function ReviewPage({ params }: PageProps<"/review/[token]">) {
  return (
    <PhoneShell title="review">
      <Suspense fallback={<Spinner label="Loading the request…" />}>
        <WithToken params={params} />
      </Suspense>
    </PhoneShell>
  );
}

/** Read the token on the server, so the screen gets a plain string rather than a promise. */
async function WithToken({ params }: { params: PageProps<"/review/[token]">["params"] }) {
  const { token } = await params;
  return <ReviewScreen token={token} />;
}
