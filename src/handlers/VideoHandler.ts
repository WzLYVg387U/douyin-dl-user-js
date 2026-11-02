import { copyImageToClipboard, fetchImageBlob } from "../utils/clipboard"
import { normalizeFilename } from "../utils/string"
import { getDouyinPlayer, readPlayerVideoElement } from "./PlayerAdapter"

/**
 * 和视频相关的操作，比如截图当前视频帧、复制当前图文图片
 */
export class VideoHandler {
  /** 获取当前可见的视频元素 */
  private getVideoElement(): HTMLVideoElement | null {
    return readPlayerVideoElement(getDouyinPlayer())
  }

  /** 判断视频元素是否真的可截帧（图文页会存在隐藏的音频 video） */
  private isUsableVideo(video: HTMLVideoElement | null): video is HTMLVideoElement {
    if (!video) return false
    if (video.videoWidth <= 0 || video.videoHeight <= 0) return false
    if (video.readyState < 2) return false
    if (getComputedStyle(video).visibility === "hidden") return false
    const rect = video.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return false
    return rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth
  }

  /** 当前画面统一出口：视频帧或图文当前图片 */
  async getCurrentFrame(): Promise<Blob | null> {
    const video = this.getVideoElement()
    if (this.isUsableVideo(video)) return this.captureVideoFrame(video)

    const imageUrl = this.getCurrentImageUrl()
    if (!imageUrl) return null
    try {
      return await fetchImageBlob(imageUrl)
    } catch (e) {
      console.error("[dy-dl]获取当前图片失败", e)
      return null
    }
  }

  /** 截取视频当前帧为 PNG */
  private async captureVideoFrame(video: HTMLVideoElement): Promise<Blob | null> {
    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) return null
    ctx.drawImage(video, 0, 0)
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/png")
    })
  }

  /** 获取当前显示图片的 URL：取唯一落在播放器容器内的图文图片 */
  private getCurrentImageUrl(): string | null {
    const selector = /^\/(?:note|video)\//.test(location.pathname)
      ? '[data-e2e="player-container"]'
      : '[data-e2e="feed-active-video"]'
    const container = document.querySelector<HTMLElement>(selector)
    if (!container) return null

    const bounds = container.getBoundingClientRect()
    const images = container.querySelectorAll<HTMLImageElement>(":scope .dySwiperSlide img")

    for (const img of images) {
      const rect = img.getBoundingClientRect()
      if (rect.right <= bounds.left || rect.left >= bounds.right) continue
      if (getComputedStyle(img).filter.includes("blur")) continue
      return img.currentSrc || img.src || null
    }
    return null
  }

  /** 根据 Blob 类型推导文件扩展名 */
  static getExtension(type: string): string {
    if (type === "image/jpeg") return "jpg"
    if (!type.startsWith("image/")) return "png"
    const ext = type.split("/")[1]?.toLowerCase()
    if (!ext || !/^[a-z0-9]+$/.test(ext)) return "png"
    return ext
  }

  /** 复制当前画面到剪贴板 */
  async copy_current_frame() {
    const blob = await this.getCurrentFrame()
    if (!blob) {
      alert("未找到可复制的画面")
      return
    }
    try {
      await copyImageToClipboard(blob)
    } catch (e) {
      console.error("复制帧失败(已显示图像):", e)
      this.showImageFallback(blob)
    }
  }

  /** 复制失败时展示图片，点击关闭 */
  private showImageFallback(blob: Blob) {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.src = url
    Object.assign(img.style, {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%,-50%)",
      zIndex: 999999,
      maxWidth: "90vw",
      maxHeight: "90vh",
    })
    img.onclick = () => {
      img.remove()
      URL.revokeObjectURL(url)
    }
    document.body.appendChild(img)
  }

  /** 下载当前画面 */
  async download_current_frame() {
    const blob = await this.getCurrentFrame()
    if (!blob) {
      alert("未找到可下载的画面")
      return
    }
    const ext = VideoHandler.getExtension(blob.type)
    const link = document.createElement("a")
    link.download = normalizeFilename("frame_" + Date.now() + "." + ext)
    link.href = URL.createObjectURL(blob)
    link.click()
    URL.revokeObjectURL(link.href)
  }
}
