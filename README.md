# Gestor de Facturas vs Inventario

Aplicación que cruza facturas escaneadas (PDF) contra un inventario activo
(Excel/CSV) y, opcionalmente, contra una orden de pedido FIT (Excel/CSV o PDF).
Detecta:

- **Doble facturación** (mismo chasis o motor en más de una factura).
- **Descuadres** (facturas sin reflejo en inventario y viceversa).
- **Discrepancias de color** entre la factura y la orden de pedido (FIT).

Soporta cualquier modelo del inventario (no solo Tauro): hay un selector
desplegable o se puede analizar todo a la vez con "Todos los modelos".

## Arquitectura

- **Backend Python** (FastAPI) — OCR de calidad con `pytesseract` + OpenCV
  + `pdf2image`, parsing y exportación.
- **Frontend** estático (HTML + CSS + JS vanilla) servido por el mismo
  FastAPI desde la raíz del proyecto.

## Requisitos

### Python
- Python 3.10 o superior

### Sistema (necesarios para OCR de PDF)

**Linux (Debian/Ubuntu)**:
```bash
sudo apt install tesseract-ocr tesseract-ocr-spa poppler-utils
```

**Windows**:
- Tesseract: [installer UB-Mannheim](https://github.com/UB-Mannheim/tesseract/wiki) (marca el idioma español durante la instalación).
- Poppler: descargar binarios en [poppler-windows](https://github.com/oschwartz10612/poppler-windows/releases) y añadir la carpeta `bin/` al `PATH`.

**macOS**:
```bash
brew install tesseract tesseract-lang poppler
```

## Instalación

```bash
git clone <repo>
cd Gestor-de-archivo
pip install -r server/requirements.txt
```

## Arrancar el servidor

```bash
python run.py
```

Abre el navegador en **<http://localhost:8000>**.

> ⚠️ **Importante**: la aplicación **necesita el servidor corriendo**. Abrir
> `index.html` haciendo doble clic (URL `file://…`) **no funciona**: las
> llamadas al backend fallarán con "Failed to fetch".

## Uso

1. **Inventario activo** — sube tu Excel/CSV con columnas `modelo`,
   `chasis`, `motor`, `color`. La app detecta variantes (`serial chasis`,
   `no. chasis`, `vin`, etc.).
2. **Selector de modelo** — elige el modelo a analizar o "Todos los modelos".
3. **FIT (opcional)** — sube la orden de pedido en Excel/CSV
   (`chasis` + `color_esperado`) o **en PDF** (se extrae con OCR).
4. **Facturas** — selecciona uno o varios PDF de facturas escaneadas.
5. **Analizar** — el servidor procesa todo. Tarda algunos segundos por página.
6. **Informe** — se muestra en pantalla y se puede exportar a Excel o PDF.

## Estructura del informe

| Sección | Contenido |
|---|---|
| Resumen | Contadores clave (facturas, duplicados, coincidencias, etc.) |
| A · Duplicados | Mismo chasis o motor en 2+ facturas |
| B · Coincidencias | Facturas que cuadran con inventario (exacto/parcial) |
| C · Sin inventario | Facturados que no aparecen en el inventario |
| D · No facturados | Inventario sin movimiento de factura |
| E · Color FIT | Chasis cuyo color en la factura no coincide con la FIT |

## Estructura del proyecto

```
Gestor-de-archivo/
├── run.py                          # arranca uvicorn
├── index.html                      # frontend (servido por FastAPI)
├── styles.css
├── js/
│   ├── api.js                      # wrapper fetch del backend
│   ├── app.js                      # orquestador UI
│   ├── inventory.js                # lectura Excel/CSV con SheetJS
│   └── report.js                   # render del informe
└── server/
    ├── main.py                     # app FastAPI
    ├── requirements.txt
    ├── routers/
    │   ├── ocr.py                  # POST /api/ocr (facturas)
    │   ├── fit.py                  # POST /api/fit/pdf (FIT en PDF)
    │   ├── analyze.py              # POST /api/analyze
    │   └── export.py               # POST /api/export/{xlsx,pdf}
    ├── services/
    │   ├── pdf_pipeline.py         # OCR pipeline (pdf2image+OpenCV+pytesseract)
    │   ├── parser.py               # extracción multi-modelo de campos
    │   ├── inventory.py            # lectura tolerante con pandas
    │   └── analyzer.py             # cruce y detección de discrepancias
    └── models/schemas.py           # tipos Pydantic
```

## Endpoints

| Método | Ruta | Función |
|---|---|---|
| POST | `/api/ocr` | OCR + parse de facturas PDF |
| POST | `/api/fit/pdf` | OCR + parse de la FIT en PDF |
| POST | `/api/analyze` | Cruce y detección de discrepancias |
| POST | `/api/export/xlsx` | Descarga del informe en Excel |
| POST | `/api/export/pdf` | Descarga del informe en PDF |

## Privacidad

Todo el procesamiento ocurre en tu máquina (servidor local + navegador local).
Los archivos no se almacenan en disco: se procesan en memoria y se descartan
al terminar la petición.

## Solución de problemas

| Problema | Causa probable | Solución |
|---|---|---|
| "Failed to fetch" / "No se puede conectar con el servidor" | El servidor Python no está corriendo, o la página se abrió como `file://` | Ejecutar `python run.py` y abrir `http://localhost:8000` |
| `tesseract: not found` | Tesseract no instalado o no está en PATH | Instalar Tesseract (ver Requisitos) |
| `pdf2image.exceptions.PDFInfoNotInstalledError` | Poppler no instalado | Instalar Poppler (ver Requisitos) |
| Algunos campos quedan "ilegibles" | OCR con mala calidad | Usa PDFs a 300 dpi o más y vuelve a escanear con buen contraste |
