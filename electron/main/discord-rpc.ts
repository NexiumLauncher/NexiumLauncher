import net from 'node:net'
import os from 'node:os'

const applicationId = '1560857605176557618'

type RichPresence = {
  details: string
  state?: string
  largeImage?: string
  smallImage?: string
  startTimestamp?: number
}

export class DiscordRpcClient {
  private socket: net.Socket | null = null
  private retryTimer: NodeJS.Timeout | null = null
  private enabled = false
  private ready = false
  private buffer = Buffer.alloc(0)
  private desired: RichPresence | null = null
  private pipeIndex = 0

  setEnabled(enabled: boolean) {
    this.enabled = enabled
    if (!enabled) {
      this.clearAndDisconnect()
      return
    }
    this.connect()
  }

  setPresence(presence: RichPresence) {
    this.desired = presence
    if (this.ready) this.sendActivity(presence)
    else if (this.enabled) this.connect()
  }

  clearAndDisconnect() {
    this.enabled = false
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = null
    const socket = this.socket
    this.socket = null
    if (this.ready && socket && !socket.destroyed) {
      const payload = Buffer.from(JSON.stringify({ cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity: null }, nonce: `${Date.now()}` }), 'utf8')
      const header = Buffer.alloc(8)
      header.writeInt32LE(1, 0)
      header.writeInt32LE(payload.length, 4)
      socket.end(Buffer.concat([header, payload]))
    } else {
      socket?.destroy()
    }
    this.ready = false
  }

  private connect() {
    if (!this.enabled || this.socket) return
    const socket = net.createConnection(this.pipePath(this.pipeIndex))
    this.socket = socket
    socket.once('connect', () => {
      this.pipeIndex = 0
      const payload = Buffer.from(JSON.stringify({ v: 1, client_id: applicationId }), 'utf8')
      const header = Buffer.alloc(8)
      header.writeInt32LE(0, 0)
      header.writeInt32LE(payload.length, 4)
      socket.write(Buffer.concat([header, payload]))
    })
    socket.on('data', (chunk) => this.readPackets(chunk))
    socket.once('error', () => {
      if (!this.ready && this.pipeIndex < 9) {
        this.socket = null
        this.pipeIndex += 1
        this.connect()
        return
      }
      this.disconnect(socket)
    })
    socket.once('close', () => this.disconnect(socket))
  }

  private pipePath(index: number) {
    if (process.platform === 'win32') return `\\\\?\\pipe\\discord-ipc-${index}`
    const runtime = process.env.XDG_RUNTIME_DIR || os.tmpdir()
    return `${runtime}/discord-ipc-${index}`
  }

  private readPackets(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk])
    while (this.buffer.length >= 8) {
      const opcode = this.buffer.readInt32LE(0)
      const length = this.buffer.readInt32LE(4)
      if (length < 0 || length > 1024 * 1024) {
        this.socket?.destroy(new Error('Invalid Discord RPC packet length'))
        return
      }
      if (this.buffer.length < 8 + length) return
      const data = this.buffer.subarray(8, 8 + length)
      this.buffer = this.buffer.subarray(8 + length)
      if (opcode === 1) {
        try {
          const message = JSON.parse(data.toString('utf8')) as { evt?: string; cmd?: string }
          if (message.evt === 'READY') {
            this.ready = true
            if (this.desired) this.sendActivity(this.desired)
          } else if (message.cmd === 'SET_ACTIVITY') {
            this.ready = true
          }
        } catch {
          this.socket?.destroy(new Error('Invalid Discord RPC response'))
          return
        }
      } else if (opcode === 2) {
        this.socket?.destroy()
        return
      } else if (opcode === 3) {
        this.writeRawPacket(4, data)
      }
    }
  }

  private sendActivity(presence: RichPresence) {
    const activity = {
      name: 'NEXIUM',
      type: 0,
      details: presence.details.slice(0, 128),
      ...(presence.state ? { state: presence.state.slice(0, 128) } : {}),
      ...(presence.startTimestamp ? { timestamps: { start: presence.startTimestamp } } : {}),
      assets: {
        large_image: presence.largeImage ?? 'nexium_logo',
        ...(presence.smallImage ? { small_image: presence.smallImage } : {}),
      },
      instance: false,
    }
    this.writePacket(1, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity }, nonce: `${Date.now()}` })
  }

  private writePacket(opcode: number, value: unknown) {
    this.writeRawPacket(opcode, Buffer.from(JSON.stringify(value), 'utf8'))
  }

  private writeRawPacket(opcode: number, payload: Buffer) {
    if (!this.socket || this.socket.destroyed) return
    const header = Buffer.alloc(8)
    header.writeInt32LE(opcode, 0)
    header.writeInt32LE(payload.length, 4)
    this.socket.write(Buffer.concat([header, payload]))
  }

  private disconnect(socket: net.Socket) {
    if (this.socket !== socket) return
    this.socket = null
    this.ready = false
    this.pipeIndex = 0
    this.buffer = Buffer.alloc(0)
    if (!this.enabled || this.retryTimer) return
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      this.connect()
    }, 5000)
    this.retryTimer.unref()
  }
}
