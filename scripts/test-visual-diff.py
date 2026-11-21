#!/usr/bin/env python3
"""Synthetic tests for the screenshot heatmap comparator; not official PDF approval."""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw


class VisualDiffRegressions(unittest.TestCase):
    def test_identical_and_modified_page_sets(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            refs=[]
            outs=[]
            for page in range(1,6):
                ref=Image.new('RGB',(500,700),'white')
                ImageDraw.Draw(ref).text((50,40),f'SYNTHETIC PAGE {page}',fill='black')
                out=ref.copy()
                if page==3:
                    ImageDraw.Draw(out).rectangle((90,100,390,300),fill='black')
                rp=root/f'ref-{page}.png'
                op=root/f'out-{page}.png'
                ref.save(rp)
                out.save(op)
                refs.append(str(rp))
                outs.append(str(op))
            diff=root/'diff'
            diff.mkdir()
            def invoke(outputs):
                run=subprocess.run([sys.executable,'scripts/compute-diff.py',json.dumps({
                    'refPages':refs,'outPages':outputs,'diffDir':str(diff)
                })],capture_output=True,text=True,check=True)
                return json.loads(run.stdout)
            identical=invoke(refs)
            self.assertTrue(identical['allPass'])
            self.assertEqual(len(identical['pages']),5)
            changed=invoke(outs)
            self.assertFalse(changed['allPass'])
            self.assertTrue(changed['pages'][0]['ok'])
            self.assertFalse(changed['pages'][2]['ok'])
            self.assertGreater(changed['pages'][2]['diffRatio'],0.001)
            hm=Image.open(diff/'heatmap-3.png').convert('RGB')
            self.assertEqual(hm.getpixel((100,150)),(255,0,0))
            self.assertEqual(hm.getpixel((450,650)),(255,255,255))

    def test_page_count_mismatch_must_fail(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            run=subprocess.run([sys.executable,'scripts/compute-diff.py',json.dumps({
                'refPages':['a.png']*5,'outPages':['b.png']*4,'diffDir':str(root)
            })],capture_output=True,text=True)
            self.assertNotEqual(run.returncode,0)
            self.assertIn('Halaman beda',run.stdout)


if __name__=='__main__':
    unittest.main()
