import { useRef, useState, useCallback } from 'react'

// Detect best supported MIME type for recording
function getSupportedMimeType(): string {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
  ]
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return ''
}

// Map MIME type to file extension Whisper accepts
function mimeToExtension(mime: string): string {
  if (mime.includes('ogg')) return 'ogg'
  if (mime.includes('mp4')) return 'mp4'
  return 'webm'
}

export function useAudioRecorder() {
  const [recording, setRecording] = useState(false)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startTimeRef = useRef<number>(0)
  const mimeTypeRef = useRef<string>('')

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mimeType = getSupportedMimeType()
    mimeTypeRef.current = mimeType

    const options = mimeType ? { mimeType } : {}
    const mr = new MediaRecorder(stream, options)
    chunksRef.current = []

    // Request data every 250ms so we always get chunks even for short recordings
    mr.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
    }
    mr.start(250)
    mediaRef.current = mr
    startTimeRef.current = Date.now()
    setRecording(true)
  }, [])

  const stop = useCallback((): Promise<{ blob: Blob; duration: number; mimeType: string; ext: string }> => {
    return new Promise((resolve) => {
      const mr = mediaRef.current!
      mr.onstop = () => {
        const mime = mimeTypeRef.current || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type: mime })
        const duration = (Date.now() - startTimeRef.current) / 1000
        mr.stream.getTracks().forEach((t) => t.stop())
        setRecording(false)
        resolve({ blob, duration, mimeType: mime, ext: mimeToExtension(mime) })
      }
      mr.stop()
    })
  }, [])

  return { recording, start, stop }
}
