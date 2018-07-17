import 'dotenv/config'
import path from 'path'
import Hapi from 'hapi'
import socketio from 'socket.io'
import fs from 'fs'
import { graphqlHapi, graphiqlHapi } from 'apollo-server-hapi'
import { makeExecutableSchema } from 'graphql-tools'
import { fileLoader, mergeTypes, mergeResolvers } from 'merge-graphql-schemas'
import depthLimit from 'graphql-depth-limit'
import { pg, createPool, getPool, query, sql } from 'pgr'
import models from '@/models'
import PubgApi from '@/lib/pubg-api.js'

pg.types.setTypeParser(1114, strValue => `${strValue}+0000`)

let io
export const getIo = () => io

export const server = process.env.NODE_ENV === 'test'
    ? Hapi.server({ autoListen: false })
    : Hapi.server({ port: process.env.HAPI_PORT || 8080, host: process.env.HOST || '0.0.0.0' })

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
                    PubgApi,
                },
                validationRules: [depthLimit(4)],
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
    const seed = sql.raw(fs.readFileSync(path.join(__dirname, '../test/seed.sql'), 'utf-8'))
    await query(sql`${seed}`)
    console.log('Recreated DB')
}

async function logTimingMetrics() {
    const pool = await getPool('default')
    console.log()
    console.log(JSON.stringify(pool.metrics, null, 2))
    console.log(JSON.stringify(PubgApi.metrics, null, 2))
    console.log()
}

async function deleteOldMatches() {
    // Note that this will cascade deletes through to match_players
    await query(sql`DELETE FROM matches WHERE played_at < (TIMEZONE('utc', NOW()) - INTERVAL '14 DAY')`)
}

async function init() {
    const pgConfig = {
        user: process.env.PGUSER,
        host: process.env.PGHOST,
        password: process.env.PGPASSWORD,
        database: process.env.PGDATABASE,
    }

    if (process.env.PGCERTPATH) {
        pgConfig.ssl = {
            rejectUnauthorized: false,
            ca: fs.readFileSync(`${process.env.PGCERTPATH}/server-ca.pem`).toString(),
            key: fs.readFileSync(`${process.env.PGCERTPATH}/client-key.pem`).toString(),
            cert: fs.readFileSync(`${process.env.PGCERTPATH}/client-cert.pem`).toString(),
        }
    }

    createPool('default', pgConfig)
    console.log(`PG connected to [${process.env.PGHOST} : ${process.env.PGDATABASE}]`)

    if (process.env.NODE_ENV !== 'production') {
        // await recreateDb()
    }

    await registerGraphql()
    await registerGraphiql()

    await server.start()
    io = socketio(server.listener)
    console.log(`Server running at: ${server.info.uri}`)

    setInterval(deleteOldMatches, 10 * 60 * 1000)
    setInterval(logTimingMetrics, 60 * 1000)
}

process.on('SIGINT', () => {
    console.log('SIGINT received. Shutting down...')
    process.exit(0)
})

process.on('unhandledRejection', err => {
    console.error(err)
    process.exit(1)
})

if (require.main === module) {
    init()
}
