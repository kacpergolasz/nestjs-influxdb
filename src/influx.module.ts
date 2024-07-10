// src/influx/influx.module.ts
import { Module, type DynamicModule } from '@nestjs/common'
import { InfluxService } from './influx.service'
import { INFLUX_OPTIONS } from './influx.constants'
import { InfluxDB, type ClientOptions } from '@influxdata/influxdb-client'
import { BucketsAPI, OrgsAPI, SetupAPI } from '@influxdata/influxdb-client-apis'

interface InfluxModuleOptions extends ClientOptions {
  org: string
  bucket: string
  username?: string
  password?: string
}

@Module({})
export class InfluxModule {
  static async createInfluxProviders(options: InfluxModuleOptions) {
    const influxProvider = {
      provide: INFLUX_OPTIONS,
      useValue: options,
    }
    const influxServiceProvider = {
      provide: InfluxService,
      useFactory: async (options: InfluxModuleOptions) => {
        const influxDB = new InfluxDB(options)
        const setupApi = new SetupAPI(
          new InfluxDB({ url: options.url, token: options.token })
        )
        const influxInstanceHasNoInitialSetup = (await setupApi.getSetup())
          .allowed
        const influxDbMustBeCreated =
          typeof influxInstanceHasNoInitialSetup === 'undefined'
            ? true
            : influxInstanceHasNoInitialSetup

        if (influxDbMustBeCreated) {
          await InfluxModule.createInfluxDB(setupApi, options)
        }
        const orgsAPI = new OrgsAPI(influxDB)
        const organizationId =
          (await InfluxModule.getOrganisationId(orgsAPI, options.org)) ||
          (await InfluxModule.createOrganisationAndGetId(orgsAPI, options.org))
        const bucketsAPI = new BucketsAPI(influxDB)

        await InfluxModule.createBucketIfNotExists(
          bucketsAPI,
          organizationId,
          options.bucket
        )

        return new InfluxService(influxDB, options.org, options.bucket)
      },
      inject: [INFLUX_OPTIONS],
    }
    return { influxProvider, influxServiceProvider }
  }
  static async forRoot(options: InfluxModuleOptions): Promise<DynamicModule> {
    const providers = await InfluxModule.createInfluxProviders(options)

    return {
      module: InfluxModule,
      providers: [providers.influxProvider, providers.influxServiceProvider],
      exports: [InfluxService],
    }
  }

  static async createInfluxDB(
    setupApi: SetupAPI,
    options: InfluxModuleOptions
  ) {
    if (typeof options.username === 'undefined') {
      throw new Error('Database does not exist, username is required')
    }
    setupApi.postSetup({
      body: {
        org: options.org,
        bucket: options.bucket,
        token: options.token,
        username: options.username,
        password: options.password,
      },
    })
  }

  static async getOrganisationId(
    orgsAPI: OrgsAPI,
    orgName: string
  ): Promise<string | null> {
    try {
      const orgs = await orgsAPI.getOrgs({ org: orgName })
      if (orgs.orgs && orgs.orgs.length > 0 && orgs.orgs[0]) {
        if (!orgs.orgs[0].id) {
          throw new Error(`Organization ${orgName} exists, but doesn't have id`)
        }
        return orgs.orgs[0].id
      }
    } catch (error: unknown) {
      if (error instanceof Object) {
        if (
          Object.keys(error).includes('statusCode') &&
          (error as Record<PropertyKey, string | number>).statusCode === 404
        ) {
          return null
        }
      }
      throw error
    }
    return null
  }

  static async createOrganisationAndGetId(
    orgsAPI: OrgsAPI,
    orgName: string
  ): Promise<string> {
    const org = await orgsAPI.postOrgs({ body: { name: orgName } })
    if (!org.id) {
      throw new Error('Failed to create organization')
    }
    return org.id
  }

  static async createBucketIfNotExists(
    bucketsAPI: BucketsAPI,
    orgId: string,
    bucketName: string
  ) {
    try {
      const buckets = await bucketsAPI.getBuckets({ orgID: orgId })
      if (!buckets.buckets?.some((bucket) => bucket.name === bucketName)) {
        await bucketsAPI.postBuckets({
          body: { orgID: orgId, name: bucketName },
        })
      }
    } catch (error) {
      console.error('Error creating bucket', error)
      throw error
    }
  }
}
