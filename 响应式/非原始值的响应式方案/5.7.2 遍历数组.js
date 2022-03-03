const ITERATE_KEY = Symbol()

const bucket = new WeakMap();

function createReactive(obj, isShallow = false, isReadonly = false) {
    return new Proxy(obj, {
        get(target, key, receiver) {
            // 代理对象可通过 raw 属性访问原始数据
            if (key === 'raw') {
                return target
            }

            // 如果是只读的，意味着任何方式都无法修改它，所以没必要建立响应式联系
            if (!isReadonly && typeof key !== 'symbol') {
                track(target, key)
            }

            const res = Reflect.get(target, key, receiver)

            if (isShallow) {
                return res
            }

            // 如果这个属性的值是对象，就开始递归代理它
            if (typeof res === 'object' && res !== null) {
                // 如果数据为只读，对值进行递归包装只读
                return isReadonly ? readonly(res) : reactive(res)
            }

            return res
        },

        set(target, key, newVal, receiver) {
            // 只读无法修改值，如果是只读的，打印警告信息
            if (isReadonly) {
                console.warn(`属性 ${key} 是只读的`)
                return true
            }

            const oldVal = target[key]
            // 判断这个属性是不是已经在这个对象了
            const type = Array.isArray(target)
                // 如果代理目标是数组，则检查被设置的索引值是否小于数组长度
                ? Number(key) < target.length ? 'SET' : 'ADD'
                : Object.prototype.hasOwnProperty.call(target, key) ? 'SET' : 'ADD'

            const res = Reflect.set(target, key, newVal, receiver)

            // receiver 是 target 的代理对象
            if (target === receiver.raw) {
                // 比较新值和旧值，只有当它们不全等，并且都不是 NaN 的时候才触发相应
                if (oldVal !== newVal && (oldVal === oldVal || newVal === newVal)) {
                    trigger(target, key, type, newVal)
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
            // 如果 target 是数组，则使用 length 属性作为 key 建立响应
            track(target, Array.isArray(target) ? 'length' : ITERATE_KEY)
            return Reflect.ownKeys(target)
        },

        // 删除属性时，调用 deleteProperty 拦截函数进行依赖收集
        deleteProperty(target, key) {
            // 只读属性，不可以删除
            if (isReadonly) {
                console.warn(`属性 ${key} 是只读的`)
                return true
            }

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

function reactive(obj) {
    return createReactive(obj)
}

function shallowReactive(obj) {
    return createReactive(obj, true)
}

function readonly(obj) {
    return createReactive(obj, false, true)
}

function shallowReadonly(obj) {
    return createReactive(obj, true, true)
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

function trigger(target, key, type, newVal) {
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

    // 当操作类型为 ADD 并且目标对象是数组时，取出并执行与 length 相关联的副作用函数
    if (type === 'ADD' && Array.isArray(target)) {
        const lengthEffects = depsMap.get('length')
        lengthEffects && lengthEffects.forEach(effectFn => {
            if (effectFn !== activeEffect) {
                effectsToRun.add(effectFn)
            }
        })
    }

    // 如果目标是数组，并且修改了数组的 length 属性
    if (Array.isArray(target) && key === 'length') {
        // 索引大于或等于新的 length 值的元素相关的副作用函数，都要执行
        depsMap.forEach((effects, key) => {
            console.log({key, newVal})
            if (key >= newVal) {
                effects.forEach(effectFn => {
                    if (effectFn !== activeEffect) {
                        effectsToRun.add(effectFn)
                    }
                })
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


const arr = reactive(['foo', 'ccc'])

effect(() => {
    console.log('触发')
    for (const val of arr.values()) {
        console.log(val)
    }
})

// 无论是为数组添加新元素，函数直接修改数组的长度，本质上都是因为修改了数组的 length
// 一旦 length 属性被修改，那么 for...in... 循环对数组的遍历结果也会改变，这种情况下
// 理所应当去触发 for...in... 副作用函数
arr[1] = 'bar'
arr.length = 0
