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
};

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

  // Rascunho: as imagens já enviadas voltam (só no navegador).
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "[]") as unknown;
      if (Array.isArray(saved) && saved.length) {
        const urls = saved.filter((u): u is string => typeof u === "string").slice(0, MAX_COMPOSER_IMAGES);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setItems(urls.map((url) => ({ id: nextId(), preview: url, url, status: "done" })));
      }
    } catch {
      // sessionStorage indisponível ou rascunho estragado: começa sem imagens.
    }
  }, [storageKey]);
  const doneUrls = items.filter((i) => i.status === "done" && i.url).map((i) => i.url as string);
  const doneKey = doneUrls.join("\n");
  useEffect(() => {
    try {
      if (doneKey) sessionStorage.setItem(storageKey, JSON.stringify(doneKey.split("\n")));
      else sessionStorage.removeItem(storageKey);
    } catch {
      // idem
    }
  }, [doneKey, storageKey]);

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
        accepted.push({ id: nextId(), preview: URL.createObjectURL(file), url: null, status: "uploading" });
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
    uploading: items.some((i) => i.status === "uploading"),
    failed: items.some((i) => i.status === "error"),
    full: items.length >= MAX_COMPOSER_IMAGES,
    notice,
    addFiles,
    remove,
    clear,
  };
}
