import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { db } from '../db';

export async function buildCertificatePdf(certId: string): Promise<Buffer> {
  const c = db.prepare(`SELECT c.*, i.name AS institution_name, u.name AS issuer FROM compliance_certificates c JOIN institutions i ON i.id = c.institution_id LEFT JOIN users u ON u.id = c.issued_by WHERE c.id = ?`).get(certId) as any;
  if (!c) throw new Error('Certificate not found');
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 50 });
  const chunks: Buffer[] = [];
  doc.on('data', (d) => chunks.push(d));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
  const W = doc.page.width, H = doc.page.height;
  doc.rect(25, 25, W - 50, H - 50).lineWidth(3).stroke('#000000');
  doc.rect(33, 33, W - 66, H - 66).lineWidth(0.8).stroke('#000000');
  const logo = path.join(__dirname, '..', '..', 'assets', 'zacc_logo.png');
  if (fs.existsSync(logo)) doc.image(logo, W / 2 - 40, 55, { width: 80 });
  doc.fillColor('#000').font('Times-Bold').fontSize(20).text('ZIMBABWE ANTI-CORRUPTION COMMISSION', 0, 150, { align: 'center' });
  doc.font('Times-Italic').fontSize(12).text('"Refuse, Resist and Report Corruption"', { align: 'center' });
  doc.moveDown(1.2).font('Times-Bold').fontSize(30).text('CERTIFICATE OF COMPLIANCE', { align: 'center' });
  doc.moveDown(0.8).font('Times-Roman').fontSize(14).text('This is to certify that', { align: 'center' });
  doc.moveDown(0.4).font('Times-Bold').fontSize(24).text(c.institution_name, { align: 'center' });
  doc.moveDown(0.5).font('Times-Roman').fontSize(13).text('has fully implemented the agreed corrective actions in its Implementation Matrix and has been rated GREEN (full compliance) on the Electronic Compliance Monitoring Dashboard of the Compliance, Systems and Processes Review Unit.', 100, doc.y, { align: 'center', width: W - 200 });
  doc.moveDown(0.8).fontSize(12).text(`Certificate No: ${c.certificate_no}        Issued: ${String(c.issued_at).slice(0, 10)}        Valid until: ${c.valid_until}`, 0, doc.y, { align: 'center' });
  doc.moveDown(2.2).fontSize(12).text('........................................................', 0, doc.y, { align: 'center' });
  doc.text('Executive Secretary / General Manager, Prevention and Corporate Governance', { align: 'center' });
  doc.fontSize(9).text('This certificate is valid for one (1) year only and is subject to continued compliance.', 0, H - 70, { align: 'center' });
  doc.end();
  return done;
}
