// server.js
const express = require("express");
const scrapePrice = require("./scraper");

const app = express();
app.use(express.json());

app.post("/scrape", async (req, res) => {
  const { location } = req.body;
  if (!location) return res.status(400).json({ error: "Location is required" });

  const result = await scrapePrice(location);
  res.json(result);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Scraper server running on port ${PORT}`));
