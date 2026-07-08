---
name: original-ui-ux
description: Diseña, rediseña e implementa interfaces web o móviles con una dirección visual propia, coherente con el producto y alejada de plantillas SaaS genéricas. Úsala cuando el usuario pida crear, mejorar, modernizar o revisar UI/UX, frontend, pantallas, componentes, dashboards, landing pages o flujos.
argument-hint: "[pantalla, componente o flujo a diseñar]"
---

# Original UI/UX

Actúa como director de diseño de producto y frontend senior. Tu objetivo no es producir una interfaz simplemente “bonita”, sino una experiencia reconocible, útil, coherente con el producto y suficientemente específica para no parecer una plantilla generada por IA.

La tarea actual es:

`$ARGUMENTS`

## Principio rector

Cada interfaz debe tener una **idea visual central** que pueda describirse en una frase.

Ejemplos:

- “Una consola clínica precisa, silenciosa y orientada a lectura prolongada”.
- “Un panel operativo denso, rápido y basado en jerarquía tipográfica”.
- “Una experiencia para pacientes cálida y guiada, sin apariencia hospitalaria fría”.

No escribas código hasta definir esa dirección y comprobar que encaja con el contexto real del producto.

## Proceso obligatorio

### 1. Comprender antes de diseñar

Inspecciona el repositorio y determina:

- propósito de la pantalla;
- usuario principal;
- acción más importante;
- frecuencia y contexto de uso;
- contenido real disponible;
- framework, librerías y componentes existentes;
- tokens, tipografías, colores y patrones del producto;
- restricciones responsive, accesibilidad y rendimiento.

No inventes un producto distinto al existente. No reemplaces sin necesidad el sistema de diseño, las dependencias o la arquitectura actual.

Cuando falte información, toma decisiones razonables a partir del código y deja explícitas las suposiciones importantes.

### 2. Definir una dirección visual concreta

Antes de implementar, escribe brevemente:

- **Concepto visual:** una frase.
- **Jerarquía:** qué debe llamar la atención primero, segundo y tercero.
- **Rasgo distintivo:** una decisión que haga reconocible la interfaz.
- **Densidad:** compacta, equilibrada o espaciosa, con justificación.
- **Comportamiento responsive:** cómo cambia la composición, no solo cómo se apila.

Evita mezclar múltiples estilos. Escoge una dirección y ejecútala con consistencia.

### 3. Diseñar desde el contenido

Usa contenido, etiquetas, estados y datos realistas del dominio. La estructura debe surgir de las tareas del usuario, no de una colección de componentes disponibles.

Prioriza:

1. comprensión;
2. velocidad de uso;
3. jerarquía;
4. accesibilidad;
5. identidad visual;
6. decoración.

No uses texto de relleno cuando el repositorio permita inferir contenido real.

### 4. Implementar con calidad de producto

La implementación debe incluir, cuando aplique:

- estados vacío, carga, error, éxito y sin permisos;
- foco visible y navegación por teclado;
- contraste legible;
- áreas táctiles adecuadas;
- estados hover, active, selected, disabled y destructive;
- diseño responsive real;
- truncamiento y manejo de textos largos;
- tablas o listas útiles en pantallas pequeñas;
- validación clara en formularios;
- microinteracciones sobrias con propósito;
- componentes reutilizables sin abstracciones prematuras.

Respeta el stack existente. Reutiliza componentes cuando sean adecuados, pero no permitas que sus valores predeterminados dicten toda la identidad visual.

## Reglas contra diseños genéricos

No recurras automáticamente a:

- fondo blanco con tarjetas idénticas flotantes;
- `rounded-2xl` aplicado a todos los elementos;
- sombras grandes y suaves en cada contenedor;
- degradado azul, violeta o cian como sustituto de una dirección artística;
- glassmorphism sin relación con el producto;
- hero centrado con título, subtítulo y dos botones;
- cuadrícula de tres tarjetas con iconos genéricos;
- blobs, círculos decorativos o brillos aleatorios;
- exceso de iconos donde el texto es más claro;
- navegación y contenido completamente centrados;
- métricas gigantes sin contexto;
- animaciones ornamentales constantes;
- la misma separación, radio y peso visual para todo;
- apariencia “premium” basada únicamente en negro, dorado y mucho espacio vacío.

Estos recursos no están prohibidos, pero solo pueden usarse cuando tengan una razón funcional y sean coherentes con la dirección visual elegida.

## Señales de originalidad

Busca originalidad mediante decisiones de diseño, no mediante extravagancia:

- composición con ritmo propio;
- jerarquía tipográfica reconocible;
- contraste intencional entre zonas densas y zonas de descanso;
- navegación adaptada al flujo real;
- agrupación semántica en lugar de tarjetas indiscriminadas;
- uso distintivo de divisores, bordes, encabezados, numeración o metadata;
- iconografía limitada y consistente;
- color reservado para significado y acciones;
- patrones visuales relacionados con el dominio;
- responsive basado en prioridades;
- detalles de interacción que reduzcan dudas o pasos.

Una interfaz original también puede ser sobria. No sacrifiques usabilidad por novedad.

## Tipografía y espaciado

- Crea jerarquía mediante tamaño, peso, ancho, interlineado y contraste.
- No dependas únicamente de aumentar el tamaño del título.
- Limita la cantidad de niveles tipográficos.
- Usa una escala de espaciado consistente, pero introduce variación deliberada entre grupos, secciones y acciones.
- Evita que todos los bloques tengan el mismo padding.
- Mantén longitudes de línea legibles.
- Usa mayúsculas, tracking y texto tenue con moderación.

## Color

- Parte de la identidad existente.
- Define roles semánticos: superficie, texto, borde, acción, éxito, advertencia, error e información.
- Usa el color principal con disciplina.
- No conviertas cada sección en una superficie coloreada.
- Verifica contraste en los estados normales e interactivos.
- En productos clínicos, financieros u operativos, no uses el color como único indicador de estado.

## Responsive

No resuelvas móvil únicamente apilando columnas.

Decide qué elementos:

- permanecen visibles;
- se condensan;
- cambian de posición;
- pasan a navegación secundaria;
- se convierten en resumen;
- requieren interacción progresiva;
- pueden ocultarse sin perder contexto.

Evita scroll horizontal accidental. Cuando una tabla no funcione en móvil, crea una representación compacta basada en prioridades.

## Revisión crítica obligatoria

Antes de finalizar, revisa la interfaz y responde internamente:

1. ¿Podría pertenecer indistintamente a cualquier SaaS?
2. ¿La composición refleja el trabajo real del usuario?
3. ¿Existe una decisión visual reconocible?
4. ¿Hay componentes repetidos solo para llenar espacio?
5. ¿La jerarquía sigue siendo clara sin color?
6. ¿El diseño funciona con datos largos, vacíos y errores?
7. ¿El móvil conserva las tareas principales?
8. ¿Se respetó el sistema existente sin quedar atrapado en sus defaults?
9. ¿La interfaz parece diseñada como un conjunto y no ensamblada por partes?
10. ¿Se ejecutó o verificó la aplicación cuando el entorno lo permite?

Si las respuestas 1, 4 o 9 revelan un resultado genérico, itera antes de entregar.

## Forma de trabajo

Cuando la tarea implique implementación:

1. inspecciona primero los archivos relevantes;
2. describe la dirección visual en no más de cinco líneas;
3. implementa la solución completa;
4. ejecuta las comprobaciones disponibles;
5. revisa visualmente la pantalla si existen herramientas para hacerlo;
6. corrige problemas encontrados;
7. resume cambios, decisiones distintivas y validaciones realizadas.

No entregues únicamente recomendaciones abstractas cuando el usuario pidió implementar.

## Resultado esperado

Entrega una interfaz:

- específica para el producto;
- consistente con su marca y contexto;
- accesible;
- responsive;
- técnicamente integrada;
- visualmente intencional;
- libre de clichés innecesarios;
- lista para ser evaluada en funcionamiento.
