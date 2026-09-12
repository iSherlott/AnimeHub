"use client";

import { useEffect, useState } from "react";

type AdminUser = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  createdAt: string;
};

type AdminInvite = {
  id: string;
  code: string;
  usedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  usedBy: { email: string; displayName: string } | null;
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

export function AdminDashboard() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [invites, setInvites] = useState<AdminInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [resetResult, setResetResult] = useState<{ userId: string; password: string } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    try {
      const [usersRes, invitesRes] = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/admin/invites"),
      ]);
      const usersData = await usersRes.json();
      const invitesData = await invitesRes.json();
      setUsers(usersData.users ?? []);
      setInvites(invitesData.invites ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function handleCreateInvite() {
    setCreatingInvite(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/invites", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao gerar convite");
        return;
      }
      await loadAll();
    } finally {
      setCreatingInvite(false);
    }
  }

  async function handleResetPassword(userId: string) {
    setError(null);
    setResetResult(null);
    const res = await fetch(`/api/admin/users/${userId}/reset-password`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Falha ao resetar senha");
      return;
    }
    setResetResult({ userId, password: data.temporaryPassword });
  }

  if (loading) {
    return <p className="text-sm text-text-muted">Carregando...</p>;
  }

  return (
    <div className="flex flex-col gap-10">
      {error && <p className="text-sm text-jump-red-bright">{error}</p>}

      <section>
        <div className="mb-3 flex items-center gap-3">
          <h2 className="font-display text-lg uppercase text-text-primary">Convites</h2>
          <button
            onClick={handleCreateInvite}
            disabled={creatingInvite}
            className="jump-shadow border-2 border-border-strong bg-jump-red px-3 py-1.5 font-display text-xs uppercase tracking-wide text-text-primary transition hover:bg-jump-red-bright disabled:opacity-50"
          >
            {creatingInvite ? "Gerando..." : "+ Gerar convite"}
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {invites.length === 0 && (
            <p className="text-sm text-text-muted">Nenhum convite gerado ainda.</p>
          )}
          {invites.map((invite) => {
            const expired = invite.expiresAt ? new Date(invite.expiresAt) < new Date() : false;
            const status = invite.usedBy ? "usado" : expired ? "expirado" : "disponível";
            return (
              <div
                key={invite.id}
                className="flex flex-wrap items-center gap-3 border border-border bg-surface p-3 text-sm"
              >
                <code className="text-text-body">{invite.code}</code>
                <span
                  className={`jump-badge px-2 py-0.5 text-[10px] font-bold uppercase ${
                    status === "disponível"
                      ? "bg-status-completed text-ink"
                      : status === "usado"
                        ? "bg-surface-raised text-text-muted"
                        : "bg-jump-red text-text-primary"
                  }`}
                >
                  {status}
                </span>
                {invite.usedBy && (
                  <span className="text-text-muted">
                    por {invite.usedBy.displayName} ({invite.usedBy.email})
                  </span>
                )}
                {!invite.usedBy && invite.expiresAt && (
                  <span className="text-text-muted">expira em {fmtDate(invite.expiresAt)}</span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="font-display mb-3 text-lg uppercase text-text-primary">Usuários</h2>
        <div className="flex flex-col gap-2">
          {users.map((u) => (
            <div
              key={u.id}
              className="flex flex-wrap items-center gap-3 border border-border bg-surface p-3 text-sm"
            >
              <span className="font-semibold text-text-primary">{u.displayName}</span>
              <span className="text-text-muted">{u.email}</span>
              {u.role === "ADMIN" && (
                <span className="jump-badge bg-jump-yellow px-2 py-0.5 text-[10px] font-bold uppercase text-ink">
                  admin
                </span>
              )}
              <span className="text-text-muted">desde {fmtDate(u.createdAt)}</span>
              <button
                onClick={() => handleResetPassword(u.id)}
                className="ml-auto text-xs text-text-muted underline-offset-2 hover:text-text-body hover:underline"
              >
                Resetar senha
              </button>
              {resetResult?.userId === u.id && (
                <div className="w-full border-l-2 border-jump-yellow bg-surface-raised p-2 text-xs text-text-body">
                  Nova senha temporária (mostrada só uma vez, repasse por
                  fora): <code className="text-jump-yellow">{resetResult.password}</code>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
