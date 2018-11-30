import axios from 'axios'
import chalk from 'chalk'
import { get } from 'lodash'

// -----------------------------------------------------------------------------
// Helpers ---------------------------------------------------------------------
// -----------------------------------------------------------------------------

let limit = 10
let remaining = 10
let reset = (Date.now() / 1000)
let remainingTimeout = null

const metrics = {
    player: { count: 0, avgMs: 0 },
    matches: { count: 0, avgMs: 0 },
}

function updateRateLimits(headers) {
    limit = Number(headers['x-ratelimit-limit'])
    remaining = Number(headers['x-ratelimit-remaining'])
    reset = Number(headers['x-ratelimit-reset'])
    console.log(`Rate Limits: ${remaining} left, resets in ${(reset - (Date.now() / 1000))} sec`)
}

async function apiGet(path, shardId = 'steam') {
    if (!path.startsWith('matches/')) console.log(chalk.blue(`[API]: Retrieving ${shardId}/${path}`))

    const m = path.startsWith('matches') ? metrics.matches : metrics.player
    const start = Date.now()

    try {
        const res = await axios({
            method: 'get',
            headers: {
                Authorization: `Bearer ${process.env.PUBG_API_KEY}`,
                Accept: 'application/vnd.api+json',
            },
            url: `https://api.pubg.com/shards/${shardId}/${path}`,
        })

        if (get(res, 'headers.x-ratelimit-limit')) updateRateLimits(res.headers)

        return res
    } catch (e) {
        if (get(e, 'response.headers.x-ratelimit-limit')) updateRateLimits(e.response.headers)

        throw e
    } finally {
        const took = Date.now() - start
        m.avgMs = ((m.count * m.avgMs) + took) / (m.count + 1)
        m.count++

        if (!remainingTimeout && process.env.NODE_ENV !== 'test') {
            remainingTimeout = setTimeout(() => {
                remaining = limit
                remainingTimeout = null
            }, 1000 * (reset - (Date.now() / 1000)))
        }
    }
}

function RateLimitError() {
    const err = Error('Rate limited')
    err.reset = reset
    return err
}

// -------------------------------------------------------------------------
// Public ------------------------------------------------------------------
// -------------------------------------------------------------------------

export default {
    metrics,

    rateLimitStats() {
        return { limit, remaining, reset }
    },

    async getPlayer(shardId, name) {
        if (remaining === 0) {
            throw RateLimitError()
        }

        try {
            const { data: { data } } = await apiGet(`players?filter[playerNames]=${name}`, shardId)
            return data.find(d => d.attributes.name.toLowerCase() === name.toLowerCase())
        } catch (e) {
            if (get(e, 'response.status') === 404) {
                return null
            }

            if (get(e, 'response.status') === 429) {
                throw RateLimitError()
            }

            throw e
        }
    },

    async getMatch(id) {
        const res = await apiGet(`matches/${id}`)
        return res.data
    },

    async getMatchTelemetry(telemetryUrl) {
        const res = await axios.get(telemetryUrl)
        return res.data
    },
}
