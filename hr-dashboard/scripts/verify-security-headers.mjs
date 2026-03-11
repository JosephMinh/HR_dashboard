const DEFAULT_BASE_URL = 'https://hr-dashboard-three-flax.vercel.app'
const DEFAULT_PATHS = ['/', '/login', '/api/dashboard/stats']
const REQUEST_TIMEOUT_MS = 10_000

const REQUIRED_HEADERS = [
  ['content-security-policy', (value) => value.includes("default-src 'self'")],
  ['x-frame-options', (value) => value === 'DENY'],
  ['x-content-type-options', (value) => value === 'nosniff'],
  ['referrer-policy', (value) => value === 'strict-origin-when-cross-origin'],
  ['permissions-policy', (value) => value.includes('camera=()')],
  ['strict-transport-security', (value) => value.includes('max-age=31536000')],
]

function normalizeBaseUrl(input) {
  const url = new URL(input)
  url.pathname = ''
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/$/, '')
}

async function inspectUrl(url) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    const headers = Object.fromEntries(response.headers.entries())
    const missing = []
    const mismatched = []

    for (const [headerName, predicate] of REQUIRED_HEADERS) {
      const value = headers[headerName]
      if (!value) {
        missing.push(headerName)
        continue
      }

      if (!predicate(value)) {
        mismatched.push({ headerName, value })
      }
    }

    return {
      url,
      status: response.status,
      location: headers.location ?? null,
      missing,
      mismatched,
      error: null,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      url,
      status: null,
      location: null,
      missing: [],
      mismatched: [],
      error: message,
    }
  }
}

function printResult(result) {
  console.log(`\n${result.url}`)
  console.log(`status: ${result.status ?? 'request failed'}`)
  if (result.location) {
    console.log(`location: ${result.location}`)
  }

  if (result.error) {
    console.log(`error: ${result.error}`)
    return
  }

  if (result.missing.length === 0 && result.mismatched.length === 0) {
    console.log('headers: OK')
    return
  }

  if (result.missing.length > 0) {
    console.log(`missing: ${result.missing.join(', ')}`)
  }

  for (const issue of result.mismatched) {
    console.log(`unexpected ${issue.headerName}: ${issue.value}`)
  }
}

async function main() {
  const baseUrl = normalizeBaseUrl(
    process.argv[2] || process.env.HEADER_CHECK_URL || DEFAULT_BASE_URL,
  )
  const results = []

  for (const path of DEFAULT_PATHS) {
    const url = `${baseUrl}${path}`
    results.push(await inspectUrl(url))
  }

  const hasFailures = results.some(
    (result) => result.error || result.missing.length > 0 || result.mismatched.length > 0,
  )

  console.log(`Verifying live security headers for ${baseUrl}`)
  for (const result of results) {
    printResult(result)
  }

  if (hasFailures) {
    process.exitCode = 1
    console.error('\nOne or more endpoints are missing required security headers.')
    return
  }

  console.log('\nAll checked endpoints returned the expected security headers.')
}

try {
  await main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Failed to verify security headers: ${message}`)
  process.exitCode = 1
}
