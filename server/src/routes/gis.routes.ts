import { Router } from 'express';
import { db } from '../db';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { clusterByProximity, GeoPoint } from '../utils/gis';

const router = Router();

// GET /api/v1/gis/provinces — aggregate RAG/risk colouring per province (public: powers the public dashboard map)
router.get(
  '/provinces',
  asyncHandler(async (_req, res) => {
    const institutions = db.prepare(`SELECT id, province, risk_level FROM institutions`).all() as { id: string; province: string; risk_level: string }[];
    const latestScores = db.prepare(`
      SELECT a.institution_id, a.composite_score, a.rag_status FROM assessments a
      INNER JOIN (SELECT institution_id, MAX(COALESCE(closed_at, created_at)) as maxDate FROM assessments WHERE status = 'Closed' GROUP BY institution_id) latest
      ON latest.institution_id = a.institution_id AND COALESCE(a.closed_at, a.created_at) = latest.maxDate
    `).all() as { institution_id: string; composite_score: number; rag_status: string }[];

    const scoreMap = new Map(latestScores.map((s) => [s.institution_id, s]));
    const byProvince: Record<string, { count: number; totalScore: number; scored: number; high: number; medium: number; low: number }> = {};

    institutions.forEach((inst) => {
      byProvince[inst.province] = byProvince[inst.province] || { count: 0, totalScore: 0, scored: 0, high: 0, medium: 0, low: 0 };
      const p = byProvince[inst.province];
      p.count++;
      if (inst.risk_level === 'High') p.high++;
      else if (inst.risk_level === 'Medium') p.medium++;
      else p.low++;
      const score = scoreMap.get(inst.id);
      if (score) {
        p.totalScore += score.composite_score;
        p.scored++;
      }
    });

    const result = Object.entries(byProvince).map(([province, p]) => {
      const avgScore = p.scored > 0 ? Math.round((p.totalScore / p.scored) * 10) / 10 : null;
      const rag = avgScore === null ? null : avgScore >= 75 ? 'Green' : avgScore >= 50 ? 'Amber' : 'Red';
      return { province, institutionCount: p.count, highRiskCount: p.high, mediumRiskCount: p.medium, lowRiskCount: p.low, avgComplianceScore: avgScore, ragStatus: rag };
    });
    res.json(result);
  })
);

// GET /api/v1/gis/institutions — geo-tagged institution list for map markers
router.get(
  '/institutions',
  asyncHandler(async (req, res) => {
    const { province } = req.query as Record<string, string>;
    let sql = `SELECT id, name, type, sector, province, district, latitude, longitude, risk_level FROM institutions WHERE latitude IS NOT NULL`;
    const params: any[] = [];
    if (province) {
      sql += ` AND province = ?`;
      params.push(province);
    }
    res.json(db.prepare(sql).all(...params));
  })
);

// GET /api/v1/gis/clusters — GIS-04 proximity clustering + suggested visit route
router.get(
  '/clusters',
  authenticate,
  asyncHandler(async (req, res) => {
    const k = Math.max(1, parseInt((req.query.k as string) || '4', 10));
    const institutions = db.prepare(`SELECT id, name, latitude, longitude FROM institutions WHERE latitude IS NOT NULL`).all() as any[];
    const points: GeoPoint[] = institutions.map((i) => ({ id: i.id, name: i.name, lat: i.latitude, lng: i.longitude }));
    const clusters = clusterByProximity(points, k);
    res.json(clusters);
  })
);

// GET /api/v1/gis/heatmap — risk density per province (open Medium+ risks per province)
router.get(
  '/heatmap',
  asyncHandler(async (_req, res) => {
    const rows = db.prepare(`
      SELECT i.province, COUNT(*) as riskCount FROM corruption_risks r
      JOIN institutions i ON i.id = r.institution_id
      WHERE r.inherent_score >= 6 AND r.treatment_status = 'Open'
      GROUP BY i.province
    `).all();
    res.json(rows);
  })
);

export default router;
