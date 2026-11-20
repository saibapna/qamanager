#!/usr/bin/env python3
import sys, json, os
import numpy as np
from PIL import Image
from skimage.metrics import structural_similarity as ssim

SSIM_THRESHOLD = 0.999
PIXEL_DIFF_MAX = 0.001

def heatmap(ref, out):
    a = np.array(ref.convert('RGB')).astype(int)
    b = np.array(out.convert('RGB')).astype(int)
    diff = np.abs(a - b).sum(axis=2)
    mask = diff > 16
    h = np.zeros_like(a, dtype=np.uint8)
    h[..., 0] = np.where(mask, 255, 255)
    h[..., 1] = np.where(mask, 0, 255)
    h[..., 2] = np.where(mask, 0, 255)
    gray = np.array(ref.convert('L').convert('RGB'))
    blended = (h * 0.6 + gray * 0.4).astype(np.uint8)
    return Image.fromarray(blended)

def main():
    cfg = json.loads(sys.argv[1])
    refs, outs, diff_dir = cfg["refPages"], cfg["outPages"], cfg["diffDir"]
    if len(refs) != len(outs):
        print(json.dumps({"error": f"Halaman beda: {len(refs)} vs {len(outs)}"})); sys.exit(1)

    pages = []
    all_pass = True
    for i, (rp, op) in enumerate(zip(refs, outs), 1):
        ref = Image.open(rp).convert('RGB')
        out = Image.open(op).convert('RGB')
        if ref.size != out.size:
            pages.append({"page": i, "error": "Ukuran beda"}); all_pass = False; continue
        a = np.array(ref.convert('L')); b = np.array(out.convert('L'))
        score = float(ssim(a, b, data_range=255))
        diff = np.count_nonzero(np.abs(a.astype(int) - b.astype(int)) > 16)
        ratio = float(diff / a.size)
        hm_path = os.path.join(diff_dir, f"heatmap-{i}.png")
        heatmap(ref, out).save(hm_path)
        ok = score >= SSIM_THRESHOLD and ratio <= PIXEL_DIFF_MAX
        if not ok: all_pass = False
        pages.append({"page": i, "ssim": round(score, 5), "diffRatio": round(ratio, 5),
                      "ok": ok, "ref": rp, "out": op, "heatmap": hm_path})
    print(json.dumps({"pages": pages, "allPass": all_pass}))

if __name__ == "__main__": main()
