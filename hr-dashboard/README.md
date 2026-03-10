This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

### Prerequisites

- Node.js 18+ or Bun
- Docker and Docker Compose
- PostgreSQL (or use Docker)

### Quick Start

1. **Copy environment file:**
   ```bash
   cp .env.example .env
   ```

2. **Start development services:**
   ```bash
   docker compose -f docker-compose.dev.yml up -d
   ```

3. **Set up storage bucket:**
   ```bash
   ./scripts/setup-minio.sh
   ```

4. **Install dependencies and run migrations:**
   ```bash
   bun install
   bun run db:push
   ```

5. **Start the development server:**
   ```bash
   bun dev
   ```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Resume Upload (S3/MinIO Storage)

The application uses S3-compatible storage for resume uploads. For local development, we use MinIO.

**Local Development (MinIO):**

1. Start MinIO:
   ```bash
   docker compose -f docker-compose.dev.yml up -d minio
   ```

2. Create the bucket:
   ```bash
   ./scripts/setup-minio.sh
   ```

3. Access MinIO Console: http://localhost:9001 (login: minioadmin / minioadmin)

Your `.env` should contain:
```bash
STORAGE_BUCKET=hr-dashboard
STORAGE_REGION=us-east-1
STORAGE_ENDPOINT=http://localhost:9000
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
```

**Production (AWS S3):**

1. Create an S3 bucket in AWS Console
2. Configure IAM credentials or use IAM roles
3. Update `.env`:
   ```bash
   STORAGE_BUCKET=your-bucket-name
   STORAGE_REGION=us-east-1
   # If not using IAM roles:
   AWS_ACCESS_KEY_ID=your-access-key
   AWS_SECRET_ACCESS_KEY=your-secret-key
   ```

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
