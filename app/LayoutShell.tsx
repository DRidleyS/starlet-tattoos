"use client";

import { usePathname } from "next/navigation";
import Footer from "@/components/Footer";

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");

  if (isAdmin) return <>{children}</>;

  return (
    <>
      <div style={{ paddingBottom: "10rem" }}>{children}</div>
      <Footer />
    </>
  );
}
