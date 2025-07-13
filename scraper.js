const puppeteer = require("puppeteer-core");
const chromePath = "/usr/bin/chromium"; // Render deployment path

async function scrapePrice(location) {
  const slugMap = require("./location_slugs");
  const slug = slugMap[location];
  if (!slug) return { error: `Unsupported location: ${location}` };

  const city = location.split(" ").slice(-1)[0].toLowerCase();
  const url = `https://housing.com/in/buy/${city}/${slug}`;

  console.log("Navigating to:", url);

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138 Safari/537.36"
  );
  await page.setViewport({ width: 1024, height: 768 });

  try {
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded", // faster navigation strategy
      timeout: 15000,
    });

    if (!response || !response.ok()) {
      throw new Error(
        `Failed to load page: ${response?.status() || "Unknown status"}`
      );
    }

    console.log("Page loaded, waiting for JS content...");

    await page.waitForTimeout(3000); // wait for JS to hydrate
    await page.waitForSelector("div[class*='T_cardV1Style']", {
      timeout: 10000,
    });

    const cards = await page.$$(`div[class*='T_cardV1Style']`);
    const nearby_properties = [];
    let property_type = "Unknown";

    for (let card of cards.slice(0, 5)) {
      const name = await card.evaluate((el) => {
        const title = el.querySelector("div[class*='title-style']");
        return title ? title.innerText.trim() : "Unnamed Property";
      });

      if (property_type === "Unknown") {
        const typeLine = await card.evaluate((el) => {
          const subtitle = el.querySelector("h2[class*='subtitle-style']");
          return subtitle ? subtitle.innerText.trim() : null;
        });

        if (typeLine) {
          if (/flat|apartment/i.test(typeLine)) property_type = "Apartment";
          else if (/villa/i.test(typeLine)) property_type = "Villa";
          else if (/plot/i.test(typeLine)) property_type = "Plot";
          else property_type = "Other";
        }
      }

      const priceText = await card.evaluate((el) => {
        const divs = Array.from(el.querySelectorAll("div"));
        for (let div of divs) {
          const text = div.innerText?.trim();
          if (text && /avg\.?\s*price.*₹.*sq\.?ft/i.test(text)) {
            return text;
          }
        }
        return null;
      });

      console.log("Matched price text:", priceText);
      if (!priceText) continue;

      const match = priceText.match(/₹([\d.]+)\s*K\/sq\.?ft/i);
      if (match) {
        const price_per_sqft = parseFloat(match[1]) * 1000;
        if (price_per_sqft >= 1000 && price_per_sqft <= 50000) {
          nearby_properties.push({
            name,
            price_per_sqft: Math.round(price_per_sqft),
          });
        }
      }
    }

    await browser.close();

    if (nearby_properties.length === 0) {
      return {
        location,
        current_price_per_sqft: 8500,
        property_type,
        nearby_properties: [],
        rental_yield_percent: 3,
        note: "Used fallback due to scraping issue",
      };
    }

    const avg_price =
      nearby_properties.reduce((acc, cur) => acc + cur.price_per_sqft, 0) /
      nearby_properties.length;

    return {
      location,
      current_price_per_sqft: Math.round(avg_price),
      property_type,
      nearby_properties,
      rental_yield_percent: 3,
    };
  } catch (err) {
    await browser.close();
    return { error: `Scraping failed: ${err.message}` };
  }
}

// If run directly
if (require.main === module) {
  const location = process.argv[2];
  if (!location) {
    console.error("Usage: node scraper.js '<Location Name>'");
    process.exit(1);
  }
  scrapePrice(location).then((res) =>
    console.log(JSON.stringify(res, null, 2))
  );
}

module.exports = scrapePrice;
