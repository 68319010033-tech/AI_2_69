import axios from 'axios'

const MOCK = true
const http = axios.create({ baseURL: '/api' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export const api = {
  async upload(files) {
    if (MOCK) {
      await sleep(800)
      return { sessionId: 'mock-session-1' }
    }
    const fd = new FormData()
    files.forEach((f) => fd.append('files', f))
    return (await http.post('/upload', fd)).data
  },
}