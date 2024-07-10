// tests/influx.module.spec.ts
import { Test, TestingModule } from '@nestjs/testing'
import { InfluxModule } from '../src/influx.module'
import { InfluxService } from '../src/influx.service'
import { Point } from '@influxdata/influxdb-client'

import { beforeAll, describe, expect, it } from 'vitest'

describe.each([
  { org: 'A', bucket: 'AA' },
  { org: 'B', bucket: 'BA' },
  { org: 'B', bucket: 'BB' },
])('InfluxModule', (moduleIds) => {
  let module: TestingModule
  let influxService: InfluxService
  const now = new Date()

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        await InfluxModule.forRoot({
          url: 'http://influxtestbase:8086',
          token: 'my-super-secret-token',
          org: `test-org-${moduleIds.org}`,
          bucket: `test-bucket-${moduleIds.bucket}`,
        }),
      ],
    }).compile()

    influxService = module.get<InfluxService>(InfluxService)
  })

  it('should ping database', async () => {
    let isPinged = false
    try {
      await influxService.ping()
      isPinged = true
    } catch (e) {
      isPinged = false
    }
    expect(isPinged).toBe(true)
  })

  it('should write and query points', async () => {
    const point = new Point('temperature')
      .tag('location', `module${moduleIds.org}`)
      .floatField('value', 22.5)
      .timestamp(now)
    influxService.writePoint(point)

    await influxService.closeWriteApi()

    const query = `from(bucket: "test-bucket-${moduleIds.bucket}") |> range(start: -1h) |> filter(fn: (r) => r._measurement == "temperature" and r.location == "module${moduleIds.org}" and r._field == "value" and r._value == 22.5)`
    const result: object[] = await influxService.query(query)
    expect(result.length).toBeGreaterThan(0)
  })

  it('should delete data', async () => {
    await influxService.deleteData({
      start: now.toISOString(),
      stop: new Date().toISOString(),
    })
  })
})
