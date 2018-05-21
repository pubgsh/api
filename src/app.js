import path from 'path'
import Hapi from 'hapi'
import fs from 'fs'
import { graphqlHapi, graphiqlHapi } from 'apollo-server-hapi'
import { makeExecutableSchema } from 'graphql-tools'
import { fileLoader, mergeTypes, mergeResolvers } from 'merge-graphql-schemas'
import { pg, createPool, query } from 'pgr'
import models from '@/models'
import PubgApi from '@/lib/pubg-api'
import crawler from './crawler.js'

pg.types.setTypeParser(1114, strValue => `${strValue}+0000`)

require('dotenv').config({ path: './.env.local' })

export const server = process.env.NODE_ENV === 'test'
    ? Hapi.server({ autoListen: false })
    : Hapi.server({ port: process.env.HAPI_PORT || 3005, host: 'localhost' })

function createSchema() {
    const typeDefs = mergeTypes(fileLoader(path.join(__dirname, './schema')))
    const resolvers = mergeResolvers(fileLoader(path.join(__dirname, './resolvers/!(*.test).js')))

    return makeExecutableSchema({
        typeDefs,
        resolvers,
    })
}

export async function registerGraphql() {
    return server.register({
        plugin: graphqlHapi,
        options: {
            path: '/graphql',
            graphqlOptions: {
                schema: createSchema(),
                context: {
                    models,
                    pubgApi: PubgApi(process.env.PUBG_API_KEY),
                },
            },
            route: {
                cors: true,
            },
        },
    })
}

async function registerGraphiql() {
    return server.register({
        plugin: graphiqlHapi,
        options: {
            path: '/graphiql',
            graphiqlOptions: {
                endpointURL: '/graphql',
            },
        },
    })
}

async function recreateDb() {  // eslint-disable-line
    const seed = fs.readFileSync(path.join(__dirname, '../test/seed.sql'), 'utf-8')
    await query(seed)
}

async function init() {
    createPool('default', {
        user: process.env.PGUSER,
        host: process.env.PGHOST,
        password: process.env.PGPASSWORD,
        database: process.env.PGDATABASE,
    })

    // await recreateDb()

    await registerGraphql()
    await registerGraphiql()

    await server.start()
    console.log(`Server running at: ${server.info.uri}`)
}

process.on('unhandledRejection', err => {
    console.error(err)
    process.exit(1)
})

if (require.main === module) {
    init()
    crawler.start()
}
