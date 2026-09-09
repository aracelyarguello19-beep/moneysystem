"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        // `max-w-full overflow-x-auto`: con 4+ tabs el `inline-flex` se pasa
        // del ancho del viewport en mobile y arrastra scroll horizontal a toda
        // la página. Acá el scroll queda contenido dentro de la propia lista.
        "inline-flex max-w-full gap-1 overflow-x-auto rounded-lg border border-outline-variant bg-surface-container-low p-1",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-label-lg font-semibold text-on-surface-variant transition-colors sm:px-4",
        "hover:text-on-surface",
        "data-[state=active]:bg-surface-container-lowest data-[state=active]:text-on-surface data-[state=active]:shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("mt-4 flex flex-col gap-4", className)} {...props} />;
}
