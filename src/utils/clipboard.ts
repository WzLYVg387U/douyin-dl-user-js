/** 通过 GM 跨域请求获取图片 Blob，作为 fetch 失败时的回退 */
function fetchImageBlobByGM(url: string): Promise<Blob> {
  const xhr = typeof GM_xmlhttpRequest === "function" ? GM_xmlhttpRequest : typeof GM?.xmlHttpRequest === "function" ? GM.xmlHttpRequest : null
  if (!xhr) return Promise.reject(new Error("GreaseMonkey 兼容 XMLHttpRequest 不可用"))
  return new Promise((resolve, reject) => {
    xhr({
      method: "GET",
      url,
      responseType: "blob",
      timeout: 30000,
      onload: (res) => {
        if (res.status >= 200 && res.status < 300 && res.response instanceof Blob) resolve(res.response)
        else reject(new Error(`获取图片失败: HTTP ${res.status}`))
      },
      onerror: () => reject(new Error("获取图片失败")),
      ontimeout: () => reject(new Error("获取图片超时")),
    })
  })
}

/** 获取图片 Blob：优先 fetch，失败时回退 GM 跨域请求 */
export async function fetchImageBlob(url: string): Promise<Blob> {
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`获取图片失败: HTTP ${response.status}`)
    return await response.blob()
  } catch (error) {
    console.warn("[dy-dl] fetch 图片失败，尝试 GM 跨域请求", error)
    return fetchImageBlobByGM(url)
  }
}

/** 将图片统一转为 PNG，浏览器剪贴板图片仅稳定支持 PNG */
async function toPngBlob(blob: Blob): Promise<Blob> {
  if (blob.type === "image/png") return blob
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement("canvas")
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0)
  bitmap.close()
  return new Promise((resolve, reject) => {
    canvas.toBlob((png) => (png ? resolve(png) : reject(new Error("图片转码失败"))), "image/png")
  })
}

/** 复制图片到剪贴板 */
export async function copyImageToClipboard(source: string | Blob): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error("当前浏览器不支持复制图片")
  }
  const blob = typeof source === "string" ? await fetchImageBlob(source) : source
  if (!blob.type.startsWith("image/")) throw new Error("不是有效的图片")
  const png = await toPngBlob(blob)
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })])
}
