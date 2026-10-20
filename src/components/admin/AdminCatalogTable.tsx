"use client";

import { useCallback, useRef, useState } from "react";
import { InfiniteFooter } from "@/components/InfiniteFooter";
import { AdminTable } from "@/components/admin/AdminUi";
import type { AdminCatalogRow } from "@/lib/adminCatalog";
import { CATALOG_STATUS_LABELS } from "@/lib/types";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";

const FORMAT_LABEL: Record<string, string> = { TV: "TV", TV_SHORT: "TV curta", MOVIE: "Movie", OVA: "OVA", ONA: "ONA", SPECIAL: "Special", MUSIC: "Music" };

/**
 * Tabela do Catálogo do admin com rolagem infinita: a primeira página vem do servidor e as seguintes são pedidas
 * (`/api/admin/catalog/rows`) quando o fim da tabela se aproxima. `query` são os filtros da URL; ao mudá-los a página
 * remonta este componente (a lista volta ao começo).
 */
export function AdminCatalogTable({ initialRows, initialCursor, query }: { initialRows: AdminCatalogRow[]; initialCursor: string | null; query: string }) {
  const [rows, setRows] = useState(initialRows);
  const [cursor, setCursor] = useState(initialCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);

  const loadMore = useCallback(() => {
    if (busy.current || cursor === null) return;
    busy.current = true;
    setLoadingMore(true);
    setFailed(false);
    fetch(`/api/admin/catalog/rows?${query}${query ? "&" : ""}cursor=${cursor}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("falha");
        const data = (await res.json()) as { rows: AdminCatalogRow[]; nextCursor: string | null };
        setRows((prev) => {
          const seen = new Set(prev.map((r) => r.key));
          return [...prev, ...data.rows.filter((r) => !seen.has(r.key))];
        });
        setCursor(data.nextCursor);
      })
      .catch(() => setFailed(true))
      .finally(() => {
        busy.current = false;
        setLoadingMore(false);
      });
  }, [cursor, query]);

  const { ref: sentinelRef, supported } = useInfiniteScroll(loadMore, cursor !== null && !failed, rows.length);

  return (
    <>
      <AdminTable
        caption="Produções do catálogo"
        testId="admin-catalog-table"
        rows={rows}
        rowKey={(r) => r.key}
        columns={[
          {
            key: "p",
            label: "Produção / Franquia",
            render: (r) => (
              <>
                <div>{r.production}</div>
                <div>{r.franchise}</div>
              </>
            ),
          },
          {
            key: "t",
            label: "Títulos",
            render: (r) => (
              <>
                {r.native && <div lang="ja">{r.native}</div>}
                {r.titles.map((t) => (
                  <div key={t}>{t}</div>
                ))}
              </>
            ),
          },
          {
            key: "s",
            label: "Tipo / Status",
            render: (r) => (
              <>
                <div>{r.format ? (FORMAT_LABEL[r.format] ?? r.format) : "—"}</div>
                <div>{r.status ? (CATALOG_STATUS_LABELS[r.status] ?? r.status) : "Data desconhecida"}</div>
              </>
            ),
          },
          {
            key: "f",
            label: "Fonte / Identificador",
            render: (r) => (
              <>
                <div>{r.source}</div>
                <div>{r.identifier}</div>
              </>
            ),
          },
        ]}
      />
      <InfiniteFooter
        testId="admin-catalog"
        sentinelRef={sentinelRef}
        supported={supported}
        hasMore={cursor !== null}
        loadingMore={loadingMore}
        failed={failed}
        onMore={loadMore}
        onRetry={loadMore}
        loadingLabel="Carregando mais obras…"
        moreLabel="Ver mais obras"
        endLabel={rows.length > 25 ? "Fim do catálogo." : undefined}
      />
    </>
  );
}
