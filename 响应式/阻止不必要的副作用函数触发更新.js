let activeEffect
function effect(fn) {
    const effectFn = () => {
        // 每次副作用函数执行前，先把它从所有与之关联的依赖集合中删除
        cleanup(effectFn)
        // 将副作用函数复制给 activeEffect
        activeEffect = effectFn
        fn()
    }

    effectFn.deps = []
    effectFn()
}

function cleanup(effectFn) {
    for (let i = 0; i < effectFn.deps.length; i++) {
        const deps = effectFn.deps[i]
        deps.delete(effectFn)
    }

    effectFn.deps.length = 0
}

const bucket = new WeakMap()

const data = { ok: true, text: 'hello world'}

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

    // 避免无限循环
    const effectsToRun = new Set(effects)
    effectsToRun.forEach(effectFn => effectFn())
    // 这里会导致无限循环执行，原因是执行副作用函数时边 cleanup 清除，执行副作用函数导致重新依赖收集到里面了
    // effects && effects.forEach(fn => fn())
}

effect(function effectFn() {
    const test = obj.ok ? obj.text : 'not'
    console.log(test)
})

// obj.ok = false

// 按照正常逻辑来说，以下代码不会触发副作用函数更新
// obj.text = 'hello vue3'