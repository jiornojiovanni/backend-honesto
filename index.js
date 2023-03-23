require('dotenv').config()

const express = require('express')
const cors = require('cors')
const bodyParser = require('body-parser')
const mysql = require('mysql2/promise')
const { PeerServer } = require("peer");

const auth = require('./auth')

const peerServer = PeerServer({ port: 9000, path: "/connect"})
const connection = mysql.createPool({
    host: process.env.HOST,
    user: process.env.USER,
    password: process.env.PASSWORD,
    database: process.env.DB
})

const port = process.env.PORT || 8080

const app = express()
    .use(cors())
    .use(bodyParser.json())
    .use(express.static('public'))

app.post("/login", async (req, res) => {
    let { email, password } = req.body
    const sql_query = "SELECT mail FROM persona WHERE mail = ? AND password = ?"

    connection.query(sql_query, [email, password]).then(([rows, fields]) => {
        if (rows.length > 0) {
            payload = rows[0].mail
            token = auth.signToken(payload)

            res.send({ status: 200, msg: "OK", token: token })
        } else {
            res.send({ status: 404, msg: "User not found" })
        }
    })

})

app.get("/user", auth.authenticateToken, (req, res) => {
    const sql_query = "SELECT nome, cognome FROM persona WHERE mail = ?"

    connection.query(sql_query, [req.payload.email]).then(([rows, fields]) => {
        if (rows.length > 0) {
            res.send({ nome: rows[0].nome, cognome: rows[0].cognome })
        } else {
            res.send({ status: 500, msg: "Internal server error" })
        }
    })
})

app.listen(port, () => {
    console.log(`Express server listening on port ${port}`)
})