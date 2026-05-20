import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import channelsRouter from './routes/channels'

const app = express()
const port = Number(process.env['PORT'] ?? 3000)

app.use(cors({ origin: process.env['CORS_ORIGIN'] ?? '*' }))
app.use(express.json())

app.use('/channels', channelsRouter)

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.listen(port, () => {
  console.log(`TitanOS Sports API corriendo en puerto ${port}`)
})
