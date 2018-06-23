import 'dotenv/config'
import fs from 'fs-extra'
import { cloneDeep } from 'lodash'
import path from 'path'
import { Pool } from 'pg' // eslint-disable-line
import { createPool, getPool, query, sql } from 'pgr'
import axios from 'axios'
import MockAdapter from 'axios-mock-adapter'
import glob from 'glob'
import sha1 from 'sha1'
import { server, registerGraphql } from '@/app.js'

// -----------------------------------------------------------------------------
// Mocks -----------------------------------------------------------------------
// -----------------------------------------------------------------------------

function Fixture(filename, { mock = true }) {
    const fixtureDir = path.join(path.dirname(filename), '__fixtures__')
    fs.ensureDirSync(fixtureDir)

    const safeConfig = config => {
        const clonedConfig = cloneDeep(config)
        delete clonedConfig.headers.Authorization
        return clonedConfig
    }

    const configHash = config => sha1(JSON.stringify(safeConfig(config), null, 2)).substring(0, 5)

    if (mock) {
        const adapter = new MockAdapter(axios)

        const knownFixturePaths = glob.sync(path.join(__dirname, '../src/**/__fixtures__/*.json'))
        const knownFixtures = {}

        knownFixturePaths.forEach(fixturePath => {
            const { config, result } = require(fixturePath) // eslint-disable-line
            knownFixtures[configHash(config)] = result
        })

        adapter.onAny().reply(async config => {
            const result = knownFixtures[configHash(config)]

            if (!result) {
                console.error('Unable to find fixture for config')
                console.error(JSON.stringify(config, null, 2))
                throw Error('FIXTURE_NOT_FOUND')
            }

            return result
        })
    } else {
        const origAxios = axios.create()
        const adapter = new MockAdapter(axios)

        adapter.onAny().reply(async config => {
            const hash = configHash(config)
            const fixturePath = path.join(fixtureDir, `${path.basename(filename, '.js')}-${hash}.json`)

            const response = await origAxios(config)

            const fixture = {
                config: safeConfig(config),
                result: [response.status, response.data, response.headers],
            }

            delete response.config.headers.Authorization
            fs.writeFileSync(fixturePath, JSON.stringify(fixture, null, 2))

            return fixture.result
        })
    }
}

// -----------------------------------------------------------------------------
// Database Setup --------------------------------------------------------------
// -----------------------------------------------------------------------------

const DATABASE = `pubgsh_test_${Math.round(Math.random() * 200000)}`
const genericPool = new Pool({
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    password: process.env.PGPASSWORD,
})

createPool('default', {
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    password: process.env.PGPASSWORD,
    database: DATABASE,
})

async function setupTestDb() {
    await genericPool.query(`CREATE DATABASE ${DATABASE}`)
    const seed = fs.readFileSync(path.join(__dirname, './seed.sql'), 'utf-8')
    await query(sql`${sql.raw(seed)}`)
}

async function teardownTestDb() {
    getPool('default').end()
    await genericPool.query(`DROP DATABASE ${DATABASE}`)
    await genericPool.end()
}

// -----------------------------------------------------------------------------
// Hapi Setup ------------------------------------------------------------------
// -----------------------------------------------------------------------------

async function setupServer() {
    await registerGraphql()
    server.start()
}

// -----------------------------------------------------------------------------
// Globals ---------------------------------------------------------------------
// -----------------------------------------------------------------------------

async function setupTestEnv() {
    await setupTestDb()
    await setupServer()
}

async function teardownTestEnv() {
    await teardownTestDb()
}

global.__Fixture = Fixture
global.__setupTestEnv = setupTestEnv
global.__teardownTestEnv = teardownTestEnv
global.__graphql = async q => {
    const res = await server.inject({
        method: 'POST',
        url: '/graphql',
        payload: {
            query: q,
        },
    })

    return { result: JSON.parse(res.result, null, 2), statusCode: res.statusCode }
}
