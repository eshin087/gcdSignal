import type { Metadata } from "next";
import LibraryRoute from "@/components/LibraryRoute";

export const metadata: Metadata = { title: "Library" };

export default function LibraryPage() {
  return <LibraryRoute />;
}
