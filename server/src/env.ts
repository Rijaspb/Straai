import dotenv from 'dotenv'
import path from 'path'

// Load from server/.env first, then project root .env as fallback
dotenv.config({ path: path.resolve(__dirname, '../.env') })
dotenv.config({ path: path.resolve(__dirname, '../../.env') })


