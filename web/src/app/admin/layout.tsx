import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Sidebar from "@/components/ui/Sidebar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) redirect("/login");
  if (session.user.role !== "admin") redirect("/login");

  return (
    <div className="d-flex">
      <Sidebar />
      <div className="main-content flex-grow-1">{children}</div>
    </div>
  );
}
