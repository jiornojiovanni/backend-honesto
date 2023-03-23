require('dotenv').config()
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');

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
    const sql_query = "SELECT nome, cognome FROM persona WHERE mail = ? AND password = ?"

    connection.query(sql_query, [email, password]).then(([rows, fields]) => {
        if (rows.length > 0) {
            res.send({ status: 200, msg: "OK", user: { nome: rows[0].nome, cognome: rows[0].cognome } })
        } else {
            res.send({ status: 404, msg: "User not found" })
        }
    })

})


app.listen(port, () => {
    console.log(`Express server listening on port ${port}`)
})