import { extractReportId, parseDroptimizerReport } from './_droptimizer.js'

function parseCSV(text) {
  return text.trim().split('\n').map((line) => line.split(',').map((cell) => cell.trim()))
}

export async function fetchRaidbotsReportArtifacts(reportInput) {
  const reportId = extractReportId(reportInput)
  if (!reportId) {
    throw new Error('report id required')
  }

  const baseUrl = `https://www.raidbots.com/simbot/report/${reportId}`
  const headers = { 'User-Agent': 'WowGearDiary/1.0' }

  const csvRes = await fetch(`${baseUrl}/data.csv`, { headers })
  if (!csvRes.ok) {
    throw new Error(`Report not found (${csvRes.status})`)
  }

  const csvText = await csvRes.text()
  let jsonData = null

  const jsonRes = await fetch(`${baseUrl}/data.json`, { headers })
  if (jsonRes.ok) {
    jsonData = await jsonRes.json().catch(() => null)
  }

  return { reportId, csvText, jsonData }
}

export async function fetchAndParseRaidbotsReport(reportInput) {
  const { reportId, csvText, jsonData } = await fetchRaidbotsReportArtifacts(reportInput)
  const [_header, ...dataRows] = parseCSV(csvText)
  const itemRows = dataRows.filter((row) => row[0]?.includes('/'))

  if (itemRows.length > 0) {
    return { reportId, data: parseDroptimizerReport(csvText, jsonData) }
  }

  return { reportId, data: jsonData }
}
