---
name: explain-code
description: Explica código con diagramas visuales y analogías. Usar cuando el usuario pregunte cómo funciona algo, quiera entender lógica del visor, flujos DICOM, o interacciones del viewport.
argument-hint: "[archivo o concepto]"
---

Al explicar código, sigue esta estructura:

## 1. Analogía
Compara el código con algo de la vida cotidiana o del dominio médico. Ejemplo: "El viewport funciona como una ventana de rayos X: ajustas brillo y contraste para ver lo que necesitas".

## 2. Diagrama
Dibuja un diagrama ASCII que muestre el flujo de datos, la arquitectura de componentes, o las interacciones relevantes.

Ejemplo:
```
DICOM File → Parser → ImageObject → Viewport → Canvas
                         ↓
                    Metadata Cache
```

## 3. Recorrido paso a paso
Explica qué hace cada parte del código en orden de ejecución. Referencia archivos y líneas específicas con formato de link markdown.

## 4. Conceptos clave
Si el código involucra conceptos de imaging médico, explícalos brevemente:
- Tags DICOM relevantes
- Modalidades afectadas (CT, MRI, X-ray, US, etc.)
- Transformaciones de coordenadas (paciente, imagen, viewport)
- Unidades de medida (Hounsfield Units, mm, pixels)
- Window/Level y su efecto visual

## 5. Errores comunes
Menciona al menos un gotcha o error frecuente relacionado con ese código o patrón.

## Reglas
- Mantén las explicaciones conversacionales y en español
- Usa múltiples analogías para conceptos complejos
- Si el código es de una extensión OHIF, explica cómo se integra con el ciclo de vida del visor
- Siempre incluye referencias a archivos concretos del proyecto
