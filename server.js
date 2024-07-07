const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const passport = require("passport");
const path = require("path");
const cors = require('cors');
const puppeteer = require('puppeteer');
const { WebSocketServer } = require('ws');
import { launch } from 'puppeteer';
import { Solver } from '@2captcha/captcha-solver';
import { readFileSync } from 'fs';
import { normalizeUserAgent } from './normalize-ua.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

require('dotenv').config();

const users = require("./routes/api/users");

const app = express();
app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const solver = new Solver(process.env.CAPTCHA_API_KEY);

const dbURL = process.env.MONGO_URI;

mongoose.connect(process.env.MONGODB_URI || dbURL, { useUnifiedTopology: true, useNewUrlParser: true })
  .then(() => console.log("MongoDB successfully connected"))
  .catch(err => console.log(err));

app.use(passport.initialize());
require("./config/passport")(passport);
app.use("/api/users", users);

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, "client", "build")));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'build', 'index.html'));
  });
}

const allCoins = 'div.ds-dex-table.ds-dex-table-new > a > div.ds-table-data-cell.ds-dex-table-row-col-token';
const telegramLink = 'div > div.chakra-wrap.custom-0 > ul > a:last-child';
const age = '#root > div > main > div.custom-a3qv9n > div.ds-dex-table.ds-dex-table-new > div > div:nth-child(3) > button';
const volume = '#root > div > main > div.custom-a3qv9n > div.ds-dex-table.ds-dex-table-new > div > div:nth-child(6) > button';
const tmcap = '#root > div > main > div.custom-a3qv9n > div.ds-dex-table.ds-dex-table-new > div > div:nth-child(13) > button';
const token = 'span.ds-dex-table-row-base-token-symbol';

const clients = new Map();  // Map to store client connections

async function createBrowserInstance(radio, clientId) {
  let browser;
  try {
    const initialUserAgent = await normalizeUserAgent();
    browser = await launch({
      headless: false,
      args: [
        `--user-agent=${initialUserAgent}`,
        "--start-maximized"
      ],
      defaultViewport: null
    });//
  } catch (error) {
    console.log("Error generated in intializing Browser");
  }

  if (browser) {
    const clientData = clients.get(clientId);
    clientData.myBrowser = 'browser';
    clients.set(clientId, clientData);

    const clientIds = Array.from(clients.entries());
    console.log(clientIds);
    // console.log(clientData.myBrowser);
    // console.log(`Updated clients map for clientId ${clientId}:`, clients);
    // console.log(clients)
    // console.log(clientId);
    // const clientIds = Array.from(clients.entries()).forEach(([clientId, clientData]) => {
    //   console.log(`ClientId: ${clientId}, ClientData:`, clientData);
    // });
    await fetch(browser, radio, clientId);
  }
}


const solveCaptcha = async (params) => {
  const maxRetries = 4;
  let attempt = 0;
  let success = false;
  let res = null;

  while (attempt < maxRetries && !success) {
    try {
      res = await solver.cloudflareTurnstile(params);
      success = true;
    } catch (err) {
      if (err.code === 1) { // ERROR_CAPTCHA_UNSOLVABLE
        console.log(`Attempt ${attempt + 1}: CAPTCHA unsolvable.`);
        attempt += 1;
        await sleep(2000); // wait for 2 seconds before retryi
      } else {
        console.error('Unexpected error solving CAPTCHA:', err);
        // throw err; // rethrow the error if it's not ERROR_CAPTCHA_UNSOLVABLE
      }
    }
  }

  if (!success) {
    console.log('Failed to solve CAPTCHA after multiple attempts.');
  }

  return res;
};

const fetch = async (browser, radio, clientId) => {
  try {
    const [page] = await browser.pages();
    const preloadFile = readFileSync('./inject.js', 'utf8');
    await page.evaluateOnNewDocument(preloadFile);

    page.on('console', async (msg) => {
      const txt = msg.text();
      if (txt.includes('intercepted-params:')) {
        const params = JSON.parse(txt.replace('intercepted-params:', ''));
        try {
          const res = await solveCaptcha(params);
          try {
            await page.evaluate((token) => { cfCallback(token); }, res.data);
          } catch (error) {
            console.log("error");
          }
          // console.log(res);
          if (res) {
            await new Promise((resolve) => setTimeout(resolve, 30000));
            // Handle radio options..
            if (radio == 'age(oldest first)') {
              console.log("Button clicked");
              await page.waitForSelector(age);
              const myAge = await page.$(age);
              await myAge.click();
            }
            else if (radio == 'age(recent first)') {
              console.log("Button clicked");
              await page.waitForSelector(age);
              const myAge = await page.$(age);
              await myAge.click();
              await new Promise(x => setTimeout(x, 1000));
              await myAge.click({ clickCount: 2 });
            }
            else if (radio == 'volume(highest first)') {
              await page.waitForSelector(volume);
              const myVolume = await page.$(volume);
              await myVolume.click();
            }
            else if (radio == 'volume(lowest first)') {
              await page.waitForSelector(volume);
              const myVolume = await page.$(volume);
              await myVolume.click();
              await new Promise(x => setTimeout(x, 1000));
              await myVolume.click({ clickCount: 2 });
            }
            else if (radio == 'tmcap(highest first)') {
              await page.waitForSelector(tmcap);
              const mytmcap = await page.$(tmcap);
              await mytmcap.click();
            }
            else if (radio == 'tmcap(low first)') {
              await page.waitForSelector(tmcap);
              const mytmcap = await page.$(tmcap);
              await mytmcap.click();
              await new Promise(x => setTimeout(x, 1000));
              await mytmcap.click({ clickCount: 2 });

            }
            await new Promise((resolve) => setTimeout(resolve, 5000));
            await page.waitForSelector(allCoins);
            const elements = await page.$$(allCoins);
            for (let i = 0; i <= 50; i++) {
              try {
                await page.keyboard.down('Control');
                await elements[i].click();
                await page.keyboard.up('Control');
                await new Promise((resolve) => setTimeout(resolve, 10000));
                if ((await browser.pages()).length !== 2) {
                  console.log("unexpected number of tabs");
                }
                const otherPage = (await browser.pages())[1];
                try {
                  await otherPage.waitForSelector(telegramLink, { timeout: 30000 });
                } catch (error) {
                  console.log(error);
                  await otherPage.close();
                  continue;
                }
                const link = await otherPage.$(telegramLink);
                if (link) {
                  const href = await link.evaluate(el => el.href);
                  if (href.includes('t.me')) {//
                    console.log(href);
                    const myClient = clients.get(clientId);
                    const ws = myClient.ws
                    if (ws && ws.readyState === ws.OPEN) {
                      // console.log(ws);
                      ws.send(JSON.stringify({ href }));
                    }
                  }//
                }
                await otherPage.close();
                await new Promise((resolve) => setTimeout(resolve, 6000));
              } catch (error) {
                console.log(error);
                const myClient = clients.get(clientId);
                const ws = myClient.ws
                if (ws && ws.readyState === ws.OPEN) {
                  ws.send(JSON.stringify({ message: "Checking Scrapper Issue....." }));
                }
              }
            }
            await browser.close();
          }
          else {
            await browser.close();
            const myClient = clients.get(clientId);
            const ws = myClient.ws
            if (ws && ws.readyState === ws.OPEN) {
              ws.send(JSON.stringify({ message: "Sorry for inconvenience.....Please Try Again on new Tab" }));
            }
          }

        } catch (e) {
          await browser.close();
          console.log(e);
          const myClient = clients.get(clientId);
          const ws = myClient.ws
          if (ws && ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ message: "Finished Executing Scrapper....." }));
          }
          return process.exit();
        }
      } else {
        return;
      }
    });

    await page.goto('https://dexscreener.com/new-pairs');
  } catch (error) {
    console.log(error);
  }

}

app.get('/clients', (req, res) => {
  try {
    const { client } = req.query;
    // console.log("client is ",client);
    // const clientIds = Array.from(clients.keys());
    // console.log(clientIds)
    const myClient = clients.get(client);
    const browser = myClient.myBrowser;
    console.log("browser value : ", browser);
    res.json(browser);
  } catch (error) {
    console.log("Error in Getting Cliet Info");
  }

});

app.post('/', (req, res) => {
  try {
    console.log("new request");
    const newItem = req.body;
    const clientId = newItem.clientId;
    const ws = clients.get(clientId);
    if (ws && ws.readyState === ws.OPEN) {
      createBrowserInstance(newItem.message, clientId);
    }
    res.status(201).json(newItem);
  } catch (error) {
    console.log("Error in POST request from client");
  }

});

const port = process.env.PORT || 3000;
const server = app.listen(port, () => console.log(`Server up and running on port ${port}`));

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const clientId = req.url.split('/').pop();
  clients.set(clientId, {
    ws: ws,
    myBrowser: null
  });

  ws.on('close', () => {
    clients.delete(clientId);
  });
});
