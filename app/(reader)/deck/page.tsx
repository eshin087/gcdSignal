import type { Metadata } from "next";
import DeckRoute from "@/components/DeckRoute";

export const metadata: Metadata = { title: "Deck" };

export default function DeckPage() {
  return <DeckRoute />;
}
