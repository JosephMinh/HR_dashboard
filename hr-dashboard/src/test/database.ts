const DEFAULT_TEST_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:5432/hr_dashboard_test?schema=public"

export function getTestDatabaseUrl(): string {
  return process.env.DATABASE_URL_TEST ?? DEFAULT_TEST_DATABASE_URL
}

export function requireTestDatabaseUrl(): string {
  const url = process.env.DATABASE_URL_TEST

  if (!url) {
    throw new Error(
      "DATABASE_URL_TEST is not set. Configure a dedicated test database before running integration or E2E suites.",
    )
  }

  return url
}
