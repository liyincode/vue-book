const bucket = new Set()

const data = { text: 'hello world'}

const obj = new Proxy(data, {
    get(target, p, receiver) {
        bucket.add(effect)
        return target[p]
    },

    set(target, p, value, receiver) {
        target[p] = value
        bucket.forEach(fn => fn())
        return true
    }
})

function effect() {
    console.log(obj.text)
    // document.body.innerText = obj.text
}
effect()
setTimeout(() => {
    obj.text = 'hello vue3'
}, 1000)