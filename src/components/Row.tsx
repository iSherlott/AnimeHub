import { ReactNode } from "react";

export function Row({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="group/row relative">
      <div className="flex items-center gap-2 px-6 sm:px-10">
        <span className="h-4 w-1.5 -skew-x-12 bg-jump-red" />
        <h2 className="font-display text-lg uppercase tracking-wide text-text-primary">
          {title}
        </h2>
      </div>

      <div className="pointer-events-none absolute inset-y-8 left-0 z-10 w-6 bg-gradient-to-r from-ink to-transparent opacity-0 transition-opacity duration-300 group-hover/row:opacity-100 sm:w-10" />
      <div className="pointer-events-none absolute inset-y-8 right-0 z-10 w-6 bg-gradient-to-l from-ink to-transparent opacity-0 transition-opacity duration-300 group-hover/row:opacity-100 sm:w-10" />

      <div className="no-scrollbar flex gap-2 overflow-x-auto px-6 pb-6 pt-4 sm:gap-3 sm:px-10">
        {children}
      </div>
    </section>
  );
}
