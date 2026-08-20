export function isTouchDevice() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false
  }

  return (
    navigator.maxTouchPoints > 0 ||
    window.matchMedia("(any-pointer: coarse)").matches
  )
}
