global.__Fixture(__filename, { mock: true })

describe('model :: Player and Match', () => {
    beforeAll(global.__setupTestEnv)
    afterAll(global.__teardownTestEnv)

    test('retrieves new players from the PUBG api', async () => {
        expect(await global.__graphql(`
            query {
                player(name: "BOT_Andre") {
                    id
                    name
                    matches {
                        id
                    }
                }
            }
        `)).toMatchSnapshot()
    })

    test('retrieves match data from the PUBG api', async () => {
        expect(await global.__graphql(`
            query {
                match(id: "6292a2b4-35aa-491d-9ea1-5add90105032") {
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
                        stats
                    }
                }
            }
        `)).toMatchSnapshot()
    })
})
