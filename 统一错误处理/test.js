import util from "./util.js";

util.registerErrorHandler( e => {
    console.log('error --->', e)
})

util.foo(() => {
    throw new Error('aaa')
})