"use client";

import NextLink from "next/link";
import { Button, type ButtonProps } from "@mui/material";

/**
 * Wrapper client-only pra `<Button component={NextLink}>` — Server
 * Components não podem passar a referência de função do NextLink como prop
 * direta pro Button (Client Component) do MUI; a função não serializa
 * através da fronteira RSC. Isolando a composição aqui (só props
 * serializáveis cruzam a fronteira) resolve, mesmo padrão do MuiProviders.
 */
export function LinkButton({
  href,
  ...props
}: Omit<ButtonProps<typeof NextLink>, "component" | "href"> & { href: string }) {
  return <Button component={NextLink} href={href} {...props} />;
}
