import Image from "next/image";
import { ButtonLink } from "@/components/ui";
import symbol from "../../public/brand/shopperrelay-symbol.png";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-5 px-5">
      <Image src={symbol} alt="" className="size-16" priority />
      <h1 className="text-[2.125rem] font-extrabold">There&apos;s nothing at this address</h1>
      <p className="text-xl text-ink-soft">The link may be old or mistyped.</p>
      <div>
        <ButtonLink href="/shop">Go to shopping</ButtonLink>
      </div>
    </main>
  );
}
