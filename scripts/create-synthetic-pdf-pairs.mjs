import fs from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// Synthetic documents test the comparator, never the official ULO visual baseline.
const outDir = process.argv[2] || 'output/pdf-comparator-fixtures';
await fs.mkdir(outDir, { recursive: true });
async function make({differentText=false,visualChange=false,pageCount=5}) {
  const pdf=await PDFDocument.create();
  const font=await pdf.embedFont(StandardFonts.Helvetica);
  for(let pageNo=1;pageNo<=pageCount;pageNo++){
    const page=pdf.addPage([595.28,841.89]);
    page.drawText('Synthetic comparator fixture -- NOT OFFICIAL', {x:60,y:780,size:14,font});
    const label=(differentText && pageNo===3)
      ? 'RESULT: REJECTED BY VALIDATOR'
      : 'RESULT: REFERENCE VALIDATOR DATA';
    page.drawText(label,{x:60,y:710,size:11,font});
    page.drawText('Page '+pageNo+' of 5',{x:60,y:80,size:11,font});
    if (visualChange && pageNo===3)
      page.drawRectangle({x:80,y:380,width:400,height:200,color:rgb(0.05,0.05,0.05)});
  }
  return Buffer.from(await pdf.save({useObjectStreams:false}));
}
const baseline=await make({});
await fs.writeFile(path.join(outDir,'synthetic-reference.pdf'),baseline);
await fs.writeFile(path.join(outDir,'synthetic-identical.pdf'),baseline);
await fs.writeFile(path.join(outDir,'synthetic-visual-change.pdf'),await make({visualChange:true}));
await fs.writeFile(path.join(outDir,'synthetic-text-change.pdf'),await make({differentText:true}));
await fs.writeFile(path.join(outDir,'synthetic-truncated.pdf'),await make({pageCount:4}));
console.log('Created synthetic 5-page positive and negative PDF comparator tests in '+outDir);
