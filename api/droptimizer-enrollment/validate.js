import { executeDirectScenario } from '../_droptimizer-execution.js'
import { ENROLLMENT_STATUSES, loadEnrollment, updateEnrollmentValidation, TRIGGER_KINDS } from '../_droptimizer-store.js'
import { getSupabase, isConfigured } from '../_supabase.js'

function requireWriteToken(req, res) {
  const expected = process.env.GUILD_WRITE_TOKEN
  const provided = req.headers['x-write-token']

  if (!expected || provided !== expected) {
    res.status(401).json({ error: 'Invalid write token' })
    return false
  }

  return true
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Write-Token')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!isConfigured()) {
    return res.status(503).json({ error: 'Supabase not configured' })
  }

  if (!requireWriteToken(req, res)) {
    return undefined
  }

  try {
    const characterName = String(req.body?.characterName ?? '').trim()
    const scenario = String(req.body?.scenario ?? '').trim()
    if (!characterName || !scenario) {
      return res.status(400).json({ error: 'characterName and scenario are required' })
    }

    const supabase = getSupabase()
    const enrollment = await loadEnrollment(supabase, characterName, scenario)
    if (!enrollment?.payload) {
      return res.status(404).json({ error: `No enrollment found for ${characterName}` })
    }

    await updateEnrollmentValidation(supabase, characterName, scenario, {
      enabled: false,
      validation_status: ENROLLMENT_STATUSES.pending,
      validation_error: null,
      validated_at: null,
    })

    const result = await executeDirectScenario({
      supabase,
      characterName,
      scenario,
      triggerKind: TRIGGER_KINDS.validation,
      payloadOverride: enrollment.payload,
      validation: true,
    })

    return res.status(200).json(result)
  } catch (error) {
    console.error('[api/droptimizer-enrollment/validate]', error.message)
    return res.status(500).json({ error: error.message })
  }
}
