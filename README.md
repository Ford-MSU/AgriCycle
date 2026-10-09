The general objective of this study is to design, develop, and evaluate **AgriCycle: A Community-Based Biomass Information Management and Market Linkage System**. The study also formalizes the CB-BAIM Model as a practical guide for local biomass data flow, validation, aggregation, buyer inquiry, and planning support.

---

## Architecture & Supabase PostgreSQL Integration

- **Frontend**: React 19 + TypeScript + Vite SPA (`HashRouter` + relative asset base `./` for GitHub Pages compatibility).
- **Database & Auth**: Supabase PostgreSQL (`@supabase/supabase-js`) with Row Level Security (RLS), role-based access control (`ADMINISTRATOR`, `COORDINATOR`, `LGU`, `BUYER`), and atomic PostgreSQL RPC functions for multi-table workflows.
- **SQL Migrations (`supabase/migrations/`)**:
  1. `20261009000001_initial_schema.sql` — Enums, sequences, normalized tables (`locations`, `organizations`, `profiles`, `reference_data`, `biomass_sources`, `biomass_records`, `validation_records`, `aggregation_groups`, `aggregation_members`, `inquiries`, `inquiry_history`, `audit_logs`), foreign keys, constraints, indexes, and triggers.
  2. `20261009000002_rls_and_functions.sql` — `SECURITY DEFINER` authorization helpers, role-escalation protection, RLS policies per table/role, and transactional RPCs (`submit_validation_decision`, `create_aggregation_group_with_members`, `submit_buyer_inquiry`, `update_inquiry_status_tx`).
  3. `20261009000003_seed_reference_and_initial_data.sql` — Standardized reference data, Butuan City barangay locations with coordinates, organizations, initial records, and the `admin_assign_user_role` bootstrap function.

---

## Local Environment Configuration

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
2. Set your Supabase Project URL and Publishable/Anon Key in `.env.local`:
   ```env
   VITE_SUPABASE_URL="https://your-project-ref.supabase.co"
   VITE_SUPABASE_PUBLISHABLE_KEY="your-supabase-publishable-or-anon-key"
   ```
   *(Never place a `service_role` or `sb_secret_` key in frontend environment variables).*
3. Run locally:
   ```bash
   npm install
   npm run dev
   ```

---

## Deploying to GitHub Pages

### 1. Configure GitHub Actions Secrets / Variables
In your GitHub repository, navigate to **Settings** > **Secrets and variables** > **Actions**, and add:
- `VITE_SUPABASE_URL`: Your Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY`: Your Supabase publishable (`sb_publishable_...`) or `anon` key

### 2. Automatic Deployment with GitHub Actions (Recommended)
1. Commit and push your changes to your repository's `main` branch.
2. In your GitHub repository, navigate to **Settings** > **Pages**.
3. Under **Build and deployment** > **Source**, select **GitHub Actions**.
4. GitHub Actions (`.github/workflows/deploy.yml`) will inject the Supabase environment variables during `npm run build` and publish the `dist/` artifact.


