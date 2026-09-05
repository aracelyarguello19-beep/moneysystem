import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// twMerge no conoce la escala tipográfica custom de "Fiscal Precision"
// (globals.css `--text-*`) — por default cualquier `text-{palabra}` que no
// matchee un tamaño estándar de Tailwind (sm/lg/xl/...) cae en el mismo
// grupo que un color de texto custom (`text-on-primary`, `text-danger`,
// etc.), así que el último que aparece en la lista de clases pisa al otro
// aunque uno sea tamaño y el otro color. Ejemplo real: `<Button
// className="text-headline-sm">` sobre variant="primary" borraba
// silenciosamente `text-on-primary`, dejando el botón sin color de texto
// propio — heredaba el `color` del body, ilegible en el tema que no
// coincidiera. Declarar acá el tamaño como su propio grupo separa ambos.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "body-lg",
            "body-md",
            "label-lg",
            "label-md",
            "headline-lg",
            "headline-lg-mobile",
            "headline-md",
            "headline-sm",
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
