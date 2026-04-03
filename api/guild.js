/**
 * api/guild.js — Vercel serverless: shared guild roster backed by Vercel KV (Upstash Redis)
 *
 * GET  /api/guild  → returns stored guild JSON (no auth required — all visitors can read)
 * POST /api/guild  → overwrites guild JSON (requires X-Write-Token header — guild password)
 *
 * Required Vercel environment variables:
 *   KV_REST_API_URL    — set automatically when you add Upstash Redis via Vercel Marketplace
 *   KV_REST_API_TOKEN  — set automatically when you add Upstash Redis via Vercel Marketplace
 *   GUILD_WRITE_TOKEN  — choose any password, add manually in Vercel → Settings → Env Vars
 */

import { kv } from '@vercel/kv'

const GUILD_KEY = 'wow-gear-diary:guild'

function sanitizeMember(member) {
  if (!member || typeof member !== 'object') return member
  const { realName, real_name, ...rest } = member
  return rest
}

function sanitizeGuild(guild) {
  if (!guild || typeof guild !== 'object') return { guild, changed: false }

  let changed = false
  const members = Array.isArray(guild.members)
    ? guild.members.map((member) => {
      if (member && typeof member === 'object' && ('realName' in member || 'real_name' in member)) {
        changed = true
      }
      return sanitizeMember(member)
    })
    : guild.members

  return {
    guild: changed ? { ...guild, members } : guild,
    changed,
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Write-Token')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // Gracefully degrade if KV is not configured (e.g. local dev without .env.local)
  if (!process.env.KV_REST_API_URL) {
    if (req.method === 'GET') return res.status(200).json(null)
    return res.status(503).json({ error: 'KV not configured — add Upstash Redis via Vercel Marketplace' })
  }

  // ── GET — read guild (public) ───────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const storedGuild = await kv.get(GUILD_KEY)
      const { guild, changed } = sanitizeGuild(storedGuild)

      if (changed && guild) {
        await kv.set(GUILD_KEY, guild)
      }

      return res.status(200).json(guild ?? null)
    } catch (err) {
      console.error('[api/guild GET]', err.message)
      return res.status(500).json({ error: err.message })
    }
  }

  // ── POST — write guild (requires password) ──────────────────────────────────
  if (req.method === 'POST') {
    const expected = process.env.GUILD_WRITE_TOKEN
    if (!expected) {
      return res.status(503).json({ error: 'GUILD_WRITE_TOKEN not set in Vercel env vars' })
    }

    const provided = req.headers['x-write-token']
    if (!provided || provided !== expected) {
      return res.status(401).json({ error: 'Wrong password' })
    }

    try {
      if (req.query.validate === '1') {
        return res.status(200).json({ ok: true, validated: true })
      }

      await kv.set(GUILD_KEY, sanitizeGuild(req.body).guild)
      return res.status(200).json({ ok: true })
    } catch (err) {
      console.error('[api/guild POST]', err.message)
      return res.status(500).json({ error: err.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
