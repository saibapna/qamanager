#!/usr/bin/env python3
"""Raster + text PDF acceptance validator (not a substitute for an official baseline)."""
import sys
import argparse
from pathlib import Path

import numpy as np
from pdf2image import convert_from_path, pdfinfo_from_path
from skimage.metrics import structural_similarity as ssim
from pdfminer.high_level import extract_text

SSIM_THRESHOLD = 0.999
PIXEL_DIFF_MAX = 0.001
SIZE_TOLERANCE = 0.05
DPI = 300
EXPECTED_PAGES = 5


def validate(ref_path, out_path, verbose=True, dpi=DPI, expected_pages=EXPECTED_PAGES):
    ref_path, out_path = Path(ref_path), Path(out_path)
    if not ref_path.is_file():
        raise FileNotFoundError(ref_path)
    if not out_path.is_file():
        raise FileNotFoundError(out_path)
    if not isinstance(dpi, int) or dpi < 72 or dpi > 300:
        raise ValueError("DPI harus berada antara 72 dan 300")
    if not isinstance(expected_pages, int) or expected_pages < 1:
        raise ValueError("Jumlah halaman harapan tidak valid")

    ref_size, out_size = ref_path.stat().st_size, out_path.stat().st_size
    if ref_size == 0 or out_size == 0:
        print("FAIL: file PDF kosong")
        return 1
    size_diff = abs(out_size - ref_size) / ref_size
    if verbose:
        print(f"[Size] ref={ref_size} out={out_size} diff={size_diff:.2%}")
    if size_diff > SIZE_TOLERANCE:
        print(f"FAIL: ukuran berbeda {size_diff:.2%} (>5%)")
        return 1

    try:
        ref_pages = int(pdfinfo_from_path(str(ref_path))["Pages"])
        out_pages = int(pdfinfo_from_path(str(out_path))["Pages"])
    except Exception as exc:
        print(f"FAIL: PDF tidak dapat dibaca: {type(exc).__name__}")
        return 1

    # Enforce the formal five-page contract; two identically truncated PDFs
    # must never be accepted as a valid official ULO baseline.
    if ref_pages != expected_pages or out_pages != expected_pages:
        print(f"FAIL: perlu {expected_pages} halaman, baseline={ref_pages} output={out_pages}")
        return 1

    all_pass = True
    # Render one page per file at a time to limit peak memory for A4 300 DPI.
    for index in range(1, expected_pages + 1):
        try:
            a = convert_from_path(str(ref_path), dpi=dpi, first_page=index, last_page=index)[0]
            b = convert_from_path(str(out_path), dpi=dpi, first_page=index, last_page=index)[0]
        except Exception as exc:
            print(f"FAIL: halaman {index} gagal dirasterisasi: {type(exc).__name__}")
            return 1
        if a.size != b.size:
            print(f"FAIL: halaman {index} memiliki resolusi berbeda")
            all_pass = False
            continue
        ga = np.asarray(a.convert("L"), dtype=np.uint8)
        gb = np.asarray(b.convert("L"), dtype=np.uint8)
        score = float(ssim(ga, gb, data_range=255))
        diff = np.count_nonzero(np.abs(ga.astype(np.int16) - gb.astype(np.int16)) > 16) / ga.size
        ok = score >= SSIM_THRESHOLD and diff <= PIXEL_DIFF_MAX
        if verbose:
            print(f"[Hal {index}] SSIM={score:.5f} diff={diff:.4%} {'PASS' if ok else 'FAIL'}")
        if not ok:
            all_pass = False

    try:
        ref_text = " ".join(extract_text(str(ref_path)).split())
        out_text = " ".join(extract_text(str(out_path)).split())
    except Exception as exc:
        print(f"FAIL: teks PDF tidak dapat dibaca: {type(exc).__name__}")
        return 1
    if ref_text != out_text:
        print(f"FAIL: teks berbeda (len ref={len(ref_text)}, out={len(out_text)})")
        all_pass = False
    elif verbose:
        print("[Text] identik")

    print("VALIDASI VISUAL LULUS" if all_pass else "VALIDASI VISUAL GAGAL")
    return 0 if all_pass else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("ref", help="PDF baseline resmi")
    parser.add_argument("out", help="PDF output yang diperiksa")
    parser.add_argument("-q", "--quiet", action="store_true")
    parser.add_argument("--dpi", type=int, default=DPI)
    parser.add_argument("--expected-pages", type=int, default=EXPECTED_PAGES)
    args = parser.parse_args()
    try:
        sys.exit(validate(args.ref, args.out, verbose=not args.quiet,
                          dpi=args.dpi, expected_pages=args.expected_pages))
    except (FileNotFoundError, ValueError) as error:
        print(f"FAIL: {error}")
        sys.exit(1)
