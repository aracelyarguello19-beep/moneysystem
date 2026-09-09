import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        // `text-base` en mobile: iOS hace zoom automático al enfocar un input
        // con font-size < 16px y eso descuadra el viewport de toda la página.
        // `w-full` evita que el ancho intrínseco del input desborde su celda.
        "min-h-11 w-full rounded border border-default px-3 py-2 text-base md:min-h-0 md:text-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
