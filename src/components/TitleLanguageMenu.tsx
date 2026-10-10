"use client";

import { useId, useState, type MouseEvent } from "react";
import TuneIcon from "@mui/icons-material/Tune";
import CheckIcon from "@mui/icons-material/Check";
import { IconButton, ListItemIcon, Menu, MenuItem, Typography, Divider } from "@mui/material";
import {
  useTitlePreference,
  type JapaneseScript,
  type TitleLanguage,
} from "@/lib/titlePreference";

const LANGUAGE_LABELS: Record<TitleLanguage, string> = {
  pt: "PT",
  en: "EN",
  ja: "JP",
};

const SCRIPT_LABELS: Record<JapaneseScript, string> = {
  romaji: "Romaji",
  furigana: "Kanji + furigana",
  kanji: "Só kanji (kana+kanji)",
};

/**
 * Só os `<MenuItem>` de idioma/escrita japonesa, sem o `IconButton`/`Menu`
 * que os envolve — extraído pra dar pra reaproveitar dentro do
 * `AccountMenu` (Epic 27, lote 3), que funde essa escolha de idioma com
 * conta/sair num único dropdown pra quem está logado, sem duplicar esta
 * lista. `onSelect` fecha o menu de fora (cada chamador cuida do próprio
 * `anchorEl`).
 */
export function LanguageMenuItems({ onSelect }: { onSelect: () => void }) {
  const { preference, setPreference } = useTitlePreference();

  return (
    <>
      <Typography variant="overline" sx={{ px: 2, color: "text.secondary" }}>
        Idioma do título
      </Typography>
      {(Object.keys(LANGUAGE_LABELS) as TitleLanguage[]).map((lang) => (
        <MenuItem
          key={lang}
          selected={preference.language === lang}
          onClick={() => {
            setPreference({ ...preference, language: lang });
            onSelect();
          }}
        >
          <ListItemIcon>
            {preference.language === lang && <CheckIcon fontSize="small" />}
          </ListItemIcon>
          {LANGUAGE_LABELS[lang]}
        </MenuItem>
      ))}

      {preference.language === "ja" && [
        <Divider key="divider" />,
        <Typography key="label" variant="overline" sx={{ px: 2, color: "text.secondary" }}>
          Escrita japonesa
        </Typography>,
        ...(Object.keys(SCRIPT_LABELS) as JapaneseScript[]).map((script) => (
          <MenuItem
            key={script}
            selected={preference.japaneseScript === script}
            onClick={() => {
              setPreference({ ...preference, japaneseScript: script });
              onSelect();
            }}
          >
            <ListItemIcon>
              {preference.japaneseScript === script && <CheckIcon fontSize="small" />}
            </ListItemIcon>
            {SCRIPT_LABELS[script]}
          </MenuItem>
        )),
      ]}
    </>
  );
}

/** Usado só por quem NÃO está logado — logado, o mesmo conteúdo (via
 * `LanguageMenuItems`) mora dentro do `AccountMenu`. */
export function TitleLanguageMenu() {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);
  const buttonId = useId();
  const menuId = useId();

  function handleOpen(e: MouseEvent<HTMLElement>) {
    setAnchorEl(e.currentTarget);
  }
  function handleClose() {
    setAnchorEl(null);
  }

  return (
    <>
      <IconButton
        id={buttonId}
        onClick={handleOpen}
        size="small"
        title="Configurações do título"
        aria-label="Configurações do título"
        aria-haspopup="true"
        aria-controls={open ? menuId : undefined}
        aria-expanded={open ? "true" : undefined}
        sx={{ width: 44, height: 44 }}
      >
        <TuneIcon fontSize="small" />
      </IconButton>

      <Menu
        id={menuId}
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        slotProps={{ list: { "aria-labelledby": buttonId } }}
      >
        <LanguageMenuItems onSelect={handleClose} />
      </Menu>
    </>
  );
}
