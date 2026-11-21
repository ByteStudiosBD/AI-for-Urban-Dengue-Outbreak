/* Browser smoke test: every route renders real data with no console errors, and the
 * main controls work. Requires the app on BASE (default http://localhost:8000) and
 * Playwright installed (npm i -D playwright). Run: node tests/e2e_smoke.cjs */
const { chromium } = require('playwright')
const BASE = process.env.BASE || 'http://localhost:8000'
const Q = '?city=Dhaka%20North&ward=DNCC_Ward_05&asOf=2024-08-05&h=2'

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(String(e)))
  const check = async (name, fn) => {
    try { await fn(); console.log(`ok   ${name}`) } catch (e) { console.log(`FAIL ${name}: ${e.message}`); process.exitCode = 1 }
  }
  const expectText = async (text) => page.getByText(text, { exact: false }).first().waitFor({ timeout: 8000 })

  await check('sign-in first', async () => { await page.goto(BASE + '/'); await page.waitForURL('**/login**'); await page.goto(BASE + '/data'); await page.waitForURL(/\/login\?next=%2Fdata/) })
  await check('demo login returns to requested page', async () => { await page.getByRole('button', { name: 'Continue in Demo Mode' }).click(); await page.waitForURL('**/data**') })
  await check('landing', async () => { await page.goto(BASE + '/'); await expectText('Know the risk before the outbreak'); const ok = await page.locator('img[src*="operating-room-hero"]').evaluate((i) => i.complete && i.naturalWidth === 1672); if (!ok) throw new Error('hero photo not loaded'); if (await page.locator('figure img').count()) throw new Error('old collage still present') })
  await check('demo login goes to home', async () => { await page.goto(BASE + '/login'); await page.getByRole('button', { name: 'Continue in Demo Mode' }).click(); await page.waitForURL((u) => new URL(u).pathname === '/'); await expectText('Know the risk before the outbreak') })
  await check('risk overview: 60 tiles', async () => { await page.goto(BASE + '/risk' + Q); await expectText('Ward Risk Heatmap — Schematic View'); await page.getByRole('button', { name: /^DNCC_Ward_19, Dhaka North: Critical/ }).waitFor({ timeout: 8000 }); const n = await page.getByRole('button', { name: /^[A-Z]+_Ward_\d+, / }).count(); if (n !== 60) throw new Error(`expected 60 ward tiles, got ${n}`) })
  await check('risk overview: ward panel', async () => { await page.getByRole('button', { name: /^DSCC_Ward_05, / }).click(); await page.getByRole('heading', { level: 2, name: 'DSCC_Ward_05' }).waitFor({ timeout: 8000 }); await page.getByRole('tab', { name: 'All ward data' }).click(); await expectText('relative_humidity_pct'); if (!page.url().includes('ward=DSCC_Ward_05')) throw new Error('selection not in URL') })
  await check('view data from panel', async () => { await page.getByRole('link', { name: 'Open in View Data' }).click(); await page.waitForURL(/\/data.*dward=DSCC_Ward_05/); await expectText('of 522 records') })
  await check('view data: full dataset', async () => { await page.goto(BASE + '/data'); await expectText('of 31,320 records') })
  await check('overview', async () => { await page.goto(BASE + '/dashboard' + Q); await expectText('Ward watchlist'); await expectText('DNCC_Ward_19') })
  await check('horizon control', async () => { await page.getByRole('radio', { name: '4 weeks ahead' }).click(); await page.waitForURL(/h=4/) })
  await check('nav: predictions', async () => { await page.getByRole('link', { name: 'Risk Predictions' }).first().click(); await expectText('Horizon comparison'); if (!page.url().includes('ward=DNCC_Ward_05')) throw new Error('filters lost') })
  await check('nav: heatmap', async () => { await page.getByRole('link', { name: 'Risk Matrix (by week)' }).click(); await expectText('Ward × horizon') })
  await check('heatmap click-through', async () => { await page.getByRole('button', { name: /DNCC_Ward_19, \+3/ }).click(); await page.waitForURL(/predictions.*ward=DNCC_Ward_19.*h=3/) })
  await check('nav: weather', async () => { await page.getByRole('link', { name: 'Weather Data' }).click(); await expectText('Why delayed weather matters') })
  await check('nav: validation', async () => { await page.getByRole('link', { name: 'Model Validation' }).click(); await expectText('Chronological split') })
  await check('alerts popover', async () => { await page.getByRole('button', { name: /^Alerts: \d+/ }).click(); await expectText('High and Critical wards'); await page.keyboard.press('Escape') })
  await check('csv export', async () => { const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()]); if (!dl.suggestedFilename().endsWith('.csv')) throw new Error('not csv') })
  await check('language toggle', async () => { await page.getByRole('button', { name: 'বাংলা' }).first().click(); await page.getByRole('heading', { level: 1, name: 'মডেল যাচাই' }).waitFor({ timeout: 8000 }); await page.getByRole('button', { name: 'EN', exact: true }).first().click(); await page.getByRole('heading', { level: 1, name: 'Model Validation' }).waitFor({ timeout: 8000 }) })
  await check('unknown route', async () => { await page.goto(BASE + '/nope' + Q); await expectText('Page not found') })
  await check('no console errors', async () => { if (errors.length) throw new Error(errors.slice(0, 3).join(' | ')) })
  await browser.close()
})()
