import React from 'react';

/**
 * Diagramas de trazo por herramienta. Cada uno combina DOS capas:
 *   1. Una silueta anatómica de fondo (hueso/órgano) que sitúa al médico sobre
 *      qué estructura se hace la anotación (rodilla, pie, columna, pelvis…).
 *      Esta capa NO se anima (es el contexto estable).
 *   2. La construcción geométrica de la medida en primer plano (ejes, líneas,
 *      ángulo, puntos y etiquetas), en la paleta azul del producto. Esta capa
 *      SE ANIMA dibujándose en el orden real del trazo (clases nd-*), en bucle,
 *      para mostrar visualmente cómo se realiza cada medición.
 *
 * Animación (definida en toolGuide.css):
 *   - nd-draw + nd-sN  → líneas/arcos que se "dibujan" (stroke-dashoffset) en el
 *     turno N; requiere style={{ '--len': <longitud aprox de la línea> }}.
 *   - nd-fade + nd-fN  → puntos y etiquetas que aparecen en el turno N.
 * Se respeta prefers-reduced-motion (todo estático).
 *
 * Son ESQUEMAS estilizados (no radiografías reales), sobre fondo negro/navy.
 */

// Acentos = paleta azul del proyecto (tailwind.css): secondary / primary / highlight.
const AX = '#5b82ff'; // eje/línea A (azul secundario)
const BX = '#4a9eff'; // eje/línea B (azul primario)
const ANG = '#00d9ff'; // ángulo / resultado (cian highlight)
const REF = 'rgba(255,255,255,0.32)'; // línea de referencia punteada

// Silueta anatómica (hueso/tejido) — tono frío claro, tenue.
const BONE = 'rgba(202,216,236,0.11)'; // relleno / cuerpo de huesos
const BONE_EDGE = 'rgba(202,216,236,0.30)'; // contorno fino
const LBL = '#aab2c0'; // etiqueta neutra

const svgProps = {
  viewBox: '0 0 320 200',
  width: '100%',
  height: '100%',
  role: 'img' as const,
  preserveAspectRatio: 'xMidYMid meet',
};

/** cssLen: helper para pasar la longitud aproximada de la línea a --len. */
const len = (v: number): React.CSSProperties => ({ ['--len' as string]: v });

const Dot: React.FC<{ x: number; y: number; color?: string; cls?: string }> = ({
  x,
  y,
  color = '#fff',
  cls,
}) => (
  <g className={cls}>
    <circle cx={x} cy={y} r="5" fill={color} opacity="0.22" />
    <circle cx={x} cy={y} r="2.6" fill="#fff" stroke={color} strokeWidth="1.6" />
  </g>
);

/** Hueso largo estilizado (cápsula): línea gruesa con extremos redondeados. */
const Bone: React.FC<{ x1: number; y1: number; x2: number; y2: number; w: number }> = ({
  x1,
  y1,
  x2,
  y2,
  w,
}) => (
  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={BONE} strokeWidth={w} strokeLinecap="round" />
);

/* --- Ángulo de Kite (talocalcáneo, pie dorsoplantar) -------------------- */
const KiteDiagram: React.FC = () => (
  <svg {...svgProps} aria-label="Pie en proyección dorsoplantar: ejes del astrágalo y del calcáneo">
    {/* Silueta del pie (estática) */}
    <g>
      <Bone x1={158} y1={120} x2={112} y2={50} w={11} />
      <Bone x1={158} y1={120} x2={132} y2={44} w={11} />
      <Bone x1={158} y1={120} x2={154} y2={42} w={11} />
      <Bone x1={158} y1={120} x2={178} y2={46} w={11} />
      <Bone x1={158} y1={120} x2={200} y2={54} w={11} />
      <circle cx="112" cy="50" r="6" fill={BONE} />
      <circle cx="132" cy="44" r="6" fill={BONE} />
      <circle cx="154" cy="42" r="6" fill={BONE} />
      <circle cx="178" cy="46" r="6" fill={BONE} />
      <circle cx="200" cy="54" r="6" fill={BONE} />
      <Bone x1={150} y1={116} x2={150} y2={158} w={30} />
      <Bone x1={168} y1={118} x2={168} y2={162} w={26} />
      <ellipse cx="159" cy="166" rx="20" ry="10" fill={BONE} />
    </g>

    {/* Construcción animada: eje A → eje B → ángulo */}
    <line className="nd-draw nd-s1" style={len(118)} x1="158" y1="150" x2="112" y2="48" stroke={AX} strokeWidth="2.4" strokeLinecap="round" />
    <line className="nd-draw nd-s2" style={len(118)} x1="158" y1="150" x2="206" y2="48" stroke={BX} strokeWidth="2.4" strokeLinecap="round" />
    <path className="nd-draw nd-s3" style={len(70)} d="M136 116 A 42 42 0 0 1 180 116" fill="none" stroke={ANG} strokeWidth="2" />
    <text className="nd-fade nd-f3" x="158" y="108" fill={ANG} fontSize="12" fontWeight="700" textAnchor="middle">θ</text>
    <Dot x={158} y={150} cls="nd-fade nd-f1" />

    <text className="nd-fade nd-f1" x="66" y="40" fill={AX} fontSize="10.5" textAnchor="start">Eje del astrágalo</text>
    <text className="nd-fade nd-f2" x="254" y="40" fill={BX} fontSize="10.5" textAnchor="end">Eje del calcáneo</text>
    <text className="nd-fade nd-f3" x="188" y="132" fill={ANG} fontSize="10.5" textAnchor="start">Ángulo de Kite</text>
    <text x="159" y="188" fill={LBL} fontSize="9.5" textAnchor="middle">Retropié</text>
  </svg>
);

/* --- Índice Cardiotorácico (tórax PA) -----------------------------------
 * Fiel a la herramienta: (1) diámetro torácico en 2 clics → el eje medio
 * vertical se coloca solo; (2) borde cardíaco izquierdo hasta la línea media;
 * (3) borde cardíaco derecho hasta la línea media. Los dos segmentos cardíacos
 * pueden quedar a distinta altura. Sombra cardíaca = izq. + der.
 */
const CardioThoracicDiagram: React.FC = () => (
  <svg {...svgProps} aria-label="Radiografía de tórax: silueta cardíaca (bordes a la línea media) sobre el diámetro torácico">
    {/* Silueta (estática) */}
    <g>
      <path
        d="M60 26 Q40 34 44 96 Q46 132 66 158 Q160 176 254 158 Q274 132 276 96 Q280 34 260 26"
        fill="rgba(202,216,236,0.05)"
        stroke={BONE_EDGE}
        strokeWidth="1.5"
      />
      <path d="M64 60 Q120 52 150 60 M64 84 Q120 74 152 84 M66 108 Q122 98 152 108" fill="none" stroke={BONE_EDGE} strokeWidth="1" opacity="0.7" />
      <path d="M256 60 Q200 52 170 60 M256 84 Q200 74 168 84 M254 108 Q198 98 168 108" fill="none" stroke={BONE_EDGE} strokeWidth="1" opacity="0.7" />
      <path
        d="M150 78 Q118 74 114 104 Q112 134 152 150 Q190 138 194 108 Q196 82 170 78 Q160 78 150 86 Z"
        fill={BONE}
        stroke={BONE_EDGE}
        strokeWidth="1.2"
      />
    </g>

    {/* Paso 1: diámetro torácico (2 clics) + eje medio automático */}
    <line className="nd-draw nd-s1" style={len(216)} x1="52" y1="150" x2="268" y2="150" stroke={BX} strokeWidth="2.2" />
    <g className="nd-fade nd-f1">
      <line x1="52" y1="143" x2="52" y2="157" stroke={BX} strokeWidth="2.2" />
      <line x1="268" y1="143" x2="268" y2="157" stroke={BX} strokeWidth="2.2" />
      <text x="160" y="168" fill={BX} fontSize="10.5" textAnchor="middle">Diámetro torácico (T)</text>
    </g>
    <line className="nd-fade nd-f1" x1="160" y1="46" x2="160" y2="150" stroke={REF} strokeWidth="1.6" strokeDasharray="5 5" />
    <text className="nd-fade nd-f1" x="165" y="60" fill={LBL} fontSize="9" textAnchor="start">eje medio</text>

    {/* Paso 2: borde cardíaco izquierdo → línea media (segmento superior) */}
    <line className="nd-draw nd-s2" style={len(46)} x1="116" y1="96" x2="160" y2="96" stroke={AX} strokeWidth="2.2" />
    <Dot x={116} y={96} color={AX} cls="nd-fade nd-f2" />
    <text className="nd-fade nd-f2" x="110" y="92" fill={AX} fontSize="9.5" textAnchor="end">borde izq.</text>

    {/* Paso 3: borde cardíaco derecho → línea media (segmento inferior, no alineado) */}
    <line className="nd-draw nd-s3" style={len(36)} x1="160" y1="118" x2="196" y2="118" stroke={AX} strokeWidth="2.2" />
    <Dot x={196} y={118} color={AX} cls="nd-fade nd-f3" />
    <text className="nd-fade nd-f3" x="202" y="122" fill={AX} fontSize="9.5" textAnchor="start">borde der.</text>

    {/* Resultado */}
    <text className="nd-fade nd-f4" x="160" y="20" fill={ANG} fontSize="11.5" fontWeight="700" textAnchor="middle">ICT = C / T</text>
    <text className="nd-fade nd-f4" x="160" y="33" fill={LBL} fontSize="9" textAnchor="middle">C (sombra cardíaca) = izq. + der.</text>
  </svg>
);

/* --- Ángulo de Cobb (columna) ------------------------------------------- */
const CobbDiagram: React.FC = () => (
  <svg {...svgProps} aria-label="Columna con curva escoliótica: platillos de las vértebras límite">
    {/* Silueta: cuerpos vertebrales apilados en curva (estática) */}
    <g fill={BONE} stroke={BONE_EDGE} strokeWidth="1">
      <rect x="132" y="20" width="30" height="15" rx="4" transform="rotate(-17 147 27)" />
      <rect x="126" y="41" width="30" height="15" rx="4" transform="rotate(-11 141 48)" />
      <rect x="121" y="62" width="30" height="15" rx="4" transform="rotate(-4 136 69)" />
      <rect x="120" y="83" width="30" height="15" rx="4" transform="rotate(3 135 90)" />
      <rect x="123" y="104" width="30" height="15" rx="4" transform="rotate(9 138 111)" />
      <rect x="129" y="125" width="30" height="15" rx="4" transform="rotate(14 144 132)" />
      <rect x="137" y="146" width="30" height="15" rx="4" transform="rotate(11 152 153)" />
    </g>

    {/* Construcción: platillo sup → platillo inf → perpendiculares → ángulo */}
    <line className="nd-draw nd-s1" style={len(62)} x1="118" y1="30" x2="176" y2="12" stroke={AX} strokeWidth="2.6" strokeLinecap="round" />
    <line className="nd-draw nd-s2" style={len(62)} x1="126" y1="150" x2="184" y2="168" stroke={BX} strokeWidth="2.6" strokeLinecap="round" />
    <line className="nd-draw nd-s3" style={len(130)} x1="150" y1="20" x2="252" y2="86" stroke={AX} strokeWidth="1.3" strokeDasharray="4 4" />
    <line className="nd-draw nd-s3" style={len(112)} x1="172" y1="159" x2="252" y2="86" stroke={BX} strokeWidth="1.3" strokeDasharray="4 4" />
    <path className="nd-draw nd-s4" style={len(60)} d="M228 74 A 27 27 0 0 1 233 100" fill="none" stroke={ANG} strokeWidth="2" />
    <Dot x={252} y={86} color={ANG} cls="nd-fade nd-f4" />

    <text className="nd-fade nd-f1" x="112" y="24" fill={AX} fontSize="10.5" textAnchor="start">Platillo superior</text>
    <text className="nd-fade nd-f2" x="182" y="182" fill={BX} fontSize="10.5" textAnchor="end">Platillo inferior</text>
    <text className="nd-fade nd-f4" x="250" y="64" fill={ANG} fontSize="10.5" textAnchor="middle">Ángulo de Cobb</text>
  </svg>
);

/* --- Ángulo Acetabular / Hilgenreiner (pelvis pediátrica) --------------- */
const HilgenreinerDiagram: React.FC = () => (
  <svg {...svgProps} aria-label="Pelvis en proyección AP: línea de Hilgenreiner y techos acetabulares">
    {/* Silueta de la pelvis (estática) */}
    <g fill={BONE} stroke={BONE_EDGE} strokeWidth="1.2">
      <path d="M150 60 Q92 46 60 86 Q54 104 82 108 Q120 104 150 84 Z" />
      <path d="M170 60 Q228 46 260 86 Q266 104 238 108 Q200 104 170 84 Z" />
      <path d="M150 54 Q168 54 168 78 Q168 100 160 108 Q152 100 152 78 Q152 60 150 54 Z" />
      <circle cx="92" cy="130" r="13" />
      <circle cx="228" cy="130" r="13" />
    </g>
    <Bone x1={88} y1={140} x2={72} y2={196} w={16} />
    <Bone x1={232} y1={140} x2={248} y2={196} w={16} />

    {/* Construcción: línea de Hilgenreiner → techos → ángulos */}
    <line className="nd-draw nd-s1" style={len(228)} x1="46" y1="118" x2="274" y2="118" stroke={AX} strokeWidth="2.4" />
    <line className="nd-draw nd-s2" style={len(58)} x1="118" y1="118" x2="70" y2="88" stroke={BX} strokeWidth="2.4" strokeLinecap="round" />
    <line className="nd-draw nd-s2" style={len(58)} x1="202" y1="118" x2="250" y2="88" stroke={BX} strokeWidth="2.4" strokeLinecap="round" />
    <path className="nd-draw nd-s3" style={len(24)} d="M104 118 A 14 14 0 0 1 110 108" fill="none" stroke={ANG} strokeWidth="1.8" />
    <path className="nd-draw nd-s3" style={len(24)} d="M216 118 A 14 14 0 0 0 210 108" fill="none" stroke={ANG} strokeWidth="1.8" />
    <Dot x={118} y={118} cls="nd-fade nd-f1" />
    <Dot x={202} y={118} cls="nd-fade nd-f1" />

    <text className="nd-fade nd-f1" x="160" y="136" fill={AX} fontSize="10.5" textAnchor="middle">Línea de Hilgenreiner</text>
    <text className="nd-fade nd-f2" x="60" y="78" fill={BX} fontSize="10.5" textAnchor="start">Techo acetabular</text>
    <text className="nd-fade nd-f3" x="160" y="100" fill={ANG} fontSize="10.5" textAnchor="middle">Ángulo acetabular</text>
  </svg>
);

/* --- Ángulo de Tönnis (cadera adulta) ----------------------------------- */
const TonnisDiagram: React.FC = () => (
  <svg {...svgProps} aria-label="Cadera en AP: horizontal de referencia y techo de carga (sourcil)">
    {/* Silueta: hueso ilíaco + cabeza femoral + fémur (estática) */}
    <g fill={BONE} stroke={BONE_EDGE} strokeWidth="1.2">
      <path d="M60 40 Q150 30 232 66 Q244 88 214 104 Q150 92 96 118 Q64 96 60 40 Z" />
      <circle cx="150" cy="142" r="34" />
    </g>
    <Bone x1={168} y1={168} x2={214} y2={198} w={22} />

    {/* Construcción: horizontal de referencia → techo de carga → ángulo */}
    <line className="nd-draw nd-s1" style={len(192)} x1="70" y1="120" x2="262" y2="120" stroke={REF} strokeWidth="2" strokeDasharray="5 5" />
    <line className="nd-draw nd-s2" style={len(124)} x1="120" y1="120" x2="238" y2="82" stroke={BX} strokeWidth="2.6" strokeLinecap="round" />
    <path className="nd-draw nd-s3" style={len(60)} d="M156 120 A 36 36 0 0 0 152 108" fill="none" stroke={ANG} strokeWidth="2" />
    <text className="nd-fade nd-f3" x="150" y="112" fill={ANG} fontSize="12" fontWeight="700" textAnchor="middle">θ</text>
    <Dot x={120} y={120} cls="nd-fade nd-f2" />

    <text className="nd-fade nd-f1" x="72" y="138" fill={LBL} fontSize="10" textAnchor="start">Horizontal de referencia</text>
    <text className="nd-fade nd-f2" x="244" y="74" fill={BX} fontSize="10.5" textAnchor="end">Techo de carga (sourcil)</text>
    <text className="nd-fade nd-f3" x="120" y="150" fill={ANG} fontSize="10.5" textAnchor="middle">Ángulo de Tönnis</text>
  </svg>
);

/* --- Índice de Insall-Salvati (rodilla lateral) ------------------------- */
const InsallSalvatiDiagram: React.FC = () => (
  <svg {...svgProps} aria-label="Rodilla en proyección lateral: longitud del tendón sobre longitud de la rótula">
    {/* Silueta de la rodilla lateral (estática) */}
    <g>
      <Bone x1={150} y1={4} x2={162} y2={92} w={34} />
      <circle cx="176" cy="112" r="27" fill={BONE} stroke={BONE_EDGE} strokeWidth="1.2" />
      <ellipse cx="158" cy="146" rx="30" ry="11" fill={BONE} stroke={BONE_EDGE} strokeWidth="1" />
      <Bone x1={158} y1={150} x2={176} y2={198} w={34} />
      <path d="M138 150 Q126 156 132 168 Q140 166 146 158 Z" fill={BONE} stroke={BONE_EDGE} strokeWidth="1" />
      <rect x="104" y="72" width="22" height="46" rx="8" transform="rotate(13 115 95)" fill={BONE} stroke={BONE_EDGE} strokeWidth="1.2" />
    </g>

    {/* Construcción: eje de la rótula (LR) → tendón (LT) */}
    <line className="nd-draw nd-s1" style={len(44)} x1="112" y1="76" x2="124" y2="116" stroke={AX} strokeWidth="2.6" strokeLinecap="round" />
    <line className="nd-draw nd-s2" style={len(50)} x1="124" y1="116" x2="140" y2="162" stroke={BX} strokeWidth="2.6" strokeLinecap="round" />
    <Dot x={112} y={76} cls="nd-fade nd-f1" />
    <Dot x={124} y={116} cls="nd-fade nd-f2" />
    <Dot x={140} y={162} cls="nd-fade nd-f2" />

    <text className="nd-fade nd-f1" x="98" y="84" fill={AX} fontSize="10.5" textAnchor="end">Rótula (LR)</text>
    <text className="nd-fade nd-f2" x="150" y="150" fill={BX} fontSize="10.5" textAnchor="start">Tendón (LT)</text>
    <text x="150" y="186" fill={LBL} fontSize="9.5" textAnchor="middle">Tuberosidad tibial</text>
    <text className="nd-fade nd-f3" x="160" y="22" fill={ANG} fontSize="11.5" fontWeight="700" textAnchor="middle">Índice = LT / LR</text>
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
