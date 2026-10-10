"use client";

import NextLink from "next/link";
import { Link as MuiLink, type LinkProps } from "@mui/material";

/**
 * Link de texto (MUI + next/link) utilizável a partir de Server Components:
 * a referência de função do NextLink não atravessa a fronteira RSC como prop
 * direta (mesmo motivo de LinkButton), então a composição fica aqui.
 */
export function AppLink({ href, ...props }: Omit<LinkProps<typeof NextLink>, "component" | "href"> & { href: string }) {
  return <MuiLink component={NextLink} href={href} {...props} />;
}
