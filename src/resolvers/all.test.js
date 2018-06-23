import moment from 'moment'
import { query, sql } from 'pgr'
import Player from '@/models/Player.js'

const breakAcctId = 'account.a36bed11ed214557b0ddef9ef1a56d07'

global.__Fixture(__filename, { mock: true })

describe('model :: Player and Match', () => {
    beforeAll(global.__setupTestEnv)
    afterAll(global.__teardownTestEnv)

    const origCreate = Player.createOrUpdate
    const origFind = Player.find
    beforeEach(() => {
        Player.createOrUpdate = jest.fn(async (...args) => origCreate.call(Player, ...args))
        Player.find = jest.fn(async (...args) => origFind.call(Player, ...args))
    })

    test('retrieves new players from the PUBG api', async () => {
        expect(await global.__graphql(`
            query {
                player(shardId: "pc-eu", name: "BreaK") {
                    id
                    name
                    matches {
                        id
                    }
                }
            }
        `)).toMatchSnapshot()

        expect(Player.createOrUpdate).toHaveBeenCalled()
    })

    test('re-requesting a player retrieves it from the db', async () => {
        expect(await global.__graphql(`
            query {
                player(shardId: "pc-eu", name: "BreaK") {
                    id
                    name
                    matches {
                        id
                    }
                }
            }
        `)).toMatchSnapshot()
        expect(Player.createOrUpdate).not.toHaveBeenCalled()
    })

    test('re-requesting a player refreshes matches if enough time has passed', async () => {
        Player.find = jest.fn(async (...args) => {
            return {
                id: 'account.a36bed11ed214557b0ddef9ef1a56d07',
                name: 'BreaK',
                shardId: 'pc-eu',
                lastFetchedAt: moment.utc('2018-01-01 00:00:00'),
            }
        })

        await global.__graphql(`
            query {
                player(shardId: "pc-eu", name: "BreaK") {
                    id
                    name
                    matches {
                        id
                    }
                }
            }
        `)
        expect(Player.createOrUpdate).toHaveBeenCalled()
    })

    test('retrieves match data from the PUBG api', async () => {
        const matchId = await query.one(sql`
            SELECT match_id AS id
            FROM match_players
            WHERE player_id = ${breakAcctId}
            LIMIT 1
        `, { rowMapper: row => row.id })

        expect(await global.__graphql(`
            query {
                match(id: "${matchId}") {
                    id
                    gameMode
                    playedAt
                    mapName
                    durationSeconds
                    telemetryUrl
                    players {
                        id
                        rosterId
                        name
                        stats {
                            DBNOs
                            kills
                        }
                    }
                }
            }
        `)).toMatchObject({
            result: {
                data: {
                    match: {
                        id: matchId,
                        telemetryUrl: expect.any(String),
                    },
                },
            },
        })
    })
})
