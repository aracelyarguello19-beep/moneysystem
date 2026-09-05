"use client";

import { useCallback, useEffect, useState } from "react";
import type { CuentaFinanciera, Moneda, TipoGasto } from "@repo/domain";
import { crearCuentaFinanciera } from "@/actions/cuentas-financieras/crear-cuenta-financiera";
import { eliminarCuentaFinanciera } from "@/actions/cuentas-financieras/eliminar-cuenta-financiera";
import { listarCuentasFinancieras } from "@/actions/cuentas-financieras/listar-cuentas-financieras";
import { registrarMovimientoManual } from "@/actions/cuentas-financieras/registrar-movimiento-manual";
import { registrarPagoResumenTarjeta } from "@/actions/gastos/registrar-pago-resumen-tarjeta";
import { registrarInteresTarjeta } from "@/actions/gastos/registrar-interes-tarjeta";
import { listarMonedas } from "@/actions/catalogos/listar-monedas";
import { listarTasasCambio, type MonedaConTasa } from "@/actions/catalogos/listar-tasas-cambio";
import { registrarTasaCambio } from "@/actions/catalogos/registrar-tasa-cambio";
import { listarTiposGasto } from "@/actions/catalogos/listar-tipos-gasto";
import { emitirInventarioCambiado } from "@/lib/inventario-events";
import { CuentaFinancieraSelect } from "@/components/cuenta-financiera-select";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatearMonto } from "@/lib/moneda";
import { Icon } from "@/components/ui/icon";

const TIPOS: { value: CuentaFinanciera["tipo"]; label: string; icon: string }[] = [
  { value: "CAJA", label: "Efectivo", icon: "payments" },
  { value: "BANCO", label: "Banco", icon: "account_balance" },
  { value: "TARJETA", label: "Tarjeta", icon: "credit_card" },
  { value: "OTRO", label: "Otro", icon: "wallet" },
];

const TIPO_ICON: Record<CuentaFinanciera["tipo"], string> = {
  CAJA: "payments",
  BANCO: "account_balance",
  TARJETA: "credit_card",
  OTRO: "wallet",
};

function moneda(monedas: Moneda[], monedaId: string): Moneda | undefined {
  return monedas.find((m) => m.id === monedaId);
}

function colorSaldo(saldo: string): string {
  return Number(saldo) < 0 ? "text-error" : "text-success";
}

function IconoCuenta({ icon }: { icon: string }) {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-surface-container-high text-on-surface-variant">
      <Icon name={icon} className="text-[18px]" />
    </div>
  );
}

// Caja: un único botón para dar de alta cualquier tipo de cuenta y una sola
// grilla con todas juntas — reemplaza a las 4 secciones separadas por tipo
// (Efectivo/Bancos/Tarjetas/Otro) de la versión anterior. La moneda ya no
// tiene un catálogo aparte (`MonedaCatalogo` se eliminó): una cuenta
// Efectivo nueva declara su moneda por código libre, y esa es la única vía
// para dar de alta una moneda — Banco/Tarjeta/Otro solo eligen entre las
// que ya existen. Cada cuenta en una moneda no oficial muestra su
// cotización como un campo editable directo en la tarjeta (`TasaCambio`,
// Story 5.3) — se comparte por moneda, así que editarla en cualquier
// cuenta de esa moneda actualiza a todas (y a lo que registre una venta en
// esa moneda, ver `registrar-venta.ts`).
export function CajaPanel({ negocioId }: { negocioId: string }) {
  const [cuentas, setCuentas] = useState<CuentaFinanciera[]>([]);
  const [monedas, setMonedas] = useState<Moneda[]>([]);
  const [tasas, setTasas] = useState<MonedaConTasa[]>([]);
  const [tiposGastoFinanciero, setTiposGastoFinanciero] = useState<TipoGasto[]>([]);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formAbierto, setFormAbierto] = useState(false);
  const [tipo, setTipo] = useState<CuentaFinanciera["tipo"]>("CAJA");
  const [nombre, setNombre] = useState("");
  const [monedaCodigoLibre, setMonedaCodigoLibre] = useState("");
  const [monedaId, setMonedaId] = useState("");
  const [banco, setBanco] = useState("");
  const [alias, setAlias] = useState("");
  const [detalleOtro, setDetalleOtro] = useState("");
  const [limiteCredito, setLimiteCredito] = useState("");

  const cargar = useCallback(async () => {
    const [cuentasResult, monedasResult, tasasResult, tiposGastoResult] = await Promise.all([
      listarCuentasFinancieras(negocioId),
      listarMonedas(negocioId),
      listarTasasCambio(negocioId),
      listarTiposGasto(negocioId),
    ]);
    if (cuentasResult.ok) setCuentas(cuentasResult.data);
    if (monedasResult.ok) {
      setMonedas(monedasResult.data.filter((m) => m.activa));
      setMonedaId((actual) => actual || monedasResult.data.find((m) => m.esBase)?.id || "");
    }
    if (tasasResult.ok) setTasas(tasasResult.data);
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
      nombre: nombre.trim() || undefined,
      monedaId: tipo === "CAJA" ? undefined : monedaId,
      monedaCodigo: tipo === "CAJA" ? monedaCodigoLibre : undefined,
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
    setMonedaCodigoLibre("");
    setBanco("");
    setAlias("");
    setDetalleOtro("");
    setLimiteCredito("");
    setFormAbierto(false);
    await cargar();
    emitirInventarioCambiado();
  }

  async function onEliminar(cuenta: CuentaFinanciera) {
    if (!window.confirm(`¿Eliminar la cuenta "${cuenta.nombre}"? Esta acción no se puede deshacer.`)) return;
    const result = await eliminarCuentaFinanciera(cuenta.id, negocioId);
    if (!result.ok) {
      setServerMessage(result.error.message);
      return;
    }
    await cargar();
    emitirInventarioCambiado();
  }

  async function onCotizacionChange(monedaIdCambio: string, valor: string) {
    if (!valor.trim() || Number(valor) <= 0) return;
    const result = await registrarTasaCambio(negocioId, monedaIdCambio, { tasa: valor });
    if (!result.ok) {
      setServerMessage(result.error.message);
      return;
    }
    await cargar();
  }

  return (
    <div className="flex flex-col gap-4">
      {!formAbierto ? (
        <Button type="button" onClick={() => setFormAbierto(true)} className="w-fit gap-2">
          <Icon name="add" fill className="text-[18px]" />
          Agregar cuenta
        </Button>
      ) : (
        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <CardHeader className="p-0">
              <CardTitle>Nueva cuenta</CardTitle>
            </CardHeader>
            <Button type="button" variant="ghost" size="sm" onClick={() => setFormAbierto(false)} className="gap-1">
              <Icon name="close" className="text-[16px]" />
              Cerrar
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TIPOS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTipo(t.value)}
                className={`flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-label-md font-semibold transition-colors ${
                  tipo === t.value
                    ? "border-tertiary bg-tertiary/10 text-on-surface"
                    : "border-outline-variant bg-surface-container-low text-on-surface-variant hover:border-tertiary"
                }`}
              >
                <Icon name={t.icon} fill={tipo === t.value} className="text-[22px]" />
                {t.label}
              </button>
            ))}
          </div>

          <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2" noValidate>
            {tipo === "CAJA" && (
              <FormField htmlFor="moneda-libre-caja" label="Moneda">
                <Input
                  id="moneda-libre-caja"
                  value={monedaCodigoLibre}
                  onChange={(e) => setMonedaCodigoLibre(e.target.value.toUpperCase())}
                  placeholder="PYG, USD, BRL..."
                  list="monedas-existentes-caja"
                  className="w-32 uppercase"
                  required
                />
                <datalist id="monedas-existentes-caja">
                  {monedas.map((m) => (
                    <option key={m.id} value={m.codigo} />
                  ))}
                </datalist>
              </FormField>
            )}
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
                <FormField htmlFor="moneda-caja" label="Moneda">
                  <Select id="moneda-caja" value={monedaId} onChange={(e) => setMonedaId(e.target.value)}>
                    {monedas.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.codigo}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </>
            )}
            {tipo === "TARJETA" && (
              <>
                <FormField htmlFor="nombre-tarjeta" label="Nombre">
                  <Input id="nombre-tarjeta" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
                </FormField>
                <FormField htmlFor="limite-caja" label="Límite de crédito (opcional)">
                  <Input
                    id="limite-caja"
                    value={limiteCredito}
                    onChange={(e) => setLimiteCredito(e.target.value)}
                    className="w-32"
                  />
                </FormField>
                <FormField htmlFor="moneda-caja-tarjeta" label="Moneda">
                  <Select id="moneda-caja-tarjeta" value={monedaId} onChange={(e) => setMonedaId(e.target.value)}>
                    {monedas.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.codigo}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </>
            )}
            {tipo === "OTRO" && (
              <>
                <FormField htmlFor="detalle-otro-caja" label="Detalle">
                  <Input
                    id="detalle-otro-caja"
                    value={detalleOtro}
                    onChange={(e) => setDetalleOtro(e.target.value)}
                    required
                  />
                </FormField>
                <FormField htmlFor="moneda-caja-otro" label="Moneda">
                  <Select id="moneda-caja-otro" value={monedaId} onChange={(e) => setMonedaId(e.target.value)}>
                    {monedas.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.codigo}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </>
            )}
            <Button type="submit" disabled={isSubmitting} className="gap-2">
              <Icon name="add" fill className="text-[18px]" />
              Crear cuenta
            </Button>
          </form>
          {tipo === "CAJA" && (
            <p className="flex items-center gap-1 text-label-md text-on-surface-variant">
              <Icon name="check_circle" fill className="text-[14px] text-success" />
              Sin nombre — se crea como &quot;Efectivo&quot;. Si la moneda no existe todavía, se crea en el momento.
            </p>
          )}
        </Card>
      )}

      {serverMessage && (
        <p role="alert" className="text-sm text-danger">
          {serverMessage}
        </p>
      )}

      {cuentas.length === 0 ? (
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-outline-variant px-4 py-5 text-body-md text-on-surface-variant">
          <Icon name="account_balance_wallet" className="text-[20px]" />
          Todavía no hay cuentas creadas.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cuentas.map((c) =>
            c.tipo === "TARJETA" ? (
              <TarjetaCard
                key={c.id}
                tarjeta={c}
                negocioId={negocioId}
                monedas={monedas}
                tiposGastoFinanciero={tiposGastoFinanciero}
                onEliminar={() => onEliminar(c)}
                onCambio={cargar}
              />
            ) : (
              <CuentaCard
                key={c.id}
                cuenta={c}
                negocioId={negocioId}
                monedas={monedas}
                tasas={tasas}
                onEliminar={() => onEliminar(c)}
                onCotizacionChange={onCotizacionChange}
                onCambio={cargar}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

function CuentaCard({
  cuenta,
  negocioId,
  monedas,
  tasas,
  onEliminar,
  onCotizacionChange,
  onCambio,
}: {
  cuenta: CuentaFinanciera;
  negocioId: string;
  monedas: Moneda[];
  tasas: MonedaConTasa[];
  onEliminar: () => void;
  onCotizacionChange: (monedaId: string, valor: string) => void;
  onCambio: () => void;
}) {
  const monedaObj = moneda(monedas, cuenta.monedaId);
  const codigoMoneda = monedaObj?.codigo ?? cuenta.monedaId;
  const esExtranjera = !!monedaObj && !monedaObj.esBase;
  const tasaVigente = tasas.find((t) => t.moneda.id === cuenta.monedaId)?.tasaVigente ?? null;

  const [agregandoMonto, setAgregandoMonto] = useState(false);
  const [monto, setMonto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function onAgregar(e: React.FormEvent) {
    e.preventDefault();
    setMensaje(null);
    setEnviando(true);
    const result = await registrarMovimientoManual(negocioId, { cuentaFinancieraId: cuenta.id, monto });
    setEnviando(false);
    if (!result.ok) {
      setMensaje(result.error.message);
      return;
    }
    setMonto("");
    setAgregandoMonto(false);
    onCambio();
    emitirInventarioCambiado();
  }

  return (
    <div className="group relative flex flex-col gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest p-4 transition-shadow hover:shadow-md">
      <button
        type="button"
        onClick={onEliminar}
        aria-label={`Eliminar ${cuenta.nombre}`}
        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded text-on-surface-variant opacity-0 transition-opacity hover:bg-error-container hover:text-on-error-container group-hover:opacity-100"
      >
        <Icon name="delete" className="text-[16px]" />
      </button>

      <div className="flex items-center gap-3">
        <IconoCuenta icon={TIPO_ICON[cuenta.tipo]} />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-label-md font-semibold uppercase tracking-wide text-on-surface-variant">
            {cuenta.nombre}
            <Badge className="normal-case">{codigoMoneda}</Badge>
          </p>
        </div>
      </div>

      <p className={`text-headline-sm font-bold ${colorSaldo(cuenta.saldoActual)}`}>
        {formatearMonto(cuenta.saldoActual, codigoMoneda)}
      </p>

      {esExtranjera && (
        <div className="flex items-center justify-between gap-2 border-t border-dashed border-outline-variant pt-2 text-label-md text-on-surface-variant">
          <span className="flex items-center gap-1">
            <Icon name="currency_exchange" className="text-[14px] text-tertiary" />1 {codigoMoneda} =
          </span>
          <Input
            aria-label={`Cotización de ${codigoMoneda}`}
            defaultValue={tasaVigente?.tasa ?? ""}
            placeholder="cotización"
            onBlur={(e) => onCotizacionChange(cuenta.monedaId, e.target.value)}
            className="h-7 w-20 text-right text-label-md"
          />
        </div>
      )}

      {!agregandoMonto ? (
        <button
          type="button"
          onClick={() => setAgregandoMonto(true)}
          className="flex items-center gap-1 self-start text-label-md text-tertiary hover:underline"
        >
          <Icon name="add" className="text-[14px]" />
          Agregar monto
        </button>
      ) : (
        <form onSubmit={onAgregar} className="flex items-center gap-1">
          <Input
            aria-label={`Agregar monto a ${cuenta.nombre}`}
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            placeholder="Monto"
            autoFocus
            className="h-7 w-24 text-label-md"
          />
          <Button type="submit" size="sm" variant="outline" disabled={enviando || !monto} className="h-7 px-2">
            <Icon name="check" className="text-[14px]" />
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setAgregandoMonto(false)} className="h-7 px-2">
            <Icon name="close" className="text-[14px]" />
          </Button>
        </form>
      )}
      {mensaje && (
        <p role="alert" className="text-label-md text-danger">
          {mensaje}
        </p>
      )}
    </div>
  );
}

function TarjetaCard({
  tarjeta,
  negocioId,
  monedas,
  tiposGastoFinanciero,
  onEliminar,
  onCambio,
}: {
  tarjeta: CuentaFinanciera;
  negocioId: string;
  monedas: Moneda[];
  tiposGastoFinanciero: TipoGasto[];
  onEliminar: () => void;
  onCambio: () => void;
}) {
  const codigoMoneda = moneda(monedas, tarjeta.monedaId)?.codigo ?? tarjeta.monedaId;
  const [gestionar, setGestionar] = useState(false);
  const [montoPago, setMontoPago] = useState("");
  const [cuentaOrigenId, setCuentaOrigenId] = useState("");
  const [montoInteres, setMontoInteres] = useState("");
  const tipoGastoId = tiposGastoFinanciero[0]?.id ?? "";
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
    <div className="group relative flex flex-col gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest p-4 transition-shadow hover:shadow-md sm:col-span-2 lg:col-span-1">
      <button
        type="button"
        onClick={onEliminar}
        aria-label={`Eliminar ${tarjeta.nombre}`}
        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded text-on-surface-variant opacity-0 transition-opacity hover:bg-error-container hover:text-on-error-container group-hover:opacity-100"
      >
        <Icon name="delete" className="text-[16px]" />
      </button>

      <div className="flex items-center gap-3">
        <IconoCuenta icon="credit_card" />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-label-md font-semibold uppercase tracking-wide text-on-surface-variant">
            {tarjeta.nombre}
            <Badge className="normal-case">{codigoMoneda}</Badge>
          </p>
        </div>
      </div>

      <p className="flex flex-wrap items-center gap-2">
        <Badge variant={Number(tarjeta.saldoActual) < 0 ? "danger" : "neutral"}>
          Deuda: {formatearMonto(tarjeta.saldoActual, codigoMoneda)}
        </Badge>
        {tarjeta.limiteCredito && (
          <span className="text-label-md text-on-surface-variant">
            límite: {formatearMonto(tarjeta.limiteCredito, codigoMoneda)}
          </span>
        )}
      </p>

      {!gestionar ? (
        <button
          type="button"
          onClick={() => setGestionar(true)}
          className="flex items-center gap-1 self-start text-label-md text-tertiary hover:underline"
        >
          <Icon name="tune" className="text-[14px]" />
          Gestionar
        </button>
      ) : (
        <div className="flex flex-col gap-3 border-t border-outline-variant pt-3">
          <form onSubmit={onPagoResumen} className="flex flex-wrap items-end gap-2">
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
              tipo={["CAJA", "BANCO"]}
              value={cuentaOrigenId}
              onChange={setCuentaOrigenId}
              label="Con qué cuenta"
            />
            <Button type="submit" size="sm">
              Pagar
            </Button>
          </form>
          <form onSubmit={onInteres} className="flex flex-wrap items-end gap-2">
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
          <button
            type="button"
            onClick={() => setGestionar(false)}
            className="flex items-center gap-1 self-start text-label-md text-on-surface-variant hover:underline"
          >
            <Icon name="expand_less" className="text-[14px]" />
            Cerrar
          </button>
        </div>
      )}
      {mensaje && (
        <p role="alert" className="text-label-md text-danger">
          {mensaje}
        </p>
      )}
    </div>
  );
}
