const bucket = new WeakMap();

const data = { foo: 1, bar: 2 }

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

// const effectFn = effect(
//   () => {
//     console.log(obj.foo)
//   },
//   {
//     lazy: true
//     }
// )

// 手动执行
// effectFn()

// const effectFn = effect(
//   () => obj.foo + obj.bar,
//   { lazy: true }
// )
//
// const value = effectFn()

function computed(getter) {
  let value
  let dirty = true

  const effectFn = effect(getter, {
    lazy: true
  })

  const obj = {
    get value() {
      console.log('get value', dirty)
      if (dirty) {
        value = effectFn()
        dirty = false
      }
      return value
    }
  }

  return obj
}


const sumRes = computed(() => obj.foo + obj.bar)

// 3
console.log(sumRes.value)
obj.foo++
// 再次访问，得到的结果还是 3
// 是因为上面第一次访问时，把 dirty = false，所以一直返回的缓存的 value
console.log(sumRes.value)





// effect(() => {
//   console.log(99)
//   obj.foo++
// })
