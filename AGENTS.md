# PDOHO Camarines Norte Leave Monitoring System

A leave application and monitoring system for the Provincial DOH Office Camarines Norte, built with Next.js 14 and Vercel Postgres.

## Features

- **Leave Application Form**: Employees can submit leave applications with various leave types (VL, SL, Maternity, etc.)
- **Admin Dashboard**: Admins can view, approve/reject leave applications
- **Leave Balance Tracking**: Track employee leave credits and balances
- **Reports**: Generate reports on leave applications
- **Attachment Support**: Upload supporting documents (PDF, JPG, PNG, DOC, DOCX up to 3MB)

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database**: Vercel Postgres (@vercel/postgres)
- **Styling**: Tailwind CSS
- **Language**: TypeScript

## Project Structure

```
├── app/
│   ├── page.tsx                 # Main leave application form
│   ├── layout.tsx               # Root layout
│   ├── globals.css              # Global styles
│   └── admin/
│       ├── page.tsx             # Admin dashboard
│       ├── login/page.tsx       # Admin login
│       ├── register/page.tsx    # Admin registration
│       ├── balances/page.tsx    # Leave balance management
│       ├── reports/page.tsx     # Reports page
│       └── reset-password/      # Password reset
├── components/
│   └── Letterhead.tsx           # Official letterhead component
├── lib/
│   ├── db.ts                    # Database schema & initialization
│   ├── auth.ts                  # Authentication helpers
│   ├── email.ts                 # Email utilities
│   ├── leaveTypes.ts            # Leave type definitions
│   └── adminUsers.ts            # Admin user management
├── api/
│   ├── applications/            # Leave application CRUD
│   ├── leave-balance/           # Leave balance queries
│   └── admin/                   # Admin operations
└── middleware.ts                 # Auth middleware
```

## Environment Variables

Required in `.env.local`:
- `POSTGRES_URL` - Vercel Postgres connection string
- `ADMIN_EMAIL` - Developer/approver email for registration requests

## Database Schema

The system uses the following tables:
- `leave_applications` - All leave applications with status tracking
- `leave_balances` - Employee leave credit balances
- `admin_users` - Admin accounts with roles
- `admin_password_resets` - Password reset tokens
- `admin_registration_approvals` - Registration approval tokens

## Development

```bash
npm install
npm run dev
```

## Deployment

Deploy to Vercel with Vercel Postgres integration.
