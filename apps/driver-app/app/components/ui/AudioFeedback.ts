// Audio Feedback using Web Audio API (zero external dependencies)

class AudioManager {
  private ctx: AudioContext | null = null

  private getContext(): AudioContext | null {
    if (typeof window === "undefined") return null
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (AudioCtx) {
        this.ctx = new AudioCtx()
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      void this.ctx.resume()
    }
    return this.ctx
  }

  // Supermarket / Zebra style barcode scan beep (high crisp chirp)
  playScanBeep() {
    try {
      const ctx = this.getContext()
      if (!ctx) return
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = "sine"
      osc.frequency.setValueAtTime(1800, ctx.currentTime)
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.08)
    } catch {
      // Audio not permitted or supported
    }
  }

  // Item Picked blip
  playPickBeep() {
    try {
      const ctx = this.getContext()
      if (!ctx) return
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = "triangle"
      osc.frequency.setValueAtTime(880, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.06)
      gain.gain.setValueAtTime(0.25, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.06)
    } catch {
      // Audio not permitted
    }
  }

  // Success 2-tone chime (e.g. picklist completed, delivery finished)
  playSuccessChime() {
    try {
      const ctx = this.getContext()
      if (!ctx) return
      const now = ctx.currentTime

      const osc1 = ctx.createOscillator()
      const gain1 = ctx.createGain()
      osc1.type = "sine"
      osc1.frequency.setValueAtTime(587.33, now) // D5
      gain1.gain.setValueAtTime(0.25, now)
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15)
      osc1.connect(gain1)
      gain1.connect(ctx.destination)
      osc1.start(now)
      osc1.stop(now + 0.15)

      const osc2 = ctx.createOscillator()
      const gain2 = ctx.createGain()
      osc2.type = "sine"
      osc2.frequency.setValueAtTime(880, now + 0.1) // A5
      gain2.gain.setValueAtTime(0.3, now + 0.1)
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.3)
      osc2.connect(gain2)
      gain2.connect(ctx.destination)
      osc2.start(now + 0.1)
      osc2.stop(now + 0.3)
    } catch {
      // Ignore
    }
  }

  // Low buzz error alert
  playErrorBuzz() {
    try {
      const ctx = this.getContext()
      if (!ctx) return
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = "sawtooth"
      osc.frequency.setValueAtTime(160, ctx.currentTime)
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.2)
    } catch {
      // Ignore
    }
  }
}

export const audioFeedback = new AudioManager()
