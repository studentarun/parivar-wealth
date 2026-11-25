/** Shrink a phone photo before upload (keeps storage well inside the free 1 GB). */
export async function compressImage(file: File, maxSide = 1600, quality = 0.72): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image()
      i.onload = () => res(i)
      i.onerror = rej
      i.src = url
    })
    const s = Math.min(1, maxSide / Math.max(img.width, img.height))
    const c = document.createElement('canvas')
    c.width = Math.round(img.width * s)
    c.height = Math.round(img.height * s)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/jpeg', quality))
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** "https://maps.google.com/?q=28.6,77.2" or ".../@28.6,77.2,15z" → coordinates */
export function parseMapLink(s: string): { lat: number; lng: number } | null {
  const m = s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || s.match(/[?&](?:q|query|ll)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/) || s.match(/^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$/)
  return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null
}
