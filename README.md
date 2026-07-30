# ZACC Institutional Compliance Portal

<div align="center">

# Zimbabwe Anti-Corruption Commission

## Institutional Compliance Portal

### Enterprise Governance • Integrity • Risk Management • Compliance Monitoring

A comprehensive enterprise-grade Institutional Compliance Management Platform designed to support corruption prevention, institutional integrity, governance oversight, compliance monitoring, and strategic decision-making across Zimbabwean public institutions.

![Node.js](https://img.shields.io/badge/Node.js-20_LTS-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-Enterprise-black?logo=express)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite)
![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite)
![Socket.IO](https://img.shields.io/badge/Socket.IO-Realtime-010101?logo=socketdotio)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3-38BDF8?logo=tailwindcss)
![License](https://img.shields.io/badge/License-Institutional-blue)

---

**Version:** 1.0

**Prepared For:** Zimbabwe Anti-Corruption Commission (ZACC)

**Developed By:** Bloodshed Munyaradzi Chiondegwa

Enterprise Digital Governance Platform

</div>

---

# Executive Summary

The **ZACC Institutional Compliance Portal** is an enterprise digital governance platform developed to strengthen institutional integrity, improve compliance oversight, reduce corruption risks, and modernise governance processes across Zimbabwean public institutions.

The platform digitises compliance monitoring, corruption risk management, institutional assessments, systems reviews, procurement oversight, whistleblower reporting, workflow automation, executive reporting, GIS visualisation, and AI-assisted compliance analytics within a secure government-grade environment.

Unlike demonstration software, this solution provides a complete enterprise implementation with working APIs, persistent storage, authentication, workflow automation, audit logging, real-time communication, and role-based security.

The system supports Zimbabwe's national anti-corruption strategy by enabling institutions to proactively identify weaknesses, monitor implementation of recommendations, improve transparency, and strengthen accountability through data-driven governance.

---

# Vision

To provide Zimbabwe's premier digital governance platform for promoting integrity, transparency, accountability, and institutional excellence through secure, intelligent, and automated compliance management.

---

# Mission

To empower the Zimbabwe Anti-Corruption Commission and partner institutions with an integrated compliance ecosystem that improves governance, strengthens corruption prevention, supports evidence-based decision-making, and enhances institutional accountability.

---

# Core Objectives

The platform has been designed to achieve the following strategic objectives:

- Strengthen institutional integrity
- Improve governance oversight
- Digitise compliance assessments
- Enhance corruption prevention
- Improve institutional accountability
- Monitor implementation of recommendations
- Support proactive risk management
- Improve transparency
- Centralise institutional reporting
- Provide executive decision support
- Protect whistleblowers
- Automate regulatory workflows

---

# Key Capabilities

The platform delivers a complete digital governance ecosystem supporting:

- Institutional Registry
- Compliance Assessments
- Corruption Risk Registers
- Systems Reviews
- Recommendation Tracking
- Integrity Committees
- Integrity Pledges
- Procurement Monitoring
- Governance Dashboards
- Workflow Automation
- GIS Mapping
- Artificial Intelligence
- Secure Whistleblower Reporting
- Executive Reporting
- Audit Logging

---

# Enterprise Features

## Governance Management

- Institutional Registry
- Governance Assessments
- Organisational Profiling
- Governance Maturity Scoring
- Institutional Performance Monitoring
- Strategic Compliance Planning

---

## Compliance Management

- Compliance Assessments
- Compliance Frameworks
- Automated Compliance Scoring
- Compliance Heat Maps
- Assessment Scheduling
- Assessment History
- Compliance Dashboards

---

## Corruption Prevention

- Corruption Risk Registers
- Risk Identification
- Risk Classification
- Risk Heat Maps
- Residual Risk Analysis
- Mitigation Planning
- Risk Monitoring

---

## Systems Reviews

- Review Planning
- Collaborative Reviews
- Findings Management
- Recommendation Generation
- Version Control
- Approval Workflow

---

## Recommendation Management

- Recommendation Lifecycle
- Progress Tracking
- Evidence Upload
- Verification Workflow
- Automated Reminders
- Escalation Rules

---

## Integrity Management

- Integrity Committees
- Committee Membership
- Committee Meetings
- Action Plans
- Integrity Pledges
- Ethics Training
- Compliance Awareness

---

## Procurement Monitoring

The procurement monitoring engine supports detection of:

- Single Sourcing
- Supplier Concentration
- Duplicate Procurement
- Split Purchases
- Procurement Threshold Violations
- Contract Irregularities

---

## Executive Analytics

- Executive Dashboards
- Compliance Trends
- Province Summaries
- Institution Rankings
- Recommendation Ageing
- Risk Distribution
- Performance Indicators
- Interactive Reports

---

## Artificial Intelligence

Integrated AI utilities include:

- Automated Summarisation
- Duplicate Finding Detection
- Compliance Intelligence
- Recommendation Drafting
- Trend Analysis
- Natural Language Search
- Predictive Analytics

---

## Whistleblower Protection

Enterprise whistleblower protection provides:

- Anonymous Reporting
- End-to-End Encryption
- Secure Tracking Codes
- Investigation Workflow
- Secure Evidence Management
- Access Auditing

---

# Technology Stack

## Backend

| Layer | Technology |
|---------|------------|
| Runtime | Node.js 20 LTS |
| Language | TypeScript |
| Framework | Express |
| Database | SQLite |
| ORM | better-sqlite3 |
| Authentication | JWT |
| MFA | TOTP |
| Real-time | Socket.IO |

---

## Frontend

| Layer | Technology |
|---------|------------|
| Framework | React 18 |
| Language | TypeScript |
| Build Tool | Vite |
| Styling | TailwindCSS |
| Routing | React Router |
| Data Fetching | React Query |
| WebSockets | Socket.IO Client |

---

## Security

Government-grade security mechanisms include:

- JWT Authentication
- Role-Based Access Control
- bcrypt Password Hashing
- TOTP Multi-Factor Authentication
- RSA Public Key Cryptography
- AES-256-GCM Encryption
- HTTPS Ready
- Rate Limiting
- Secure Session Management
- Audit Logging

---

# High-Level Architecture

```text
                         Users
                           │
 ┌─────────────────────────┼─────────────────────────┐
 │                         │                         │
Administrators      Compliance Officers      Institutions
 │                         │                         │
 └───────────────Web Application────────────┬────────┘
                                            │
                                   Express REST API
                                            │
           ┌────────────────────────────────┼─────────────────────────────┐
           │                                │                             │
      SQLite Database                 Workflow Engine               WebSockets
           │                                │                             │
           └───────────────Business Services──────────────────────────────┘
                                            │
                             AI • GIS • Reporting • Encryption
```

---

# Enterprise Solution Architecture

```text
                           Internet
                               │
                        HTTPS / TLS
                               │
                      React + TypeScript
                               │
                       REST API Gateway
                               │
                       Express Application
                               │
 ┌───────────────┬──────────────┬──────────────┬──────────────┐
 │               │              │              │              │
Compliance    Workflow       GIS Engine     AI Engine    Reporting
 │               │              │              │              │
 └───────────────┴──────────────┴──────────────┴──────────────┘
                               │
                           SQLite Database
```

---

# Enterprise Benefits

## Operational Benefits

- Reduced administrative workload
- Faster compliance assessments
- Improved recommendation tracking
- Better institutional visibility
- Improved workflow efficiency
- Reduced paper-based processes

---

## Governance Benefits

- Improved transparency
- Better accountability
- Evidence-based governance
- Stronger institutional oversight
- Enhanced corruption prevention
- Improved compliance monitoring

---

## Strategic Benefits

- National governance insights
- Executive decision support
- Digital transformation
- Standardised compliance frameworks
- Increased institutional maturity
- Scalable government platform

---

# Getting Started

## System Requirements

The platform has minimal infrastructure requirements.

### Required Software

| Software | Version |
|-----------|----------|
| Node.js | 20+ |
| npm | Latest |
| Git | Latest |

No external database server is required for development because SQLite is bundled with the application.

---

# Installation

Clone the repository.

```bash
git clone https://github.com/<organisation>/zacc-institutional-compliance-portal.git

cd zacc-institutional-compliance-portal
```

Install project dependencies.

```bash
npm install
```

Run the project setup.

```bash
npm run setup
```

Start the application.

```bash
npm run start
```

The application will automatically:

- Initialise SQLite
- Create database schema
- Seed default configuration
- Build required assets
- Launch backend services
- Start frontend application

---

# Default Development URLs

| Service | URL |
|----------|------|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:4000 |
| Health Endpoint | http://localhost:4000/health |
| WebSocket | ws://localhost:4000 |

---
# Development Environment

The ZACC Institutional Compliance Portal supports both development and production environments. The development environment has been designed for rapid deployment with minimal configuration while preserving enterprise-grade architectural principles.

---

## Development Installation

Install all project dependencies.

```bash
npm run install:all
```

Seed the application with demonstration data.

```bash
npm run seed
```

Start both frontend and backend development servers.

```bash
npm run dev
```

The development environment automatically provides:

- SQLite database initialization
- Sample institutions
- Sample users
- Sample compliance assessments
- Risk registers
- GIS datasets
- Demo dashboards
- WebSocket server
- Authentication services

---

# Development URLs

| Component | URL |
|------------|-----|
| Client Application | http://localhost:5173 |
| Backend API | http://localhost:4000 |
| API Health | http://localhost:4000/health |
| WebSocket Server | ws://localhost:4000 |
| API Documentation | http://localhost:4000/api/docs *(optional)* |

---

# Demo Users

The seed process creates demonstration users representing various institutional roles.

Default Password

```text
ZaccDemo#2026
```

---

## Available Roles

| Role | Responsibility |
|------|----------------|
| Super Administrator | Complete platform administration |
| Prevention Director | National oversight |
| Compliance Officer | Compliance monitoring |
| Systems Reviewer | Systems reviews |
| Monitoring Officer | Monitoring implementation |
| Internal Auditor | Audit activities |
| Investigations Officer | Investigation management |
| Institutional Focal Person | Institution coordination |
| Committee Chairperson | Integrity committee management |

Every user is required to complete Multi-Factor Authentication (MFA) enrollment during their first login.

---

# Environment Configuration

The platform uses environment variables for runtime configuration.

Copy:

```text
.env.example
```

to:

```text
.env
```

---

## Application Configuration

```env
NODE_ENV=

PORT=

CLIENT_URL=

JWT_SECRET=

JWT_EXPIRES_IN=
```

---

## Database

```env
DATABASE_PATH=

DATABASE_BACKUP_PATH=
```

---

## Authentication

```env
JWT_SECRET=

JWT_REFRESH_SECRET=

JWT_EXPIRY=

JWT_REFRESH_EXPIRY=
```

---

## Multi-Factor Authentication

```env
MFA_ISSUER=

TOTP_WINDOW=
```

---

## WebSockets

```env
SOCKET_PORT=
```

---

## Email (Optional)

```env
SMTP_HOST=

SMTP_PORT=

SMTP_USER=

SMTP_PASSWORD=
```

---

## GIS

```env
MAP_DEFAULT_LATITUDE=

MAP_DEFAULT_LONGITUDE=

MAP_DEFAULT_ZOOM=
```

---

# Project Structure

```text
zacc-institutional-compliance-portal/

├── client/
│
├── server/
│
├── docs/
│
├── scripts/
│
├── uploads/
│
├── package.json
│
├── README.md
│
└── .env.example
```

---

# Detailed Directory Structure

```text
server
│
├── src
│
├── api
│
├── auth
│
├── compliance
│
├── committees
│
├── dashboard
│
├── encryption
│
├── gis
│
├── institutions
│
├── investigations
│
├── middleware
│
├── notifications
│
├── procurement
│
├── recommendations
│
├── reporting
│
├── reviews
│
├── risks
│
├── users
│
├── websocket
│
└── workflow
```

---

# Authentication & Identity Management

The platform implements enterprise authentication suitable for government environments.

Authentication follows modern security principles, ensuring that only verified users gain access to institutional data.

---

## Authentication Features

- Secure Login
- JWT Authentication
- Refresh Tokens
- Password Encryption
- Multi-Factor Authentication
- Session Validation
- Secure Logout
- Password Reset
- Account Lockout
- Login Auditing

---

## Authentication Flow

```text
User Login
      │
Username & Password
      │
Credential Validation
      │
JWT Generation
      │
MFA Verification
      │
Role Validation
      │
Secure Session
      │
Access Granted
```

---

# Multi-Factor Authentication

Every privileged account supports Time-Based One-Time Password (TOTP) authentication.

Supported authenticator applications include:

- Microsoft Authenticator
- Google Authenticator
- Authy
- FreeOTP

MFA enrolment is mandatory during first login for privileged users.

---

# Role-Based Access Control (RBAC)

Authorization is implemented using Role-Based Access Control.

Each user receives permissions based upon organisational responsibilities.

---

## Supported Roles

| Role | Access Level |
|--------|-------------|
| Super Administrator | Full platform control |
| Prevention Director | National dashboards |
| Compliance Officer | Compliance operations |
| Systems Reviewer | Systems reviews |
| Monitoring Officer | Monitoring activities |
| Auditor | Read-only audit access |
| Investigations Officer | Whistleblower investigations |
| Institution User | Institution-specific access |

---

## Permission Categories

The permission engine controls access to:

- Institutions
- Compliance Assessments
- Recommendations
- Systems Reviews
- Risk Registers
- Integrity Committees
- GIS
- Reports
- Dashboards
- Users
- Administration

Permissions are centrally managed and evaluated on every secured API request.

---

# Institutional Registry Module

The Institutional Registry serves as the foundation of the entire platform.

Every compliance assessment, recommendation, systems review, and corruption risk assessment is linked to a registered institution.

---

## Core Features

- Institution Registration
- Institution Classification
- Province Assignment
- Sector Assignment
- Contact Management
- Institutional Profile
- Status Tracking
- Risk Categorisation
- Audit History

---

## Institution Profile

Each institution maintains:

- Official Name
- Ministry
- Province
- District
- Physical Address
- Contact Persons
- Geographic Coordinates
- Risk Classification
- Compliance Status
- Historical Assessments

---

## Institution Lifecycle

```text
Institution Registration
           │
Profile Validation
           │
Compliance Assessment
           │
Recommendation Tracking
           │
Monitoring
           │
Performance Reporting
```

---

# Compliance Assessment Engine

The Compliance Assessment Engine evaluates institutional governance using weighted assessment frameworks.

The engine automatically calculates institutional compliance scores while preserving transparency and repeatability.

---

## Assessment Framework

The default assessment framework evaluates five governance domains.

| Assessment Area | Weight |
|-----------------|-------:|
| Governance | 20% |
| Internal Controls | 25% |
| Procurement | 20% |
| Financial Management | 20% |
| Integrity | 15% |

Additional frameworks may be configured for sector-specific assessments.

---

## Assessment Workflow

```text
Assessment Scheduled
          │
Evidence Collection
          │
Compliance Evaluation
          │
Weighted Scoring
          │
Recommendation Generation
          │
Management Review
          │
Approval
          │
Publication
```

---

## Compliance Scoring

Scores are automatically converted into performance categories.

| Score | Rating |
|--------|---------|
| 90–100 | Excellent |
| 75–89 | Good |
| 60–74 | Satisfactory |
| 40–59 | Needs Improvement |
| Below 40 | Critical |

These thresholds can be customised by administrators.

---

# Workflow Engine

The Workflow Engine orchestrates every major business process across the platform.

It provides configurable workflows that support governance, approvals, escalations, and monitoring.

---

## Workflow Features

- Task Assignment
- Approval Chains
- SLA Tracking
- Escalation Rules
- Notifications
- Deadline Monitoring
- Workflow History
- Activity Logging

---

## Workflow Lifecycle

```text
Task Created
      │
Assignment
      │
Review
      │
Approval
      │
Implementation
      │
Verification
      │
Completed
```

---

## Service Level Agreements (SLA)

Every workflow can define:

- Target Completion Date
- Escalation Thresholds
- Reminder Intervals
- Responsible Officers
- Approval Authorities

The platform automatically notifies responsible users when deadlines approach or are exceeded.

---
# Systems Review Module

The Systems Review Module enables the Zimbabwe Anti-Corruption Commission to conduct structured institutional systems reviews that identify governance weaknesses, process inefficiencies, corruption vulnerabilities, and control deficiencies.

Unlike traditional audits, systems reviews evaluate the adequacy of governance processes, policies, procedures, and internal controls to determine whether institutional systems effectively prevent corruption and promote accountability.

---

## Core Features

- Annual Review Planning
- Review Registration
- Team Assignment
- Terms of Reference
- Working Papers
- Evidence Collection
- Observation Recording
- Finding Classification
- Recommendation Generation
- Review Approval
- Report Publication

---

## Systems Review Lifecycle

```text
Review Planning
        │
Institution Selection
        │
Review Team Assignment
        │
Field Work
        │
Evidence Collection
        │
Analysis
        │
Findings
        │
Recommendations
        │
Management Response
        │
Approval
        │
Final Report
```

---

## Review Categories

The platform supports multiple review types including:

- Governance Reviews
- Procurement Reviews
- Financial Systems Reviews
- Human Resources Reviews
- ICT Governance Reviews
- Asset Management Reviews
- Revenue Management Reviews
- Risk Management Reviews
- Compliance Reviews
- Ethics Reviews

---

## Evidence Management

Each review supports secure evidence management including:

- Document Uploads
- Photographs
- Video Evidence
- Audio Recordings
- Meeting Minutes
- Signed Statements
- Supporting Reports
- Working Papers

Evidence is version-controlled and linked directly to review findings.

---

# Findings Management

Findings identified during systems reviews are centrally managed to ensure traceability and accountability.

---

## Finding Attributes

Each finding records:

- Finding Reference Number
- Title
- Detailed Description
- Root Cause
- Risk Level
- Impact Assessment
- Evidence References
- Responsible Institution
- Review Reference
- Status
- Date Raised
- Reviewer

---

## Risk Classification

Findings are categorised by severity.

| Rating | Description |
|----------|-------------|
| Critical | Immediate intervention required |
| High | Significant governance risk |
| Medium | Moderate control weakness |
| Low | Minor improvement opportunity |
| Advisory | Good practice recommendation |

---

# Recommendation Management

Recommendations are automatically generated from findings and monitored until full implementation.

The recommendation engine provides complete lifecycle management with verification and closure processes.

---

## Recommendation Features

- Recommendation Register
- Action Plans
- Responsible Officers
- Due Dates
- Progress Updates
- Evidence Submission
- Verification Workflow
- Closure Approval
- Reminder Notifications
- Escalation Management

---

## Recommendation Lifecycle

```text
Finding Created
       │
Recommendation Generated
       │
Institution Accepts
       │
Action Plan
       │
Implementation
       │
Evidence Submitted
       │
Verification
       │
Closure
```

---

## Recommendation Statuses

- Draft
- Submitted
- Accepted
- In Progress
- Awaiting Verification
- Verified
- Closed
- Overdue

---

## Performance Indicators

The recommendation dashboard provides:

- Total Recommendations
- Completed Recommendations
- Overdue Recommendations
- Average Closure Time
- Institution Performance
- Provincial Performance
- National Trends

---

# Integrity Committee Management

Integrity Committees play a central role in institutional governance.

The platform enables ZACC to monitor committee establishment, membership, activities, and performance across all participating institutions.

---

## Features

- Committee Registration
- Membership Management
- Meeting Scheduling
- Attendance Tracking
- Action Plans
- Meeting Minutes
- Resolution Tracking
- Annual Work Plans
- Committee Performance

---

## Committee Workflow

```text
Committee Created
        │
Members Appointed
        │
Meeting Scheduled
        │
Agenda Prepared
        │
Meeting Conducted
        │
Minutes Approved
        │
Actions Assigned
        │
Progress Monitored
```

---

## Committee Roles

Supported committee positions include:

- Chairperson
- Vice Chairperson
- Secretary
- Member
- Observer
- ZACC Liaison Officer

---

# Integrity Pledge Management

The platform supports electronic integrity pledges signed by institutional employees.

---

## Features

- Digital Pledge Creation
- Employee Acceptance
- Electronic Signature Support
- Renewal Tracking
- Historical Archive
- Compliance Monitoring

---

# Corruption Risk Register

The Corruption Risk Register provides a structured framework for identifying, analysing, evaluating, and mitigating corruption risks.

---

## Core Features

- Risk Identification
- Risk Assessment
- Risk Owners
- Control Evaluation
- Residual Risk
- Mitigation Planning
- Monitoring
- Reporting

---

## Risk Workflow

```text
Risk Identified
       │
Risk Assessment
       │
Control Evaluation
       │
Residual Risk
       │
Mitigation Plan
       │
Implementation
       │
Monitoring
       │
Review
```

---

## Risk Matrix

Risks are evaluated using a likelihood versus impact matrix.

| Likelihood | Impact | Rating |
|-------------|---------|--------|
| Low | Low | Low |
| Medium | Medium | Moderate |
| High | Medium | High |
| High | High | Critical |

---

## Risk Categories

Supported categories include:

- Procurement
- Human Resources
- Financial Management
- Asset Management
- Revenue Collection
- Information Technology
- Governance
- Ethics
- Strategic Risk
- Operational Risk

---

# Procurement Monitoring Module

Procurement activities represent one of the highest corruption risk areas within public institutions.

The Procurement Monitoring Module provides advanced analytics and compliance monitoring to detect procurement anomalies and support preventative oversight.

---

## Capabilities

- Procurement Register
- Supplier Register
- Contract Register
- Tender Tracking
- Threshold Monitoring
- Vendor Analysis
- Procurement Dashboards
- Exception Reporting

---

## Automated Detection Rules

The platform identifies potential procurement irregularities including:

- Split Procurement
- Repeat Supplier Awards
- Single Source Procurement
- Excessive Variations
- Contract Extensions
- Duplicate Suppliers
- Threshold Breaches
- Irregular Evaluation Patterns

---

## Procurement Analytics

Dashboards include:

- Procurement Volume
- Contract Values
- Supplier Distribution
- Average Procurement Cycle
- High-Risk Procurements
- Provincial Comparisons
- Institution Rankings

---

# Geographic Information System (GIS)

The GIS module provides spatial intelligence for institutional monitoring and national governance analysis.

Interactive maps allow users to visualise compliance performance, corruption risks, institutional distribution, and implementation progress across Zimbabwe.

---

## GIS Features

- Interactive National Map
- Province Dashboard
- District Mapping
- Institution Locations
- Compliance Heat Maps
- Risk Heat Maps
- Recommendation Density
- Infrastructure Mapping

---

## GIS Layers

Supported map layers include:

- Provinces
- Districts
- Institutions
- Compliance Scores
- Corruption Risk Levels
- Active Reviews
- Recommendations
- Investigations

---

## Spatial Analytics

The GIS engine enables users to:

- Compare provinces
- Analyse regional trends
- Identify high-risk clusters
- Monitor institutional coverage
- Evaluate implementation progress geographically

---

# Executive Dashboards

The Executive Dashboard provides real-time governance intelligence for senior leadership.

Dashboards aggregate operational data into meaningful indicators that support strategic decision-making.

---

## Executive KPIs

- Institutions Registered
- Compliance Assessments Completed
- National Compliance Index
- High-Risk Institutions
- Open Recommendations
- Overdue Recommendations
- Active Systems Reviews
- Procurement Exceptions
- Integrity Committee Coverage
- Provincial Performance Rankings

---

## Dashboard Widgets

The executive dashboard includes:

- KPI Cards
- Trend Charts
- Province Comparison
- Heat Maps
- Risk Indicators
- Compliance Distribution
- Interactive Tables
- GIS Visualisations

---

# Artificial Intelligence & Analytics

Artificial Intelligence enhances decision-making by assisting compliance officers with data analysis, report drafting, anomaly detection, and predictive governance insights.

---

## AI Capabilities

- Recommendation Drafting
- Executive Summaries
- Duplicate Finding Detection
- Risk Prioritisation
- Natural Language Search
- Trend Detection
- Predictive Compliance Analysis
- Intelligent Report Generation

---

## AI Workflow

```text
Institutional Data
        │
Data Processing
        │
AI Analysis
        │
Risk Detection
        │
Recommendation Generation
        │
Officer Review
        │
Final Decision
```

---

## Predictive Analytics

The analytics engine provides forecasts for:

- Compliance Trends
- Recommendation Completion Rates
- Institutional Risk Levels
- Governance Performance
- Procurement Risk
- Review Backlogs

The predictive models assist management in allocating resources, prioritising interventions, and proactively addressing emerging governance risks.

---
# Secure Whistleblower Management

The Whistleblower Management Module provides a secure and confidential mechanism for receiving, managing, and investigating reports of suspected corruption, fraud, abuse of office, maladministration, and other integrity-related concerns.

The module has been designed around internationally recognised whistleblower protection principles to maximise confidentiality, accountability, and evidence integrity.

---

## Core Features

- Anonymous Reporting
- Named Reporting
- Secure Case Tracking
- Encrypted Evidence Storage
- Investigation Assignment
- Case Workflow Management
- Protected Communications
- Follow-up Messaging
- Audit Trail
- Case Closure

---

## Reporting Channels

Whistleblower reports may be submitted through:

- Web Portal
- Secure Mobile Device
- Internal Compliance Portal
- Email Integration (Optional)
- API Integration
- Manual Registration by Authorised Officers

---

## Whistleblower Workflow

```text
Report Submitted
        │
Reference Generated
        │
Initial Screening
        │
Risk Classification
        │
Case Assignment
        │
Evidence Collection
        │
Investigation
        │
Recommendations
        │
Management Action
        │
Case Closure
```

---

## Confidentiality Controls

The platform protects whistleblower identities through:

- Anonymous Submission
- Encrypted Storage
- Secure Case References
- Restricted Investigator Access
- Identity Separation
- Audit Monitoring
- Secure Attachments
- Tamper Detection

---

# Investigation Management

The Investigation Module supports structured case management for allegations arising from whistleblower reports, systems reviews, compliance assessments, or management referrals.

---

## Features

- Investigation Registration
- Investigator Assignment
- Evidence Collection
- Interview Scheduling
- Timeline Management
- Findings Recording
- Recommendation Management
- Investigation Reports
- Case Closure

---

## Investigation Lifecycle

```text
Case Created
      │
Assessment
      │
Investigator Assigned
      │
Evidence Collection
      │
Analysis
      │
Findings
      │
Recommendations
      │
Management Action
      │
Closed
```

---

# Notification & Communication Engine

The Notification Engine delivers automated communications throughout the platform.

---

## Supported Channels

- Email
- SMS
- In-App Notifications
- WebSocket Push Notifications

---

## Automated Notifications

Notifications are generated for:

- Assessment Assignments
- Review Approvals
- Recommendation Due Dates
- Overdue Actions
- Risk Escalations
- Investigation Assignments
- Integrity Committee Meetings
- Password Changes
- Login Alerts
- System Announcements

---

# Reporting & Business Intelligence

The Reporting Engine consolidates operational, strategic, and executive information into interactive dashboards and exportable reports.

---

## Operational Reports

- Institution Register
- Compliance Assessments
- Systems Reviews
- Risk Registers
- Recommendation Status
- Committee Activities
- Investigation Register
- Procurement Monitoring

---

## Executive Reports

- National Compliance Index
- Provincial Performance
- High-Risk Institutions
- Governance Maturity
- Recommendation Ageing
- Risk Heat Maps
- Integrity Committee Coverage
- Procurement Analytics

---

## Export Formats

Reports may be exported as:

- PDF
- Microsoft Excel
- CSV
- JSON

---

# REST API

The platform exposes a versioned RESTful API for secure integration with authorised systems.

---

## Base URL

Development

```text
http://localhost:4000/api/v1
```

Production

```text
https://compliance.zacc.org.zw/api/v1
```

---

## Authentication Endpoints

| Method | Endpoint | Description |
|---------|----------|-------------|
| POST | `/auth/login` | User authentication |
| POST | `/auth/logout` | End current session |
| POST | `/auth/refresh` | Refresh JWT token |
| POST | `/auth/reset-password` | Reset password |
| POST | `/auth/mfa/verify` | Verify MFA |

---

## Institution Endpoints

| Method | Endpoint |
|---------|----------|
| GET | `/institutions` |
| POST | `/institutions` |
| PUT | `/institutions/{id}` |
| DELETE | `/institutions/{id}` |

---

## Compliance Endpoints

| Method | Endpoint |
|---------|----------|
| GET | `/compliance/assessments` |
| POST | `/compliance/assessments` |
| PUT | `/compliance/assessments/{id}` |
| GET | `/compliance/dashboard` |

---

## Recommendation Endpoints

| Method | Endpoint |
|---------|----------|
| GET | `/recommendations` |
| POST | `/recommendations` |
| PUT | `/recommendations/{id}` |
| POST | `/recommendations/{id}/verify` |

---

## Risk Register Endpoints

| Method | Endpoint |
|---------|----------|
| GET | `/risks` |
| POST | `/risks` |
| PUT | `/risks/{id}` |
| GET | `/risks/dashboard` |

---

## GIS Endpoints

| Method | Endpoint |
|---------|----------|
| GET | `/gis/provinces` |
| GET | `/gis/institutions` |
| GET | `/gis/heatmap` |
| GET | `/gis/dashboard` |

---

# Security Architecture

Security has been implemented using a defence-in-depth approach suitable for government environments.

---

## Identity & Access Security

- JWT Authentication
- Refresh Tokens
- Multi-Factor Authentication (TOTP)
- Password Hashing (bcrypt)
- Role-Based Access Control (RBAC)
- Fine-Grained Permissions
- Session Timeout
- Account Lockout

---

## Data Protection

Sensitive information is protected using:

- AES-256-GCM Encryption
- RSA Public Key Cryptography
- Secure Password Hashing
- Signed JWT Tokens
- Encrypted File Storage
- Secure Key Management

---

## Application Security

The application includes:

- HTTPS Enforcement
- Content Security Policy (CSP)
- Helmet Security Headers
- CORS Protection
- CSRF Mitigation
- Input Validation
- Output Encoding
- SQL Injection Prevention
- XSS Protection
- Rate Limiting

---

## Audit Logging

Every critical event is permanently recorded.

Examples include:

- Login Attempts
- MFA Events
- User Administration
- Assessment Updates
- Recommendation Changes
- Investigation Activities
- Report Generation
- Permission Changes
- System Configuration
- API Access

Audit records are immutable and available for forensic review.

---

# Deployment

The platform supports multiple deployment models.

---

## Development

- Node.js
- SQLite
- Vite Development Server

---

## Staging

- Linux Server
- Nginx Reverse Proxy
- HTTPS
- SQLite or PostgreSQL
- PM2 Process Manager

---

## Production

Recommended production stack:

- Ubuntu Server LTS
- Nginx
- Node.js LTS
- PostgreSQL
- Redis (optional)
- Docker
- Docker Compose
- TLS Certificates
- Automated Backups

---

# Docker Deployment

Build the application:

```bash
docker compose build
```

Start all services:

```bash
docker compose up -d
```

Stop services:

```bash
docker compose down
```

View logs:

```bash
docker compose logs -f
```

---

# Continuous Integration & Continuous Deployment (CI/CD)

A recommended CI/CD pipeline includes:

1. Source Checkout
2. Dependency Installation
3. Static Code Analysis
4. Type Checking
5. Unit Testing
6. Integration Testing
7. Build Validation
8. Security Scanning
9. Packaging
10. Deployment Approval
11. Production Deployment

The project is compatible with:

- GitHub Actions
- GitLab CI/CD
- Azure DevOps
- Jenkins

---

# Monitoring & Observability

Recommended production monitoring stack:

- Prometheus
- Grafana
- Loki
- Node Exporter
- Application Health Checks

Key monitored metrics include:

- API Availability
- Response Times
- Authentication Failures
- Workflow Throughput
- Database Performance
- Memory Usage
- CPU Utilisation
- WebSocket Connections
- Error Rates

---

# Backup & Disaster Recovery

## Database Protection

- Daily Full Backups
- Hourly Incremental Backups
- Point-in-Time Recovery (PITR)
- Automated Verification

## Document Protection

- Encrypted Storage
- Version History
- Scheduled Replication
- Integrity Verification

Recovery procedures should be tested regularly to ensure compliance with organisational Recovery Time Objectives (RTO) and Recovery Point Objectives (RPO).

---

# Testing Strategy

The platform supports a comprehensive testing approach.

## Test Types

- Unit Tests
- Integration Tests
- End-to-End Tests
- API Tests
- Security Tests
- Performance Tests
- Accessibility Tests
- User Acceptance Testing (UAT)

Useful commands:

```bash
npm test
npm run test:watch
npm run test:coverage
npm run lint
npm run build
```

---

# Troubleshooting

| Issue | Recommended Resolution |
|--------|------------------------|
| Application fails to start | Verify environment variables and Node.js version |
| Authentication errors | Confirm JWT configuration and system time |
| Database unavailable | Verify database path and permissions |
| WebSocket disconnected | Check backend service and firewall configuration |
| GIS map not loading | Validate GIS configuration and network connectivity |

---

# Performance Optimisation

The application has been designed with scalability in mind.

Optimisation features include:

- Lazy Loading
- API Pagination
- Indexed Database Queries
- Asset Compression
- Browser Caching
- Code Splitting
- Background Processing
- WebSocket Event Optimisation

---

# Accessibility

The portal is designed to align with accessibility best practices.

Key features include:

- Keyboard Navigation
- High Contrast Support
- Responsive Layout
- Accessible Form Validation
- Semantic HTML
- Screen Reader Compatibility
- WCAG-Oriented Interface Design

---

# Roadmap

Planned enhancements include:

- Native Mobile Applications
- Advanced AI Risk Prediction
- OCR Document Processing
- Digital Signatures
- Electronic Evidence Chain of Custody
- National Single Sign-On (SSO)
- Open Government API Integrations
- Business Intelligence Data Warehouse
- Multi-Language Support
- Advanced GIS Analytics

---

# Contributing

Development contributions should follow the project's coding standards.

Guidelines include:

- Use TypeScript best practices.
- Follow established linting and formatting rules.
- Write tests for new functionality.
- Update documentation alongside code changes.
- Submit changes through pull requests with peer review.

---

# License

**Proprietary Government Software**

This software is proprietary and confidential.

It has been developed for the Zimbabwe Anti-Corruption Commission (ZACC). Unauthorised copying, modification, redistribution, reverse engineering, or commercial use without written permission is prohibited.

---

# Support

**Developer**

**Bloodshed Munyaradzi Chiondegwa**

Software Developer | Financial Consultant | Business Systems Architect

Harare, Zimbabwe

For implementation support, deployment assistance, and maintenance enquiries, contact the development team through the project's designated support channels.

---

# Acknowledgements

This platform was developed to support the Zimbabwe Anti-Corruption Commission's mission of preventing corruption, strengthening institutional integrity, enhancing transparency, and promoting accountable public administration through secure, modern, and data-driven digital governance.

---

<div align="center">

# Zimbabwe Anti-Corruption Commission

## Institutional Compliance Portal

**Enterprise Digital Governance Platform**

Version 1.0

Developed by **Bloodshed Munyaradzi Chiondegwa**

Prepared for the **Zimbabwe Anti-Corruption Commission (ZACC)**

© 2026 All Rights Reserved.

</div>