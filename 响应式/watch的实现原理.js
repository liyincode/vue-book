const data = { foo: 1, bar: 2 }

const bucket = new WeakMap();

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

function watch(source, cb) {
    let getter
    if (typeof source === 'function') {
        getter = source
    } else {
        getter = () => traverse(source)
    }
    effect(
        // 递归读取属性
        () => getter(),
        {
            scheduler() {
                cb()
            }
        }
    )
}

function traverse(value, seen = new Set()) {
    // 递归终止条件
    if (typeof value !== 'object' || value === null | seen.has(value)) return
    // 将数据添加到 seen 中，代表数据已经被读取过了
    seen.add(value)
    // 假设 value 就是一个对象，暂时不考虑 数组
    for (const k in value) {
        traverse(value[k], seen)
    }

    return value
}

watch(
    () => obj.foo,
    () => {
        console.log('数据变化了')
})

// obj.bar++
obj.foo++