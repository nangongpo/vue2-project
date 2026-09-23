function easeInOutQuad(t, b, c, d) {
  t /= d / 2
  if (t < 1) {
    return c / 2 * t * t + b
  }
  t--
  return -c / 2 * (t * (t - 2) - 1) + b
}

// requestAnimationFrame for Smart Animating http://goo.gl/sx5sts
var requestAnimFrame = (function() {
  return window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || function(callback) { window.setTimeout(callback, 1000 / 60) }
})()

/**
 * @param {number} amount
 * @param {HTMLElement=} container
 */
function move(amount, container) {
  if (container) {
    container.scrollTop = amount
    return
  }

  document.documentElement.scrollTop = amount
  document.body.parentNode.scrollTop = amount
  document.body.scrollTop = amount
}

/**
 * @param {HTMLElement=} container
 */
function position(container) {
  if (container) {
    return container.scrollTop
  }

  return document.documentElement.scrollTop || document.body.parentNode.scrollTop || document.body.scrollTop
}

/**
 * @param {number} to
 * @param {number=} duration
 * @param {Function|Object=} options
 */
export function scrollTo(to, duration, options) {
  var callback
  var container

  if (typeof options === 'function') {
    callback = options
  } else {
    options = options || {}
    callback = options.callback
    container = options.container
  }

  var start = position(container)
  var change = to - start
  var increment = 20
  var currentTime = 0

  duration = (typeof (duration) === 'undefined') ? 500 : duration

  var animateScroll = function() {
    // increment the time
    currentTime += increment
    // find the value with the quadratic in-out easing function
    var val = easeInOutQuad(currentTime, start, change, duration)
    // move the document.body
    move(val, container)
    // do the animation unless its over
    if (currentTime < duration) {
      requestAnimFrame(animateScroll)
    } else {
      if (callback && typeof (callback) === 'function') {
        // the animation is done so lets callback
        callback()
      }
    }
  }

  animateScroll()
}
