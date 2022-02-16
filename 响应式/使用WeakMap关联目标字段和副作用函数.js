// 存储副作用函数的桶
const bucket = new WeakMap();

// 全局注册副作用函数
let activeEffect

function effect(fn) {
    activeEffect = fn
    fn()
}

const data = { text: 'hello world'}

const obj = new Proxy(data, {
    get(target, key, receiver) {
        if (!activeEffect) return

        // 原始对象与副作用函数相关联 target -> Map
        let depsMap = bucket.get(target)
        if (!depsMap) {
            bucket.set(target, (depsMap = new Map()))
        }

        // 属性与副作用函数相关联 key -> Set
        let deps = depsMap.get(key)
        if (!deps) {
            deps.set(key, (deps = new Set()))
        }
        deps.add(activeEffect)

        return target[key]
    },

    set(target, key, value, receiver) {
        // 设置属性值
        target[key] = value
        // 根据原始对象获取到属性与副作用函数的集合
        const depsMap = bucket.get(target)
        if (!depsMap) return
        // 更具对象属性获取所相关的副作用函数
        const effects = depsMap.get(key)
        // 执行副作用函数
        effects && effects.forEach(fn => fn())
    }
})
