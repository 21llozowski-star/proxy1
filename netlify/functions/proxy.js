const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
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
            maxRedirects: 5,
            validateStatus: () => true,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9'
            }
        });

        const contentType = response.headers['content-type'] || '';
        res.status(response.status);

        // Rewrite HTML links, images, scripts, and forms so they stay inside the proxy
        if (contentType.includes('text/html')) {
            const html = Buffer.from(response.data).toString('utf-8');
            const $ = cheerio.load(html);
            const finalUrl = response.request?.res?.responseUrl || targetUrl;

            const toProxyUrl = (rawUrl) => {
                if (!rawUrl) return rawUrl;
                const trimmed = rawUrl.trim();
                if (
                    trimmed.startsWith('data:') ||
                    trimmed.startsWith('javascript:') ||
                    trimmed.startsWith('mailto:') ||
                    trimmed.startsWith('#') ||
                    trimmed.startsWith('/proxy?url=')
                ) {
                    return rawUrl;
                }
                try {
                    const absolute = new URL(trimmed, finalUrl).href;
                    return `/proxy?url=${encodeURIComponent(absolute)}`;
                } catch {
                    return rawUrl;
                }
            };

            $('[href]').each((_, el) => {
                const val = $(el).attr('href');
                if (val) $(el).attr('href', toProxyUrl(val));
            });

            $('[src]').each((_, el) => {
                const val = $(el).attr('src');
                if (val) $(el).attr('src', toProxyUrl(val));
            });

            $('[srcset]').each((_, el) => {
                const srcset = $(el).attr('srcset');
                if (srcset) {
                    const rewritten = srcset
                        .split(',')
                        .map((part) => {
                            const [urlPart, descriptor] = part.trim().split(/\s+/);
                            const proxied = toProxyUrl(urlPart);
                            return descriptor ? `${proxied} ${descriptor}` : proxied;
                        })
                        .join(', ');
                    $(el).attr('srcset', rewritten);
                }
            });

            $('form[action]').each((_, el) => {
                const val = $(el).attr('action');
                if (val) $(el).attr('action', toProxyUrl(val));
            });

            $('meta[http-equiv="Content-Security-Policy"]').remove();

            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.send($.html());
        }

        if (contentType) {
            res.setHeader('Content-Type', contentType);
        }
        return res.send(Buffer.from(response.data));
    } catch (error) {
        return res.status(500).send(`Unable to load URL: ${error.message}`);
    }
});

module.exports.handler = serverless(app);
