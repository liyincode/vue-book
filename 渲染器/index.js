function renderer(vnode, container) {
    const el = document.createElement(vnode.tag)
    for (const key in vnode.props) {
        if (/^on/.test(key)) {
            el.addEventListener(key,substr(2).toLowerCase(), vnode.props[key])
        }
    }

    if (typeof vnode.childer === 'string') {
        el.appendChild(document.createTextNode(vnode.children))
    } else if (Array.isArray(vnode.children)) {
        vnode.children.forEach(child => renderer(child, el))
    }

    container.appendChild(el)
}

const vnode = {
    tag: 'div',
    props: {
        onClick: () => alert('hello')
    },
    children: 'click me'
}

renderer(vnode, document.body)