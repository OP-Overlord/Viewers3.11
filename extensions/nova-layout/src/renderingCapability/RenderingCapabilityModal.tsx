/**
 * RenderingCapabilityModal
 * ------------------------------------------------------------------------------
 * Popup técnico-comercial que se muestra cuando el equipo / la serie no cumplen
 * las condiciones mínimas para MPR / Volume Rendering / 3D. Presenta una tabla
 * comparativa "Tu equipo / serie" vs "Recomendado para este equipo" y, según la
 * severidad:
 *
 *   - 'warn'  → "Cancelar" + "Continuar bajo mi responsabilidad".
 *   - 'block' → "Cancelar" + "Continuar de todos modos", con aviso más fuerte.
 *
 * En NINGÚN caso se impide usar la herramienta: el popup informa y pide una
 * confirmación explícita, pero el usuario siempre puede continuar.
 *
 * Estilado con los tokens del theme de @ohif/ui-next (la paleta Tailwind del
 * core NO incluye amber/green/blue/gray estándar; usar success/warning/error/
 * muted/border/foreground, etc.). Botones con el componente <Button> de OHIF.
 */

import React from 'react';
import { Button } from '@ohif/ui-next';
import type { CapabilityAssessment } from './assessHeavyRendering';
import { formatBytes } from './assessHeavyRendering';

const TIER_LABEL: Record<string, string> = {
  software: 'Sin GPU (renderizado por software)',
  integrated: 'GPU integrada',
  integratedHigh: 'GPU integrada (equipo de altas prestaciones)',
  dedicated: 'GPU dedicada',
  unknown: 'GPU no identificada',
};

type RowStatus = 'ok' | 'warn' | 'block';

interface SpecRow {
  label: string;
  current: string;
  recommended: string;
  status: RowStatus;
}

const statusDot: Record<RowStatus, string> = {
  ok: 'bg-success',
  warn: 'bg-warning',
  block: 'bg-error',
};

function buildRows(a: CapabilityAssessment): SpecRow[] {
  const { device, series, thresholds, maxSliceDim } = a;
  const rows: SpecRow[] = [];

  // GPU
  rows.push({
    label: 'Tarjeta gráfica',
    current: `${TIER_LABEL[device.tier] ?? device.tier} · ${device.renderer}`,
    recommended: 'GPU dedicada (NVIDIA / AMD Radeon RX / Apple M)',
    status:
      device.tier === 'dedicated' || device.tier === 'integratedHigh'
        ? 'ok'
        : device.tier === 'software'
          ? 'block'
          : 'warn',
  });

  // Cortes de la serie
  const sliceStatus: RowStatus =
    series.sliceCount > thresholds.blockInstances
      ? 'block'
      : series.sliceCount > thresholds.safeInstances
        ? 'warn'
        : 'ok';
  rows.push({
    label: 'Cortes en la serie',
    current: `${series.sliceCount} cortes`,
    recommended: `≤ ${thresholds.safeInstances} cortes`,
    status: sliceStatus,
  });

  // Resolución por corte
  if (series.rows && series.columns) {
    const dimStatus: RowStatus =
      maxSliceDim > 0 && (series.rows > maxSliceDim || series.columns > maxSliceDim)
        ? 'block'
        : 'ok';
    rows.push({
      label: 'Resolución por corte',
      current: `${series.rows}×${series.columns} px`,
      recommended: `≤ ${maxSliceDim} px por lado`,
      status: dimStatus,
    });
  }

  // Memoria estimada de volumen
  if (series.estimatedVolumeBytes > 0) {
    const memStatus: RowStatus =
      thresholds.maxVolumeBytes > 0 && series.estimatedVolumeBytes > thresholds.maxVolumeBytes
        ? 'block'
        : 'ok';
    rows.push({
      label: 'Memoria estimada del volumen',
      current: formatBytes(series.estimatedVolumeBytes),
      recommended: `≤ ${formatBytes(thresholds.maxVolumeBytes)}`,
      status: memStatus,
    });
  }

  // RAM del equipo (si el navegador lo expone)
  if (typeof device.deviceMemoryGB === 'number') {
    rows.push({
      label: 'Memoria del equipo (RAM)',
      current: `${device.deviceMemoryGB} GB`,
      recommended: '≥ 8 GB',
      status: device.deviceMemoryGB >= 8 ? 'ok' : 'warn',
    });
  }

  // Núcleos lógicos
  if (typeof device.logicalCores === 'number') {
    rows.push({
      label: 'Núcleos del procesador',
      current: `${device.logicalCores}`,
      recommended: '≥ 4',
      status: device.logicalCores >= 4 ? 'ok' : 'warn',
    });
  }

  return rows;
}

interface Props {
  assessment: CapabilityAssessment;
  /** Inyectado por el UIModalService (ui-next usa `hide`; otros, `onClose`). */
  hide?: () => void;
  onClose?: () => void;
  /** Confirmación del usuario. Presente en 'warn' y en 'block'. */
  onContinue?: () => void;
}

const FEATURE_TITLE: Record<string, string> = {
  mpr: 'MPR',
  volumeRendering: 'Volume Rendering',
  volume3d: 'Visualización 3D',
};

export default function RenderingCapabilityModal({ assessment, hide, onClose, onContinue }: Props) {
  const close = hide ?? onClose ?? (() => undefined);
  const isBlock = assessment.severity === 'block';
  const rows = buildRows(assessment);
  const featureName = FEATURE_TITLE[assessment.feature] ?? 'esta función';

  const intro = isBlock
    ? `Este equipo no alcanza la configuración recomendada para ejecutar ${featureName} con ` +
      `la serie seleccionada. Puedes activarla de todos modos, pero es probable que el visor ` +
      `se ralentice de forma notable o se cierre de forma inesperada; en ese caso, vuelve a ` +
      `abrir el estudio y continúa con la visualización 2D.`
    : `${featureName} puede ejecutarse en este equipo, pero la serie seleccionada está por ` +
      `encima del rango óptimo. Es posible que el visor se ralentice o se vuelva inestable. ` +
      `Puedes continuar bajo tu responsabilidad o seguir con la visualización 2D.`;

  return (
    <div className="text-foreground max-w-2xl p-1">
      <div className="mb-3 flex items-start gap-3">
        <div
          className={`bg-muted mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
            isBlock ? 'text-error' : 'text-warning'
          }`}
          aria-hidden
        >
          {/* triángulo de advertencia */}
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
          >
            <path
              d="M12 3 2 20h20L12 3Zm0 6v5m0 3v.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <p className="text-foreground-secondary text-sm leading-relaxed">{intro}</p>
      </div>

      <div className="border-border overflow-hidden rounded-md border">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-background-elevated text-foreground-secondary">
              <th className="px-3 py-2 font-medium">Especificación</th>
              <th className="px-3 py-2 font-medium">Tu equipo / serie</th>
              <th className="px-3 py-2 font-medium">Recomendado para este equipo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr
                key={row.label}
                className="border-border-subtle border-t"
              >
                <td className="text-foreground-secondary px-3 py-2">{row.label}</td>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot[row.status]}`} />
                    <span className="text-foreground">{row.current}</span>
                  </span>
                </td>
                <td className="text-muted-foreground px-3 py-2">{row.recommended}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {assessment.reasons.length > 0 && (
        <ul className="text-foreground-secondary mt-3 list-disc space-y-1 pl-5 text-xs">
          {assessment.reasons.map((reason, i) => (
            <li key={i}>{reason}</li>
          ))}
        </ul>
      )}

      <p className="text-muted-foreground mt-3 text-[11px] leading-relaxed">
        Para aprovechar al máximo las reconstrucciones MPR y 3D de NOVA Imaging, recomendamos un
        equipo con GPU dedicada y al menos 8 GB de RAM. Contacta a tu asesor NOVA Imaging para
        conocer los equipos certificados.
      </p>

      <div className="mt-4 flex justify-end gap-2">
        <Button
          variant="secondary"
          onClick={close}
        >
          Cancelar
        </Button>
        <Button
          variant={isBlock ? 'destructive' : 'warning'}
          onClick={() => {
            onContinue?.();
            close();
          }}
        >
          {isBlock
            ? 'Continuar de todos modos (no recomendado)'
            : 'Continuar bajo mi responsabilidad'}
        </Button>
      </div>
    </div>
  );
}
