import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { AdminDashboard } from "@/components/AdminDashboard";
import { getCurrentUser } from "@/lib/auth/session";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") notFound();

  return (
    <div className="min-h-screen bg-ink pb-16">
      <Header />
      <div className="px-6 py-10 sm:px-10">
        <h1 className="font-display mb-1 text-3xl uppercase text-text-primary drop-shadow-[2px_2px_0_#000]">
          Administração
        </h1>
        <p className="mb-8 text-sm text-text-muted">
          Cadastro é só por convite. Gere um código, compartilhe fora daqui, e
          quem receber usa em <code className="text-text-body">/signup</code>.
        </p>
        <AdminDashboard />
      </div>
    </div>
  );
}
