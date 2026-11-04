import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isFinal, parseDays, toIso } from '../src/index.js'

const HTML = `<div class="box_kqxs">
  <div class="title"><a>KẾT QUẢ XỔ SỐ Miền Nam</a> - <a href="/x">03/11/2026</a></div>
  <td class="thu"> <a href="/x">Thứ ba</a></td>
  <table cellpadding="0" cellspacing="0" class="rightcl" width="100%">
    <td class="tinh"><a href="/x">Bến Tre</a></td>
    <td class="matinh">XSBTR - K44-T11</td>
    <td class="giai8"><div>98</div></td>
    <td class="giai6"><div>0396</div><div>0675</div></td>
    <td class="giaidb"><div>069612</div></td>
  </table>
</div>`

test('parses day, weekday, province, prizes', () => {
  const days = parseDays(HTML)
  assert.equal(days.length, 1)
  assert.equal(days[0].date, '03/11/2026')
  assert.equal(days[0].weekday, 'Thứ ba')
  const province = days[0].provinces[0]
  assert.equal(province.name, 'Bến Tre')
  assert.equal(province.code, 'XSBTR - K44-T11')
  assert.deepEqual(province.prizes.db, ['069612'])
  assert.deepEqual(province.prizes.g6, ['0396', '0675'])
  assert.deepEqual(province.prizes.g8, ['98'])
})

test('skips boxes without results', () => {
  assert.deepEqual(parseDays('<div class="box_kqxs"><p>empty</p></div>'), [])
})

test('toIso normalizes and rejects junk', () => {
  assert.equal(toIso('03/11/2026'), '2026-11-03')
  assert.equal(toIso('3-11-2026'), '2026-11-03')
  assert.equal(toIso('03-11-2026'), '2026-11-03')
  assert.equal(toIso('2026-11-03'), '2026-11-03')
  assert.equal(toIso('nope'), undefined)
})

test('isFinal: past is final, future is not, today depends on the 16:45 ICT cutoff', () => {
  const realNow = Date.now
  const ict = (iso) => (Date.parse(iso) - 7 * 3600 * 1000)
  try {
    Date.now = () => ict('2026-11-04T10:00:00Z')
    assert.equal(isFinal('2026-11-03'), true)
    assert.equal(isFinal('2026-11-04'), false)
    assert.equal(isFinal('2026-11-05'), false)

    Date.now = () => ict('2026-11-04T16:44:00Z')
    assert.equal(isFinal('2026-11-04'), false)

    Date.now = () => ict('2026-11-04T16:45:00Z')
    assert.equal(isFinal('2026-11-04'), true)
  } finally {
    Date.now = realNow
  }
})
