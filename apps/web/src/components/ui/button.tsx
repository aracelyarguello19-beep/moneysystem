import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded text-label-lg font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 active:scale-95",
  {
    variants: {
      variant: {
        // Disabled explícito en vez de solo opacity-50: `primary` es blanco
        // en tema oscuro (--color-primary en .dark, globals.css), así que un
        // botón deshabilitado a medio-opacity queda casi blanco sobre fondo
        // oscuro con el texto ilegible — necesita su propio par bg/texto que
        // funcione en los dos temas.
        primary: "bg-primary text-on-primary hover:opacity-90 disabled:bg-surface-container-high disabled:text-on-surface-variant",
        danger: "bg-error text-on-error hover:opacity-90 disabled:bg-surface-container-high disabled:text-on-surface-variant",
        outline: "border border-outline-variant bg-surface text-on-surface hover:bg-surface-container-high",
        ghost: "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface",
        link: "text-tertiary underline-offset-2 hover:underline",
      },
      size: {
        sm: "px-3 py-1",
        md: "px-4 py-2",
        lg: "px-4 py-2.5",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
