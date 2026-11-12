const express = require('express');
const axios = require('axios');
const serverless = require('serverless-http');

const app = express();

app.get(['/proxy', '/.netlify/functions/proxy', '/'], async (req, res) => {
    let targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).send('Please enter a valid URL.');
    }

    if (!/^https?:\/\//i.test(targetUrl)) {
        targetUrl = 'https://' + targetUrl;
    }

    try {
        const response = await axios.get(targetUrl, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        const contentType = response.headers['content-type'];
        if (contentType) {
            res.setHeader('Content-Type', contentType);
        }

        res.send(response.data);
    } catch (error) {
        res.status(500).send(`Unable to load URL: ${error.message}`);
    }
});

module.exports.handler = serverless(app);
