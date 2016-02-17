export function getEmPixelSize(node) {
  return new Number(getComputedStyle(node, "").fontSize.match(/(\d*(\.\d*)?)px/)[1])
}
