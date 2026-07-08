# 裔甯專案紀錄工具

Next.js + Supabase + Vercel project generated from `ARCHITECTURE.md`.

## Stack

- Next.js App Router
- Supabase Postgres
- Vercel deployment
- Admin write operations protected by `ADMIN_PASSCODE`
- No full member login in phase 1

## Setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in Supabase SQL Editor.
3. Copy `.env.example` to `.env.local`.
4. Fill:

```txt
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_PASSCODE=
```

5. Install and run:

```bash
npm install
npm run dev
```

## Student Routes

```txt
/s/[share_token]
/s/[share_token]/catalog
/s/[share_token]/sessions
/s/[share_token]/records
/s/[share_token]/plan
```

Default seed token:

```txt
/s/yi-ning
```

## Admin Routes

```txt
/admin/[share_token]
/admin/[share_token]/records
/admin/[share_token]/sessions
/admin/[share_token]/payments
```

Admin forms require `ADMIN_PASSCODE`.

## API Routes

```txt
GET   /api/student/[share_token]/summary
POST  /api/admin/[share_token]/redemption-records
POST  /api/admin/[share_token]/class-sessions
POST  /api/admin/[share_token]/payment-records
PATCH /api/admin/[share_token]/payment-records/[payment_record_id]
```

## Verification

```bash
npm run typecheck
npm run build
```
