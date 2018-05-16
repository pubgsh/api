import axios from 'axios'
import { get } from 'lodash'

export default function PubgApi(apiKey) {
    async function apiGet(path, shardId = 'pc-na') {
        const res = await axios({
            method: 'get',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                Accept: 'application/vnd.api+json',
            },
            url: `https://api.playbattlegrounds.com/shards/${shardId}/${path}`,
        })

        return res.data
    }

    return {
        async getPlayer(shardId, name) {
            try {
                const { data } = await apiGet(`players?filter[playerNames]=${name}`, shardId)
                return data.find(d => d.attributes.name.toLowerCase() === name.toLowerCase())
            } catch (e) {
                if (get(e, 'response.status') === 404) {
                    return null
                }

                throw e
            }
        },

        async getMatch(id) {
            const match = await apiGet(`matches/${id}`)
            return match
        },

        async getMatchTelemetry(telemetryUrl) {
            const telemetry = await axios.get(telemetryUrl)
            return telemetry
        },
    }
}
