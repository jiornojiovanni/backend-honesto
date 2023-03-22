require('dotenv').config()
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');

const connection = mysql.createPool({
  host     : process.env.HOST,
  user     : process.env.USER,
  password : process.env.PASSWORD,
  database : process.env.DB
});

const port = process.env.PORT || 8080;

const app = express()
  .use(cors())
  .use(bodyParser.json())

app.listen(port, () => {
  console.log(`Express server listening on port ${port}`);
  connection.query('SELECT * FROM tipologia_documento').then(([result]) => {
        console.log(result)
  });
});