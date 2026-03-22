import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import AdminShell from "./AdminShell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  // Let the login page render without the shell
  // Middleware already handles redirect for unauthenticated users on other admin pages

  if (!session?.user) {
    // Dark background even without the full shell (login page, session loading)
    return (
      <div className="min-h-screen bg-neutral-950 text-white font-body">
        {children}
      </div>
    );
  }

  return <AdminShell>{children}</AdminShell>;
}
