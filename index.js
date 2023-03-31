require('dotenv').config();

const express = require('express');
const cors = require('cors');
const https = require("https");
const fs = require("fs");
const path = require("path");
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');
const PDFDocument = require('pdfkit');
const { v4: uuidv4 } = require('uuid');
const { ExpressPeerServer } = require("peer");
const { Server } = require("socket.io");

const auth = require('./auth');

const connection = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB,
    port: process.env.DB_PORT,
    dateStrings: true
});

const app = express()
    .use(cors({
        origin: "*"
    }))
    .use(bodyParser.json())
    .use(express.static(path.join(__dirname, 'public/')));

app.post("/login", async (req, res) => {
    let { email, password } = req.body;
    const sql_query = "SELECT id_persona, mail FROM persona WHERE mail = ? AND password = ?";

    connection.query(sql_query, [email, password]).then(([rows]) => {
        if (rows.length > 0) {
            let payload = { email: rows[0].mail, id: rows[0].id_persona };
            let token = auth.signToken(payload);

            res.status(200).send({ token: token, expiresIn: 3600 });
        } else {
            res.status(404).send();
        }
    });

});

app.get("/user", auth.authenticateToken, (req, res) => {
    const sql_query = "SELECT nome, cognome, id_persona, mail, tipo FROM persona WHERE mail = ?";
    connection.query(sql_query, [req.payload.email]).then(([rows]) => {
        if (rows.length > 0) {
            res.status(200).send({ nome: rows[0].nome, cognome: rows[0].cognome, id_persona: rows[0].id_persona, email: rows[0].mail, tipo: rows[0].tipo });
        } else {
            res.status(500).send();
        }
    });
});

app.put("/user", async (req, res) => {
    const sql_query = "INSERT into persona (nome, cognome, mail, password, telefono, data_nascita, provincia, cap, tipo, fk_specializzazione) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    let spec = null;
    if(req.body.fk_specializzazione != '') {
        spec = req.body.fk_specializzazione;
    }
    
    try {
        await connection.query(sql_query, [
            req.body.nome,
            req.body.cognome,
            req.body.mail,
            req.body.password,
            req.body.telefono,
            req.body.data_nascita,
            req.body.provincia,
            req.body.cap,
            req.body.tipo,
            spec
        ]);
        res.status(200).json();
    } catch (error) {
        console.error(error);
        res.status(500).json();
    }
});

app.get("/specialties", async (req, res) => {
    const sql_query = "SELECT * from specializzazione";
    try {
        let [rows] = await connection.query(sql_query);
        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json();
    }
});

app.put("/visit", auth.authenticateToken, async (req, res) => {
    const check_Paziente = "SELECT id_persona, mail FROM persona WHERE mail = ? AND tipo = 'paziente'";
    const insert_visita = "INSERT INTO visita (ora_programmata, data_programmata, stato) VALUES (?, ?, 'programmata')";
    const insert_partecipa = "INSERT INTO partecipa (fk_persona, fk_visita) VALUES(?, ?)";

    try {
        let [rows] = await connection.query(check_Paziente, [req.body.visitEmail]);
        if (rows.length == 0) {
            res.status(500).send();
            return;
        }
        let paziente_id = rows[0].id_persona;


        let insertId = (await connection.query(insert_visita, [req.body.visitTime, req.body.visitDate]))[0].insertId;

        await connection.query(insert_partecipa, [req.payload.id, insertId]);
        await connection.query(insert_partecipa, [paziente_id, insertId]);

        res.status(200).send();
    } catch (err) {
        console.log(err);
        res.status(500).send();
    }

});

app.get("/visit", auth.authenticateToken, async (req, res) => {
    const sql_query = "SELECT v.* from visita v, partecipa p WHERE p.fk_visita = v.id_visita AND p.fk_persona = ? ORDER BY v.data_programmata DESC";

    try {
        let [rows] = await connection.query(sql_query, [req.payload.id]);
        res.status(200).send(rows);
    } catch (err) {
        console.log(err);
        res.status(500).send();
    }

});

app.get("/visitpartecipants", auth.authenticateToken, async (req, res) => {
    const sql_query = "SELECT p.* from visita v, partecipa p WHERE p.fk_visita = v.id_visita AND v.id_visita = ? AND p.fk_persona != ?";
    try {
        let [rows] = await connection.query(sql_query, [req.query.visitID, req.payload.id]);
        res.status(200).send({ fk_persona: rows[0].fk_persona });
    } catch (err) {
        console.log(err);
        res.status(500).send();
    }
});

app.post("/createdoc", auth.authenticateToken, async (req, res) => {
    const doc = new PDFDocument;
    const filename = uuidv4();
    const title = req.body.title;
    const text = req.body.text;

    doc.pipe(fs.createWriteStream(path.join(__dirname, 'public/') + filename + '.pdf'));
    doc.font(path.join(__dirname, 'public/') + "fonts/calibri.ttf");
    
    doc.image(path.join(__dirname, 'public/') + "images/logo.png", 80, 57, { width: 200 })
		.fillColor('#444444')
		.fontSize(10)
		.text('Giovanni Palmieri', 160, 65, { align: 'right' })
		.text('28/03/2023', 160, 80, { align: 'right' })
		.moveDown();

    doc
        .font(path.join(__dirname, 'public/') + 'fonts/calibrib.ttf', 18)
        .text("Titolo: " + title, 80, 150)
        .moveDown()
        .text("Descrizione:")
        .font(path.join(__dirname, 'public/') + 'fonts/calibri.ttf', 10)
        .text(text, {
            align: 'justify',
            columns: 1,
            height: 300,
            ellipsis: true
        });

    doc.end();

    try {
        const uri = "/" + filename +".pdf";
        const sql_query = "INSERT INTO documentazione (nome_documento, timestamp_creazione, fk_tipologia_documento, fk_visita, uri_documento) VALUES (?, NOW(), ?, ?, ?)";
        await connection.query(sql_query, [filename, req.body.type, req.body.visitID, uri]);

        res.status(200).send({ uri: uri });
    } catch (error) {
        console.error(error);
        res.status(500).send();
    }  
});

app.get("/documents", auth.authenticateToken, async (req, res) => {
    const sql_query = "SELECT DISTINCT d.nome_documento, d.timestamp_creazione, d.uri_documento FROM documentazione d, visita v , partecipa p , persona p2 WHERE d.fk_visita = v.id_visita AND p.fk_visita = v.id_visita AND p.fk_persona = p2.id_persona  AND p2.id_persona = ?";

    try {
        let [rows] = await connection.query(sql_query, [req.payload.id]);
        res.status(200).send(rows);
    } catch (err) {
        console.log(err);
        res.status(500).send();
    }

});

app.post("/documents", auth.authenticateToken, async (req, res) => {
    const sql_query = "SELECT DISTINCT d.nome_documento, d.timestamp_creazione, d.uri_documento FROM documentazione d, visita v , partecipa p , persona p2 WHERE d.fk_visita = v.id_visita AND p.fk_visita = v.id_visita AND p.fk_persona = p2.id_persona  AND p2.id_persona = ?";

    try {
        let [rows] = await connection.query(sql_query, [req.body.patientID]);
        res.status(200).send(rows);
    } catch (err) {
        console.log(err);
        res.status(500).send();
    }

});

app.post("/updatevisit", auth.authenticateToken, async (req, res) => {
    const sql_query = "UPDATE partecipa p SET p.ora = ?, p.data = ? WHERE p.ora IS NULL AND p.data IS NULL AND p.fk_persona = ? AND p.fk_visita = ?";
    const datetime = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const date = datetime.split(' ')[0];
    const time = datetime.split(' ')[1];

    try {
        await connection.query(sql_query, [time, date, req.payload.id, req.body.visitID]);
        res.status(200).send();
    } catch (err) {
        console.log(err);
        res.status(500).send();
    }
});

app.post("/startvisit", auth.authenticateToken, async (req, res) => {
    const sql_query = "UPDATE visita v SET v.stato = 'in corso' WHERE v.id_visita = ?";
    try {
        await connection.query(sql_query, [req.body.visitID]);
        res.status(200).send();
    } catch (err) {
        console.log(err);
        res.status(500).send();
    }
});

app.post("/stopvisit", auth.authenticateToken, async (req, res) => {
    const sql_query = "UPDATE visita v SET v.stato = 'terminata' WHERE v.id_visita = ?";
    try {
        await connection.query(sql_query, [req.body.visitID]);
        res.status(200).send();
    } catch (err) {
        console.log(err);
        res.status(500).send();
    }
});

app.get("/patients", auth.authenticateToken, async (req, res) => {
    const sql_query = "SELECT DISTINCT  p.nome, p.cognome, p.id_persona, p.mail " +
        "FROM persona p, partecipa p2 " +
        "WHERE p2.fk_persona = p.id_persona AND p2.fk_persona != ? AND p2.fk_visita IN " +
        "(SELECT v.id_visita  from visita v, partecipa p WHERE p.fk_visita = v.id_visita AND p.fk_persona = ?)";

    try {
        let [rows] = await connection.query(sql_query, [req.payload.id, req.payload.id]);
        res.status(200).send(rows);
    } catch (err) {
        console.log(err);
        res.status(500).send();
    }
});

app.get("/patient", auth.authenticateToken, async (req, res) => {
    const sql_query = "SELECT p.nome, p.cognome, p.id_persona, p.mail FROM persona p WHERE p.id_persona=?";

    try {
        let [rows] = await connection.query(sql_query, [req.payload.id, req.payload.id]);
        res.status(200).send(rows);
    } catch (err) {
        console.log(err);
        res.status(500).send();
    }
});

app.get("/allpatients", auth.authenticateToken, async (req, res) => {
    const sql_query = "SELECT p.id_persona, p.nome, p.cognome, p.mail FROM persona p WHERE p.tipo = 'paziente'";

    try {
        let [rows] = await connection.query(sql_query);
        res.status(200).send(rows);
    } catch (err) {
        console.log(err);
        res.status(500).send();
    }
});

app.listen(process.env.EXPRESS_PORT, () => {
    console.log(`Express server listening on port ${process.env.EXPRESS_PORT}`);
});

const server = https
    .createServer(
        {
            key: fs.readFileSync(process.env.SSL_KEY),
            cert: fs.readFileSync(process.env.SSL_CERT)
        },
        app
    )
    .listen(process.env.HTTPS_PORT, () => {
        console.log(`HTTPS server is runing at port ${process.env.HTTPS_PORT}`);
    });

const peerServer = ExpressPeerServer(server, {
    path: "/connect",
});

app.use("/", peerServer);


const io = new Server(server, {
    cors: {
        origin: "*",
    }
});



let counter = 0;

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
 
    socket.on('join', (stanza) => {
        const room = stanza;
        console.log("room",room);
        socket.join(room);


  });
  socket.on('joined', (stanza) =>  {
    
    counter = io.sockets.adapter.rooms.get(stanza).size;
    console.log("Utenti: "+counter);
    io.emit("userJoinedRoom", counter);

  });
 
 
// socket.on('signal', (data) => {
//     console.log('Segnale rievuto')
//     console.log(data)
//     const room = socket.rooms.values().next().value;
 
//     if (room) {
//         socket.to(room).emit('signal', data);
//     }
// });

    // whenever we receive a 'message' we log it out
    socket.on("message", (room, clientMessage) =>  {
        if (clientMessage.type === 'signal') {
          const message  = {
            message: clientMessage.message,
            author: '',
            time: Date.now(),
            type: clientMessage.type,
            room: room,
          };
          if (clientMessage.for) {
            message.for = clientMessage.for;
          }

            io.to(room).emit("private-message", message);

        }
    });

    socket.on('disconnect', () => {
       
        console.log('Client disconnected:', socket.id);
    });
});

 



