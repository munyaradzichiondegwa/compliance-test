import fs from 'fs';
import path from 'path';
import {
  AlignmentType, BorderStyle, Document, ImageRun, Paragraph, Table, TableCell, TableRow, TextRun, WidthType, Footer, PageNumber, TabStopType, VerticalAlign, PageOrientation,
} from 'docx';

export const FONT = 'Times New Roman';
export const SZ = 24; // 12pt
const LOGO_PATH = path.join(__dirname, '..', '..', 'assets', 'zacc_logo.png');
const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const BLACK = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
export const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE };
export const BLACK_BORDERS = { top: BLACK, bottom: BLACK, left: BLACK, right: BLACK, insideHorizontal: BLACK, insideVertical: BLACK };

export function t(text: string, o: { bold?: boolean; italics?: boolean; size?: number; underline?: boolean; caps?: boolean } = {}) {
  return new TextRun({ text, font: FONT, size: o.size ?? SZ, bold: o.bold, italics: o.italics, underline: o.underline ? {} : undefined, allCaps: o.caps, color: '000000' });
}
export function p(text: string | TextRun[], o: { bold?: boolean; align?: any; after?: number; before?: number; size?: number; indent?: number; keepNext?: boolean; italics?: boolean } = {}) {
  const children = typeof text === 'string' ? [t(text, { bold: o.bold, size: o.size, italics: o.italics })] : text;
  return new Paragraph({ children, alignment: o.align ?? AlignmentType.JUSTIFIED, spacing: { after: o.after ?? 120, before: o.before ?? 0, line: 276 }, indent: o.indent ? { left: o.indent } : undefined, keepNext: o.keepNext });
}
export const h = (text: string) => p(text, { bold: true, align: AlignmentType.LEFT, before: 200, after: 100, keepNext: true });
export function numbered(items: string[], style: 'num' | 'alpha' | 'dash' = 'alpha', indent = 360) {
  return items.map((it, i) => {
    const label = style === 'num' ? `${i + 1}.` : style === 'alpha' ? `${String.fromCharCode(97 + (i % 26))})` : '-';
    return new Paragraph({ children: [t(`${label}\t${it}`)], alignment: AlignmentType.JUSTIFIED, spacing: { after: 80, line: 276 }, indent: { left: indent + 360, hanging: 360 }, tabStops: [{ type: TabStopType.LEFT, position: indent + 360 }] });
  });
}

export function cell(text: string | string[], o: { w?: number; bold?: boolean; align?: any; shade?: boolean; size?: number; span?: number; borders?: any } = {}) {
  const lines = Array.isArray(text) ? text : String(text ?? '').split('\n');
  return new TableCell({
    width: o.w ? { size: o.w, type: WidthType.DXA } : undefined, columnSpan: o.span, verticalAlign: VerticalAlign.TOP,
    borders: o.borders, margins: { top: 50, bottom: 50, left: 90, right: 90 },
    children: lines.map((l) => new Paragraph({ children: [t(l, { bold: o.bold, size: o.size ?? 21 })], alignment: o.align ?? AlignmentType.LEFT, spacing: { after: 40 } })),
  });
}
export function table(widths: number[], header: string[] | null, rows: (string | string[])[][], o: { size?: number; boldLast?: boolean } = {}) {
  const trs: TableRow[] = [];
  if (header) trs.push(new TableRow({ tableHeader: true, cantSplit: true, children: header.map((hd, i) => cell(hd, { w: widths[i], bold: true, size: o.size })) }));
  rows.forEach((r, ri) => trs.push(new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, { w: widths[i], size: o.size, bold: o.boldLast && ri === rows.length - 1 })) })));
  return new Table({ width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA }, columnWidths: widths, rows: trs, borders: BLACK_BORDERS });
}
export const money = (n: number) => `USD ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** ZACC letterhead: contacts | logo | HQ address, bold line, name, motto, correspondence line. */
export function letterhead(): (Paragraph | Table)[] {
  const logo = fs.existsSync(LOGO_PATH) ? fs.readFileSync(LOGO_PATH) : null;
  const small = (lines: string[], align: any) => lines.map((l) => new Paragraph({ children: [t(l, { size: 18, bold: /:$/.test(l) })], alignment: align, spacing: { after: 20 } }));
  const left = new TableCell({ width: { size: 3500, type: WidthType.DXA }, borders: NO_BORDERS, children: small(['CONTACTS:', 'Landline HQ: HARARE 2369602/2369605/2369614', 'Reporting offices:', 'Golda: 242307065-7', 'Makombe: 2422541912-16', 'Gweru: 054224040', 'Bulawayo: 0292263910'], AlignmentType.LEFT) });
  const mid = new TableCell({ width: { size: 2200, type: WidthType.DXA }, borders: NO_BORDERS, verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: logo ? [new ImageRun({ data: logo, transformation: { width: 92, height: 86 } })] : [t('')] })] });
  const right = new TableCell({ width: { size: 3500, type: WidthType.DXA }, borders: NO_BORDERS, children: small(['HARARE HQ ADDRESS:', '872 Betterment Close', 'Mount Pleasant Business Park', 'P. Bag 7783', 'Causeway, Harare'], AlignmentType.RIGHT) });
  const head = new Table({ width: { size: 9200, type: WidthType.DXA }, columnWidths: [3500, 2200, 3500], borders: NO_BORDERS, rows: [new TableRow({ children: [left, mid, right] })] });
  const line = new Paragraph({ children: [], border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: '000000', space: 1 } }, spacing: { after: 100 } });
  const c = (text: string, o: { bold?: boolean; size?: number; italics?: boolean } = {}) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 20 }, children: [t(text, { bold: o.bold, size: o.size ?? 22, italics: o.italics })] });
  return [head, line, c('ZIMBABWE ANTI-CORRUPTION COMMISSION', { bold: true, size: 26 }), c('"REFUSE, RESIST AND REPORT CORRUPTION"', { size: 20, italics: true }), c('"ALL CORRESPONDENCE TO BE ADDRESSED TO THE SECRETARY TO THE COMMISSION"', { size: 16 }), new Paragraph({ children: [], spacing: { after: 120 } })];
}
export const centreTitle = (text: string) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 160 }, children: [t(text, { bold: true, size: 26 })] });

export function sigBlock(rows: { title: string; options?: string; name?: string; date?: string }[]): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  rows.forEach((r) => {
    if (r.options) out.push(new Paragraph({ spacing: { before: 280, after: 40 }, keepNext: true, children: [t(r.options, { bold: true })] }));
    else out.push(new Paragraph({ spacing: { before: 280, after: 40 }, keepNext: true, children: [t('')] }));
    out.push(new Paragraph({ spacing: { after: 30 }, keepNext: true, children: [t(r.title, { bold: true })] }));
    if (r.name) out.push(new Paragraph({ spacing: { after: 30 }, keepNext: true, children: [t(r.name)] }));
    out.push(new Paragraph({ spacing: { after: 60 }, children: [t(`SIGNATURE: ................................................   DATE: ${r.date || '.........................'}`)] }));
  });
  return out;
}

export function footer() {
  return new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES], font: FONT, size: 16 })] })] });
}
export function makeDoc(children: (Paragraph | Table)[], landscape = false) {
  return new Document({
    creator: 'ZACC Compliance Portal', styles: { default: { document: { run: { font: FONT, size: SZ } } } },
    sections: [{ properties: { page: { size: landscape ? { width: 16838, height: 11906, orientation: PageOrientation.LANDSCAPE } : { width: 11906, height: 16838 }, margin: { top: 900, bottom: 900, left: landscape ? 900 : 1300, right: landscape ? 900 : 1300 } } }, footers: { default: footer() }, children }],
  });
}
export { AlignmentType, Paragraph, Table };
