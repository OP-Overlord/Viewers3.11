import React from 'react';

/**
 * Diagramas de trazo esquemáticos para cada herramienta de medición
 * especializada. Ilustran la CONSTRUCCIÓN geométrica de la medida (líneas,
 * puntos, ángulo y etiquetas), no una anatomía realista: es lo que enseña a
 * trazar la medida correctamente.
 *
 * Se dibujan sobre el fondo oscuro de la tarjeta, por lo que asumen tema
 * oscuro. Paleta coherente con la burbuja NOVA:
 *   - línea A (primaria): violeta #a08bff
 *   - línea B (secundaria): azul #6bbcff
 *   - ángulo / valor normal: verde #5ad19a
 *   - referencia / horizontal: gris punteado
 *   - silueta anatómica: blanco muy tenue
 */

// Acentos = paleta azul del proyecto (tailwind.css): secondary / primary / highlight.
const AX = '#5b82ff'; // eje/línea A (azul secundario)
const BX = '#4a9eff'; // eje/línea B (azul primario)
const ANG = '#00d9ff'; // ángulo / resultado (cian highlight)
const REF = 'rgba(255,255,255,0.35)'; // línea de referencia punteada
const BONE = 'rgba(255,255,255,0.07)'; // silueta anatómica
const BONE_STK = 'rgba(255,255,255,0.14)';
const LBL = '#aab2c0'; // etiqueta neutra

const svgProps = {
  viewBox: '0 0 320 200',
  width: '100%',
  height: '100%',
  role: 'img' as const,
  preserveAspectRatio: 'xMidYMid meet',
};

const Dot: React.FC<{ x: number; y: number; color: string }> = ({ x, y, color }) => (
  <>
    <circle cx={x} cy={y} r="5.5" fill={color} opacity="0.25" />
    <circle cx={x} cy={y} r="2.6" fill="#fff" stroke={color} strokeWidth="1.6" />
  </>
);

/* --- Ángulo de Kite (talocalcáneo AP) ---------------------------------- */
const KiteDiagram: React.FC = () => (
  <svg {...svgProps} aria-label="Diagrama del ángulo de Kite: ejes del astrágalo y del calcáneo divergiendo desde un vértice">
    {/* siluetas óseas tenues */}
    <ellipse cx="120" cy="95" rx="30" ry="16" transform="rotate(-33 120 95)" fill={BONE} stroke={BONE_STK} />
    <ellipse cx="200" cy="95" rx="30" ry="16" transform="rotate(33 200 95)" fill={BONE} stroke={BONE_STK} />
    {/* eje astrágalo (A) */}
    <line x1="160" y1="160" x2="92" y2="42" stroke={AX} strokeWidth="2.4" strokeLinecap="round" />
    {/* eje calcáneo (B) */}
    <line x1="160" y1="160" x2="228" y2="42" stroke={BX} strokeWidth="2.4" strokeLinecap="round" />
    {/* arco del ángulo */}
    <path d="M138 118 A 45 45 0 0 1 182 118" fill="none" stroke={ANG} strokeWidth="2" />
    <text x="160" y="108" fill={ANG} fontSize="12" fontWeight="700" textAnchor="middle">θ</text>
    <Dot x={160} y={160} color="#fff" />
    {/* etiquetas */}
    <text x="70" y="36" fill={AX} fontSize="10.5" textAnchor="start">Eje del astrágalo</text>
    <text x="250" y="36" fill={BX} fontSize="10.5" textAnchor="end">Eje del calcáneo</text>
    <text x="160" y="182" fill={LBL} fontSize="10" textAnchor="middle">Punto de intersección</text>
    <text x="215" y="128" fill={ANG} fontSize="10.5" textAnchor="start">Ángulo de Kite</text>
  </svg>
);

/* --- Índice Cardiotorácico --------------------------------------------- */
const CardioThoracicDiagram: React.FC = () => (
  <svg {...svgProps} aria-label="Diagrama del índice cardiotorácico: diámetro cardíaco sobre diámetro torácico">
    {/* tórax */}
    <path d="M40 40 Q30 100 55 160 M280 40 Q290 100 265 160" fill="none" stroke={BONE_STK} strokeWidth="2" />
    {/* corazón */}
    <ellipse cx="150" cy="108" rx="52" ry="40" fill={BONE} stroke={BONE_STK} />
    {/* diámetro torácico (T) */}
    <line x1="48" y1="150" x2="272" y2="150" stroke={BX} strokeWidth="2.2" />
    <line x1="48" y1="142" x2="48" y2="158" stroke={BX} strokeWidth="2.2" />
    <line x1="272" y1="142" x2="272" y2="158" stroke={BX} strokeWidth="2.2" />
    <text x="160" y="168" fill={BX} fontSize="10.5" textAnchor="middle">Diámetro torácico (T)</text>
    {/* diámetro cardíaco (C) */}
    <line x1="104" y1="96" x2="196" y2="96" stroke={AX} strokeWidth="2.2" />
    <line x1="104" y1="88" x2="104" y2="104" stroke={AX} strokeWidth="2.2" />
    <line x1="196" y1="88" x2="196" y2="104" stroke={AX} strokeWidth="2.2" />
    <text x="150" y="82" fill={AX} fontSize="10.5" textAnchor="middle">Diámetro cardíaco (C)</text>
    {/* fórmula */}
    <text x="160" y="26" fill={ANG} fontSize="11.5" fontWeight="700" textAnchor="middle">ICT = C / T</text>
  </svg>
);

/* --- Ángulo de Cobb ----------------------------------------------------- */
const CobbDiagram: React.FC = () => (
  <svg {...svgProps} aria-label="Diagrama del ángulo de Cobb: platillos de las vértebras límite y sus perpendiculares">
    {/* curva de la columna tenue */}
    <path d="M150 24 C110 70 210 120 150 176" fill="none" stroke={BONE_STK} strokeWidth="14" strokeLinecap="round" opacity="0.5" />
    {/* platillo superior (A) */}
    <line x1="96" y1="52" x2="176" y2="40" stroke={AX} strokeWidth="2.6" strokeLinecap="round" />
    {/* platillo inferior (B) */}
    <line x1="128" y1="150" x2="216" y2="168" stroke={BX} strokeWidth="2.6" strokeLinecap="round" />
    {/* perpendiculares punteadas hacia el vértice */}
    <line x1="150" y1="46" x2="250" y2="90" stroke={AX} strokeWidth="1.4" strokeDasharray="4 4" opacity="0.8" />
    <line x1="172" y1="159" x2="250" y2="90" stroke={BX} strokeWidth="1.4" strokeDasharray="4 4" opacity="0.8" />
    {/* arco del ángulo en el vértice */}
    <path d="M226 78 A 26 26 0 0 1 232 104" fill="none" stroke={ANG} strokeWidth="2" />
    <Dot x={250} y={90} color={ANG} />
    {/* etiquetas */}
    <text x="90" y="42" fill={AX} fontSize="10.5" textAnchor="start">Platillo superior</text>
    <text x="214" y="182" fill={BX} fontSize="10.5" textAnchor="end">Platillo inferior</text>
    <text x="248" y="70" fill={ANG} fontSize="10.5" textAnchor="middle">Ángulo de Cobb</text>
  </svg>
);

/* --- Ángulo Acetabular (Hilgenreiner) ---------------------------------- */
const HilgenreinerDiagram: React.FC = () => (
  <svg {...svgProps} aria-label="Diagrama del ángulo acetabular: línea de Hilgenreiner y techos acetabulares">
    {/* pelvis tenue */}
    <path d="M60 118 Q160 150 260 118" fill="none" stroke={BONE_STK} strokeWidth="2" />
    <circle cx="86" cy="118" r="16" fill={BONE} stroke={BONE_STK} />
    <circle cx="234" cy="118" r="16" fill={BONE} stroke={BONE_STK} />
    {/* línea de Hilgenreiner (horizontal) */}
    <line x1="46" y1="118" x2="274" y2="118" stroke={AX} strokeWidth="2.4" />
    {/* techos acetabulares */}
    <line x1="118" y1="118" x2="66" y2="86" stroke={BX} strokeWidth="2.4" strokeLinecap="round" />
    <line x1="202" y1="118" x2="254" y2="86" stroke={BX} strokeWidth="2.4" strokeLinecap="round" />
    {/* arcos de ángulo */}
    <path d="M104 118 A 14 14 0 0 1 110 108" fill="none" stroke={ANG} strokeWidth="1.8" />
    <path d="M216 118 A 14 14 0 0 0 210 108" fill="none" stroke={ANG} strokeWidth="1.8" />
    <Dot x={118} y={118} color="#fff" />
    <Dot x={202} y={118} color="#fff" />
    {/* etiquetas */}
    <text x="160" y="138" fill={AX} fontSize="10.5" textAnchor="middle">Línea de Hilgenreiner</text>
    <text x="60" y="76" fill={BX} fontSize="10.5" textAnchor="start">Techo acetabular</text>
    <text x="160" y="98" fill={ANG} fontSize="10.5" textAnchor="middle">Ángulo acetabular</text>
  </svg>
);

/* --- Ángulo de Tönnis --------------------------------------------------- */
const TonnisDiagram: React.FC = () => (
  <svg {...svgProps} aria-label="Diagrama del ángulo de Tönnis: horizontal de referencia y techo de carga (sourcil)">
    {/* techo esclerótico tenue */}
    <path d="M120 120 Q160 96 232 78" fill="none" stroke={BONE_STK} strokeWidth="10" strokeLinecap="round" opacity="0.6" />
    {/* horizontal de referencia (punteada) */}
    <line x1="70" y1="120" x2="262" y2="120" stroke={REF} strokeWidth="2" strokeDasharray="5 5" />
    {/* techo de carga (sourcil) */}
    <line x1="120" y1="120" x2="238" y2="80" stroke={BX} strokeWidth="2.6" strokeLinecap="round" />
    {/* arco del ángulo */}
    <path d="M156 120 A 36 36 0 0 0 152 108" fill="none" stroke={ANG} strokeWidth="2" />
    <text x="150" y="112" fill={ANG} fontSize="12" fontWeight="700" textAnchor="middle">θ</text>
    <Dot x={120} y={120} color="#fff" />
    {/* etiquetas */}
    <text x="72" y="138" fill={LBL} fontSize="10.5" textAnchor="start">Horizontal de referencia</text>
    <text x="244" y="72" fill={BX} fontSize="10.5" textAnchor="end">Techo de carga (sourcil)</text>
    <text x="120" y="150" fill={ANG} fontSize="10.5" textAnchor="middle">Ángulo de Tönnis</text>
  </svg>
);

/* --- Índice de Insall-Salvati ------------------------------------------ */
const InsallSalvatiDiagram: React.FC = () => (
  <svg {...svgProps} aria-label="Diagrama del índice de Insall-Salvati: longitud del tendón sobre longitud de la rótula">
    {/* fémur / tibia tenues */}
    <path d="M96 30 Q120 60 118 92" fill="none" stroke={BONE_STK} strokeWidth="12" strokeLinecap="round" opacity="0.5" />
    <path d="M150 150 L168 196" stroke={BONE_STK} strokeWidth="14" strokeLinecap="round" opacity="0.5" />
    {/* rótula */}
    <ellipse cx="130" cy="78" rx="17" ry="24" transform="rotate(18 130 78)" fill={BONE} stroke={BONE_STK} strokeWidth="1.5" />
    {/* eje mayor de la rótula (LR) */}
    <line x1="122" y1="56" x2="140" y2="100" stroke={AX} strokeWidth="2.6" strokeLinecap="round" />
    {/* tendón rotuliano (LT) */}
    <line x1="140" y1="100" x2="162" y2="156" stroke={BX} strokeWidth="2.6" strokeLinecap="round" />
    <Dot x={140} y={100} color="#fff" />
    <Dot x={162} y={156} color="#fff" />
    {/* etiquetas */}
    <text x="150" y="66" fill={AX} fontSize="10.5" textAnchor="start">Longitud rótula (LR)</text>
    <text x="176" y="132" fill={BX} fontSize="10.5" textAnchor="start">Longitud tendón (LT)</text>
    <text x="120" y="176" fill={LBL} fontSize="10" textAnchor="middle">Tuberosidad tibial</text>
    {/* fórmula */}
    <text x="150" y="26" fill={ANG} fontSize="11.5" fontWeight="700" textAnchor="middle">Índice = LT / LR</text>
  </svg>
);

const toolDiagrams: Record<string, React.FC> = {
  CobbAngle: CobbDiagram,
  CardioThoracicIndex: CardioThoracicDiagram,
  KiteAngle: KiteDiagram,
  HilgenreinerAngle: HilgenreinerDiagram,
  TonnisAngle: TonnisDiagram,
  InsallSalvatiIndex: InsallSalvatiDiagram,
};

export default toolDiagrams;
