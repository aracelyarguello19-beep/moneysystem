"use client";

import { useCallback, useEffect, useState } from "react";
import { GastoForm } from "@/components/gasto-form";
import { GastosLista } from "@/components/gastos-lista";
import { TipoGastoCatalogo } from "@/components/tipo-gasto-catalogo";
import { GastoFijoPanel } from "@/components/gasto-fijo-panel";
import { ResumenGastosChart } from "@/components/resumen-gastos-chart";
import {
  obtenerGastosPageData,
  type GastosPageData,
} from "@/actions/gastos/obtener-gastos-page-data";
import { useGastoCambiado } from "@/lib/gasto-events";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Dueño único del fetch de la página (mismo criterio que `IndicadoresPanel`):
// una sola llamada consolidada en vez de que cada componente hermano
// (GastoForm, GastosLista, TipoGastoCatalogo, GastoFijoPanel) pida su propio
// catálogo de tipos/monedas por separado.
export function GastosPanel({ negocioId }: { negocioId: string }) {
  const [data, setData] = useState<GastosPageData | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const result = await obtenerGastosPageData(negocioId);
    if (result.ok) {
      setData(result.data);
      setMensaje(null);
    } else {
      setMensaje(result.error.message);
    }
  }, [negocioId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useGastoCambiado(cargar);

  return (
    <main className="flex flex-col gap-8 p-margin-mobile md:p-margin-desktop">
      <PageHeader
        title="Gastos"
        description="Registro y análisis de gastos operativos del negocio."
        actions={data ? <TipoGastoCatalogo negocioId={negocioId} tiposGasto={data.tiposGasto} /> : undefined}
      />

      {mensaje && (
        <p role="alert" className="text-sm text-danger">
          {mensaje}
        </p>
      )}

      {data && (
        <>
          <ResumenGastosChart negocioId={negocioId} />

          <Tabs defaultValue="varios">
            <TabsList>
              <TabsTrigger value="varios">Gastos varios</TabsTrigger>
              <TabsTrigger value="fijos">Gastos fijos</TabsTrigger>
            </TabsList>

            <TabsContent value="varios">
              <Card>
                <CardHeader>
                  <CardTitle>Registrar gasto</CardTitle>
                </CardHeader>
                <GastoForm negocioId={negocioId} tiposGasto={data.tiposGasto} monedas={data.monedas} />
              </Card>

              <GastosLista
                negocioId={negocioId}
                gastos={data.gastos}
                tiposGasto={data.tiposGasto}
                monedas={data.monedas}
              />
            </TabsContent>

            <TabsContent value="fijos">
              <GastoFijoPanel negocioId={negocioId} gastosFijos={data.gastosFijos} monedas={data.monedas} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </main>
  );
}
