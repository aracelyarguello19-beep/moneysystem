import type { ReactNode } from "react";

// Header de página exacto de Stitch: título grande + subtítulo + acciones a
// la derecha, con el borde inferior que separa del contenido.
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col justify-between gap-4 border-b border-outline-variant pb-4 md:mb-8 md:flex-row md:items-end">
      <div className="min-w-0">
        <h1 className="font-display text-headline-lg-mobile font-light tracking-tight text-on-surface md:text-headline-lg">
          {title}
        </h1>
        {description && <p className="mt-1 text-body-md text-on-surface-variant">{description}</p>}
      </div>
      {/* `flex-wrap`: varias acciones no entran en una fila a 375px. */}
      {actions && <div className="flex flex-wrap gap-2 sm:gap-3">{actions}</div>}
    </header>
  );
}
