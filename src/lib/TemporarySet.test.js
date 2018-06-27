import Promise from 'bluebird'
import TemporarySet from './TemporarySet.js'

describe('TemporarySet', () => {
    test('it stores a ttl', () => {
        const s = new TemporarySet(100)
        expect(s.ttlMs).toBe(100)
    })

    test('sets and retrieves items', () => {
        const s = new TemporarySet(100)
        s.add(1)
        s.add(2)
        s.add(2)

        expect(s.has(1)).toBe(true)
        expect([...s]).toEqual([1, 2])
    })

    test('clears item after the timeout', async () => {
        expect.assertions(4)
        const s = new TemporarySet(100)

        s.add(1)
        setTimeout(() => s.add(2), 50)
        setTimeout(() => expect([...s]).toEqual([1]), 30)
        setTimeout(() => expect([...s]).toEqual([1, 2]), 70)
        setTimeout(() => expect([...s]).toEqual([2]), 110)
        setTimeout(() => expect([...s]).toEqual([]), 210)

        await Promise.delay(250)
    })
})
