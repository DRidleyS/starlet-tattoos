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
    return <>{children}</>;
  }

  return <AdminShell>{children}</AdminShell>;
}
