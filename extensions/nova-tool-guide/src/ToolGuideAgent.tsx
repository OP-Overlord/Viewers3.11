import React, { useEffect, useRef, useState } from 'react';
import { eventTarget } from '@cornerstonejs/core';
import { Enums as csToolsEnums } from '@cornerstonejs/tools';
import toolGuides, { type ToolGuide } from './toolGuides';
import toolDiagrams from './toolDiagrams';
import NovaLogo from './NovaLogo';
import './toolGuide.css';

/**
 * ToolGuideAgent — burbuja flotante NO invasiva (inferior derecha) que aparece
 * al activar una herramienta de medición especializada (menú "Medidas
 * Especiales") y ofrece la guía clínica de la medida: uso clínico, referencias
 * anatómicas por población, diagrama de trazo, pasos, interpretación clínica,
 * bibliografía pública y la nota orientativa.
 *
 * Comportamiento:
 *  - Se muestra al recibir TOOL_ACTIVATED de una tool con guía registrada.
 *  - Auto-cierre a los 5 s si el usuario no interactúa (hover lo pausa).
 *  - Clic en la burbuja → tarjeta expandida con la guía completa (sin auto-cierre).
 *  - `pointer-events: none` en el contenedor: nunca entorpece el dibujo sobre
 *    el canvas; solo la propia burbuja/tarjeta captura el ratón.
 */

// La burbuja se cierra sola a los 5 s si el usuario no interactúa.
const AUTO_DISMISS_MS = 5 * 1000;

// setToolActiveToolbar activa la tool en varios tool groups (default, mpr, SR)
// → llegan varios TOOL_ACTIVATED casi simultáneos; se colapsan en uno.
const DEDUPE_MS = 500;

/** Avatar de la guía: el logo sencillo (isotipo) de NOVA. */
const GuideAvatar: React.FC = () => (
  <span
    className="nova-guide-avatar"
    aria-hidden="true"
  >
    <NovaLogo size={30} />
  </span>
);

/** Renderiza texto con **negritas** en fragmentos <strong>. */
const RichText: React.FC<{ text: string }> = ({ text }) => {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <strong key={i}>{part.slice(2, -2)}</strong>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </>
  );
};

export const ToolGuideAgent: React.FC = () => {
  const [guide, setGuide] = useState<ToolGuide | null>(null);
  // Cambia en cada activación (o al salir el hover) para reiniciar el timer y
  // la barra de progreso desde cero.
  const [tick, setTick] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);

  const lastEventRef = useRef<{ name: string; at: number }>({ name: '', at: 0 });
  const expandedRef = useRef(false);
  expandedRef.current = expanded;

  useEffect(() => {
    const onToolActivated = (evt: Event) => {
      const toolName = (evt as CustomEvent).detail?.toolName as string | undefined;
      if (!toolName) {
        return;
      }

      const now = Date.now();
      const last = lastEventRef.current;
      if (toolName === last.name && now - last.at < DEDUPE_MS) {
        return;
      }
      lastEventRef.current = { name: toolName, at: now };

      const nextGuide = toolGuides[toolName];
      if (!nextGuide) {
        // Se activó otra herramienta sin guía: la burbuja compacta ya no
        // aplica. Si la tarjeta está expandida (el usuario está leyendo),
        // no se la quitamos.
        if (!expandedRef.current) {
          setGuide(null);
        }
        return;
      }

      setGuide(nextGuide);
      setExpanded(false);
      setHovered(false);
      setTick(t => t + 1);
    };

    eventTarget.addEventListener(csToolsEnums.Events.TOOL_ACTIVATED, onToolActivated);
    return () => {
      eventTarget.removeEventListener(csToolsEnums.Events.TOOL_ACTIVATED, onToolActivated);
    };
  }, []);

  // Auto-cierre: solo aplica a la burbuja compacta y sin el ratón encima.
  useEffect(() => {
    if (!guide || expanded || hovered) {
      return;
    }
    const t = setTimeout(() => setGuide(null), AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [guide, tick, expanded, hovered]);

  // Escape cierra la tarjeta expandida.
  useEffect(() => {
    if (!expanded) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setGuide(null);
        setExpanded(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [expanded]);

  if (!guide) {
    return null;
  }

  const dismiss = () => {
    setGuide(null);
    setExpanded(false);
  };

  const Diagram = toolDiagrams[guide.toolName];

  return (
    <div
      className="nova-guide-root"
      role="status"
      aria-live="polite"
    >
      {expanded ? (
        <div className="nova-guide-card">
          <div className="nova-guide-card-header">
            <GuideAvatar />
            <div className="nova-guide-id">
              <span className="nova-guide-name">{guide.title}</span>
              <span className="nova-guide-badge">{guide.specialty}</span>
            </div>
            <button
              className="nova-guide-close"
              onClick={dismiss}
              aria-label="Cerrar"
              title="Cerrar"
            >
              ×
            </button>
          </div>

          <div className="nova-guide-context">{guide.context}</div>

          <div className="nova-guide-body">
            <section className="nova-guide-section">
              <div className="nova-guide-section-title">Uso clínico</div>
              <p className="nova-guide-clinical-use">{guide.clinicalUse}</p>
            </section>

            <section className="nova-guide-section">
              <div className="nova-guide-section-title">Referencias anatómicas</div>
              <div className="nova-guide-anatomy-lead">
                <RichText text={guide.anatomyLead} />
              </div>
              {guide.anatomy.length > 0 && (
                <ul className="nova-guide-anatomy">
                  {guide.anatomy.map((item, i) => (
                    <li key={i}>
                      {item.population && (
                        <span className="nova-guide-pop-chip">{item.population}</span>
                      )}
                      <span>{item.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {Diagram && (
              <section className="nova-guide-section">
                <div className="nova-guide-section-title">Diagrama de trazo</div>
                <div className="nova-guide-diagram">
                  <Diagram />
                </div>
              </section>
            )}

            <section className="nova-guide-section">
              <div className="nova-guide-section-title">Pasos para el trazo</div>
              <ol className="nova-guide-steps">
                {guide.steps.map((step, i) => (
                  <li
                    className="nova-guide-step"
                    key={i}
                  >
                    <span className="nova-guide-step-num">{i + 1}</span>
                    <span className="nova-guide-step-texts">
                      <span className="nova-guide-step-title">{step.title}</span>
                      {step.detail && (
                        <span className="nova-guide-step-detail">{step.detail}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </section>

            <section className="nova-guide-section">
              <div className="nova-guide-section-title">Interpretación clínica</div>
              <div className="nova-guide-values">
                {guide.values.map((row, i) => (
                  <div
                    className={`nova-guide-value-row nova-guide-tone-${row.tone ?? 'neutral'}`}
                    key={i}
                  >
                    <span className="nova-guide-value-label">{row.label}</span>
                    <span className="nova-guide-value-detail">{row.detail}</span>
                  </div>
                ))}
              </div>
              <p className="nova-guide-interpretation">{guide.interpretation}</p>
            </section>

            <section className="nova-guide-section">
              <div className="nova-guide-section-title">Referencia bibliográfica</div>
              <p className="nova-guide-citation">{guide.reference.citation}</p>
              <a
                className="nova-guide-link"
                href={guide.reference.url}
                target="_blank"
                rel="noreferrer noopener"
              >
                {guide.reference.urlLabel} ↗
              </a>
            </section>

            <p className="nova-guide-disclaimer">
              Guía orientativa: no reemplaza el juicio clínico.
            </p>
          </div>

          <div className="nova-guide-footer">
            <button
              className="nova-guide-primary"
              onClick={dismiss}
            >
              Entendido
            </button>
          </div>
        </div>
      ) : (
        <div
          className="nova-guide-bubble"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => {
            setHovered(false);
            setTick(t => t + 1);
          }}
        >
          <button
            className="nova-guide-bubble-main"
            onClick={() => setExpanded(true)}
            title="Ver la guía de esta medición"
          >
            <GuideAvatar />
            <span className="nova-guide-bubble-texts">
              <span className="nova-guide-bubble-title">{guide.title}</span>
              <span className="nova-guide-bubble-hint">
                Ver guía: uso, anatomía y valores de referencia
              </span>
            </span>
          </button>
          <button
            className="nova-guide-close nova-guide-bubble-close"
            onClick={dismiss}
            aria-label="Cerrar"
            title="Cerrar"
          >
            ×
          </button>
          <span
            key={tick}
            className={`nova-guide-progress${hovered ? ' nova-guide-progress-paused' : ''}`}
            aria-hidden="true"
          />
        </div>
      )}
    </div>
  );
};

export default ToolGuideAgent;
