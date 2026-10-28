"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Rascunho das imagens de uma publicação nova (o campo do Feed e o editor completo dividem). */
export const DRAFT_IMAGES_KEY = "anime-hub:draft:new-post:images";
/** Quantas imagens uma publicação leva pelo campo (o servidor aceita até 6; o X, 4). */
export const MAX_COMPOSER_IMAGES = 4;
/** Mesmo limite do servidor (src/lib/uploadValidation.ts): recusa antes de mandar. */
const MAX_BYTES = 8 * 1024 * 1024;

export type PostImage = {
  id: string;
  /** O que a miniatura mostra: a prévia local enquanto envia, depois a imagem já guardada. */
  preview: string;
  /** Endereço da imagem guardada (só depois do envio). */
  url: string | null;
  status: "uploading" | "done" | "error";
  error?: string;
  /** Descrição da imagem (texto alternativo), escrita por quem posta; "" = sem descrição. */
  alt: string;
  /** Imagem marcada como spoiler: na publicação, fica borrada até a pessoa tocar. */
  spoiler: boolean;
};

/** Limite da descrição de uma imagem (o mesmo do servidor, `MAX_IMAGE_ALT_LENGTH`, e do ALT do X). */
export const MAX_IMAGE_ALT_LENGTH = 1000;

let seq = 0;
const nextId = () => `img-${Date.now()}-${(seq += 1)}`;

/**
 * Imagens de uma publicação nova: cada uma é enviada na hora em que é escolhida (POST /api/uploads, que reduz e guarda
 * em WebP; GIF continua animado), com prévia local enquanto sobe. `storageKey` guarda as já enviadas no rascunho
 * (sessionStorage), para irem junto do campo do Feed para o editor completo e sobreviverem ao login.
 */
export function usePostImages(storageKey: string) {
  const [items, setItems] = useState<PostImage[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  });

  // Rascunho: as imagens já enviadas (e as descrições) voltam (só no navegador). Aceita o formato antigo, só o endereço.
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "[]") as unknown;
      if (Array.isArray(saved) && saved.length) {
        const restored = saved
          .map((entry): { url: string; alt: string; spoiler: boolean } | null => {
            if (typeof entry === "string") return { url: entry, alt: "", spoiler: false };
            const e = entry as { url?: unknown; alt?: unknown; spoiler?: unknown } | null;
            return e && typeof e.url === "string" ? { url: e.url, alt: typeof e.alt === "string" ? e.alt.slice(0, MAX_IMAGE_ALT_LENGTH) : "", spoiler: e.spoiler === true } : null;
          })
          .filter((e): e is { url: string; alt: string; spoiler: boolean } => e !== null)
          .slice(0, MAX_COMPOSER_IMAGES);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setItems(restored.map(({ url, alt, spoiler }) => ({ id: nextId(), preview: url, url, status: "done", alt, spoiler })));
      }
    } catch {
      // sessionStorage indisponível ou rascunho estragado: começa sem imagens.
    }
  }, [storageKey]);
  const done = items.filter((i) => i.status === "done" && i.url);
  const doneUrls = done.map((i) => i.url as string);
  const doneAlts = done.map((i) => i.alt.trim());
  const doneSpoilers = done.map((i) => i.spoiler);
  const draft = JSON.stringify(done.map((i) => ({ url: i.url, alt: i.alt, spoiler: i.spoiler })));
  useEffect(() => {
    try {
      if (draft !== "[]") sessionStorage.setItem(storageKey, draft);
      else sessionStorage.removeItem(storageKey);
    } catch {
      // idem
    }
  }, [draft, storageKey]);

  // Prévias locais (blob:) são soltas quando saem da lista e ao desmontar.
  useEffect(() => () => itemsRef.current.forEach((i) => i.preview.startsWith("blob:") && URL.revokeObjectURL(i.preview)), []);

  const upload = useCallback(async (id: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/uploads", { method: "POST", body: form });
      const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      setItems((list) => list.map((i) => (i.id !== id ? i : res.ok && data?.url ? { ...i, url: data.url, status: "done" } : { ...i, status: "error", error: data?.error ?? "Não foi possível enviar a imagem." })));
    } catch {
      setItems((list) => list.map((i) => (i.id === id ? { ...i, status: "error", error: "Não foi possível enviar a imagem." } : i)));
    }
  }, []);

  const addFiles = useCallback(
    (files: Iterable<File>) => {
      const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
      if (images.length === 0) return;
      const room = MAX_COMPOSER_IMAGES - itemsRef.current.length;
      const accepted: PostImage[] = [];
      const problems: string[] = [];
      for (const file of images) {
        if (accepted.length >= room) {
          problems.push(`No máximo ${MAX_COMPOSER_IMAGES} imagens por publicação.`);
          break;
        }
        if (file.size > MAX_BYTES) {
          problems.push(`"${file.name}" passa de 8 MB.`);
          continue;
        }
        accepted.push({ id: nextId(), preview: URL.createObjectURL(file), url: null, status: "uploading", alt: "", spoiler: false });
        void upload(accepted[accepted.length - 1].id, file);
      }
      setNotice(problems.length ? problems.join(" ") : null);
      if (accepted.length) setItems((list) => [...list, ...accepted]);
    },
    [upload]
  );

  const remove = useCallback((id: string) => {
    setItems((list) => {
      const gone = list.find((i) => i.id === id);
      if (gone?.preview.startsWith("blob:")) URL.revokeObjectURL(gone.preview);
      return list.filter((i) => i.id !== id);
    });
    setNotice(null);
  }, []);

  const setAlt = useCallback((id: string, alt: string) => {
    setItems((list) => list.map((i) => (i.id === id ? { ...i, alt: alt.slice(0, MAX_IMAGE_ALT_LENGTH) } : i)));
  }, []);

  const toggleSpoiler = useCallback((id: string) => {
    setItems((list) => list.map((i) => (i.id === id ? { ...i, spoiler: !i.spoiler } : i)));
  }, []);

  const clear = useCallback(() => {
    setItems((list) => {
      list.forEach((i) => i.preview.startsWith("blob:") && URL.revokeObjectURL(i.preview));
      return [];
    });
    setNotice(null);
  }, []);

  return {
    items,
    urls: doneUrls,
    /** Descrições na mesma ordem de `urls` (vão juntas para o servidor). */
    alts: doneAlts,
    /** Marca de spoiler na mesma ordem de `urls`. */
    spoilers: doneSpoilers,
    uploading: items.some((i) => i.status === "uploading"),
    failed: items.some((i) => i.status === "error"),
    full: items.length >= MAX_COMPOSER_IMAGES,
    notice,
    addFiles,
    remove,
    setAlt,
    toggleSpoiler,
    clear,
  };
}
