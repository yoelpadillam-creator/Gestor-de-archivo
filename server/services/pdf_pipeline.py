"""
Pipeline OCR: PDF → imagen (pdf2image) → preprocesado OpenCV → pytesseract.
Si la página ya trae texto digital (pdfplumber), se usa directamente.
Todo corre en memoria; nunca se escribe en disco.
"""

import io
import math
import unicodedata
from typing import Optional

import cv2
import numpy as np
import pdfplumber
import pytesseract
from pdf2image import convert_from_bytes
from PIL import Image

DIGITAL_TEXT_MIN = 40
RENDER_DPI = 300
UPSCALE_THRESHOLD = 1500   # px de ancho mínimo; si es menor se escala ×1.5
TESSERACT_CONFIG = "--oem 1 --psm 6 -l spa"


def _pil_to_bgr(img: Image.Image) -> np.ndarray:
    return cv2.cvtColor(np.array(img.convert("RGB")), cv2.COLOR_RGB2BGR)


def _deskew(gray: np.ndarray) -> np.ndarray:
    """Detecta y corrige la inclinación de la imagen si supera 0.5°."""
    coords = np.column_stack(np.where(gray < 128))
    if len(coords) < 100:
        return gray
    angle = cv2.minAreaRect(coords)[-1]
    if angle < -45:
        angle = 90 + angle
    if abs(angle) < 0.5:
        return gray
    h, w = gray.shape
    center = (w // 2, h // 2)
    M = cv2.getRotationMatrix2D(center, angle, 1.0)
    return cv2.warpAffine(gray, M, (w, h), flags=cv2.INTER_CUBIC,
                          borderMode=cv2.BORDER_REPLICATE)


def _preprocess(img: Image.Image) -> Image.Image:
    """Convierte PIL→BGR, aplica preprocesado OpenCV, devuelve PIL."""
    bgr = _pil_to_bgr(img)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)

    # Upscale si la imagen es pequeña
    h, w = gray.shape
    if w < UPSCALE_THRESHOLD:
        scale = UPSCALE_THRESHOLD / w
        gray = cv2.resize(gray, None, fx=scale, fy=scale,
                          interpolation=cv2.INTER_CUBIC)

    gray = cv2.fastNlMeansDenoising(gray, h=10, templateWindowSize=7,
                                     searchWindowSize=21)
    gray = cv2.adaptiveThreshold(gray, 255,
                                  cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                  cv2.THRESH_BINARY, 11, 2)
    gray = _deskew(gray)
    return Image.fromarray(gray)


def _ocr_image(pil_img: Image.Image) -> str:
    processed = _preprocess(pil_img)
    return pytesseract.image_to_string(processed, config=TESSERACT_CONFIG)


def _digital_text(pdf_bytes: bytes) -> Optional[list[str]]:
    """Intenta extraer texto digital con pdfplumber. Devuelve lista de textos
    por página si todas tienen suficiente contenido, o None si alguna no lo
    tiene (en ese caso hay que hacer OCR completo)."""
    try:
        pages_text: list[str] = []
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page in pdf.pages:
                text = (page.extract_text() or "").strip()
                pages_text.append(text)
        return pages_text
    except Exception:
        return None


def extract_pages(pdf_bytes: bytes) -> list[str]:
    """
    Devuelve lista de strings (texto por página).
    Preferencia: texto digital → OCR si la página tiene < DIGITAL_TEXT_MIN chars.
    """
    digital = _digital_text(pdf_bytes)
    if digital is None:
        digital = [""] * 9999  # sentinel vacío; se hará OCR de todo

    images: Optional[list[Image.Image]] = None
    results: list[str] = []

    for i, dt in enumerate(digital):
        if len(dt) >= DIGITAL_TEXT_MIN:
            results.append(dt)
            continue
        # Necesita OCR: rasterizar PDF sólo la primera vez que haga falta
        if images is None:
            images = convert_from_bytes(pdf_bytes, dpi=RENDER_DPI, fmt="png")
        if i >= len(images):
            break
        results.append(_ocr_image(images[i]))

    return results
