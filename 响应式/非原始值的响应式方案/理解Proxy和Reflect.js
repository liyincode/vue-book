const data = {
    foo: 1,
    get bar() {
        return this.foo
    }
}

const bucket = new WeakMap();

const p = new Proxy(data, {
    get(target, key, receiver) {
        track(target, key)
        return Reflect.get(data, key, receiver)
        // return target[key]
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

    activeEffect.deps.push(deps)
}

function trigger(target, key) {
    const depsMap = bucket.get(target)
    if (!depsMap) return

    const effects = depsMap.get(key)

    const effectsToRun = new Set()
    effects && effects.forEach(effectFn => {
        // 如果 trigger 触发执行的副作用函数与当前正在执行的函数相同，则不触发执行
        if (effectFn !== activeEffect) {
            effectsToRun.add(effectFn)
        }
    })
    effectsToRun.forEach(effectFn => {
        // 如果副作用函数有调用器，就使用调用器来执行副作用函数
        if (effectFn.options.scheduler) {
            effectFn.options.scheduler(effectFn)
        } else {
            effectFn()
        }
    })
}

let activeEffect
const effectStack = []

function effect(fn, options = {}) {
    const effectFn = () => {
        cleanup(effectFn)
        activeEffect = effectFn
        effectStack.push(effectFn)
        const res = fn()
        effectStack.pop()
        activeEffect = effectStack[effectStack.length - 1]
        return res
    }

    // 将 option 挂载到副作用函数上
    effectFn.options = options
    effectFn.deps = []
    if (!options.lazy) {
        effectFn()
    }
    return effectFn
}

function cleanup(effectFn) {
    for (let i = 0; i < effectFn.deps.length; i++) {
        const deps = effectFn.deps[i]
        deps.delete(effectFn)
    }

    effectFn.deps.length = 0;
}

effect(() => {
    console.log(p.bar)
})

// 如果在 proxy 中 return target[key]，这里就不会触发副作用函数，因为 return this.foo 中
// this 指的是原始对象 data

// 如果在 proxy 中使用 Reflect.get(target, key, receiver),就会正常触发副作用函数，因为
// Reflect.get 会指定 this，也就是 receiver，也就是 p 这个代理对象，return this.foo 也就是
// return p.foo 就会再次触发 p 的 get() 方法,foo 就会和富作用函数发生联系
p.foo++