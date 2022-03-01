const ITERATE_KEY = Symbol()

const bucket = new WeakMap();

function reactive(obj) {
    return new Proxy(obj, {
        get(target, key, receiver) {
            // 代理对象可通过 raw 属性访问原始数据
            if (key === 'raw') {
                return target
            }

            track(target, key)
            return Reflect.get(target, key, receiver)
        },

        set(target, key, newVal, receiver) {
            const oldVal = target[key]
            // 判断这个属性是不是已经在这个对象了
            const type = Object.prototype.hasOwnProperty.call(target, key) ? 'SET' : 'ADD'
            const res = Reflect.set(target, key, newVal, receiver)

            // receiver 是 target 的代理对象
              if (target === receiver.raw) {
                // 比较新值和旧值，只有当它们不全等，并且都不是 NaN 的时候才触发相应
                if (oldVal !== newVal && (oldVal === oldVal || newVal === newVal)) {
                    trigger(target, key, type)
                }
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
}

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



const obj = {}
const proto = { bar: 1 }
const child = reactive(obj)
const parent = reactive(proto)
Object.setPrototypeOf(child, parent)

child.raw = obj
parent.raw = proto

effect(() => {
    console.log(child.bar)
})

// 会触发两次副作用函数调用，以下是原因
// 当 child.bar 时，child 本身是没有 bar 这个属性的，但根据 ECMA 规范，如果先 [[Get]] 这个属性发现没有，
// 然后会获取他的原型再寻找，这个时候（{} -> bar -> 副作用函数建立了联系），它的原型就是 parent
// 也就是获取到 parent.bar 的值，这个时候因为 parent 也是 Proxy 代理对象，parent.bar 时，
// 这里会进行依赖收集 parent -> bar -> 副作用函数

child.bar = 2
// 当 child.bar = 2 [[Set]] 时，如果设置的属性不存在，就会获取原型，并调用原型的 [[Set]] 方法，和上面
// 一样，set 拦截函数会被执行两次


// 解决上述问题的方式
// set(target, key, value, receiver)
// 当 parent 的 set 拦截函数执行时，target 是原始对象 proto，receiver 是代理对象 child
// 当 child 的 set 拦截函数执行时，target 是 obj {}, receiver 还是代理对象 child
// 所以只需要判断 receiver 是 target 的代理对象就行，即 child 是 obj 的代理对象
// 需要新增 raw 属性处理