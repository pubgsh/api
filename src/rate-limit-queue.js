import Promise from 'bluebird'
import queue from 'async/queue'
import { get, isEmpty } from 'lodash'
import { knownBadPlayers, shouldFetch } from '@/resolvers/Player.js'
import { getIo } from '@/app.js'
import models from '@/models'
import PubgApi from '@/lib/pubg-api.js'

const registeredSockets = {}
if (process.env.NODE_ENV !== 'test') {
    setImmediate(() => {
        const io = getIo()

        io.on('connection', socket => {
            const playerKey = get(socket, 'handshake.query.playerKey')

            if (playerKey) {
                console.log(`Socket for [${playerKey}] connected.`)
                if (!registeredSockets[playerKey]) registeredSockets[playerKey] = []
                registeredSockets[playerKey].push(socket)
            }

            socket.on('disconnect', e => {
                console.log(`Socket for [${playerKey}] disconnected.`)
                registeredSockets[playerKey].splice(registeredSockets[playerKey].indexOf(socket), 1)
            })
        })
    })
}

export const playerFetchQueue = queue(async ({ shardId, name, playerKey }) => {
    try {
        if (PubgApi.rateLimitStats().remaining === 0) {
            const delaySec = PubgApi.rateLimitStats().reset - (Date.now() / 1000) + 2
            console.log(`Blocking ${playerKey} for ${delaySec}`)
            await Promise.delay(1000 * delaySec)
        }

        console.log(`Unblocked ${playerKey}`)

        if (!isEmpty(registeredSockets[playerKey])) {
            const player = await models.Player.find(shardId, { name })

            if (shouldFetch(player, playerKey)) {
                const pubgPlayer = await PubgApi.getPlayer(shardId, name)

                if (!pubgPlayer) {
                    knownBadPlayers.add(playerKey)
                } else {
                    await models.Player.createOrUpdate(pubgPlayer)
                }
            }

            registeredSockets[playerKey].forEach(s => s.send('LOADED'))
        }
    } catch (e) {
        console.log(e, 'UNKNOWN ERROR')
        playerFetchQueue.unshift({ shardId, name, playerKey })
    }
}, 1)

