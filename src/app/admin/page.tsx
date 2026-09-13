import { notFound } from "next/navigation";
import { Box, Typography } from "@mui/material";
import { Header } from "@/components/Header";
import { AdminDashboard } from "@/components/AdminDashboard";
import { getCurrentUser } from "@/lib/auth/session";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") notFound();

  return (
    <div className="min-h-screen bg-ink pb-16">
      <Header />
      <Box sx={{ px: { xs: 3, sm: 5 }, py: 5 }}>
        <Typography
          variant="h3"
          component="h1"
          className="font-display"
          sx={{ mb: 0.5, textTransform: "uppercase", fontSize: { xs: "2rem", sm: "3rem" } }}
        >
          Administração
        </Typography>
        <Typography variant="body2" sx={{ mb: 4, color: "text.secondary" }}>
          Cadastro é só por convite. Gere um código, compartilhe fora daqui, e
          quem receber usa em <Box component="code" sx={{ color: "text.primary" }}>/signup</Box>.
        </Typography>
        <AdminDashboard />
      </Box>
    </div>
  );
}
