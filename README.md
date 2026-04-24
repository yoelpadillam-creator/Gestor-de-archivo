# Analizador de Facturas vs Inventario (Tauro)

Página web estática que cruza facturas escaneadas en PDF contra un inventario
activo en Excel/CSV y produce un **informe detallado** con duplicados y
descuadres para el modelo **Tauro**. Todo se procesa en el navegador; los
archivos nunca salen de tu máquina.

## Para qué sirve

Detectar si una unidad Tauro fue **facturada dos veces** (doble facturación
del mismo chasis o motor) comparando:

- **Inventario activo** (Excel/CSV con `modelo`, `chasis`, `motor`, `color`).
- **Facturas** (PDF escaneados, uno o varios) — se leen mediante OCR.

## Uso

1. Abre `index.html` en Chrome, Edge o Firefox actualizado (doble clic o
   sirviéndolo desde GitHub Pages / cualquier servidor estático).
2. **Paso 1** — Sube el Excel/CSV con el inventario. Se filtran automáticamente
   las filas cuyo modelo sea Tauro.
3. **Paso 2** — Selecciona uno o varios PDF de facturas escaneadas.
4. **Paso 3** — Pulsa *Analizar facturas*. El OCR puede tardar entre 5 y 20
   segundos por página dependiendo de la calidad del escaneo.
5. **Paso 4** — Revisa el informe en pantalla y/o expórtalo a Excel o PDF.

## Estructura del informe

- **Resumen** con contadores clave.
- **A · Facturas duplicadas**: mismo chasis o motor en dos o más facturas
  (el hallazgo clave para explicar dos Tauros fuera de inventario).
- **B · Coincidencias**: Tauros facturados que cuadran con el inventario. Se
  marca si la coincidencia es exacta o parcial (p. ej. coincide chasis pero
  no color).
- **C · Facturados que NO están en inventario**: candidatos a error de
  facturación o inventario desactualizado.
- **D · En inventario pero NO facturados**.

## Columnas esperadas del inventario

La aplicación tolera variantes comunes de nombres de columna, p. ej.:

- `modelo`, `model`, `producto`, `descripcion`
- `chasis`, `serial chasis`, `no. chasis`, `vin`
- `motor`, `serial motor`, `no. motor`
- `color`

Si tus encabezados son muy distintos a estos, edita `js/inventory.js`
(`HEADER_ALIASES`) y agrega los tuyos.

## Stack

- HTML + CSS + JavaScript vanilla (sin build step).
- [pdf.js](https://mozilla.github.io/pdf.js/) — abre y rasteriza los PDF.
- [Tesseract.js](https://tesseract.projectnaptha.com/) — OCR en español.
- [SheetJS](https://sheetjs.com/) — lectura de Excel/CSV y exportación a
  Excel.
- [jsPDF](https://github.com/parallax/jsPDF) + autotable — exportación a PDF.

## Privacidad

Todas las librerías se cargan desde CDNs públicos, pero el contenido de tus
archivos **no se envía a ningún servidor**: el parsing y el OCR corren en tu
navegador.

## Notas

- Si un PDF trae texto digital (no escaneado), se lee sin OCR y el análisis es
  mucho más rápido y preciso.
- Tesseract.js descarga el modelo de español (`spa`) la primera vez que lo
  usas; se cachea en el navegador.
- Si Tesseract deja algunos campos como *ilegibles*, abre esa factura
  manualmente y revisa; mejora el escaneo a 300 dpi o ajusta los regex en
  `js/parser.js`.
