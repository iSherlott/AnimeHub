"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";

export default function SignupPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao criar conta");
        return;
      }
      router.push("/");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-ink">
      <Header />
      <div className="mx-auto max-w-sm px-6 py-16">
        <h1 className="font-display mb-6 text-2xl uppercase text-text-primary">Criar conta</h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="text"
            required
            placeholder="Nome de exibição"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="border border-border bg-surface p-2 text-sm text-text-primary placeholder:text-text-muted"
          />
          <input
            type="email"
            required
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border border-border bg-surface p-2 text-sm text-text-primary placeholder:text-text-muted"
          />
          <input
            type="password"
            required
            minLength={8}
            placeholder="Senha (mín. 8 caracteres)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border border-border bg-surface p-2 text-sm text-text-primary placeholder:text-text-muted"
          />
          {error && <p className="text-sm text-jump-red-bright">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="jump-shadow mt-2 border-2 border-border-strong bg-jump-red py-2 font-display uppercase tracking-wide text-text-primary transition hover:bg-jump-red-bright disabled:opacity-50"
          >
            {loading ? "Criando..." : "Criar conta"}
          </button>
        </form>
        <p className="mt-4 text-sm text-text-muted">
          Já tem conta?{" "}
          <Link href="/login" className="text-text-primary underline-offset-2 hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
