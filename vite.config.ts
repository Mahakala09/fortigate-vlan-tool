import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/fortigate-vlan-tool/',  // ← 改成你的 repo 名稱
})
