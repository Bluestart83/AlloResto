import Sidebar from "@/components/ui/Sidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="d-flex">
      <Sidebar />
      <div className="main-content flex-grow-1">{children}</div>
    </div>
  );
}
