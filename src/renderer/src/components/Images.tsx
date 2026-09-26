import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'

export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/gif,image/webp'
const ACCEPTED = IMAGE_ACCEPT.split(',')

/** An image in the task form: `data` is set for new ones, `src` is what the thumbnail shows. */
export interface DraftImage {
  name: string
  src: string
  data?: string
}

/** Reads pasted, dropped or picked image files as data URLs; other files are ignored. */
export async function readImages(files: Iterable<File>): Promise<DraftImage[]> {
  const list = [...files].filter((f) => ACCEPTED.includes(f.type))
  return Promise.all(
    list.map(
      (f) =>
        new Promise<DraftImage>((resolve, reject) => {
          const r = new FileReader()
          r.onload = () => resolve({ name: f.name || 'image', src: String(r.result), data: String(r.result) })
          r.onerror = () => reject(r.error)
          r.readAsDataURL(f)
        })
    )
  )
}

/** Thumbnails that open full size on click; removable when `onRemove` is given. */
export function Thumbs({ images, onRemove }: { images: DraftImage[]; onRemove?: (index: number) => void }): ReactNode {
  const { t } = useTranslation()
  const [open, setOpen] = useState<number | null>(null)
  if (!images.length) return null
  return (
    <>
      <div className="thumbs">
        {images.map((img, i) => (
          <div key={img.name + i} className="thumb">
            <button type="button" className="thumb-img" onClick={() => setOpen(i)} title={img.name}>
              <img src={img.src} alt={img.name} />
            </button>
            {onRemove && (
              <button type="button" className="thumb-x" aria-label={t('img_remove')} title={t('img_remove')} onClick={() => onRemove(i)}>
                <X />
              </button>
            )}
          </div>
        ))}
      </div>
      {open !== null && images[open] && <Lightbox img={images[open]} onClose={() => setOpen(null)} />}
    </>
  )
}

function Lightbox({ img, onClose }: { img: DraftImage; onClose: () => void }): ReactNode {
  useEffect(() => {
    // Capture phase: Escape closes only the picture, not the dialog under it.
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])
  return (
    <div className="modal lightbox-bg" onMouseDown={onClose}>
      <img className="lightbox" src={img.src} alt={img.name} />
    </div>
  )
}
