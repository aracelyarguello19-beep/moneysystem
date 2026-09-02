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
    <header className="mb-8 flex flex-col justify-between gap-4 border-b border-outline-variant pb-4 md:flex-row md:items-end">
      <div>
        <h1 className="text-headline-lg-mobile font-bold tracking-tight text-on-surface md:text-headline-lg">
          {title}
        </h1>
        {description && <p className="mt-1 text-body-md text-on-surface-variant">{description}</p>}
      </div>
      {actions && <div className="flex gap-3">{actions}</div>}
    </header>
  );
}
