export function FilterChipRow({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string | null;
  onChange: (value: string | null) => void;
}) {
  if (options.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3">
      <span className="font-display w-24 flex-shrink-0 pt-1.5 text-xs uppercase tracking-wide text-text-muted">
        {label}
      </span>
      <div className="no-scrollbar flex gap-2 overflow-x-auto sm:flex-wrap">
        {options.map((opt) => {
          const active = opt.value === selected;
          return (
            <button
              key={opt.value}
              onClick={() => onChange(active ? null : opt.value)}
              className={`jump-badge flex-shrink-0 px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition ${
                active
                  ? "bg-jump-red text-text-primary"
                  : "border border-border bg-surface text-text-muted hover:border-text-muted"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
