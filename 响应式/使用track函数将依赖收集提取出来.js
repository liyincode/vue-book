let activeEffect
function effect(fn) {
    activeEffect = fn
    fn()
}

const bucket = new WeakMap()

const data = { text: 'hello world'}

const obj = new Proxy(data, {
    get(target, key, receiver) {
        track(target, key)

        return target[key]
    },

    set(target, key, value, receiver) {

        target[key] = value
        trigger(target, key)
    }
})

function track(target, key) {
    if (!activeEffect) return

    let depsMap = bucket.get(target)
    if (!depsMap) {
        bucket.set(target, (depsMap = new Map()))
    }

    let deps = depsMap.get(key)
    if (!deps) {
        depsMap.set(key, (deps = new Set()))
    }
    deps.add(activeEffect)
}

function trigger(target, key) {
    const depsMap = bucket.get(target)
    if (!depsMap) return
    const effects = depsMap.get(key)
    effects && effects.forEach(fn => fn())
}