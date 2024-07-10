// src/influx/influx.service.ts
import { Injectable } from '@nestjs/common'
import {
  InfluxDB,
  type QueryApi,
  type WriteApi,
  Point,
} from '@influxdata/influxdb-client'
import {
  DeleteAPI,
  PingAPI,
  type PostDeleteRequest,
} from '@influxdata/influxdb-client-apis'

@Injectable()
export class InfluxService {
  private queryApi: QueryApi
  private writeApi: WriteApi

  constructor(
    private influxDB: InfluxDB,
    private org: string,
    private bucket: string
  ) {
    this.queryApi = this.influxDB.getQueryApi(this.org)
    this.writeApi = this.influxDB.getWriteApi(this.org, this.bucket)
  }

  async query(query: string): Promise<Record<PropertyKey, string>[]> {
    return new Promise((resolve, reject) => {
      const results: Record<PropertyKey, string>[] = []
      this.queryApi.queryRows(query, {
        next(row, tableMeta) {
          const o = tableMeta.toObject(row)
          results.push(o)
        },
        error(error) {
          reject(error)
        },
        complete() {
          resolve(results)
        },
      })
    })
  }

  writePoint(point: Point): void {
    try {
      return this.writeApi.writePoint(point)
    } catch (error) {
      console.error('Error writing point', error)
    }
  }

  async closeWriteApi() {
    try {
      await this.writeApi.close()
    } catch (error) {
      console.error('Error closing Write API', error)
    }
  }

  async ping() {
    try {
      const pingAPI = new PingAPI(this.influxDB)
      return pingAPI.getPing({ org: this.org, bucket: this.bucket })
    } catch (error) {
      console.error('Error pinging InfluxDB', error)
    }
  }

  async deleteData(body: PostDeleteRequest['body']) {
    const deleteAPI = new DeleteAPI(this.influxDB)
    try {
      await deleteAPI.postDelete({ org: this.org, bucket: this.bucket, body })
    } catch (error) {
      console.error('Error deleting data', error)
    }
  }
}
