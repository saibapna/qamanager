#!/usr/bin/env python3
import sys, argparse, hashlib
from pathlib import Path
import numpy as np
from pdf2image import convert_from_path
from skimage.metrics import structural_similarity as ssim
from pdfminer.high_level import extract_text

SSIM_THRESHOLD = 0.999
PIXEL_DIFF_MAX = 0.001
SIZE_TOLERANCE = 0.05
DPI = 300

def validate(ref_path, out_path, verbose=True):
    ref_path, out_path = Path(ref_path), Path(out_path)
    if not ref_path.exists(): raise FileNotFoundError(ref_path)
    if not out_path.exists(): raise FileNotFoundError(out_path)

    ref_size, out_size = ref_path.stat().st_size, out_path.stat().st_size
    size_diff = abs(out_size - ref_size) / ref_size
    if verbose: print(f"[Size] ref={ref_size} out={out_size} diff={size_diff:.2%}")
    if size_diff > SIZE_TOLERANCE:
        print(f"❌ Ukuran beda {size_diff:.2%}"); return 1

    ref_pages = convert_from_path(str(ref_path), dpi=DPI)
    out_pages = convert_from_path(str(out_path), dpi=DPI)
    if len(ref_pages) != len(out_pages):
        print(f"❌ Jumlah halaman beda: {len(ref_pages)} vs {len(out_pages)}"); return 1

    all_pass = True
    for i, (a, b) in enumerate(zip(ref_pages, out_pages), 1):
        if a.size != b.size:
            print(f"❌ Hal {i}: ukuran beda"); all_pass = False; continue
        sa = np.array(a.convert("L")); sb = np.array(b.convert("L"))
        score = ssim(sa, sb, data_range=255)
        diff = np.count_nonzero(np.abs(sa.astype(int) - sb.astype(int)) > 16) / sa.size
        ok = score >= SSIM_THRESHOLD and diff <= PIXEL_DIFF_MAX
        if verbose: print(f"[Hal {i}] SSIM={score:.5f} diff={diff:.4%} {'PASS' if ok else 'FAIL'}")
        if not ok: all_pass = False

    ref_t = " ".join(extract_text(str(ref_path)).split())
    out_t = " ".join(extract_text(str(out_path)).split())
    if ref_t != out_t:
        print(f"❌ Teks beda (len ref={len(ref_t)}, out={len(out_t)})"); all_pass = False
    elif verbose: print("[Text] identik")

    print("\n✅ VALIDASI 1=1 LULUS" if all_pass else "\n❌ VALIDASI 1=1 GAGAL")
    return 0 if all_pass else 1

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("ref"); ap.add_argument("out")
    ap.add_argument("-q", "--quiet", action="store_true")
    a = ap.parse_args()
    sys.exit(validate(a.ref, a.out, verbose=not a.quiet))
