"use client";

import { useCallback, useEffect, useState } from "react";
import type { CuentaFinanciera, Moneda, TipoGasto } from "@repo/domain";
import { agruparPorBanco, agruparSaldosPorMoneda } from "@repo/domain";
import { crearCuentaFinanciera } from "@/actions/cuentas-financieras/crear-cuenta-financiera";
import { listarCuentasFinancieras } from "@/actions/cuentas-financieras/listar-cuentas-financieras";
import { registrarPagoResumenTarjeta } from "@/actions/gastos/registrar-pago-resumen-tarjeta";
import { registrarInteresTarjeta } from "@/actions/gastos/registrar-interes-tarjeta";
import { listarMonedas } from "@/actions/catalogos/listar-monedas";
import { listarTiposGasto } from "@/actions/catalogos/listar-tipos-gasto";
import { emitirInventarioCambiado } from "@/lib/inventario-events";
import { CuentaFinancieraSelect } from "@/components/cuenta-financiera-select";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const TIPOS: { value: CuentaFinanciera["tipo"]; label: string }[] = [
  { value: "CAJA", label: "Efectivo" },
  { value: "BANCO", label: "Banco" },
  { value: "TARJETA", label: "Tarjeta de crédito" },
  { value: "OTRO", label: "Otro" },
];

function nombreMoneda(monedas: Moneda[], monedaId: string): string {
  return monedas.find((m) => m.id === monedaId)?.codigo ?? monedaId;
}

function colorSaldo(saldo: string): string {
  return Number(saldo) < 0 ? "text-error" : "text-success";
}

// Caja: efectivo, bancos (agrupados por banco), tarjetas de crédito y
// "otro" — un solo lugar para crear cuentas y ver cuánto hay en cada
// moneda, reemplaza a las viejas sesiones Saldos/Tarjeta.
export function CajaPanel({ negocioId }: { negocioId: string }) {
  const [cuentas, setCuentas] = useState<CuentaFinanciera[]>([]);
  const [monedas, setMonedas] = useState<Moneda[]>([]);
  const [tiposGastoFinanciero, setTiposGastoFinanciero] = useState<TipoGasto[]>([]);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [tipo, setTipo] = useState<CuentaFinanciera["tipo"]>("CAJA");
  const [nombre, setNombre] = useState("");
  const [monedaId, setMonedaId] = useState("");
  const [banco, setBanco] = useState("");
  const [alias, setAlias] = useState("");
  const [detalleOtro, setDetalleOtro] = useState("");
  const [limiteCredito, setLimiteCredito] = useState("");

  const cargar = useCallback(async () => {
    const [cuentasResult, monedasResult, tiposGastoResult] = await Promise.all([
      listarCuentasFinancieras(negocioId),
      listarMonedas(negocioId),
      listarTiposGasto(negocioId),
    ]);
    if (cuentasResult.ok) setCuentas(cuentasResult.data);
    if (monedasResult.ok) {
      setMonedas(monedasResult.data.filter((m) => m.activa));
      setMonedaId((actual) => actual || monedasResult.data.find((m) => m.esBase)?.id || "");
    }
    if (tiposGastoResult.ok) {
      setTiposGastoFinanciero(tiposGastoResult.data.filter((t) => t.clasificacion === "FINANCIERO"));
    }
  }, [negocioId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerMessage(null);
    setIsSubmitting(true);
    const result = await crearCuentaFinanciera(negocioId, {
      tipo,
      nombre,
      monedaId,
      banco: tipo === "BANCO" ? banco : undefined,
      alias: tipo === "BANCO" ? alias || undefined : undefined,
      detalleOtro: tipo === "OTRO" ? detalleOtro : undefined,
      limiteCredito: tipo === "TARJETA" ? limiteCredito || undefined : undefined,
    });
    setIsSubmitting(false);
    if (!result.ok) {
      setServerMessage(result.error.message);
      return;
    }
    setNombre("");
    setBanco("");
    setAlias("");
    setDetalleOtro("");
    setLimiteCredito("");
    await cargar();
    emitirInventarioCambiado();
  }

  const cajaYBanco = cuentas.filter((c) => c.tipo === "CAJA" || c.tipo === "BANCO");
  const tarjetas = cuentas.filter((c) => c.tipo === "TARJETA");
  const otras = cuentas.filter((c) => c.tipo === "OTRO");
  const porBanco = agruparPorBanco(cuentas);

  return (
    <div className="flex flex-col gap-8">
      <Card>
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2" noValidate>
        <FormField htmlFor="tipo-caja" label="Tipo de cuenta">
          <Select
            id="tipo-caja"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as CuentaFinanciera["tipo"])}
          >
            {TIPOS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField htmlFor="nombre-caja" label="Nombre">
          <Input id="nombre-caja" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        </FormField>
        {tipo === "BANCO" && (
          <>
            <FormField htmlFor="banco-caja" label="Banco">
              <Input id="banco-caja" value={banco} onChange={(e) => setBanco(e.target.value)} required />
            </FormField>
            <FormField htmlFor="alias-caja" label="Alias (opcional)">
              <Input
                id="alias-caja"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder="Cuenta 1"
              />
            </FormField>
          </>
        )}
        {tipo === "OTRO" && (
          <FormField htmlFor="detalle-otro-caja" label="Detalle">
            <Input
              id="detalle-otro-caja"
              value={detalleOtro}
              onChange={(e) => setDetalleOtro(e.target.value)}
              required
            />
          </FormField>
        )}
        {tipo === "TARJETA" && (
          <FormField htmlFor="limite-caja" label="Límite de crédito (opcional)">
            <Input
              id="limite-caja"
              value={limiteCredito}
              onChange={(e) => setLimiteCredito(e.target.value)}
              className="w-32"
            />
          </FormField>
        )}
        <FormField htmlFor="moneda-caja" label="Moneda">
          <Select id="moneda-caja" value={monedaId} onChange={(e) => setMonedaId(e.target.value)}>
            {monedas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.codigo}
              </option>
            ))}
          </Select>
        </FormField>
        <Button type="submit" disabled={isSubmitting}>
          Crear cuenta
        </Button>
      </form>

      {serverMessage && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {serverMessage}
        </p>
      )}
      </Card>

      <section className="flex flex-col gap-3">
        <h3 className="text-label-md font-semibold uppercase tracking-wide text-on-surface-variant">
          Efectivo y bancos por moneda
        </h3>
        {Object.entries(agruparSaldosPorMoneda(cajaYBanco)).map(([mId, cs]) => (
          <Card key={mId}>
            <p className="mb-2 text-sm font-semibold">{nombreMoneda(monedas, mId)}</p>
            <ul className="flex flex-col gap-1">
              {cs.map((c) => (
                <li key={c.id} className="flex justify-between text-sm">
                  <span>
                    {c.nombre}
                    {c.banco && ` — ${c.banco}${c.alias ? ` (${c.alias})` : ""}`}
                  </span>
                  <span className={colorSaldo(c.saldoActual)}>{c.saldoActual}</span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
        {cajaYBanco.length === 0 && (
          <p className="text-sm text-muted">Todavía no hay cuentas de efectivo/banco.</p>
        )}
      </section>

      {Object.keys(porBanco).length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-label-md font-semibold uppercase tracking-wide text-on-surface-variant">Por banco</h3>
          {Object.entries(porBanco).map(([bancoNombre, cs]) => (
            <Card key={bancoNombre}>
              <p className="mb-2 text-sm font-semibold">{bancoNombre}</p>
              <ul className="flex flex-col gap-1">
                {cs.map((c) => (
                  <li key={c.id} className="flex justify-between text-sm">
                    <span>
                      {c.alias || c.nombre} · {nombreMoneda(monedas, c.monedaId)}
                    </span>
                    <span className={colorSaldo(c.saldoActual)}>{c.saldoActual}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h3 className="text-label-md font-semibold uppercase tracking-wide text-on-surface-variant">Tarjetas de crédito</h3>
        {tarjetas.length === 0 && <p className="text-sm text-muted">No hay tarjetas creadas.</p>}
        {tarjetas.map((t) => (
          <TarjetaFila
            key={t.id}
            tarjeta={t}
            negocioId={negocioId}
            tiposGastoFinanciero={tiposGastoFinanciero}
            onCambio={cargar}
          />
        ))}
      </section>

      {otras.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-label-md font-semibold uppercase tracking-wide text-on-surface-variant">Otro</h3>
          <Card>
            <ul className="flex flex-col gap-1">
              {otras.map((o) => (
                <li key={o.id} className="flex justify-between text-sm">
                  <span>
                    {o.nombre}
                    {o.detalleOtro && ` — ${o.detalleOtro}`}
                  </span>
                  <span className={colorSaldo(o.saldoActual)}>
                    {o.saldoActual} {nombreMoneda(monedas, o.monedaId)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}
    </div>
  );
}

function TarjetaFila({
  tarjeta,
  negocioId,
  tiposGastoFinanciero,
  onCambio,
}: {
  tarjeta: CuentaFinanciera;
  negocioId: string;
  tiposGastoFinanciero: TipoGasto[];
  onCambio: () => void;
}) {
  const [montoPago, setMontoPago] = useState("");
  const [cuentaOrigenId, setCuentaOrigenId] = useState("");
  const [montoInteres, setMontoInteres] = useState("");
  const [tipoGastoId, setTipoGastoId] = useState(tiposGastoFinanciero[0]?.id ?? "");
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function onPagoResumen(e: React.FormEvent) {
    e.preventDefault();
    setMensaje(null);
    const result = await registrarPagoResumenTarjeta(negocioId, tarjeta.id, {
      monto: montoPago,
      cuentaFinancieraId: cuentaOrigenId,
    });
    if (!result.ok) {
      setMensaje(result.error.message);
      return;
    }
    setMontoPago("");
    onCambio();
    emitirInventarioCambiado();
  }

  async function onInteres(e: React.FormEvent) {
    e.preventDefault();
    setMensaje(null);
    if (!tipoGastoId) {
      setMensaje("Creá un tipo de gasto Financiero antes de registrar un interés.");
      return;
    }
    const result = await registrarInteresTarjeta(negocioId, tarjeta.id, {
      monto: montoInteres,
      tipoGastoId,
    });
    if (!result.ok) {
      setMensaje(result.error.message);
      return;
    }
    setMontoInteres("");
    onCambio();
    emitirInventarioCambiado();
  }

  return (
    <Card>
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
        {tarjeta.nombre}
        <Badge variant={Number(tarjeta.saldoActual) < 0 ? "danger" : "neutral"}>
          Deuda: {tarjeta.saldoActual}
        </Badge>
        {tarjeta.limiteCredito && (
          <span className="text-xs font-normal text-muted">límite: {tarjeta.limiteCredito}</span>
        )}
      </p>
      <div className="flex flex-wrap gap-4">
        <form onSubmit={onPagoResumen} className="flex items-end gap-2">
          <FormField htmlFor={`pago-${tarjeta.id}`} label="Pagar resumen">
            <Input
              id={`pago-${tarjeta.id}`}
              value={montoPago}
              onChange={(e) => setMontoPago(e.target.value)}
              className="w-24"
              placeholder="Monto"
            />
          </FormField>
          <CuentaFinancieraSelect
            id={`origen-${tarjeta.id}`}
            negocioId={negocioId}
            esTarjeta={false}
            value={cuentaOrigenId}
            onChange={setCuentaOrigenId}
            label="Con qué cuenta"
          />
          <Button type="submit" size="sm">
            Pagar
          </Button>
        </form>
        <form onSubmit={onInteres} className="flex items-end gap-2">
          <FormField htmlFor={`interes-${tarjeta.id}`} label="Registrar interés">
            <Input
              id={`interes-${tarjeta.id}`}
              value={montoInteres}
              onChange={(e) => setMontoInteres(e.target.value)}
              className="w-24"
              placeholder="Monto"
            />
          </FormField>
          <Button type="submit" size="sm" variant="outline">
            Registrar
          </Button>
        </form>
      </div>
      {mensaje && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {mensaje}
        </p>
      )}
    </Card>
  );
}
