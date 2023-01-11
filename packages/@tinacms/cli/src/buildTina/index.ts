/**
 Copyright 2021 Forestry.io Holdings, Inc.
 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at
 http://www.apache.org/licenses/LICENSE-2.0
 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */

import fs from 'fs-extra'

import {
  buildSchema,
  createDatabase,
  Database,
  getASTSchema,
} from '@tinacms/graphql'
import {
  AuditFileSystemBridge,
  FilesystemBridge,
  IsomorphicBridge,
  LevelStore,
} from '@tinacms/datalayer'
import path from 'path'
import { DocumentNode } from 'graphql'
import { compileSchema, resetGeneratedFolder } from '../cmds/compile'
import { genClient, genTypes } from '../cmds/query-gen'
import { makeIsomorphicOptions } from './git'
import { viteBuild } from '@tinacms/app'
import { spin } from '../utils/spinner'
import { isProjectTs } from './attachPath'
import { logger } from '../logger'
import { logText } from '../utils/theme'

interface ClientGenOptions {
  noSDK?: boolean
  local?: boolean
  verbose?: boolean
  port?: number
  rootPath?: string
}

interface BuildOptions {
  local: boolean
  dev?: boolean
  verbose?: boolean
  rootPath?: string
}

interface BuildSetupOptions {
  isomorphicGitBridge?: boolean
  experimentalData?: boolean
}

export const buildSetupCmdBuild = async (
  ctx: any,
  next: () => void,
  opts: BuildSetupOptions
) => {
  const rootPath = ctx.rootPath as string
  const { bridge, database } = await buildSetup({
    ...opts,
    rootPath,
    useMemoryStore: true,
  })
  // attach to context
  ctx.bridge = bridge
  ctx.database = database
  ctx.builder = new ConfigBuilder(database)

  next()
}

export const buildSetupCmdServerStart = async (
  ctx: any,
  next: () => void,
  opts: BuildSetupOptions
) => {
  const rootPath = ctx.rootPath as string
  const { bridge, database } = await buildSetup({
    ...opts,
    rootPath,
    useMemoryStore: false,
  })
  // attach to context
  ctx.bridge = bridge
  ctx.database = database
  ctx.builder = new ConfigBuilder(database)

  next()
}
export const buildSetupCmdAudit = async (
  ctx: any,
  next: () => void,
  options: { clean: boolean }
) => {
  const rootPath = ctx.rootPath as string
  const bridge = options.clean
    ? new FilesystemBridge(rootPath)
    : new AuditFileSystemBridge(rootPath)

  await fs.ensureDirSync(path.join(rootPath, '.tina', '__generated__'))
  const store = new LevelStore(rootPath, false)

  const database = await createDatabase({ store, bridge })

  // attach to context
  ctx.bridge = bridge
  ctx.database = database
  ctx.builder = new ConfigBuilder(database)

  next()
}

const buildSetup = async ({
  isomorphicGitBridge,
  rootPath,
  useMemoryStore,
}: BuildSetupOptions & {
  rootPath: string
  useMemoryStore: boolean
}) => {
  const fsBridge = new FilesystemBridge(rootPath)
  const isomorphicOptions =
    isomorphicGitBridge && (await makeIsomorphicOptions(fsBridge))

  /**
   * To work with Github directly, replace the Bridge and Store
   * and ensure you've provided your access token.
   * NOTE: when talking the the tinacms repo, you must
   * give your personal access token access to the TinaCMS org
   */
  // const ghConfig = {
  //   rootPath: 'examples/tina-cloud-starter',
  //   accessToken: '<my-token>',
  //   owner: 'tinacms',
  //   repo: 'tinacms',
  //   ref: 'add-data-store',
  // }
  // const bridge = new GithubBridge(ghConfig)
  // const store = new GithubStore(ghConfig)

  const bridge = isomorphicGitBridge
    ? new IsomorphicBridge(rootPath, isomorphicOptions)
    : fsBridge

  // const store = experimentalData
  //   ? new LevelStore(rootPath, useMemoryStore)
  //   : new FilesystemStore({ rootPath })

  await fs.ensureDirSync(path.join(rootPath, '.tina', '__generated__'))

  const store = new LevelStore(rootPath, useMemoryStore)

  const database = await createDatabase({ store, bridge })

  return { database, bridge, store }
}

export const buildCmdBuild = async (
  ctx: {
    builder: ConfigBuilder
    rootPath: string
    usingTs: boolean
    schema: unknown
    apiUrl: string
  },
  next: () => void,
  options: Omit<
    BuildOptions & BuildSetupOptions & ClientGenOptions,
    'bridge' | 'database' | 'store'
  >
) => {
  // always skip indexing in the "build" command
  const { schema } = await ctx.builder.build({
    rootPath: ctx.rootPath,
    ...options,
  })
  ctx.schema = schema
  const apiUrl = await ctx.builder.genTypedClient({
    compiledSchema: schema,
    local: options.local,
    noSDK: options.noSDK,
    verbose: options.verbose,
    usingTs: ctx.usingTs,
    port: options.port,
  })
  ctx.apiUrl = apiUrl
  await buildAdmin({
    local: options.local,
    rootPath: ctx.rootPath,
    schema,
    apiUrl,
  })
  next()
}

export const auditCmdBuild = async (
  ctx: { builder: ConfigBuilder; rootPath: string; database: Database },
  next: () => void,
  options: Omit<
    BuildOptions & BuildSetupOptions,
    'bridge' | 'database' | 'store'
  >
) => {
  const { graphQLSchema, tinaSchema } = await ctx.builder.build({
    rootPath: ctx.rootPath,
    ...options,
    verbose: true,
  })

  await spin({
    waitFor: async () => {
      await ctx.database.indexContent({ graphQLSchema, tinaSchema })
    },
    text: 'Indexing local files',
  })

  next()
}

export class ConfigBuilder {
  constructor(private database: Database) {}

  async build({ dev, verbose, rootPath, local }: BuildOptions): Promise<{
    schema: any
    graphQLSchema: DocumentNode
    tinaSchema: any
  }> {
    const usingTs = await isProjectTs(rootPath)

    if (!rootPath) {
      throw new Error('Root path has not been attached')
    }
    const tinaGeneratedPath = path.join(rootPath!, '.tina', '__generated__')

    // Clear the cache of the DB passed to the GQL server
    this.database.clearCache()

    await fs.mkdirp(tinaGeneratedPath)
    await this.database.store.close()
    await resetGeneratedFolder({
      tinaGeneratedPath,
      usingTs,
      isBuild: !local,
    })
    await this.database.store.open()

    const compiledSchema = await compileSchema({
      verbose,
      dev,
      rootPath,
    })
    // FIXME: the bridge is initialized before we have access to the config,
    // ideally this is available to us during Bridge init but as a workaround
    // we add it here.
    if (
      this.database.bridge.addOutputPath &&
      compiledSchema.config?.remote?.rootPath
    ) {
      this.database.bridge.addOutputPath(compiledSchema.config.remote.rootPath)
    }

    const { graphQLSchema, tinaSchema } = await buildSchema(
      rootPath,
      this.database,
      ['experimentalData', 'isomorphicGitBridge']
    )

    return { schema: compiledSchema, graphQLSchema, tinaSchema }
  }

  async genTypedClient({
    usingTs,
    compiledSchema,
    noSDK,
    verbose,
    local,
    port,
    rootPath,
  }: ClientGenOptions & {
    usingTs: boolean
    compiledSchema: any
  }) {
    const astSchema = await getASTSchema(this.database)

    await genTypes({ schema: astSchema, usingTs, rootPath }, () => {}, {
      noSDK,
      verbose,
    })

    return genClient(
      { tinaSchema: compiledSchema, usingTs, rootPath },
      {
        local,
        port,
      }
    )
  }
}

export const buildAdmin = async ({
  schema,
  local,
  rootPath,
  apiUrl,
}: {
  schema: any
  local: boolean
  rootPath: string
  apiUrl: string
}) => {
  if (schema?.config?.build) {
    const buildVite = async () => {
      await viteBuild({
        local,
        rootPath,
        outputFolder: schema?.config?.build?.outputFolder as string,
        publicFolder: schema?.config?.build?.publicFolder as string,
        apiUrl,
        host: schema?.config?.build?.host ?? false,
      })
    }
    // Local runs an asset server as a long-lived task, don't show spinning animation
    if (local) {
      logger.info(logText('Starting Tina asset server'))
      await buildVite()
    } else {
      await spin({
        text: logText('Building static site'),
        waitFor: buildVite,
      })
      logger.info(logText('\nDone building static site'))
    }
  }
}
