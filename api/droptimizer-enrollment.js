import {
  assertAutomationScenario,
  validateEnrollmentPayload,
} from './_droptimizer-execution.js'
import { ENROLLMENT_STATUSES, upsertEnrollment } from './_droptimizer-store.js'
import { getSupabase, isConfigured } from './_supabase.js'

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
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Write-Token')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (!isConfigured()) {
    return res.status(503).json({ error: 'Supabase not configured' })
  }

  if (!requireWriteToken(req, res)) {
    return undefined
  }

  const supabase = getSupabase()

  if (req.method === 'POST') {
    try {
      const characterName = String(req.body?.characterName ?? '').trim()
      const scenario = String(req.body?.scenario ?? '').trim()
      const rawPayload = req.body?.payload

      if (!characterName || !scenario || rawPayload == null) {
        return res.status(400).json({ error: 'characterName, scenario, and payload are required' })
      }

      assertAutomationScenario(scenario)
      const { payload, actor } = validateEnrollmentPayload({
        characterName,
        scenario,
        payload: rawPayload,
      })

      const row = await upsertEnrollment(supabase, {
        characterName,
        scenario,
        payload,
        enabled: false,
        validationStatus: ENROLLMENT_STATUSES.pending,
        validationError: null,
        validatedAt: null,
        payloadSource: 'settings_ui',
      })

      return res.status(200).json({
        ok: true,
        enrollment: {
          character: row.character_name,
          scenario: row.scenario,
          enabled: row.enabled,
          validationStatus: row.validation_status,
          validationError: row.validation_error,
          validatedAt: row.validated_at,
          updatedAt: row.updated_at,
          payloadHash: row.payload_hash,
          payloadSource: row.payload_source,
          actor,
        },
      })
    } catch (error) {
      console.error('[api/droptimizer-enrollment POST]', error.message)
      return res.status(400).json({ error: error.message })
    }
  }

  if (req.method === 'DELETE') {
    try {
      const characterName = String(req.query?.characterName ?? req.body?.characterName ?? '').trim()
      const scenario = String(req.query?.scenario ?? req.body?.scenario ?? '').trim()
      if (!characterName || !scenario) {
        return res.status(400).json({ error: 'characterName and scenario are required' })
      }

      assertAutomationScenario(scenario)

      const { error } = await supabase
        .from('droptimizer_payloads')
        .delete()
        .eq('character_name', characterName)
        .eq('scenario', scenario)

      if (error) throw error

      return res.status(200).json({ ok: true })
    } catch (error) {
      console.error('[api/droptimizer-enrollment DELETE]', error.message)
      return res.status(500).json({ error: error.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
