const obj = {
    foo: 1,
    bar: 1
}
const ITERATE_KEY = Symbol()

const bucket = new WeakMap();

const p = new Proxy(obj, {
    get(target, key, receiver) {
        track(target, key)
        return Reflect.get(target, key, receiver)
    },

    set(target, key, newVal, receiver) {
        const oldVal = target[key]
        // 判断这个属性是不是已经在这个对象了
        const type = Object.prototype.hasOwnProperty.call(target, key) ? 'SET' : 'ADD'
        const res = Reflect.set(target, key, newVal, receiver)

        // 比较新值和旧值，只有当它们不全等，并且都不是 NaN 的时候才触发相应
        if (oldVal !== newVal && (oldVal === oldVal || newVal === newVal)) {
            trigger(target, key, type)
        }
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
    },

    // 删除属性时，调用 deleteProperty 拦截函数进行依赖收集
    deleteProperty(target, key) {
        // 检查被操作的属性是否是对象自己的属性
        const hadKey = Object.prototype.hasOwnProperty.call(target, key)
        const res = Reflect.deleteProperty(target, key)

        if (res && hadKey) {
            // 只有当被删除的属性是对象自己的属性并且成功删除时，才会触发更新
            trigger(target, key, 'DELETE')
        }

        return res
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

function trigger(target, key, type) {
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

    // 只有当操作类型为 'ADD' 时，才会触发 ITERATE_KEY 相关联的副作用函数的更新
    if (type === 'ADD' || type === 'DELETE') {
        // 取得 ITERATE_KEY 相关联的副作用函数
        const iterateEffects = depsMap.get(ITERATE_KEY)

        // ITERATE_KEY 相关联的函数也添加到 effectsToRun 中
        iterateEffects && iterateEffects.forEach(effectFn => {
            // 如果 trigger 触发执行的副作用函数与当前正在执行的函数相同，则不触发执行
            if (effectFn !== activeEffect) {
                effectsToRun.add(effectFn)
            }
        })
    }

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
    console.log(p.foo)
})


// 1 当值没有变化时，不需要触发副作用更新
p.foo = 2