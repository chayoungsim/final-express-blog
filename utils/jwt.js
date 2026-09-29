const jwt = require("jsonwebtoken");
const { JWT_SECRET, JWT_ACCESS_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN } =
  process.env;

function signAccess(uid) {
  return jwt.sign({ uid }, JWT_SECRET, { expiresIn: JWT_ACCESS_EXPIRES_IN });
}

function signRefresh(uid) {
  return jwt.sign({ uid, tid: Date.now() }, JWT_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN,
  });
}

function verify(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = { signAccess, signRefresh, verify };
