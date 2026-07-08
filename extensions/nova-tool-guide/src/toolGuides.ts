/**
 * Contenido clínico de las guías de uso de las herramientas de medición
 * especializadas (menú "Medidas Especiales" del modo desktop).
 *
 * Cada entrada está indexada por el `toolName` de Cornerstone (el mismo que
 * registra initToolGroups y que emite el evento TOOL_ACTIVATED).
 *
 * Los valores de referencia provienen de literatura pública y ampliamente
 * aceptada (cita clásica + artículo de Radiopaedia como fuente abierta). Son
 * ORIENTATIVOS: la interpretación final es siempre del médico.
 */

/** Referencia anatómica, opcionalmente acotada a una población. */
export interface GuideAnatomyItem {
  population?: string;
  text: string;
}

/** Paso del trazo: título breve + detalle. */
export interface GuideStep {
  title: string;
  detail?: string;
}

/** Fila de interpretación clínica: etiqueta (izq.) + detalle (der.) + tono. */
export interface GuideValueRow {
  /** Texto en negrita a la izquierda (categoría, población o rango). */
  label: string;
  /** Texto secundario a la derecha (rango o significado clínico). */
  detail: string;
  /** Acento de color: 'normal' resalta en verde; 'low'/'high' matizan. */
  tone?: 'normal' | 'low' | 'high';
}

export interface ToolGuide {
  /** toolName de Cornerstone (clave del mapa). */
  toolName: string;
  /** Nombre clínico mostrado en la burbuja y la cabecera. */
  title: string;
  specialty: string;
  /** Símbolo y unidad de la medida (cabecera tipo lectura de instrumento). */
  metric: { glyph: string; unit: string };
  /** Proyección/estudio donde se aplica la medida. */
  context: string;
  /** Descripción breve del uso clínico de la herramienta. */
  clinicalUse: string;
  /** Descripción anatómica principal (frase líder, admite **negritas**). */
  anatomyLead: string;
  /** Referencias anatómicas adicionales, por población. */
  anatomy: GuideAnatomyItem[];
  /** Pasos del trazo, en el orden real de clics de la herramienta. */
  steps: GuideStep[];
  /** Filas de interpretación clínica (valores de referencia + significado). */
  values: GuideValueRow[];
  /** Lectura rápida bajo la tabla de valores. */
  interpretation: string;
  reference: {
    citation: string;
    url: string;
    urlLabel: string;
  };
}

const toolGuides: Record<string, ToolGuide> = {
  CobbAngle: {
    toolName: 'CobbAngle',
    title: 'Ángulo de Cobb',
    specialty: 'Ortopedia · Columna',
    metric: { glyph: '∠', unit: 'grados (°)' },
    context: 'Radiografía PA de columna total, en bipedestación',
    clinicalUse:
      'Cuantifica la magnitud de una curva escoliótica y su seguimiento en el tiempo. Es la medida estándar para decidir observación, órtesis o cirugía en la escoliosis.',
    anatomyLead:
      'Se mide entre el **platillo superior de la vértebra límite superior** y el **platillo inferior de la vértebra límite inferior** de la curva.',
    anatomy: [
      {
        population: 'Niños y adolescentes',
        text: 'Verifique la madurez esquelética (signo de Risser en las crestas ilíacas): condiciona el riesgo de progresión.',
      },
      {
        population: 'Adultos',
        text: 'Los cambios degenerativos (osteofitos, listesis) pueden dificultar identificar los platillos vertebrales.',
      },
    ],
    steps: [
      {
        title: 'Identificar las vértebras límite',
        detail: 'Las más inclinadas hacia la concavidad, en los extremos de la curva.',
      },
      {
        title: 'Trazar el platillo superior',
        detail: 'Línea sobre el platillo de la vértebra límite superior (2 clics).',
      },
      {
        title: 'Trazar el platillo inferior',
        detail: 'Línea sobre el platillo de la vértebra límite inferior (2 clics).',
      },
      {
        title: 'Auto-cálculo',
        detail: 'El visor calcula el ángulo entre ambas líneas.',
      },
    ],
    values: [
      { label: 'Normal (< 10°)', detail: 'Asimetría sin criterio de escoliosis', tone: 'normal' },
      { label: 'Leve (10° – 24°)', detail: 'Escoliosis · observación', tone: 'low' },
      { label: 'Moderada (25° – 44°)', detail: 'Considerar órtesis (esqueleto inmaduro)', tone: 'high' },
      { label: 'Severa (≥ 45° – 50°)', detail: 'Valoración quirúrgica', tone: 'high' },
    ],
    interpretation:
      'Se define escoliosis con un ángulo ≥ 10°. Una progresión > 5° entre controles con la misma técnica se considera significativa.',
    reference: {
      citation:
        'Cobb JR. Outline for the study of scoliosis. AAOS Instr Course Lect. 1948;5:261-275.',
      url: 'https://radiopaedia.org/articles/cobb-angle',
      urlLabel: 'Radiopaedia · Cobb angle',
    },
  },

  CardioThoracicIndex: {
    toolName: 'CardioThoracicIndex',
    title: 'Índice Cardiotorácico (ICT)',
    specialty: 'Cardiología · Tórax',
    metric: { glyph: 'C/T', unit: 'índice' },
    context: 'Radiografía PA de tórax en inspiración adecuada',
    clinicalUse:
      'Detecta el aumento de la silueta cardíaca (cardiomegalia o derrame pericárdico) como cribado rápido en la radiografía de tórax.',
    anatomyLead:
      'Es la relación entre el **diámetro cardíaco máximo** y el **diámetro torácico interno máximo** medidos sobre la misma proyección.',
    anatomy: [
      {
        population: 'Adultos',
        text: 'Solo válido en proyección PA y con buena inspiración: la proyección AP o en decúbito magnifica la silueta cardíaca.',
      },
      {
        population: 'Lactantes',
        text: 'El timo puede ensanchar el mediastino superior y simular cardiomegalia (signo de la vela tímica).',
      },
    ],
    steps: [
      {
        title: 'Trazar el diámetro torácico',
        detail: 'De borde interno a borde interno costal, a la altura de las cúpulas diafragmáticas (2 clics).',
      },
      {
        title: 'Marcar el borde cardíaco derecho',
        detail: 'En su punto de máxima excursión lateral (1 clic).',
      },
      {
        title: 'Marcar el borde cardíaco izquierdo',
        detail: 'En su punto de máxima excursión lateral (1 clic).',
      },
      {
        title: 'Auto-cálculo',
        detail: 'El visor calcula la relación ancho cardíaco / ancho torácico.',
      },
    ],
    values: [
      { label: 'Adultos (PA)', detail: '≤ 0.50', tone: 'normal' },
      { label: 'Niños < 2 años', detail: '≤ 0.60', tone: 'normal' },
      { label: 'Neonatos', detail: '≤ 0.65', tone: 'normal' },
      { label: 'Por encima del límite', detail: 'Cardiomegalia / derrame pericárdico', tone: 'high' },
    ],
    interpretation:
      'Un índice por encima del límite para la población sugiere cardiomegalia. Confirme técnica (PA, inspiración) antes de interpretarlo como patológico.',
    reference: {
      citation: 'Danzer CS. The cardiothoracic ratio. Am J Med Sci. 1919;157:513-521.',
      url: 'https://radiopaedia.org/articles/cardiothoracic-ratio',
      urlLabel: 'Radiopaedia · Cardiothoracic ratio',
    },
  },

  KiteAngle: {
    toolName: 'KiteAngle',
    title: 'Ángulo de Kite (talocalcáneo AP)',
    specialty: 'Ortopedia · Pie',
    metric: { glyph: '∠', unit: 'grados (°)' },
    context: 'Radiografía dorsoplantar (AP) del pie, idealmente con carga',
    clinicalUse:
      'Evalúa la alineación del retropié cuantificando la divergencia entre astrágalo y calcáneo. Ayuda a diferenciar el pie varo (equinovaro) del pie plano valgo.',
    anatomyLead:
      'Se mide entre el **eje longitudinal del astrágalo** y el **eje longitudinal del calcáneo** en una radiografía dorsoplantar del pie.',
    anatomy: [
      {
        population: 'Neonatos y lactantes',
        text: 'Osificación incompleta: trace los ejes sobre los núcleos de osificación visibles del astrágalo y el calcáneo.',
      },
      {
        population: 'Niños mayores y adultos',
        text: 'Con osificación completa, use el borde cortical medial del astrágalo y el lateral del calcáneo.',
      },
    ],
    steps: [
      {
        title: 'Trazar el eje del astrágalo',
        detail: 'Paralelo a su borde medial, hacia la base del 1.er metatarsiano (2 clics).',
      },
      {
        title: 'Trazar el eje del calcáneo',
        detail: 'Siguiendo su borde lateral, hacia la base del 4.º–5.º metatarsiano (2 clics).',
      },
      {
        title: 'Auto-cálculo',
        detail: 'El visor calcula el ángulo entre ambos ejes.',
      },
    ],
    values: [
      { label: 'Normal · neonatos y lactantes', detail: '30° – 50°', tone: 'normal' },
      { label: 'Normal · niños ≥ 5 y adultos', detail: '15° – 30°', tone: 'normal' },
      { label: 'Disminuido (< 15°)', detail: 'Retropié varo · pie equinovaro', tone: 'low' },
      { label: 'Aumentado (> 50°)', detail: 'Retropié valgo · pie plano', tone: 'high' },
    ],
    interpretation:
      'Un ángulo disminuido indica paralelismo talocalcáneo (retropié varo); uno aumentado indica divergencia (retropié valgo).',
    reference: {
      citation:
        'Vanderwilde R, Staheli LT, Chew DE, Malagon V. Measurements on radiographs of the foot in normal infants and children. J Bone Joint Surg Am. 1988;70(3):407-415.',
      url: 'https://radiopaedia.org/articles/talocalcaneal-angle',
      urlLabel: 'Radiopaedia · Talocalcaneal (Kite) angle',
    },
  },

  HilgenreinerAngle: {
    toolName: 'HilgenreinerAngle',
    title: 'Ángulo Acetabular (Hilgenreiner)',
    specialty: 'Ortopedia · Cadera pediátrica',
    metric: { glyph: '∠', unit: 'grados (°)' },
    context: 'Radiografía AP de pelvis en lactantes y niños',
    clinicalUse:
      'Valora la displasia del desarrollo de la cadera (DDC) midiendo la inclinación del techo acetabular respecto a la horizontal pélvica. A mayor ángulo, menor cobertura de la cabeza femoral.',
    anatomyLead:
      'Es el ángulo entre la **línea de Hilgenreiner** (une ambos cartílagos trirradiados) y la **línea del techo acetabular** de cada cadera.',
    anatomy: [
      {
        population: 'Lactantes y niños',
        text: 'Aplicable mientras el cartílago trirradiado siga abierto. Pelvis sin rotación: agujeros obturadores simétricos.',
      },
      {
        population: 'Esqueleto maduro',
        text: 'Con el trirradiado cerrado la medida pierde validez: use el ángulo de Tönnis (sourcil).',
      },
    ],
    steps: [
      {
        title: 'Trazar la línea de Hilgenreiner',
        detail: 'Horizontal que une ambos cartílagos trirradiados (2 clics).',
      },
      {
        title: 'Trazar la línea acetabular izquierda',
        detail: 'Del cartílago trirradiado al borde óseo lateral del techo (2 clics).',
      },
      {
        title: 'Trazar la línea acetabular derecha',
        detail: 'Igual, en la cadera contralateral (2 clics).',
      },
      {
        title: 'Auto-cálculo',
        detail: 'El visor calcula el ángulo de cada cadera respecto a la horizontal.',
      },
    ],
    values: [
      { label: 'Normal · recién nacidos', detail: '< 30° (media ≈ 27°)', tone: 'normal' },
      { label: 'Normal · ≥ 1 año', detail: '< 22°', tone: 'normal' },
      { label: 'Normal · 2 años', detail: '< 20°', tone: 'normal' },
      { label: 'Aumentado para la edad', detail: 'Displasia del desarrollo (DDC)', tone: 'high' },
    ],
    interpretation:
      'El ángulo debe disminuir progresivamente con el crecimiento. Un valor aumentado para la edad orienta a displasia del desarrollo de la cadera.',
    reference: {
      citation:
        'Tönnis D. Normal values of the hip joint for the evaluation of X-rays in children and adults. Clin Orthop Relat Res. 1976;(119):39-47.',
      url: 'https://radiopaedia.org/articles/acetabular-angle',
      urlLabel: 'Radiopaedia · Acetabular angle',
    },
  },

  TonnisAngle: {
    toolName: 'TonnisAngle',
    title: 'Ángulo de Tönnis',
    specialty: 'Ortopedia · Cadera',
    metric: { glyph: '∠', unit: 'grados (°)' },
    context: 'Radiografía AP de pelvis en esqueleto maduro',
    clinicalUse:
      'Mide la inclinación del techo de carga acetabular. Valora la displasia (con inestabilidad) y la sobre-cobertura (pinzamiento femoroacetabular tipo pincer) en adolescentes y adultos.',
    anatomyLead:
      'Es el ángulo entre una **horizontal de referencia** (línea inter-lágrimas) y la **línea del techo de carga** (sourcil), medido en su extremo medial.',
    anatomy: [
      {
        population: 'Adolescentes y adultos',
        text: 'Aplicable tras el cierre del cartílago trirradiado. Pelvis sin rotación ni inclinación (coxis alineado con la sínfisis).',
      },
      {
        population: 'Lactantes y niños',
        text: 'En cadera inmadura use el ángulo acetabular de Hilgenreiner en su lugar.',
      },
    ],
    steps: [
      {
        title: 'Trazar la horizontal de referencia',
        detail: 'Paralela al eje transverso de la pelvis, por el extremo medial del sourcil (2 clics).',
      },
      {
        title: 'Trazar el techo de carga',
        detail: 'Del extremo medial al lateral del sourcil esclerótico (2 clics).',
      },
      {
        title: 'Auto-cálculo',
        detail: 'El visor calcula el ángulo de inclinación del techo.',
      },
    ],
    values: [
      { label: 'Normal (0° – 10°)', detail: 'Cobertura adecuada', tone: 'normal' },
      { label: 'Aumentado (> 10°)', detail: 'Displasia acetabular · inestabilidad', tone: 'high' },
      { label: 'Negativo (< 0°)', detail: 'Sobre-cobertura · pinzamiento pincer', tone: 'low' },
    ],
    interpretation:
      'Un techo muy inclinado (> 10°) sugiere displasia con sobrecarga del borde lateral; un ángulo negativo sugiere sobre-cobertura y riesgo de pinzamiento femoroacetabular.',
    reference: {
      citation:
        'Tönnis D. Congenital Dysplasia and Dislocation of the Hip in Children and Adults. Springer; 1987.',
      url: 'https://radiopaedia.org/articles/acetabular-index',
      urlLabel: 'Radiopaedia · Acetabular index (Tönnis)',
    },
  },

  InsallSalvatiIndex: {
    toolName: 'InsallSalvatiIndex',
    title: 'Índice de Insall-Salvati',
    specialty: 'Ortopedia · Rodilla',
    metric: { glyph: 'LT/LR', unit: 'índice' },
    context: 'Radiografía lateral de rodilla con flexión de ~30°',
    clinicalUse:
      'Evalúa la altura de la rótula (rótula alta o baja), asociada a inestabilidad rotuliana o a rigidez del aparato extensor.',
    anatomyLead:
      'Es la relación entre la **longitud del tendón rotuliano** y la **longitud de la rótula** (eje mayor) medidas en la proyección lateral.',
    anatomy: [
      {
        population: 'Adultos',
        text: 'Medir con flexión de ~30°: con el tendón tenso la medida es reproducible.',
      },
      {
        population: 'Niños y adolescentes',
        text: 'Interprete con cautela si la osificación de la rótula o de la tuberosidad tibial es incompleta.',
      },
    ],
    steps: [
      {
        title: 'Trazar el eje mayor de la rótula',
        detail: 'Su longitud diagonal máxima, de polo superior a inferior (2 clics).',
      },
      {
        title: 'Marcar el inicio del tendón',
        detail: 'En el polo inferior de la rótula (1 clic).',
      },
      {
        title: 'Marcar la inserción del tendón',
        detail: 'En la tuberosidad tibial anterior (1 clic).',
      },
      {
        title: 'Auto-cálculo',
        detail: 'El visor calcula la relación longitud del tendón / longitud de la rótula.',
      },
    ],
    values: [
      { label: 'Normal', detail: '0.8 – 1.2', tone: 'normal' },
      { label: 'Rótula alta', detail: '> 1.2', tone: 'high' },
      { label: 'Rótula baja', detail: '< 0.8', tone: 'low' },
    ],
    interpretation:
      'La rótula alta se asocia a inestabilidad y luxación recidivante; la rótula baja, a rigidez y a cirugía o traumatismo previo del aparato extensor.',
    reference: {
      citation:
        'Insall J, Salvati E. Patella position in the normal knee joint. Radiology. 1971;101(1):101-104.',
      url: 'https://radiopaedia.org/articles/insall-salvati-ratio',
      urlLabel: 'Radiopaedia · Insall-Salvati ratio',
    },
  },
};

export default toolGuides;
