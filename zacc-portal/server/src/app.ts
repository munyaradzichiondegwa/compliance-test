import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import path from 'path';
import fs from 'fs';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

import authRoutes from './routes/auth.routes';
import usersRoutes from './routes/users.routes';
import institutionsRoutes from './routes/institutions.routes';
import assessmentsRoutes from './routes/assessments.routes';
import systemsReviewsRoutes from './routes/systemsReviews.routes';
import recommendationsRoutes from './routes/recommendations.routes';
import committeesRoutes from './routes/committees.routes';
import pledgesRoutes from './routes/pledges.routes';
import whistleblowerRoutes from './routes/whistleblower.routes';
import riskRegisterRoutes from './routes/riskRegister.routes';
import procurementRoutes from './routes/procurement.routes';
import notificationsRoutes from './routes/notifications.routes';
import workflowConfigRoutes from './routes/workflowConfig.routes';
import gisRoutes from './routes/gis.routes';
import dashboardRoutes from './routes/dashboard.routes';
import auditRoutes from './routes/audit.routes';
import reportsRoutes from './routes/reports.routes';
import aiRoutes from './routes/ai.routes';
import mockExternalRoutes from './routes/mockExternal.routes';
import adminRoutes from './routes/admin.routes';

export function createApp() {
  const app = express();

  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
  // CORS_ORIGIN should be set to the real deployed frontend origin in
  // production (comma-separated for multiple). Defaults to reflecting the
  // request origin, which is fine for local/demo use on a single host but
  // should be locked down before exposing this to the public internet.
  const corsOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()) : true;
  app.use(cors({ origin: corsOrigins, credentials: true }));
  app.use(compression());
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Lightweight request log — useful during a live demo walkthrough.
  app.use((req, _res, next) => {
    // eslint-disable-next-line no-console
    console.log(`${new Date().toISOString().slice(11, 19)}  ${req.method.padEnd(6)} ${req.path}`);
    next();
  });

  app.get('/health', (_req, res) => res.json({ ok: true, service: 'ZACC Compliance Portal API', time: new Date().toISOString() }));

  const v1 = express.Router();
  v1.use('/auth', authRoutes);
  v1.use('/users', usersRoutes);
  v1.use('/institutions', institutionsRoutes);
  v1.use('/assessments', assessmentsRoutes);
  v1.use('/systems-reviews', systemsReviewsRoutes);
  v1.use('/recommendations', recommendationsRoutes);
  v1.use('/committees', committeesRoutes);
  v1.use('/pledges', pledgesRoutes);
  v1.use('/whistleblower', whistleblowerRoutes);
  v1.use('/risk-register', riskRegisterRoutes);
  v1.use('/procurement', procurementRoutes);
  v1.use('/notifications', notificationsRoutes);
  v1.use('/workflow-configs', workflowConfigRoutes);
  v1.use('/gis', gisRoutes);
  v1.use('/dashboard', dashboardRoutes);
  v1.use('/audit-logs', auditRoutes);
  v1.use('/reports', reportsRoutes);
  v1.use('/ai', aiRoutes);
  v1.use('/mock-external', mockExternalRoutes);
  v1.use('/admin', adminRoutes);

  app.use('/api/v1', v1);

  // Serve the built frontend (client/dist) so the whole portal runs as a
  // single deployable service — `npm run build` in both server/ and client/,
  // then `npm start` in server/, and everything is on one port. In dev mode
  // (`npm run dev` in client/), Vite serves the frontend separately on 5173
  // and proxies /api + /socket.io here instead — see client/vite.config.ts.
  const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
