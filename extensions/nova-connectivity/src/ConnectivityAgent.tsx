import React, { useEffect, useRef, useState } from 'react';
import { connectivityMonitor, type ConnSnapshot, type ConnHealth } from './connectivityMonitor';
import './connectivity.css';

/**
 * ConnectivityAgent — burbuja flotante NO invasiva, con personalidad de agente
 * de IA ("NOVA AI"), que SÓLO aparece cuando el monitor detecta latencia alta o
 * descarga lenta. Es puramente informativa: no ofrece ninguna acción que altere
 * el visor; como mucho el usuario la descarta o la expande para leer el detalle.
 *
 * Estados visuales:
 *  - Oculta (conexión buena, o el usuario la descartó dentro del cooldown).
 *  - Burbuja compacta: avatar IA + mensaje corto + punto de estado.
 *  - Tarjeta expandida: mensaje empático + chips con métricas + "Entendido".
 */

// Tras descartar, no volvemos a molestar durante este tiempo… salvo que la
// situación EMPEORE respecto a cuando se descartó.
const DISMISS_COOLDOWN_MS = 5 * 60 * 1000;

// La burbuja se cierra sola a los 5 s aunque el usuario no interactúe (aviso
// efímero y no invasivo). Si la expande para leer, se cancela el auto-cierre.
const AUTO_DISMISS_MS = 5 * 1000;

const severityRank: Record<ConnHealth, number> = {
  good: 0,
  degraded: 1,
  poor: 2,
  offline: 3,
};

interface Copy {
  short: string;
  title: string;
  body: string;
}

const COPY: Record<Exclude<ConnHealth, 'good'>, Copy> = {
  degraded: {
    short: 'Tu conexión va un poco lenta',
    title: 'Conexión un poco lenta',
    body: 'He notado que tu conexión va algo lenta en este momento. Algunas imágenes podrían tardar un poco más en cargar. Sigo pendiente por ti.',
  },
  poor: {
    short: 'Conexión inestable',
    title: 'Conexión inestable',
    body: 'Tu conexión está bastante lenta ahora mismo. Si una imagen tarda en aparecer, dale unos segundos: seguirá cargando en segundo plano.',
  },
  offline: {
    short: 'Sin conexión a internet',
    title: 'Te quedaste sin conexión',
    body: 'Parece que se perdió el internet. No te preocupes: retomaré la carga automáticamente en cuanto vuelvas a estar en línea.',
  },
};

const SparkleAvatar: React.FC = () => (
  <span
    className="nova-conn-avatar"
    aria-hidden="true"
  >
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
    >
      <path
        d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z"
        fill="currentColor"
      />
      <path
        d="M18.5 14l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z"
        fill="currentColor"
        opacity="0.7"
      />
    </svg>
  </span>
);

const formatRtt = (ms?: number): string | undefined =>
  ms === undefined ? undefined : `Latencia ~${Math.round(ms)} ms`;

const formatDownlink = (mbps?: number): string | undefined =>
  mbps === undefined ? undefined : `Velocidad ~${mbps >= 1 ? mbps.toFixed(1) : mbps.toFixed(2)} Mbps`;

export const ConnectivityAgent: React.FC = () => {
  const [snapshot, setSnapshot] = useState<ConnSnapshot>(connectivityMonitor.getSnapshot());
  const [expanded, setExpanded] = useState(false);
  // Estado de descarte: hasta cuándo, y con qué severidad se descartó.
  const dismissUntilRef = useRef(0);
  const dismissedRankRef = useRef(0);
  const [, forceRender] = useState(0);

  useEffect(() => connectivityMonitor.subscribe(setSnapshot), []);

  const health = snapshot.health;
  const isProblem = health !== 'good';
  const rank = severityRank[health];

  // ¿Estamos en cooldown de descarte? Sólo aplica si NO ha empeorado.
  const now = Date.now();
  const inCooldown = now < dismissUntilRef.current && rank <= dismissedRankRef.current;

  // Si la conexión se recupera, reseteamos el estado de la tarjeta.
  useEffect(() => {
    if (!isProblem) {
      setExpanded(false);
    }
  }, [isProblem]);

  // Marca la burbuja como descartada (entra en cooldown) a la severidad dada.
  const commitDismiss = (atRank: number) => {
    dismissUntilRef.current = Date.now() + DISMISS_COOLDOWN_MS;
    dismissedRankRef.current = atRank;
    setExpanded(false);
    forceRender(n => n + 1);
  };

  // Auto-cierre: la burbuja desaparece sola a los 5 s aunque el usuario no
  // interactúe. Si la expande para leer el detalle (interacción), se cancela el
  // temporizador y no la cerramos mientras la está leyendo.
  useEffect(() => {
    if (!isProblem || inCooldown || expanded) {
      return;
    }
    const t = setTimeout(() => commitDismiss(rank), AUTO_DISMISS_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProblem, inCooldown, expanded, rank]);

  if (!isProblem || inCooldown) {
    return null;
  }

  const copy = COPY[health as Exclude<ConnHealth, 'good'>];
  const chips = [formatRtt(snapshot.rttMs), formatDownlink(snapshot.downlinkMbps)].filter(
    (c): c is string => Boolean(c)
  );

  const handleDismiss = () => commitDismiss(rank);

  return (
    <div
      className={`nova-conn-root nova-conn-${health}`}
      role="status"
      aria-live="polite"
    >
      {expanded ? (
        <div className="nova-conn-card">
          <div className="nova-conn-card-header">
            <SparkleAvatar />
            <div className="nova-conn-id">
              <span className="nova-conn-name">NOVA AI</span>
              <span className="nova-conn-badge">Asistente IA</span>
            </div>
            <button
              className="nova-conn-close"
              onClick={handleDismiss}
              aria-label="Cerrar"
              title="Cerrar"
            >
              ×
            </button>
          </div>

          <div className="nova-conn-card-title">{copy.title}</div>
          <p className="nova-conn-card-body">{copy.body}</p>

          {chips.length > 0 && (
            <div className="nova-conn-chips">
              {chips.map(chip => (
                <span
                  key={chip}
                  className="nova-conn-chip"
                >
                  {chip}
                </span>
              ))}
            </div>
          )}

          <div className="nova-conn-actions">
            <button
              className="nova-conn-primary"
              onClick={handleDismiss}
            >
              Entendido
            </button>
          </div>
        </div>
      ) : (
        <button
          className="nova-conn-bubble"
          onClick={() => setExpanded(true)}
          title="Ver detalle de la conexión"
        >
          <SparkleAvatar />
          <span className="nova-conn-bubble-text">{copy.short}</span>
          <span
            className="nova-conn-dot"
            aria-hidden="true"
          />
        </button>
      )}
    </div>
  );
};

export default ConnectivityAgent;
