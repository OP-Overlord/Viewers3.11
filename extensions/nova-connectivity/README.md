# nova-connectivity — Agente de conectividad "NOVA AI"

Widget flotante **informativo y no invasivo** que avisa, con tono de asistente de
IA, cuando detecta **latencia alta** o **velocidad de descarga lenta**. Solo
aparece cuando hay un problema y desaparece solo cuando la conexión se estabiliza.

## Qué hace

- Vigila la red de forma **pasiva** (no genera tráfico de prueba):
  - `navigator.connection` (rtt, downlink, effectiveType) — señal principal en
    Chromium (desktop y Android).
  - `PerformanceObserver('resource')` — mide TTFB y throughput reales de las
    peticiones DICOM/WADO cuando hay datos de timing (mismo origen o con
    `Timing-Allow-Origin`).
  - eventos `online`/`offline`.
- Clasifica la salud en `good | degraded | poor | offline` con histéresis para no
  parpadear (avisa tras ~8 s degradado; se retira tras ~16 s estable).
- Muestra una burbuja con avatar IA ("NOVA AI") y mensajes empáticos. Es **solo
  informativa**: no ejecuta ninguna acción sobre el visor. El usuario puede
  expandir el detalle (latencia/velocidad) o descartarla (cooldown de 5 min,
  salvo que la conexión empeore).

## Cómo se integra

Se consume **desde el código fuente** (igual que `nova-cine`). Cada modo llama:

```ts
import {
  mountConnectivityAgent,
  unmountConnectivityAgent,
} from '../../../extensions/nova-connectivity/src';

// onModeEnter
mountConnectivityAgent();
// onModeExit
unmountConnectivityAgent();
```

Ya está cableado en `nova-desktop`, `nova-anonimized` y `nova-mobile`. El widget se
monta vía portal en `<body>` (un `<div id="nova-connectivity-root">`), por lo que
es independiente del layout de cada modo.

## Ajustes

Umbrales e histéresis en `src/connectivityMonitor.ts`
(`RTT_*`, `DOWNLINK_*`, `SHOW_AFTER_BAD_EVALS`, `HIDE_AFTER_GOOD_EVALS`).
Textos y persona en `src/ConnectivityAgent.tsx` (`COPY`). Estilos autocontenidos
en `src/connectivity.css` (clases `nova-conn-*`).

## Limitaciones

Si el navegador no expone `navigator.connection` (Safari/Firefox) **y** el PACS es
cross-origin sin `Timing-Allow-Origin`, no hay señal pasiva fiable: el agente
permanece oculto (comportamiento conservador, nunca da falsos avisos).
