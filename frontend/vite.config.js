import { defineConfig } from 'vite'
import { createViteConfig } from './build/index.js'

export default defineConfig(({ mode }) => createViteConfig(mode))
