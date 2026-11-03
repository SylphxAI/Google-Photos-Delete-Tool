/**
 * Growth readout: group paid Stripe Checkout sessions by utm_source,
 * utm_medium and utm_content so the Pro paywall A/B variants (utm_content
 * a|b) can be read out once checkout on the product's pricing page is live.
 *
 *   bun run growth:readout path/to/checkout_sessions.csv
 *
 * Input is a Checkout sessions CSV exported from the Stripe dashboard. It
 * reads that one file: no secrets, no network, no API calls.
 */
import { readFileSync } from 'node:fs'

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_content'] as const
type UtmKey = (typeof UTM_KEYS)[number]

export interface ReadoutRow {
  source: string
  medium: string
  content: string
  sessions: number
  paid: number
  /** Sum of paid session amounts, by currency (major units as exported). */
  revenue: Record<string, number>
}

/** Minimal RFC 4180 parser: quoted fields, doubled quotes, CRLF, embedded newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((f) => f !== '')) rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some((f) => f !== '')) rows.push(row)
  return rows
}

const norm = (h: string): string => h.trim().toLowerCase().replace(/[\s_]+/g, ' ')

/** Column index for a UTM key: `utm_source`, `metadata[utm_source]`, `utm_source (metadata)`, ... */
function utmColumn(headers: string[], key: UtmKey): number {
  const want = key.replace(/_/g, ' ')
  const exact = headers.findIndex((h) => h === want)
  return exact >= 0 ? exact : headers.findIndex((h) => h.includes(want))
}

function column(headers: string[], ...names: string[]): number {
  for (const n of names) {
    const i = headers.indexOf(n)
    if (i >= 0) return i
  }
  return -1
}

const UNSET = '(none)'

export function readout(csv: string): { rows: ReadoutRow[]; paid: number; sessions: number } {
  const table = parseCsv(csv)
  if (table.length === 0) return { rows: [], paid: 0, sessions: 0 }
  const headers = table[0].map(norm)
  const utm = UTM_KEYS.map((k) => utmColumn(headers, k))
  const payment = column(headers, 'payment status')
  const status = column(headers, 'status')
  if (payment < 0 && status < 0) throw new Error('No "Payment Status" or "Status" column: is this a Checkout sessions export?')
  const amount = column(headers, 'amount total', 'amount')
  const currency = column(headers, 'currency')

  const groups = new Map<string, ReadoutRow>()
  let paidTotal = 0
  let sessions = 0
  for (const r of table.slice(1)) {
    sessions++
    const val = (i: number): string => (i >= 0 ? (r[i] ?? '').trim() : '')
    const isPaid = payment >= 0 ? val(payment).toLowerCase() === 'paid' : val(status).toLowerCase() === 'complete'
    const [source, medium, content] = utm.map((i) => val(i) || UNSET)
    const key = `${source}\u0000${medium}\u0000${content}`
    let g = groups.get(key)
    if (!g) groups.set(key, (g = { source, medium, content, sessions: 0, paid: 0, revenue: {} }))
    g.sessions++
    if (!isPaid) continue
    g.paid++
    paidTotal++
    const n = Number(val(amount).replace(/,/g, ''))
    if (amount >= 0 && Number.isFinite(n)) {
      const cur = (val(currency) || '?').toUpperCase()
      g.revenue[cur] = Math.round(((g.revenue[cur] ?? 0) + n) * 100) / 100
    }
  }
  const rows = [...groups.values()].sort(
    (a, b) => b.paid - a.paid || b.sessions - a.sessions || `${a.source}${a.medium}${a.content}`.localeCompare(`${b.source}${b.medium}${b.content}`),
  )
  return { rows, paid: paidTotal, sessions }
}

export function formatReadout(csv: string): string {
  const { rows, paid, sessions } = readout(csv)
  const money = (r: Record<string, number>): string =>
    Object.entries(r).map(([c, v]) => `${v.toFixed(2)} ${c}`).join(', ') || '-'
  const lines = [`Paid sessions: ${paid} of ${sessions}`, '', 'utm_source | utm_medium | utm_content | paid | sessions | revenue']
  for (const r of rows) lines.push(`${r.source} | ${r.medium} | ${r.content} | ${r.paid} | ${r.sessions} | ${money(r.revenue)}`)
  return lines.join('\n')
}

if (import.meta.main) {
  const file = process.argv[2]
  if (!file) {
    console.error('usage: bun run growth:readout <checkout_sessions.csv>')
    process.exit(2)
  }
  console.log(formatReadout(readFileSync(file, 'utf8')))
}
