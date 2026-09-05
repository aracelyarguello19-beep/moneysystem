import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatCard } from "@/components/ui/stat-card";
import { ThemeToggle } from "@/components/ui/theme-toggle";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-default p-4">
        {children}
      </div>
    </section>
  );
}

export default function DesignSystemPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 p-8">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">Design System — Sistema de Control Financiero</h1>
          <p className="text-sm text-muted">
            Átomos y moléculas construidos a partir del audit de patrones (Fase 4). Ver{" "}
            <code className="text-xs">apps/web/src/tokens/tokens.yaml</code> para los tokens.
          </p>
        </div>
        <ThemeToggle />
      </header>

      <Section title="StatCard (KPI)">
        <StatCard
          spotlight
          tone="primary"
          icon={<Icon name="payments" />}
          label="Lucro"
          value="Gs. 6.575.160"
          delta="+11.8%"
          className="w-56"
        />
        <StatCard
          tone="primary"
          icon={<Icon name="payments" />}
          label="Faturamento"
          value="Gs. 14.238.120"
          delta="+28%"
          className="w-56"
        />
        <StatCard
          tone="danger"
          icon={<Icon name="trending_down" />}
          label="Custos Totais"
          value="Gs. 7.662.960"
          delta="-19%"
          className="w-56"
        />
        <StatCard
          tone="warning"
          icon={<Icon name="pie_chart" />}
          label="Margem"
          value="15,2%"
          delta="+71%"
          className="w-56"
        />
      </Section>

      <Section title="Button">
        <Button variant="primary">Registrar gasto</Button>
        <Button variant="danger">Eliminar</Button>
        <Button variant="outline">Cancelar</Button>
        <Button variant="ghost">Ver detalles</Button>
        <Button variant="link">Ver detalles</Button>
        <Button variant="primary" disabled>
          Guardando…
        </Button>
      </Section>

      <Section title="Badge">
        <Badge variant="success">Pagado</Badge>
        <Badge variant="warning">Por vencer</Badge>
        <Badge variant="danger">Vencido</Badge>
        <Badge variant="neutral">Borrador</Badge>
      </Section>

      <Section title="Input / Select / FormField">
        <FormField htmlFor="ds-monto" label="Monto" className="w-40">
          <Input id="ds-monto" placeholder="0.00" />
        </FormField>
        <FormField htmlFor="ds-moneda" label="Moneda" className="w-32">
          <Select id="ds-moneda">
            <option>PYG</option>
            <option>USD</option>
          </Select>
        </FormField>
        <FormField htmlFor="ds-error" label="Con error" error="Este campo es obligatorio" className="w-40">
          <Input id="ds-error" />
        </FormField>
      </Section>

      <Section title="Card">
        <Card className="w-72">
          <CardHeader>
            <CardTitle>Saldo disponible</CardTitle>
            <CardDescription>Cuenta principal</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-primary">Gs. 6.575.160</p>
          </CardContent>
        </Card>
      </Section>
    </div>
  );
}
