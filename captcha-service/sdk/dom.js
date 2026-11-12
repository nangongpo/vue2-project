import { CAPTCHA_CANVAS } from './constants.js'
const styleId = 'captcha-sdk-style'
export function installStyle() {
  if (typeof document === 'undefined') return
  const node = document.getElementById(styleId) || document.createElement('style')
  node.id = styleId
  node.textContent =
    '.tac{width:100%;font:14px Arial,sans-serif;color:#334155;user-select:none}.tac__panel{background:#fff;border:0;border-radius:6px;padding:12px 16px;box-sizing:border-box}.tac__head{height:48px;flex-shrink:0;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;margin:0;padding:0 16px;background:#fff;color:#1e293b}.tac__title{font-size:15px;font-weight:600;color:#1e293b}.tac__actions{display:flex;gap:8px}.tac__icon{width:28px;height:28px;padding:0;border:0;background:transparent;color:#64748b;font-size:22px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center}.tac__footer{height:42px;flex-shrink:0;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;padding:0 16px;background:#fff;color:#94a3b8}.tac__footer-actions{display:flex;align-items:center;gap:12px}.tac__footer-button{width:26px;height:26px;padding:0;border:0;background:transparent;color:#64748b;font-size:24px;line-height:0;box-sizing:border-box;flex:0 0 26px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;vertical-align:middle}.tac__vendor{font-size:12px;font-weight:600;letter-spacing:.04em;color:#94a3b8}.tac__canvas{position:relative;width:100%;height:auto;aspect-ratio:3/1;overflow:hidden;background:#141c2e}.tac__background{display:block;width:100%;height:100%;object-fit:fill}.tac__piece{position:absolute;z-index:2;width:44px;height:44px;pointer-events:none}.tac__canvas-refresh{position:absolute;z-index:5;right:8px;top:8px;width:30px;height:30px;padding:0;display:flex;align-items:center;justify-content:center;border:0;border-radius:50%;background:rgba(15,23,42,.55);color:#fff;font-size:18px;line-height:1;cursor:pointer}.tac__track{position:relative;height:42px;margin-top:10px;line-height:42px;background:#f8fafc;border:1px solid #cbd5e1;text-align:center;overflow:hidden}.tac__progress{position:absolute;z-index:1;left:0;top:0;height:100%;width:0;background:#dbeafe}.tac__text{position:relative;z-index:2;color:#64748b}.tac__button{position:absolute;z-index:4;left:0;top:0;width:42px;height:42px;border:1px solid #cbd5e1;background:#fff;color:#64748b;line-height:42px;text-align:center;cursor:grab;box-sizing:border-box;font-size:22px}.tac__button.ok{background:#16a34a;border-color:#16a34a;color:#fff}.tac__message{min-height:20px;margin-top:6px;line-height:20px}.tac__message.error{background:#dc2626;color:#fff}.tac__message.success{background:#16a34a;color:#fff}.tac__grid-instruction,.tac__click-order-instruction{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px}.tac__grid-prompt,.tac__click-order-prompt{font-size:15px;font-weight:600;color:#1e293b}.tac__grid-target{width:40px;height:40px;object-fit:contain;border:0;border-radius:0;background:transparent}.tac__grid{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}.tac__tile{position:relative;height:72px;border:2px solid transparent;border-radius:3px;padding:0;background:#f8fafc;cursor:pointer;overflow:hidden}.tac__tile:hover,.tac__tile:focus-visible{border-color:#93c5fd;outline:none}.tac__tile.selected{border-color:#4b9cff}.tac__tile.selected::after{content:"✓";position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:24px;height:24px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;border:2px solid #fff;border-radius:50%;background:#4b9cff;color:#fff;font-size:15px;line-height:1;font-weight:700;padding:0 0 1px;box-shadow:0 1px 3px rgba(0,0,0,.3)}.tac__tile img{display:block;width:100%;height:100%;object-fit:cover}.tac__grid-footer,.tac__click-order-footer{display:flex;align-items:center;justify-content:space-between;margin-top:6px;color:#64748b;font-size:12px}.tac__grid-actions{display:flex;align-items:center;gap:12px}.tac__grid-help{border:0;background:transparent;color:#64748b;cursor:pointer;font-size:24px;line-height:24px;padding:0;min-width:24px;min-height:24px;display:inline-flex;align-items:center;justify-content:center}.tac__grid-help:last-child{font-size:24px}.tac__grid-help:hover,.tac__grid-help:focus-visible{color:#2563eb}.tac__click-order-sequence{display:flex;gap:8px;align-items:center;flex-shrink:0}.tac__click-order-sequence img{width:30px;height:30px;object-fit:contain}.tac__click-order-board{position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;border-radius:4px;background:#0f172a}.tac__click-order-background{display:block;width:100%;height:100%;object-fit:fill}.tac__click-order-target{position:absolute;z-index:2;border:2px solid transparent;border-radius:8px;background:transparent;cursor:pointer}.tac__click-order-target:hover,.tac__click-order-target:focus-visible{border-color:#93c5fd;outline:none}.tac__click-order-target.selected{border-color:#22c55e;background:rgba(34,197,94,.18)}.tac__click-order-target.selected::after{content:attr(data-order);position:absolute;right:-6px;top:-8px;width:20px;height:20px;border-radius:50%;background:#22c55e;color:#fff;text-align:center;line-height:20px}.tac__click-order-confirm{display:block;width:100%;height:36px;margin-top:10px;border:0;border-radius:4px;background:#4f7cff;color:#fff;font-size:14px;cursor:pointer}.tac__click-order-confirm:disabled{background:#cbd5e1;color:#fff;cursor:not-allowed}.tac__submit{margin-top:12px;width:100%;height:36px;border:0;border-radius:4px;background:#4f7cff;color:#fff}.tac__overlay{position:fixed;z-index:2147483000;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.48)}.tac__dialog{width:376px;height:470px;max-width:none;max-height:none;overflow:hidden;box-sizing:border-box;background:#fff;border-radius:6px}.tac__range{width:100%}'
  node.textContent +=
    '.tac__body{width:fit-content;box-sizing:border-box;padding:0 16px}.tac__body>.tac__panel{position:relative;width:300px;margin:0;padding:0}.tac__canvas,.tac__grid,.tac__click-order-board,.tac__rotate-stage{position:relative;width:300px;height:200px;aspect-ratio:auto;margin-left:auto;margin-right:auto}.tac__tile{height:auto}.tac__rotate-stage{overflow:hidden}.tac__rotate-image{display:block;width:300px;height:200px;object-fit:contain}.tac__header-target{display:block;width:28px;height:28px;flex:0 0 28px;box-sizing:border-box;padding:0;border:0;border-radius:0;background:transparent;object-fit:contain}.tac__click-order-target{box-sizing:border-box;border-radius:0}.tac__range,.tac__submit{width:300px;box-sizing:border-box}.tac__message{position:absolute;bottom:0;left:0;right:0;width:auto;height:20px;min-height:20px;box-sizing:border-box;margin:0;overflow:hidden;padding:0 8px;line-height:20px;text-align:center;}.tac__message.success{background:#16a34a;color:#fff}.tac__message.error{background:#dc2626;color:#fff}.tac__head{height:60px;padding-left:16px;padding-right:16px}.tac__footer{height:64px;padding-left:16px;padding-right:16px}.tac__dialog{width:fit-content;height:auto;max-height:none;overflow:visible}'
  node.textContent +=
    '.tac__body{border:0;margin:0;min-width:0}.tac__body:disabled{opacity:1;pointer-events:none}.tac__simple-slider .tac__message{position:static;margin-top:8px}.tac__button{padding:0}.tac__rotate-stage{display:flex;align-items:center;justify-content:center}.tac__rotate-image{width:170px;height:170px;border-radius:50%}.tac__message--standalone{position:static;padding:0 16px;color:#64748b}'
  node.textContent += `.tac__canvas,.tac__grid,.tac__click-order-board,.tac__rotate-stage{width:${CAPTCHA_CANVAS.width}px;height:${CAPTCHA_CANVAS.height}px;aspect-ratio:auto;box-sizing:border-box}.tac__grid{grid-template-rows:repeat(3,minmax(0,1fr));grid-template-columns:repeat(3,minmax(0,1fr))}.tac__tile{min-width:0;min-height:0}.tac__tile img{height:100%;width:100%}`
  node.textContent +=
    '.tac__dialog{width:318px;height:318px;padding:8px;display:flex;flex-direction:column;overflow:hidden}.tac__dialog>.tac__head{height:44px;flex:0 0 44px;padding:0}.tac__dialog>.tac__body{width:302px;height:218px;flex:0 0 218px;padding:0 1px;overflow:hidden}.tac__dialog>.tac__footer{height:30px;flex:0 0 30px;margin-top:10px;padding:0}.tac__controls{display:flex;align-items:center;justify-content:center;gap:12px;width:300px;height:30px;margin-top:8px;box-sizing:border-box}.tac__controls .tac__track{width:300px;height:30px;box-sizing:border-box;margin:0}.tac__controls .tac__button{height:28px;line-height:26px}.tac__controls .tac__submit,.tac__controls .tac__click-order-confirm{height:30px;margin:0;box-sizing:border-box}.tac__controls--rotate .tac__range{flex:1;min-width:0;width:auto;margin:0}.tac__controls--rotate .tac__submit{width:64px;flex:0 0 64px}.tac__loading-canvas{position:relative;width:300px;height:180px}.tac__loading-canvas .tac__message{position:absolute}'
  node.textContent +=
    '.tac__loading{position:absolute;inset:0;z-index:4;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.92);cursor:wait}.tac__spinner{display:block;width:30px;height:30px;box-sizing:border-box;border:3px solid #dbeafe;border-top-color:#3b82f6;border-radius:50%;animation:tac-spin .75s linear infinite}.tac__message{z-index:5}@keyframes tac-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.tac__spinner{animation-duration:2s}}'
  node.textContent += '.tac__footer-button svg{display:block;width:20px;height:20px;flex:none;pointer-events:none}'
  node.textContent +=
    '.tac__puzzle-slider .tac__track{border:1px solid #e2e8f0;border-radius:6px;background:#f1f5f9;isolation:isolate}.tac__puzzle-slider .tac__progress{background:#dbeafe}.tac__puzzle-slider .tac__slider-hint{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding-left:42px;font:12px/1 Arial,sans-serif;color:#64748b;pointer-events:none;transition:opacity .15s}.tac__puzzle-slider .is-dragging .tac__slider-hint{opacity:0}.tac__puzzle-slider .tac__controls .tac__button{display:flex;align-items:center;justify-content:center;width:42px;height:28px;top:0;padding:0;border:0;border-radius:5px;background:#3b82f6;color:#fff;box-shadow:inset 0 0 0 1px rgba(0,0,0,.06);transition:background .15s,box-shadow .15s;cursor:grab}.tac__puzzle-slider .tac__button svg{display:block;flex:none;pointer-events:none}.tac__puzzle-slider .tac__button:hover{background:#2563eb}.tac__puzzle-slider .tac__button:focus-visible{outline:2px solid #1d4ed8;outline-offset:-3px}.tac__puzzle-slider .is-dragging .tac__button{background:#1d4ed8;box-shadow:inset 0 2px 4px rgba(0,0,0,.16);cursor:grabbing}.tac__puzzle-slider .tac__controls .tac__button.ok{background:#16a34a;cursor:default}'
  node.textContent += '.tac__rotate-stage{isolation:isolate;background:#f3f6fa;background-image:radial-gradient(ellipse at 50% 45%,#fff 0%,#f3f6fa 65%,#eaf0f6 100%)}.tac__rotate-stage::before{content:"";position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:176px;height:176px;box-sizing:border-box;border:1px solid #dce5ef;border-radius:50%;background:rgba(255,255,255,.65);box-shadow:0 2px 8px rgba(51,65,85,.06),inset 0 0 0 3px rgba(255,255,255,.5);pointer-events:none}.tac__rotate-image{position:relative;z-index:1}'
  node.textContent += '.tac__loading-canvas .tac__loading{flex-direction:column;gap:10px}.tac__loading-canvas .tac__loading>.tac__message{position:static;inset:auto;width:100%;height:20px;flex:0 0 20px;margin:0;padding:0}'
  if (!node.isConnected) document.head.appendChild(node)
}

export function createElement(tag, className, text) {
  const node = document.createElement(tag)
  node.className = className || ''
  if (text !== undefined) node.textContent = text
  return node
}

// SVG avoids font-specific baselines and side bearings in footer glyphs.
export function createFooterButton(action) {
  const button = createElement('button', 'tac__footer-button')
  button.type = 'button'
  button.setAttribute('aria-label', action === 'refresh' ? '刷新验证码' : '关闭验证')
  const namespace = 'http://www.w3.org/2000/svg'
  const icon = document.createElementNS(namespace, 'svg')
  icon.setAttribute('viewBox', '0 0 24 24')
  icon.setAttribute('width', '20')
  icon.setAttribute('height', '20')
  icon.setAttribute('fill', 'none')
  icon.setAttribute('stroke', 'currentColor')
  icon.setAttribute('stroke-width', '1.8')
  icon.setAttribute('stroke-linecap', 'round')
  icon.setAttribute('stroke-linejoin', 'round')
  icon.setAttribute('aria-hidden', 'true')
  icon.setAttribute('focusable', 'false')
  const path = document.createElementNS(namespace, 'path')
  path.setAttribute(
    'd',
    action === 'refresh' ? 'M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8 M21 3v5h-5' : 'M6 6l12 12M18 6L6 18'
  )
  icon.appendChild(path)
  button.appendChild(icon)
  return button
}

export function createScope() {
  const listeners = new Set()
  return {
    cleanup(callback) {
      listeners.add(callback)
    },
    bind(node, event, handler, options) {
      node.addEventListener(event, handler, options)
      const remove = () => node.removeEventListener(event, handler, options)
      listeners.add(remove)
      return remove
    },
    clear() {
      listeners.forEach((remove) => remove())
      listeners.clear()
    },
  }
}

export function pointer(event) {
  const source = event.touches?.[0] || event.changedTouches?.[0] || event
  return { x: source.clientX, y: source.clientY }
}

// Refresh the injected stylesheet when Vite replaces this module.
if (import.meta.hot) {
  import.meta.hot.accept((updated) => updated?.installStyle())
}
