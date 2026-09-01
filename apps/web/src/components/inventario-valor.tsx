"use client";

import { useEffect, useState } from "react";
import type { ValorInventario } from "@repo/domain";
import { obtenerValorInventario } from "@/actions/inventario/obtener-valor-inventario";

// AC1/AC2: stock y valor por producto, más el total agregado del negocio
// activo. AC4 (excluir Servicio) lo garantiza `calcularValorInventario` en
// `packages/database`, no esta vista.
export function InventarioValor({ negocioId }: { negocioId: string }) {
  const [valor, setValor] = useState<ValorInventario | null>(null);

  useEffect(() => {
    obtenerValorInventario(negocioId).then((result) => {
      if (result.ok) setValor(result.data);
    });
  }, [negocioId]);

  if (!valor) return null;

  if (valor.items.length === 0) {
    return <p className="text-sm text-gray-500">Todavía no hay productos con stock.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <table className="text-sm">
        <thead>
          <tr className="text-left text-gray-500">
            <th className="pr-4">Producto</th>
            <th className="pr-4">Stock</th>
            <th className="pr-4">Costo</th>
            <th>Valor</th>
          </tr>
        </thead>
        <tbody>
          {valor.items.map((item) => (
            <tr key={item.itemId}>
              <td className="pr-4">{item.nombre}</td>
              <td className="pr-4">{item.stockActual}</td>
              <td className="pr-4">{item.costoCompra}</td>
              <td>{item.valor}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="font-medium">Total en inventario: {valor.total}</p>
    </div>
  );
}
