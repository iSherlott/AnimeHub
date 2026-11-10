"use client";

import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { STICKY_NAME_CELL_SX } from "@/components/admin/adminTableSx";

type AdminUser = {
  id: string;
  email: string;
  displayName: string;
  /** Nome de usuário (@), fixo; contas antigas podem ainda não ter. */
  handle?: string | null;
  role: string;
  /** Ainda com a senha provisória (conta nova ou senha redefinida). */
  mustChangePassword?: boolean;
  createdAt: string;
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

/**
 * Admin → Acesso: criar conta (sistema fechado: toda conta nasce aqui, como membro, com o link de uso único para a
 * pessoa definir a senha), a lista de usuários com papel e @, e "Resetar senha". Só o administrador vê esta parte.
 */
export function AdminAccounts({ currentUserId }: { currentUserId?: string }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newHandle, setNewHandle] = useState("");
  const [creatingAccount, setCreatingAccount] = useState(false);
  // Senha provisória e link recém-gerados (conta criada ou senha redefinida): mostrados uma vez, num diálogo.
  const [resetResult, setResetResult] = useState<{ userId: string; password: string; link?: string; created?: { displayName: string; email: string } } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Guarda síncrona contra clique duplo em "Criar conta": o `disabled` do botão só reflete no próximo render, e um
  // segundo clique real antes disso criaria a mesma conta duas vezes (achado da 5ª rodada de auditoria, Epic 18).
  const creatingAccountRef = useRef(false);

  async function loadUsers() {
    setLoading(true);
    try {
      const data = await (await fetch("/api/admin/users")).json();
      setUsers(data.users ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadUsers();
  }, []);

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    if (creatingAccountRef.current) return;
    creatingAccountRef.current = true;
    setCreatingAccount(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: newName, email: newEmail, handle: newHandle }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Falha ao criar a conta");
        return;
      }
      setUsers((current) => [...current, data.user]);
      setResetResult({ userId: data.user.id, password: data.temporaryPassword, link: data.passwordLink, created: { displayName: data.user.displayName, email: data.user.email } });
      setNewName("");
      setNewEmail("");
      setNewHandle("");
    } finally {
      creatingAccountRef.current = false;
      setCreatingAccount(false);
    }
  }

  // Papel (Fase 9): só o administrador muda; o servidor recusa tirar o próprio papel e deixar o sistema sem administrador.
  async function handleRoleChange(userId: string, role: string) {
    setError(null);
    const res = await fetch(`/api/admin/users/${userId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Falha ao mudar o papel");
      return;
    }
    setUsers((current) => current.map((u) => (u.id === userId ? { ...u, role } : u)));
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
    setResetResult({ userId, password: data.temporaryPassword, link: data.passwordLink });
    setUsers((current) => current.map((u) => (u.id === userId ? { ...u, mustChangePassword: true } : u)));
  }

  if (loading) {
    return (
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        Carregando...
      </Typography>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {error && <Alert severity="error">{error}</Alert>}

      <Box component="section" aria-labelledby="admin-new-account">
        <Typography id="admin-new-account" variant="h6" component="h2" className="font-display" sx={{ mb: 0.5, textTransform: "uppercase" }}>
          Criar conta
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
          O AnimeHub é fechado: só daqui nascem contas, sempre como membro. Você recebe um link de uso único para mandar à
          pessoa (por WhatsApp, por exemplo): por ele, ela mesma define a senha. Esqueceu a senha? Em Usuários, gere um link
          novo.
        </Typography>
        <Box component="form" onSubmit={handleCreateAccount} sx={{ display: "flex", flexWrap: "wrap", gap: 2, alignItems: "flex-start" }}>
          <TextField label="Nome" size="small" required value={newName} onChange={(e) => setNewName(e.target.value)} slotProps={{ htmlInput: { maxLength: 60 } }} sx={{ flex: "1 1 200px" }} />
          <TextField
            label="Nome de usuário"
            size="small"
            required
            value={newHandle}
            // Fixo e em minúsculas, sem espaço nem caractere especial: o campo já ajusta enquanto digita.
            onChange={(e) => setNewHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
            helperText="Fixo: 3 a 20 letras minúsculas, números ou _."
            slotProps={{ htmlInput: { maxLength: 20, "data-testid": "new-account-handle" }, input: { startAdornment: <Typography component="span" sx={{ color: "text.secondary", mr: 0.25 }}>@</Typography> } }}
            sx={{ flex: "1 1 200px" }}
          />
          <TextField label="E-mail" type="email" size="small" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} slotProps={{ htmlInput: { maxLength: 254 } }} sx={{ flex: "1 1 240px" }} />
          <Button type="submit" variant="contained" disabled={creatingAccount} sx={{ minHeight: 40 }}>
            {creatingAccount ? "Criando..." : "Criar conta"}
          </Button>
        </Box>
      </Box>

      <Box component="section">
        <Typography variant="h6" component="h2" className="font-display" sx={{ mb: 1.5, textTransform: "uppercase" }}>
          Usuários
        </Typography>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small" aria-label="Usuários cadastrados">
            <TableHead>
              <TableRow>
                <TableCell sx={STICKY_NAME_CELL_SX}>Nome</TableCell>
                <TableCell>E-mail</TableCell>
                <TableCell>Desde</TableCell>
                <TableCell>Papel</TableCell>
                <TableCell align="right">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell sx={STICKY_NAME_CELL_SX}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {u.displayName}
                      </Typography>
                      {u.role === "ADMIN" && (
                        <Chip label="admin" size="small" sx={{ bgcolor: "secondary.main", color: "#0b0b0d", fontWeight: 700, fontSize: 10 }} />
                      )}
                      {u.mustChangePassword && <Chip label="senha provisória" size="small" variant="outlined" sx={{ fontWeight: 700, fontSize: 10 }} />}
                    </Box>
                    <HandleCell user={u} onSaved={(handle) => setUsers((current) => current.map((x) => (x.id === u.id ? { ...x, handle } : x)))} />
                  </TableCell>
                  <TableCell sx={{ color: "text.secondary" }}>{u.email}</TableCell>
                  <TableCell sx={{ color: "text.secondary" }}>{fmtDate(u.createdAt)}</TableCell>
                  <TableCell>
                    <Box
                      component="select"
                      aria-label={`Papel de ${u.displayName}`}
                      data-testid={`user-role-${u.id}`}
                      value={u.role}
                      disabled={u.id === currentUserId}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => void handleRoleChange(u.id, e.target.value)}
                      sx={{ bgcolor: "background.paper", color: "text.primary", border: 1, borderColor: "divider", borderRadius: "6px", p: 0.5 }}
                    >
                      {Object.entries(ROLE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    <Button onClick={() => handleResetPassword(u.id)} size="small" color="inherit">
                      Resetar senha
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      {/* Diálogo em vez de revelar inline na tabela — o Alert inline
          (mt: 1 dentro da célula) visualmente sobrepunha a linha de baixo
          em vez de empurrá-la (achado real da 3ª rodada de auditoria,
          Epic 18); um Dialog nunca colide com o conteúdo ao redor. */}
      <Dialog open={resetResult !== null} onClose={() => setResetResult(null)}>
        <DialogTitle>{resetResult?.created ? "Conta criada" : "Link de nova senha"}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {resetResult?.created
              ? `A conta de ${resetResult.created.displayName} (${resetResult.created.email}) foi criada como membro. Mande este link para a pessoa: por ele, ela define a própria senha e já entra.`
              : "Mande este link para a pessoa: por ele, ela define a nova senha e já entra. As sessões abertas dela foram encerradas."}
          </DialogContentText>
          {resetResult?.link && <PasswordLinkBox path={resetResult.link} />}
          <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 1 }}>Vale uma vez só, por 48 horas. Mostrado só agora.</Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 2 }}>Se preferir ditar, a senha provisória (a pessoa troca no primeiro acesso):</Typography>
          <Box component="code" data-testid="temporary-password" sx={{ display: "block", mt: 0.5, fontWeight: 700, fontSize: 16 }}>
            {resetResult?.password}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetResult(null)}>Fechar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/** O link completo (com o endereço do site) e um botão de copiar: é o que o admin manda pelo WhatsApp. */
function PasswordLinkBox({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window === "undefined" ? path : `${window.location.origin}${path}`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <Box sx={{ display: "flex", gap: 1, alignItems: "center", mt: 2, flexWrap: "wrap" }}>
      <Box component="code" data-testid="password-link" sx={{ flex: "1 1 260px", minWidth: 0, overflowWrap: "anywhere", fontSize: 13, p: 1, borderRadius: "8px", bgcolor: "#171820" }}>
        {url}
      </Box>
      <Button size="small" variant="contained" onClick={() => void copy()} data-testid="password-link-copy">
        {copied ? "Copiado" : "Copiar link"}
      </Button>
    </Box>
  );
}

/**
 * O @ da pessoa na tabela de usuários. Fixo para ela; o administrador define nas contas antigas que ainda não têm
 * (ou corrige um erro de digitação).
 */
function HandleCell({ user, onSaved }: { user: AdminUser; onSaved: (handle: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(user.handle ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle: value }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Não foi possível salvar.");
        return;
      }
      onSaved(data.handle);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Typography variant="body2" sx={{ color: user.handle ? "text.secondary" : "warning.main", fontSize: 12 }} data-testid={`user-handle-${user.id}`}>
          {user.handle ? `@${user.handle}` : "sem nome de usuário"}
        </Typography>
        <Button size="small" color="inherit" onClick={() => setEditing(true)} sx={{ minWidth: 0, px: 0.75, fontSize: 11 }} data-testid={`user-handle-edit-${user.id}`}>
          {user.handle ? "corrigir" : "definir"}
        </Button>
      </Box>
    );
  }
  return (
    <Box component="form" onSubmit={save} sx={{ display: "flex", alignItems: "flex-start", gap: 1, mt: 0.5 }}>
      <TextField
        size="small"
        value={value}
        autoFocus
        onChange={(e) => setValue(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
        error={Boolean(error)}
        helperText={error ?? undefined}
        slotProps={{ htmlInput: { maxLength: 20, "aria-label": `Nome de usuário de ${user.displayName}`, "data-testid": `user-handle-input-${user.id}` } }}
        sx={{ width: 180 }}
      />
      <Button type="submit" size="small" variant="contained" disabled={saving}>
        Salvar
      </Button>
      <Button size="small" color="inherit" onClick={() => setEditing(false)}>
        Cancelar
      </Button>
    </Box>
  );
}
