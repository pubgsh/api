import fs from 'fs-extra'
import path from 'path'
import { Pool } from 'pg'
import { createPool, getPool, query } from 'pgr'
import axios from 'axios'
import MockAdapter from 'axios-mock-adapter'
import glob from 'glob'
import sha1 from 'sha1'
import { server, registerGraphql } from '@/app.js'

require('dotenv').config({ path: './.env.local' })

// -----------------------------------------------------------------------------
// Mocks -----------------------------------------------------------------------
// -----------------------------------------------------------------------------

function Fixture(filename, { mock = true }) {
    const fixtureDir = path.join(path.dirname(filename), '__fixtures__')
    fs.ensureDirSync(fixtureDir)

    const configHash = config => sha1(JSON.stringify(config, null, 2)).substring(0, 5)

    if (mock) {
        const adapter = new MockAdapter(axios)

        const knownFixturePaths = glob.sync(path.join(__dirname, '../src/**/__fixtures__/*.json'))
        const knownFixtures = {}

        knownFixturePaths.forEach(fixturePath => {
            const { config, response } = require(fixturePath) // eslint-disable-line
            knownFixtures[configHash(config)] = response
        })

        adapter.onAny().reply(async config => {
            const response = knownFixtures[configHash(config)]

            if (!response) {
                console.error('Unable to find fixture for config')
                console.error(JSON.stringify(config, null, 2))
                throw Error('FIXTURE_NOT_FOUND')
            }

            return [response.status, response.data, response.headers]
        })
    } else {
        const origAxios = axios.create()
        const adapter = new MockAdapter(axios)

        adapter.onAny().reply(async config => {
            const hash = configHash(config)
            const fixturePath = path.join(fixtureDir, `${path.basename(filename, '.js')}-${hash}.json`)

            console.log('made real request')
            const response = await origAxios(config)
            fs.writeFileSync(fixturePath, JSON.stringify({ config, response }, null, 2))
            return [response.status, response.data, response.headers]
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
    await query(seed)
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
