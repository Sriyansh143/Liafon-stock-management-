'use client'

/**
 * Screenshot sharing utility.
 *
 * Uses html2canvas to capture a DOM element as an image, then opens
 * WhatsApp with the image attached (via the Web Share API on mobile,
 * or a download link on desktop).
 */

import html2canvas from 'html2canvas'

/**
 * Capture a DOM element as a canvas, then convert to a blob.
 */
async function captureElement(element: HTMLElement): Promise<Blob | null> {
  try {
    const canvas = await html2canvas(element, {
      backgroundColor: getComputedStyle(document.body).backgroundColor || '#ffffff',
      scale: 2, // 2x for retina sharpness
      logging: false,
      useCORS: true,
      allowTaint: false,
    })
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/png', 0.95)
    })
  } catch (err) {
    console.error('[screenshot] Capture failed:', err)
    return null
  }
}

/**
 * Share a screenshot of a DOM element via WhatsApp.
 *
 * On mobile (with Web Share API + file support): opens the native
 * share sheet with the image attached — user picks WhatsApp.
 *
 * On desktop (no Web Share API): downloads the image + opens wa.me
 * with a text message prompting the user to attach the image.
 *
 * @param element The DOM element to capture
 * @param caption Text caption to include with the share
 */
export async function shareScreenshot(element: HTMLElement, caption: string): Promise<void> {
  const blob = await captureElement(element)
  if (!blob) {
    // Fallback to text-only sharing
    window.open(`https://wa.me/?text=${encodeURIComponent(caption)}`, '_blank')
    return
  }

  const file = new File([blob], 'liafon-share.png', { type: 'image/png' })

  // Check if Web Share API supports file sharing (mobile)
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        text: caption,
        title: 'Liafon Stock Management',
      })
      return
    } catch (err) {
      // User cancelled or share failed — fall through to download
      console.error('[screenshot] Share failed:', err)
    }
  }

  // Desktop fallback: download the image + open WhatsApp with text.
  // Revoke the object URL after 10s (was 1s) — large screenshots on
  // slow devices can take longer than 1s to start downloading, and
  // revoking too early silently aborts the download.
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'liafon-share.png'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)

  // Open WhatsApp with text (user attaches the downloaded image manually)
  window.open(`https://wa.me/?text=${encodeURIComponent(caption + '\n\n📸 Screenshot downloaded — attach it to this message.')}`, '_blank')
}

/**
 * Share a screenshot to WhatsApp Status (mobile only).
 * On desktop, downloads the image instead.
 */
export async function shareToStatus(element: HTMLElement, caption: string): Promise<void> {
  const blob = await captureElement(element)
  if (!blob) {
    window.open(`https://wa.me/?text=${encodeURIComponent(caption)}`, '_blank')
    return
  }

  const file = new File([blob], 'liafon-status.png', { type: 'image/png' })

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        text: caption,
        title: 'Share to Status',
      })
      return
    } catch {
      // fall through
    }
  }

  // Desktop fallback
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'liafon-status.png'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
