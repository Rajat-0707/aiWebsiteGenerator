export default {
  server: {
    proxy: {
      "/api": {
        target: process.env.VITE_API_URL || "https://aiwebsitegenerator.onrender.com",
        changeOrigin: true,
        secure: false
      }
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
}
