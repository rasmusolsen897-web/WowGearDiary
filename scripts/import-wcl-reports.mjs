import { createClient } from '@supabase/supabase-js'
import { importWclWarehouseReport, normalizeWclReportCode } from '../api/_wclWarehouse.js'

function getSupabase() {
  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
  }

  return createClient(url, serviceKey)
}

async function main() {
  const reportInputs = process.argv.slice(2)
  if (!reportInputs.length) {
    throw new Error('Provide one or more WCL report URLs or codes')
  }

  const supabase = getSupabase()
  const imported = []
  const failed = []

  for (const input of reportInputs) {
    const reportCode = normalizeWclReportCode(input)
    if (!reportCode) {
      failed.push({ reportInput: input, error: 'Invalid WCL report input' })
      continue
    }

    try {
      imported.push(await importWclWarehouseReport({ supabase, reportInput: input }))
    } catch (error) {
      failed.push({ reportInput: input, error: error.message })
    }
  }

  console.log(JSON.stringify({ ok: failed.length === 0, imported, failed }, null, 2))
  if (failed.length > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
