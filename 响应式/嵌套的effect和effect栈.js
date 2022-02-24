let activeEffect
const effectStack = []
function effect(fn) {
  const effectFn = () => {
    cleanup(effectFn)
    activeEffect = effectFn
    effectStack.push(effectFn)
    fn()
    effectStack.pop()
    activeEffect = effectStack[effectStack.length - 1]
  }

  effectFn.deps = []
  effectFn()
}

function cleanup(effectFn) {
  for (let i = 0; i < effectFn.deps.length; i++) {
    const deps = effectFn.deps[i]
    deps.delete(effectFn)
  }

  effectFn.deps.length = 0;
}

const bucket = new WeakMap();

const data = {foo: true, bar: true}

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

  const effectsToRun = new Set(effects)
  effectsToRun.forEach(effectFn => effectFn())
}

let temp1
let temp2
effect(function effectFn1() {
  console.log('effectFn1 执行')

  effect(function effectFn() {
    console.log('effectFn2 执行')
    temp2 = obj.bar
  })
  temp1 = obj.foo
})

console.log('bucket', bucket)
setTimeout(() => {
  obj.bar = false
}, 1000)
