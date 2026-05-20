import mysql from 'mysql2/promise'
import 'dotenv/config'

const pool = mysql.createPool({
  uri: process.env['DATABASE_URL'],
  ssl: { rejectUnauthorized: false },
  waitForConnections: true,
  connectionLimit: 10,
})

export default pool
