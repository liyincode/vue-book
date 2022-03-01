const obj = {
    foo: 1
}
const ITERATE_KEY = Symbol()

const bucket = new WeakMap();

const p = new Proxy(obj, {
    get(target, key, receiver) {
        track(target, key)
        return Reflect.get(target, key, receiver)
    },

    set(target, key, value, receiver) {
        const res = Reflect.set(target, key, value, receiver)
        trigger(target, key)
        return res
    },

    // 如果 in 操作符读取，使用 has 拦截函数依赖收集建立联系
    has(target, key) {
        track(target, key)
        return Reflect.has(target, key)
    },

    // 如果 for...in... 读取，使用 ownKeys 拦截函数依赖收集
    ownKeys(target) {
        track(target, ITERATE_KEY)
        return Reflect.ownKeys(target)
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
    // 取得 ITERATE_KEY 相关联的副作用函数
    const iterateEffects = depsMap.get(ITERATE_KEY)

    const effectsToRun = new Set()
    effects && effects.forEach(effectFn => {
        // 如果 trigger 触发执行的副作用函数与当前正在执行的函数相同，则不触发执行
        if (effectFn !== activeEffect) {
            effectsToRun.add(effectFn)
        }
    })

    // ITERATE_KEY 相关联的函数也添加到 effectsToRun 中

    iterateEffects && iterateEffects.forEach(effectFn => {
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

/// ///////////////


effect(() => {
    // 'foo' in p
    for (const key in p) {
        console.log(key)
    }
})

// 当我们**修改** foo 的值时，不会触发副作用函数
// 因为是 ITERATE_KEY 与 副作用函数建立的联系，foo 与 副作用函数并没有建立联系
// 所以这里不会触发副作用函数
p.foo++