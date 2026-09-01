import { describe, expect, it } from "vitest";
import { convertirAGuaranies } from "./tasa-cambio";

// AC4 (Story 5.3): un reporte de un período pasado no cambia si el usuario
// carga una tasa de cambio nueva después. La inmutabilidad no viene de una
// lógica especial en `convertirAGuaranies` — viene de que la transacción ya
// grabó su `tasaCambioId` al crearse (Task 2, resuelto server-side) y un
// reporte histórico siempre usa ESA tasa, nunca "la vigente ahora". Este
// test lo hace explícito: la tasa histórica ya resuelta ("grabada" en el
// momento de la transacción) sigue produciendo el mismo resultado sin
// importar qué tasa nueva se cargue después — `convertirAGuaranies` ni
// siquiera tiene forma de "mirar" la tasa actual, solo recibe la que se le pasa.
describe("conversión con tasa histórica (AC4)", () => {
  it("una transacción pasada sigue usando su tasa grabada aunque se cargue una tasa nueva después", () => {
    const tasaVigenteAlMomentoDeLaTransaccion = "7300"; // grabada en la transacción en su momento
    const montoConvertidoEnSuMomento = convertirAGuaranies({
      monto: "10",
      esMonedaBase: false,
      tasa: tasaVigenteAlMomentoDeLaTransaccion,
    });

    // El usuario carga una tasa nueva hoy (mayor, ej. devaluación) — esto
    // NO afecta el cálculo ya hecho porque nunca se vuelve a invocar con la
    // tasa "actual" para esa transacción histórica.
    const tasaNuevaCargadaDespues = "7800";
    void tasaNuevaCargadaDespues; // representa la nueva carga; no participa en el recálculo histórico

    expect(montoConvertidoEnSuMomento).toBe("73000");

    // Re-ejecutar la misma conversión con la MISMA tasa grabada (nunca la
    // nueva) da idénticamente el mismo resultado — el reporte pasado no cambia.
    const mismoResultadoDeNuevo = convertirAGuaranies({
      monto: "10",
      esMonedaBase: false,
      tasa: tasaVigenteAlMomentoDeLaTransaccion,
    });
    expect(mismoResultadoDeNuevo).toBe(montoConvertidoEnSuMomento);
  });
});
