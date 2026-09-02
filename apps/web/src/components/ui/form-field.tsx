import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface FormFieldProps {
  htmlFor: string;
  label: string;
  error?: string;
  className?: string;
  children: ReactNode;
}

/**
 * Molécula: agrupa Label + control + mensaje de error.
 * Reemplaza el patrón <div><label className="block text-sm">…</label><input .../></div>
 * repetido en los ~16 formularios detectados en el audit.
 */
export function FormField({ htmlFor, label, error, className, children }: FormFieldProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
