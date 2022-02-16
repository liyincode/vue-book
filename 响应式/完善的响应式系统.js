// 全局变量存储被注册的副作用函数
let activeEffect
// 注册副作用函数
function effect(fn) {
    activeEffect = fn
    fn()
}

const data = { text: 'hello world'}



const bucket = new Set()
const obj = new Proxy(data, {
    get(target, p, receiver) {
        if (activeEffect) {
            bucket.add(activeEffect)
        }
        return target[p]
    },
    set(target, p, value, receiver) {
        target[p] = value
        bucket.forEach(fn => fn())
        return true
    }
})

effect(() => {
    console.log('触发副作用函数', obj.text)
})


setTimeout(() => {
    obj.noExist = 'hello vue3'
}, 1000)