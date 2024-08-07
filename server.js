const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const passport = require("passport");
const path = require("path");
const cors = require('cors');
const puppeteer = require('puppeteer');
const { WebSocketServer } = require('ws');
const ngrok = require('ngrok');

const { launch } = require('puppeteer');
const { Solver } = require('@2captcha/captcha-solver');
const { readFileSync } = require('fs');
const { normalizeUserAgent } = require('./normalize-ua.js');

const sleep = ms => new Promise(r => setTimeout(r, ms));

require('dotenv').config();

const users = require("./routes/api/users");
const cron = require('node-cron');
const User = require("./models/UserSchema");
const app = express();
const corsOptions = {
  origin: '*',
  optionsSuccessStatus: 200 // For legacy browser support
};
app.use(cors(corsOptions));

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const solver = new Solver(process.env.CAPTCHA_API_KEY);

const dbURL = process.env.MONGO_URI;

mongoose.connect(process.env.MONGODB_URI || dbURL, { useUnifiedTopology: true, useNewUrlParser: true })
  .then(() => console.log("MongoDB successfully connected"))
  .catch(err => console.log(err));

// cron.schedule('* * * * *', async () => {
//   console.log('Running payment check...');

//   try {
//     const users = await User.find();

//     const currentDate = new Date();

//     for (const user of users) {
//       if (user.nextPaymentDueDate < currentDate) {
//         user.paymentStatus = 'unpaid';
//         await user.save();
//         console.log(`Updated payment status for user ${user._id}`);
//       }
//     }

//     console.log('Payment check completed.');
//   } catch (err) {
//     console.error('Error checking payments:', err);
//   }
// }); 
// Passport middleware
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
const telegramLink = 'div > div.chakra-wrap > ul > a[href*="t.me"]';
// const age = '#root > div > main > div.custom-a3qv9n > div.ds-dex-table.ds-dex-table-new > div > div:nth-child(3) > button';
// const volume = '#root > div > main > div.custom-a3qv9n > div.ds-dex-table.ds-dex-table-new > div > div:nth-child(6) > button';
// const tmcap = '#root > div > main > div.custom-a3qv9n > div.ds-dex-table.ds-dex-table-new > div > div:nth-child(13) > button';
// const token = 'span.ds-dex-table-row-base-token-symbol';
const filterBtn = '#root > div > main > div.custom-a3qv9n > div.custom-jupjcv > div > div.custom-zl2cr9 > div > div.chakra-button__group.custom-1itqpek > button.chakra-button.custom-rdz67p';
const tmcap = 'form > div.chakra-stack.custom-14xw2ug > div:nth-child(2) > div:nth-child(1) > div:nth-child(2) > input'
const apply = ' footer > button.chakra-button.custom-ug3je';

const clients = new Map();  // Map to store client connection

async function createBrowserInstance(params, clientId) {
  console.log(`Creating browser instance for client ${clientId} with parameters:`, params);
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

    await fetch(browser, params, clientId);
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
//
const fetch = async (browser, parameters, clientId) => {
  console.log("Params in Fetch : ", parameters);
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
          }//
          if (res) {
            await new Promise((resolve) => setTimeout(resolve, 15000));
            // Handle rado options..
            let elements;

            try {
              await page.waitForSelector(allCoins);
              elements = await page.$$(allCoins);
            } catch (error) {
              console.log("error");
            }//
            let elLength = 0;
            if (elements) {
              if (elements.length < 50) {
                elLength = elements.length - 1;
              }
              else {
                elLength = 50
              }
              console.log("length : ", elLength);
            }
            else {
              elLength = -1;
            }

            for (let i = 0; i <= elLength; i++) {
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
                const link = await otherPage.$$(telegramLink);
                if (link[1]) {
                  console.log("Got multiple links")
                  const href = await link[1].evaluate(el => el.href);
                  if (href.includes('t.me')) {//
                    console.log(href);
                    const myClient = clients.get(clientId);
                    const ws = myClient.ws
                    if (ws && ws.readyState === ws.OPEN) {
                      // console.log(ws);
                      ws.send(JSON.stringify({ href }));
                    }
                  }
                  else if (link[0]) {
                    const href = await link[0].evaluate(el => el.href);
                    if (href.includes('t.me')) {//
                      console.log(href);
                      const myClient = clients.get(clientId);
                      const ws = myClient.ws
                      if (ws && ws.readyState === ws.OPEN) {
                        // console.log(ws);
                        ws.send(JSON.stringify({ href }));
                      }
                    }
                  }
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
            if (elLength <= 2) {
              console.log("Didnt pick many listings...")
              const myClient = clients.get(clientId);
              const ws = myClient.ws
              if (ws && ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify({ message: "Didnt pick many listings...." }));
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
        return;//
      }
    });//
    //
    await page.goto(`https://dexscreener.com/new-pairs?rankBy=trendingScoreH6&order=desc&minLiq=1000&minMarketCap=${parameters.tmcapMin}&maxMarketCap=${parameters.tmcapMax}&minAge=${parameters.ageMin}&maxAge=${parameters.ageMax}&min24HVol=${parameters.volumeMin}&max24HVol=${parameters.volumeMax}`);
  } catch (error) {
    console.log(error);
  }

}
app.post('/sockets', (req, res) => {
  console.log("testing");
  try {
    const { client } = req.body; // Extracting client from the request body
    if (!client) {
      return res.status(400).json({ error: 'Client parameter is missing' });
    }

    const myClient = clients.get(client);
    if (!myClient) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const browser = myClient.myBrowser;
    console.log('browser value:', browser);
    res.json(browser);
  } catch (error) {
    console.log('Error in Getting Client Info', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


app.post('/', (req, res) => {
  console.log("Hello budy g");
  try {
    const { ageMin, ageMax, volumeMin, volumeMax, tmcapMin, tmcapMax, clientId } = req.body;
    console.log(typeof (ageMin));

    const ws = clients.get(clientId);
    if (ws && ws.readyState === ws.OPEN) {
      createBrowserInstance({ ageMin, ageMax, volumeMin, volumeMax, tmcapMin, tmcapMax }, clientId);
    }
    res.status(201).json(req.body);
  } catch (error) {
    console.log("Error in POST request from client");
  }

});


app.post('/api/users/webhook', (req, res) => {
  const event = req.body;
  console.log(req);


  if (event.type === 'charge:confirmed') {
    // Payment was successful
    console.log('Payment confirmed');
        // Update payment status in your database

  } else if (event.type === 'charge:failed') {
    console.log('Payment failed');
  } else {
    // Handle other event types as needed
    console.log(`Unhandled event type: ${event.type}`);
  }

  res.status(200).send('Webhook received');
});

const port = process.env.PORT || 3000;
const server = app.listen(port, () => console.log(`Server up and running on port ${port}`));

(async function() {
  try {
    // const url = await ngrok.connect(port);
    // console.log(`Ngrok tunnel running at ${url}`);

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

  } catch (error) {
    console.error('Error starting Ngrok:', error);
  }
})();
