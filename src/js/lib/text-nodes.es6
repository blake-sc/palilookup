// # Plugins
// `eachText` will call `callback` for the text value of every text node
// within the collection. The text value will be set to the return value
// of the callback, unless that value is `undefined`. eachText calls
// *callback* on text in document order.
export function eachText(elements, callback) {
    function iterNodes(node) {
        if (node.nodeType == 3) {
            var result = callback(node.nodeValue, node);
            if (result !== undefined) {
                node.nodeValue = result;
            }
        } else {
          for (child of node.childNodes) {
            iterNodes(child);
          }
        }
    }
    for (node of elements) {
      iterNodes(node);
    }
    return this
}

// Returns a flattened array of descendent textNodes
// optionally filtered by *filter*, which should return
// true to include an element.
export function textNodes(elements, filter) {
    let result = [];
    function iterNodes(node) {
        if (filter && $.proxy(filter, node)(node) == false) return

        if (node.nodeType == 3) {
            result.push(node);
        } else {
          for (child of [...node.childNodes]) {
            iterNodes(child);
          }
        }
    }
    for (node of [...elements]) {
      iterNodes(node);
    }

    return result
};
