/**
 * Browser-side YOLOv8-n (int8) for detecting phone/laptop/book in the candidate's frame.
 *
 * - Loads the ONNX model lazily on first use from the CDN.
 * - Samples 1 frame per second (cheap on CPU; we only care about "did a phone appear").
 * - Emits hits through onHit(); the AntiCheatTracker aggregates them.
 *
 * Model: yolov8n quantized to int8 (~6 MB).
 * Class ids used: 63 laptop, 67 cell phone, 73 book.
 *
 * Auto-disables on low-concurrency hardware (< 4 logical cores).
 */

import type { ObjectHit } from './antiCheat'

const MODEL_URL =
  'https://huggingface.co/Xenova/yolov8n/resolve/main/onnx/model_quantized.onnx'

const COCO_CLASSES_OF_INTEREST: Record<number, ObjectHit['label']> = {
  63: 'laptop',
  67: 'cell phone',
  73: 'book',
}

const INPUT_SIZE = 640
const CONF_THRESHOLD = 0.5
const IOU_THRESHOLD = 0.45

type OrtModule = typeof import('onnxruntime-web')
type InferenceSession = Awaited<ReturnType<OrtModule['InferenceSession']['create']>>

export class YoloRunner {
  private session: InferenceSession | null = null
  private ort: OrtModule | null = null
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D | null
  private running = false
  private loopTimer: ReturnType<typeof setInterval> | null = null
  private loadingPromise: Promise<void> | null = null

  constructor(private onHit: (hits: ObjectHit[]) => void) {
    this.canvas = document.createElement('canvas')
    this.canvas.width = INPUT_SIZE
    this.canvas.height = INPUT_SIZE
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })
  }

  /** Optional capability check — returns false on low-end machines. */
  static isSupported(): boolean {
    const cores = navigator.hardwareConcurrency ?? 2
    return cores >= 4
  }

  async start(video: HTMLVideoElement) {
    if (this.running) return
    this.running = true

    // Kick off model load (non-blocking for the loop start)
    this.loadingPromise = this.load().catch(() => {
      this.running = false
    })

    // 1 fps sampling loop
    this.loopTimer = setInterval(async () => {
      if (!this.session) await this.loadingPromise
      if (!this.session || !this.running) return
      if (video.readyState < 2) return
      try {
        const hits = await this.detect(video)
        this.onHit(hits)
      } catch {
        // transient inference failures are ignored
      }
    }, 1000)
  }

  stop() {
    this.running = false
    if (this.loopTimer) clearInterval(this.loopTimer)
    this.loopTimer = null
  }

  private async load() {
    // Dynamic import so the WASM binaries only download when we actually need them
    const ort = await import('onnxruntime-web')
    this.ort = ort
    // Keep the WASM artefacts on the jsdelivr CDN to avoid shipping them with Vite
    ort.env.wasm.wasmPaths =
      'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/'
    ort.env.wasm.numThreads = 1

    this.session = await ort.InferenceSession.create(MODEL_URL, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    })
  }

  private async detect(video: HTMLVideoElement): Promise<ObjectHit[]> {
    if (!this.ctx || !this.session || !this.ort) return []

    // Letterbox — draw the video frame into the 640×640 canvas, then grab pixels.
    const vw = video.videoWidth
    const vh = video.videoHeight
    if (!vw || !vh) return []
    const scale = Math.min(INPUT_SIZE / vw, INPUT_SIZE / vh)
    const nw = Math.round(vw * scale)
    const nh = Math.round(vh * scale)
    const dx = Math.floor((INPUT_SIZE - nw) / 2)
    const dy = Math.floor((INPUT_SIZE - nh) / 2)

    this.ctx.fillStyle = '#727272' // 0.5 grey — standard YOLO pad
    this.ctx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE)
    this.ctx.drawImage(video, dx, dy, nw, nh)
    const { data } = this.ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE)

    // HWC→CHW + normalize 0..1
    const tensor = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE)
    const planeSize = INPUT_SIZE * INPUT_SIZE
    for (let i = 0; i < planeSize; i++) {
      tensor[i] = data[i * 4] / 255
      tensor[planeSize + i] = data[i * 4 + 1] / 255
      tensor[2 * planeSize + i] = data[i * 4 + 2] / 255
    }
    const inputTensor = new this.ort.Tensor('float32', tensor, [1, 3, INPUT_SIZE, INPUT_SIZE])

    const outputs = await this.session.run({ images: inputTensor })
    const outKey = Object.keys(outputs)[0]
    const out = outputs[outKey]
    const dims = out.dims as number[] // [1, 84, 8400] for YOLOv8
    const dataArr = out.data as Float32Array

    const boxes: { cls: number; conf: number }[] = []
    const numPreds = dims[2]
    const numVals = dims[1] // 84 = 4 + 80 classes
    // data layout: [xc, yc, w, h, c0, c1, ..., c79]  — transposed so we index channel-first.
    for (let p = 0; p < numPreds; p++) {
      // Find max class among COCO_CLASSES_OF_INTEREST only (cheap filter)
      let bestCls = -1
      let bestScore = 0
      for (const cls of [63, 67, 73]) {
        const s = dataArr[(4 + cls) * numPreds + p]
        if (s > bestScore) {
          bestScore = s
          bestCls = cls
        }
      }
      if (bestScore >= CONF_THRESHOLD && bestCls >= 0) {
        boxes.push({ cls: bestCls, conf: bestScore })
      }
    }

    // NMS would go here if we wanted bounding boxes — but for the antiCheat signal
    // we only care "is there a confident detection of class X this second?". Skip NMS.
    // Collapse to per-class best confidence:
    const best: Partial<Record<number, number>> = {}
    for (const b of boxes) {
      if (!best[b.cls] || b.conf > best[b.cls]!) best[b.cls] = b.conf
    }

    const hits: ObjectHit[] = []
    const now = Date.now()
    for (const clsKey of Object.keys(best)) {
      const cls = Number(clsKey)
      const label = COCO_CLASSES_OF_INTEREST[cls]
      if (!label) continue
      hits.push({ label, confidence: best[cls]!, timestamp: now })
    }
    return hits
  }
}

// Suppress unused-warning for IOU_THRESHOLD until NMS is re-enabled
void IOU_THRESHOLD
