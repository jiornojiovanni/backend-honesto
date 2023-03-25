require('dotenv').config()

const express = require('express')
const cors = require('cors')
const https = require("https");
const fs = require("fs");
const bodyParser = require('body-parser')
const mysql = require('mysql2/promise')
const { ExpressPeerServer } = require("peer");

const auth = require('./auth')

const connection = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB
})

const port = process.env.PORT || 3000

const app = express()
    .use(cors({
        origin: "*"
    }))
    .use(bodyParser.json())
    .use(express.static('public'))

app.post("/login", async (req, res) => {
    let { email, password } = req.body
    const sql_query = "SELECT mail FROM persona WHERE mail = ? AND password = ?"

    connection.query(sql_query, [email, password]).then(([rows, fields]) => {
        if (rows.length > 0) {
            payload = rows[0].mail
            token = auth.signToken(payload)

            res.status(200).send({ token: token })
        } else {
            res.status(404).send()
        }
    })

})

app.get("/user", auth.authenticateToken, (req, res) => {
    const sql_query = "SELECT nome, cognome FROM persona WHERE mail = ?"

    connection.query(sql_query, [req.payload.email]).then(([rows, fields]) => {
        if (rows.length > 0) {
            res.status(200).send({ nome: rows[0].nome, cognome: rows[0].cognome })
        } else {
            res.status(500).json()
        }
    })
})

app.put("/visit", auth.authenticateToken, async (req, res) => {
    const sql_query = "INSERT INTO visita (ora_programmata, data_programmata, stato) VALUES (?, ?, 'programmata')"

    try {
        let result = await connection.query(sql_query, [req.body.visitTime, req.body.visitDate] );
        res.status(200).send();
    } catch(err) {
        console.log(err)
        res.status(500).send()
    }
    
});

app.listen(port, () => {
    console.log(`Express server listening on port ${port}`)
})

const server = https
    .createServer(
        // Provide the private and public key to the server by reading each
        // file's content with the readFileSync() method.
        {
            key: fs.readFileSync("ssl.key"),
            cert: fs.readFileSync("ssl.cert")
        },
        app
    )
    .listen(8080, () => {
        console.log("HTTPS server is runing at port 8080");
    });

const peerServer = ExpressPeerServer(server, {
    path: "/connect",
});

app.use("/", peerServer);