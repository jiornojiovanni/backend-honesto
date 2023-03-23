const jwt = require('jsonwebtoken')

function signToken(email) {
    return jwt.sign({ email: email }, process.env.TOKEN_SECRET, { expiresIn: 3600 })
}

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]

    if (token == null) return res.sendStatus(401)

    jwt.verify(token, process.env.TOKEN_SECRET, (err, payload) => {
        if (err) {
            console.log(err)
            return res.sendStatus(403)
        }

        req.payload = payload
        next()
    })
}

module.exports = { signToken, authenticateToken }