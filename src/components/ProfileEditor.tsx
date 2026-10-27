"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import EditIcon from "@mui/icons-material/Edit";
import { Box, ButtonBase, Chip, IconButton, InputBase, Typography } from "@mui/material";
import { AvatarPickerDialog, PROFILE_ACCENT } from "@/components/AvatarPickerDialog";
import { UserAvatar } from "@/components/UserAvatar";
import { MONTHS } from "@/lib/birthdayDates";
import { useCurrentUser, useSetCurrentUser } from "@/lib/auth/useCurrentUser";

type Me = { id: string; displayName: string; handle: string | null; bio: string | null; avatarUrl: string | null; bannerUrl: string | null; favoriteAnime: string | null; favoriteCharacter: string | null; favoriteGenres: string[]; birthDay: number | null; birthMonth: number | null };

const outlined = (enabled: boolean, accent: boolean) => ({
  px: 4,
  py: 1.5,
  minWidth: 140,
  border: "2px solid",
  borderColor: accent ? PROFILE_ACCENT : enabled ? "#9a9a9a" : "#4b4b4b",
  color: accent ? PROFILE_ACCENT : enabled ? "#f2f2f5" : "#6b6b6b",
  fontSize: 14,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase" as const,
  "&:hover": enabled || accent ? { bgcolor: "rgba(255,255,255,0.06)" } : undefined,
  "&:focus-visible": { outline: "2px solid #ffd400", outlineOffset: 2 },
});

const SELECT_SX = { fontSize: 18, py: 0.75, px: 0.5, bgcolor: "transparent", color: "text.primary", border: 0, borderBottom: "2px solid #6b6b6b", fontFamily: "inherit", "&:focus": { outline: "none", borderBottomColor: PROFILE_ACCENT }, "&:focus-visible": { outline: "2px solid #ffd400", outlineOffset: 2 }, "& option": { bgcolor: "#171820" } } as const;

function Field({ id, label, value, onChange, help, placeholder, maxLength, multiline = false }: { id: string; label: string; value: string; onChange: (v: string) => void; help: string; placeholder?: string; maxLength: number; multiline?: boolean }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
      <Typography component="label" htmlFor={id} sx={{ fontSize: 13, color: "text.secondary" }}>
        {label}
      </Typography>
      <InputBase
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        multiline={multiline}
        minRows={multiline ? 2 : undefined}
        maxRows={multiline ? 5 : undefined}
        inputProps={{ maxLength }}
        sx={{ fontSize: 20, py: 0.75, borderBottom: "2px solid #6b6b6b", "&:focus-within": { borderBottomColor: PROFILE_ACCENT }, "& input::placeholder, & textarea::placeholder": { color: "#6b6b6b", opacity: 1 } }}
      />
      <Typography sx={{ fontSize: 13, color: "text.secondary", lineHeight: 1.6 }}>{help}</Typography>
    </Box>
  );
}

/**
 * Editar Perfil, no estilo da Crunchyroll: faixa de banner no topo, avatar redondo sobreposto com o lápis,
 * campos com sublinhado e os botões SALVAR / CANCELAR. Avatar e banner vêm das obras que a pessoa acompanha
 * (e gravam ao salvar no seletor); nome, identificador e bio gravam com SALVAR.
 */
export function ProfileEditor({ me, genreOptions = [] }: { me: Me; genreOptions?: string[] }) {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const setCurrentUser = useSetCurrentUser();
  const [name, setName] = useState(me.displayName);
  const [handle, setHandle] = useState(me.handle ?? "");
  const [bio, setBio] = useState(me.bio ?? "");
  const [favoriteAnime, setFavoriteAnime] = useState(me.favoriteAnime ?? "");
  const [favoriteCharacter, setFavoriteCharacter] = useState(me.favoriteCharacter ?? "");
  const [favoriteGenres, setFavoriteGenres] = useState<string[]>(me.favoriteGenres);
  const [birthDay, setBirthDay] = useState(me.birthDay ? String(me.birthDay) : "");
  const [birthMonth, setBirthMonth] = useState(me.birthMonth ? String(me.birthMonth) : "");
  const [avatar, setAvatar] = useState(me.avatarUrl);
  const [banner, setBanner] = useState(me.bannerUrl);
  const [picker, setPicker] = useState<"avatar" | "banner" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    name.trim() !== me.displayName ||
    handle.trim() !== (me.handle ?? "") ||
    bio.trim() !== (me.bio ?? "") ||
    favoriteAnime.trim() !== (me.favoriteAnime ?? "") ||
    favoriteCharacter.trim() !== (me.favoriteCharacter ?? "") ||
    favoriteGenres.join(",") !== me.favoriteGenres.join(",") ||
    birthDay !== (me.birthDay ? String(me.birthDay) : "") ||
    birthMonth !== (me.birthMonth ? String(me.birthMonth) : "");
  const canSave = dirty && name.trim().length > 0 && !busy;

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, string | string[] | number | null> = {
        displayName: name,
        bio,
        favoriteAnime,
        favoriteCharacter,
        favoriteGenres,
        birthDay: birthDay ? Number(birthDay) : null,
        birthMonth: birthMonth ? Number(birthMonth) : null,
      };
      if (handle.trim()) payload.handle = handle;
      const res = await fetch("/api/users/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Não foi possível salvar. Tente de novo.");
        return;
      }
      if (currentUser) setCurrentUser({ ...currentUser, displayName: data.displayName, handle: data.handle });
      router.push(`/users/${me.id}`);
      router.refresh();
    } catch {
      setError("Não foi possível salvar. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  function savedImage(kind: "avatar" | "banner", url: string | null) {
    if (kind === "avatar") {
      setAvatar(url);
      if (currentUser) setCurrentUser({ ...currentUser, avatarUrl: url });
    } else {
      setBanner(url);
    }
    router.refresh();
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }} data-testid="profile-editor">
      <Typography component="h1" sx={{ fontSize: 30, fontWeight: 700 }}>
        Editar Perfil
      </Typography>

      <Box sx={{ width: "100%", maxWidth: 510, bgcolor: "#141414", pb: 5 }}>
        <Box sx={{ position: "relative", height: 140, bgcolor: "#2a2a2a", overflow: "hidden" }}>
          {banner && <Box component="img" src={banner} alt="" data-testid="profile-banner" sx={{ width: "100%", height: "100%", objectFit: "cover" }} />}
          <IconButton
            onClick={() => setPicker("banner")}
            aria-label="Editar banner"
            data-testid="edit-banner"
            size="small"
            sx={{ position: "absolute", right: 8, bottom: 8, bgcolor: "rgba(210,210,210,0.85)", color: "#111", "&:hover": { bgcolor: "#fff" } }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
        </Box>
        <Box sx={{ position: "relative", width: 96, height: 96, mx: "auto", mt: "-48px", borderRadius: "50%", border: "4px solid #141414", bgcolor: "#141414" }}>
          <UserAvatar id={me.id} displayName={name || me.displayName} avatarUrl={avatar} size={88} />
          <IconButton
            onClick={() => setPicker("avatar")}
            aria-label="Editar avatar"
            data-testid="edit-avatar"
            size="small"
            sx={{ position: "absolute", right: -4, bottom: -4, bgcolor: "rgba(210,210,210,0.95)", color: "#111", border: "2px solid #141414", "&:hover": { bgcolor: "#fff" } }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
        </Box>

        <Box sx={{ px: { xs: 3, sm: 7 }, pt: 4, display: "flex", flexDirection: "column", gap: 4 }}>
          <Field id="profile-name" label="Nome do Perfil" value={name} onChange={setName} maxLength={40} help="Este é o nome mostrado nas suas publicações e no seu perfil. Pode ser alterado a qualquer tempo." />
          <Field
            id="profile-handle"
            label="Nome de usuário (opcional)"
            value={handle}
            onChange={setHandle}
            placeholder="seu_identificador"
            maxLength={21}
            help="3 a 20 caracteres: letras sem acento, números e _. Aparece como @identificador e é único."
          />
          <Field id="profile-bio" label="Quem sou eu (opcional)" value={bio} onChange={setBio} multiline maxLength={300} placeholder="uma frase sobre você" help="Até 300 caracteres. Aparece no seu perfil público." />
          <Field id="profile-favorite-anime" label="Anime favorito (opcional)" value={favoriteAnime} onChange={setFavoriteAnime} maxLength={80} placeholder="ex.: Frieren" help="Aparece no quem sou eu do seu perfil." />
          <Field id="profile-favorite-character" label="Personagem favorito (opcional)" value={favoriteCharacter} onChange={setFavoriteCharacter} maxLength={80} placeholder="ex.: Himmel" help="Aparece no quem sou eu do seu perfil." />
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            <Typography component="span" sx={{ fontSize: 13, color: "text.secondary" }}>
              Aniversário (opcional)
            </Typography>
            <Box sx={{ display: "flex", gap: 2 }}>
              <Box component="select" value={birthDay} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setBirthDay(e.target.value)} aria-label="Dia do aniversário" data-testid="profile-birth-day" sx={SELECT_SX}>
                <option value="">Dia</option>
                {Array.from({ length: 31 }, (_, i) => (
                  <option key={i + 1} value={String(i + 1)}>
                    {i + 1}
                  </option>
                ))}
              </Box>
              <Box component="select" value={birthMonth} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setBirthMonth(e.target.value)} aria-label="Mês do aniversário" data-testid="profile-birth-month" sx={SELECT_SX}>
                <option value="">Mês</option>
                {MONTHS.map((m, i) => (
                  <option key={m} value={String(i + 1)}>
                    {m}
                  </option>
                ))}
              </Box>
            </Box>
            <Typography sx={{ fontSize: 13, color: "text.secondary", lineHeight: 1.6 }}>Sem o ano. Só seus amigos veem, e eles recebem um lembrete no dia.</Typography>
          </Box>
          {genreOptions.length > 0 && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }} data-testid="profile-favorite-genres">
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: "text.secondary" }}>Gêneros favoritos (até 5)</Typography>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                {genreOptions.map((g) => {
                  const on = favoriteGenres.includes(g);
                  return (
                    <Chip
                      key={g}
                      label={g}
                      clickable
                      color={on ? "primary" : "default"}
                      variant={on ? "filled" : "outlined"}
                      disabled={!on && favoriteGenres.length >= 5}
                      onClick={() => setFavoriteGenres((cur) => (on ? cur.filter((x) => x !== g) : [...cur, g]))}
                      data-testid={`profile-genre-${g}`}
                    />
                  );
                })}
              </Box>
            </Box>
          )}
          {error && (
            <Typography role="alert" data-testid="profile-edit-error" sx={{ fontSize: 14, color: "#ef4444" }}>
              {error}
            </Typography>
          )}
        </Box>
      </Box>

      <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap", justifyContent: "center" }}>
        <ButtonBase onClick={() => void save()} disabled={!canSave} sx={outlined(canSave, false)} data-testid="profile-edit-save">
          {busy ? "Salvando…" : "Salvar"}
        </ButtonBase>
        <ButtonBase onClick={() => router.push(`/users/${me.id}`)} disabled={busy} sx={outlined(true, true)} data-testid="profile-edit-cancel">
          Cancelar
        </ButtonBase>
      </Box>

      {picker && (
        <AvatarPickerDialog
          open
          kind={picker}
          userId={me.id}
          displayName={name || me.displayName}
          current={picker === "avatar" ? avatar : banner}
          onClose={() => setPicker(null)}
          onSaved={(url) => savedImage(picker, url)}
        />
      )}
    </Box>
  );
}
