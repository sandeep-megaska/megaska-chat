// /api/ping.js  (ultra-minimal)
module.exports = (req, res) => {
  try {
    res.status(200).send("ok");
  } catch (e) {
    console.error("PING_FATAL:", e);
    res.status(500).send("fail");
  }
};