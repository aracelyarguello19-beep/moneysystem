import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  "inline-flex items-center rounded text-[11px] font-bold uppercase tracking-wide px-2 py-0.5",
  {
    variants: {
      variant: {
        neutral: "bg-surface-container text-on-surface-variant",
        success: "bg-success/10 text-success",
        danger: "bg-error/10 text-error",
        warning: "bg-warning/10 text-warning",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
