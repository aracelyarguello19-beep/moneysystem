import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

/**
 * Select nativo estilizado (no Radix): las 18 instancias detectadas en el
 * audit son listas de opciones simples ligadas a value/onChange primitivo
 * — el <select> nativo cubre el caso sin el costo de migrar cada call site
 * al patrón Item/Value de Radix. Si aparece un caso con búsqueda o
 * contenido rico, ese sí amerita @radix-ui/react-select (ya instalado).
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        // Mismo criterio que Input: 16px en mobile evita el zoom de iOS, y
        // `w-full` impide que el ancho intrínseco de la opción más larga
        // (ej. nombres de cuentas) estire y desborde la grilla del formulario.
        "min-h-11 w-full rounded border border-default px-3 py-2 text-base md:min-h-0 md:text-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = "Select";
