import { rm } from 'node:fs/promises'

const targets = ['.vercel/output', '.output']

await Promise.all(
  targets.map((target) => rm(target, { recursive: true, force: true })),
)
