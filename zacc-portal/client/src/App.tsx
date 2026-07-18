import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import ProtectedRoute from './routes/ProtectedRoute';
import AppLayout from './components/layout/AppLayout';
import ErrorBoundary from './components/common/ErrorBoundary';
import RoleGate from './routes/RoleGate';

import Landing from './pages/public/Landing';
import PublicDashboard from './pages/public/PublicDashboard';
import WhistleblowerReport from './pages/public/WhistleblowerReport';
import WhistleblowerTrack from './pages/public/WhistleblowerTrack';
import Login from './pages/auth/Login';

import Dashboard from './pages/shared/Dashboard';
import Institutions from './pages/shared/Institutions';
import InstitutionDetail from './pages/shared/InstitutionDetail';
import RiskRegister from './pages/shared/RiskRegister';
import GisMap from './pages/shared/GisMap';
import SearchPage from './pages/shared/Search';
import SettingsPage from './pages/shared/Settings';
import Reports from './pages/shared/Reports';
import Procurement from './pages/shared/Procurement';

import Assessments from './pages/officer/Assessments';
import AssessmentDetail from './pages/officer/AssessmentDetail';

import SystemsReviews from './pages/reviewer/SystemsReviews';
import SystemsReviewDetail from './pages/reviewer/SystemsReviewDetail';

import Recommendations from './pages/monitoring/Recommendations';
import RecommendationDetail from './pages/monitoring/RecommendationDetail';

import Committees from './pages/committee/Committees';
import CommitteeDetail from './pages/committee/CommitteeDetail';
import Pledges from './pages/institution/Pledges';

import WhistleblowerCases from './pages/investigations/WhistleblowerCases';
import WhistleblowerCaseDetail from './pages/investigations/WhistleblowerCaseDetail';

import Users from './pages/admin/Users';
import WorkflowConfig from './pages/admin/WorkflowConfig';
import NotificationAdmin from './pages/admin/NotificationAdmin';
import AuditLog from './pages/admin/AuditLog';

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <NotificationProvider>
            <Routes>
            {/* Public */}
            <Route path="/" element={<Landing />} />
            <Route path="/public-dashboard" element={<PublicDashboard />} />
            <Route path="/whistleblower/report" element={<WhistleblowerReport />} />
            <Route path="/whistleblower/track" element={<WhistleblowerTrack />} />
            <Route path="/login" element={<Login />} />

            {/* Authenticated app shell */}
            <Route
              path="/app"
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="institutions" element={<Institutions />} />
              <Route path="institutions/:id" element={<InstitutionDetail />} />
              <Route path="risk-register" element={<RiskRegister />} />
              <Route path="gis" element={<GisMap />} />
              <Route path="search" element={<SearchPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="reports" element={<Reports />} />
              <Route path="procurement" element={<Procurement />} />

              <Route path="assessments" element={<Assessments />} />
              <Route path="assessments/:id" element={<AssessmentDetail />} />

              <Route path="systems-reviews" element={<SystemsReviews />} />
              <Route path="systems-reviews/:id" element={<SystemsReviewDetail />} />

              <Route path="recommendations" element={<Recommendations />} />
              <Route path="recommendations/:id" element={<RecommendationDetail />} />

              <Route path="committees" element={<Committees />} />
              <Route path="committees/:id" element={<CommitteeDetail />} />
              <Route path="pledges" element={<Pledges />} />

              <Route path="users" element={<RoleGate roles={['SUPER_ADMIN']}><Users /></RoleGate>} />
              <Route path="workflow-config" element={<RoleGate roles={['SUPER_ADMIN']}><WorkflowConfig /></RoleGate>} />
              <Route path="notification-admin" element={<RoleGate roles={['SUPER_ADMIN']}><NotificationAdmin /></RoleGate>} />
              <Route path="audit-log" element={<RoleGate roles={['SUPER_ADMIN', 'AUDITOR', 'PREVENTION_HEAD']}><AuditLog /></RoleGate>} />
              <Route path="whistleblower-cases" element={<RoleGate roles={['SUPER_ADMIN', 'INVESTIGATIONS_OFFICER', 'PREVENTION_HEAD']}><WhistleblowerCases /></RoleGate>} />
              <Route path="whistleblower-cases/:id" element={<RoleGate roles={['SUPER_ADMIN', 'INVESTIGATIONS_OFFICER', 'PREVENTION_HEAD']}><WhistleblowerCaseDetail /></RoleGate>} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </NotificationProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
