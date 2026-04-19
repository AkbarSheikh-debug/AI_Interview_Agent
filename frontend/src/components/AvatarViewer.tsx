import { useRef, useEffect, useState, memo, forwardRef, useImperativeHandle, useMemo, useLayoutEffect } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useGLTF, useAnimations, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'

export type AvatarState = 'idle' | 'speaking' | 'listening' | 'thinking'

const STATE_LABELS: Record<AvatarState, string> = {
  idle: 'Ready',
  speaking: 'Speaking…',
  listening: 'Listening…',
  thinking: 'Thinking…',
}

export interface AvatarViewerHandle {
  speakAudio: (audioBuffer: AudioBuffer, text?: string) => void
  stopAudio: () => void
}

interface AvatarViewerProps {
  state: AvatarState
  mouthOpen: number
}

// ── Animation mapping for cool_man.glb ────────────────────────────────────
// Available anims: Pose, salute, sit, shakehand, walking, cough
const STATE_TO_ANIM: Record<AvatarState, string> = {
  idle: 'Pose',
  speaking: 'salute',
  listening: 'Pose',
  thinking: 'walking',
}

// ── Framing approach ──────────────────────────────────────────────────────
// Model "cool_man.glb" is ~1.80 native units tall (feet near y=0, head ~1.79).
// Instead of scaling the model, we keep it at native size and place the camera
// at the head/shoulder level looking slightly downward.  This guarantees that
// the viewport crops at the chest and the head fills the upper portion.
//
// Camera:  position [0, 1.55, 0.85]  → slightly below chin height, close-up
//          lookAt   [0, 1.55, 0]     → straight ahead at upper-chest level
//          fov 30
//
// This gives a visible vertical span of ~0.45m, showing from mid-chest (~1.33)
// to above the head (~1.78).  Shoulders, neck, face, and hair fill the frame.

function CameraRig() {
  useFrame(({ camera }) => {
    camera.lookAt(0, 1.55, 0)
    camera.updateMatrixWorld(true)
  })
  return null
}

function AvatarModel({ state }: { state: AvatarState }) {
  const group = useRef<THREE.Group>(null!)
  const inner = useRef<THREE.Group>(null!)
  const { scene } = useGLTF('/cool_man.glb')
  const clone = useMemo(() => scene.clone(true), [scene])
  void useAnimations // keep import used
  void state
  void STATE_TO_ANIM

  // No scaling — just place the model at origin and let the camera frame it.
  useLayoutEffect(() => {
    if (!inner.current) return
    clone.position.set(0, 0, 0)
    clone.rotation.set(0, 0, 0)
    clone.scale.set(1, 1, 1)
    clone.updateMatrixWorld(true)
  }, [clone])

  // Subtle breathing/bob on idle
  useFrame(({ clock }) => {
    if (group.current) {
      const t = clock.getElapsedTime()
      group.current.position.y = Math.sin(t * 1.2) * 0.005
    }
  })

  return (
    <group ref={group} position={[0, 0, 0]}>
      <group ref={inner}>
        <primitive object={clone} />
      </group>
    </group>
  )
}

const AvatarViewer = forwardRef<AvatarViewerHandle, AvatarViewerProps>(({ state }, ref) => {
  const [error, setError] = useState<string | null>(null)
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)

  useImperativeHandle(ref, () => ({
    speakAudio: (audioBuffer: AudioBuffer) => {
      try {
        // Stop any existing audio
        if (audioSourceRef.current) {
          try { audioSourceRef.current.stop() } catch {}
        }

        if (!audioCtxRef.current) {
          audioCtxRef.current = new AudioContext()
        }
        const ctx = audioCtxRef.current
        const source = ctx.createBufferSource()
        source.buffer = audioBuffer
        source.connect(ctx.destination)
        source.start()
        audioSourceRef.current = source
      } catch (e) {
        console.error('AvatarViewer audio error', e)
      }
    },
    stopAudio: () => {
      if (audioSourceRef.current) {
        try { audioSourceRef.current.stop() } catch {}
        audioSourceRef.current = null
      }
    },
  }))

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioSourceRef.current) {
        try { audioSourceRef.current.stop() } catch {}
      }
      if (audioCtxRef.current) {
        try { audioCtxRef.current.close() } catch {}
      }
    }
  }, [])

  if (error) {
    return (
      <div className="relative w-full h-full flex items-center justify-center"
        style={{ background: 'linear-gradient(160deg, #12142a 0%, #0f1117 55%, #0c0e20 100%)' }}>
        <div className="text-red-400 text-sm text-center px-4">
          <p className="font-semibold">Avatar Error</p>
          <p className="opacity-80 text-xs mt-1">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative w-full h-full"
      style={{ background: 'linear-gradient(160deg, #12142a 0%, #0f1117 55%, #0c0e20 100%)' }}>

      <Canvas
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1.2
        }}
        onError={() => setError('WebGL context lost')}
      >
        {/* Camera at upper-chest height, close up for head+shoulders crop */}
        <PerspectiveCamera makeDefault position={[0, 1.55, 0.85]} fov={30} />
        <CameraRig />

        <ambientLight intensity={0.6} />
        <directionalLight position={[2, 3, 2]} intensity={1.2} castShadow />
        <directionalLight position={[-1, 2, -1]} intensity={0.4} />
        <pointLight position={[0, 2, 3]} intensity={0.5} color="#a5b4fc" />

        <AvatarModel state={state} />
      </Canvas>

      {/* State badge */}
      <div className="absolute bottom-5 left-0 right-0 flex justify-center pointer-events-none z-20">
        <span className="text-xs px-3 py-1 rounded-full font-medium tracking-widest"
          style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.35)', color: '#a5b4fc' }}>
          {STATE_LABELS[state]}
        </span>
      </div>
    </div>
  )
})

// Preload the model
useGLTF.preload('/cool_man.glb')

export default memo(AvatarViewer)
