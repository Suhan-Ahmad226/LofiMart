import type { Metadata } from "next";
import FlashSalePage from "@/features/shop/screens/FlashSalePage";

export const metadata: Metadata = {
  title: "Flash Sale",
  description:
    "Shop live flash sale deals on LofiMart — limited-time discounted marketplace offers curated by admin and fulfilled by approved sellers.",
  alternates: { canonical: "/flash-sale" },
  openGraph: {
    title: "Flash Sale | LofiMart",
    description:
      "Shop live flash sale deals on LofiMart — limited-time discounted marketplace offers curated by admin and fulfilled by approved sellers.",
    type: "website",
  },
};

export default function FlashSaleRoute() {
  return <FlashSalePage />;
}
