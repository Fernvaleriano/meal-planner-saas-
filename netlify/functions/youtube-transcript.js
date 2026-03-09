const { handleCors, authenticateCoach, corsHeaders } = require('./utils/auth');

const headers = {
    ...corsHeaders,
    'Content-Type': 'application/json'
};

/**
 * Lightweight proxy: fetches YouTube transcript server-side and returns it.
 * This exists because browsers block cross-origin requests to youtube.com (CORS),
 * and YouTube blocks requests from cloud IPs for the full page scrape approach.
 * The innertube API however works from server-side.
 */
exports.handler = async (event) => {
    const corsResponse = handleCors(event);
    if (corsResponse) return corsResponse;

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const body = JSON.parse(event.body || '{}');
    const { videoId, coachId } = body;

    if (!videoId || !coachId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'videoId and coachId are required' }) };
    }

    // Authenticate coach
    const { user, error: authError } = await authenticateCoach(event, coachId);
    if (authError) return authError;

    try {
        // Step 1: Get video info and caption tracks via innertube API
        const playerRes = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                'Origin': 'https://www.youtube.com',
                'Referer': 'https://www.youtube.com/',
            },
            body: JSON.stringify({
                context: {
                    client: {
                        hl: 'en',
                        gl: 'US',
                        clientName: 'WEB',
                        clientVersion: '2.20241126.01.00',
                    }
                },
                videoId: videoId,
            })
        });

        if (!playerRes.ok) {
            console.error('Innertube player API failed:', playerRes.status);
            throw new Error('INNERTUBE_FAILED');
        }

        const playerData = await playerRes.json();
        const videoTitle = playerData?.videoDetails?.title || '';
        const captionTracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

        if (!captionTracks || captionTracks.length === 0) {
            // Fallback: try scraping the watch page
            console.log('No caption tracks from innertube, trying page scrape...');
            return await tryPageScrape(videoId, headers);
        }

        // Prefer manual English > auto English > first available
        let track = captionTracks.find(t => t.languageCode === 'en' && !t.kind);
        if (!track) track = captionTracks.find(t => t.languageCode === 'en');
        if (!track) track = captionTracks[0];

        // Step 2: Fetch the actual caption XML
        const capRes = await fetch(track.baseUrl);
        if (!capRes.ok) throw new Error('Failed to fetch caption XML');

        const xml = await capRes.text();
        const transcript = parseCaptionXml(xml);

        if (!transcript || transcript.length < 10) {
            throw new Error('NO_CAPTIONS');
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ transcript, videoTitle })
        };

    } catch (err) {
        console.error('youtube-transcript error:', err.message);

        if (err.message === 'NO_CAPTIONS' || err.message === 'INNERTUBE_FAILED') {
            // Try page scrape as last resort
            try {
                return await tryPageScrape(videoId, headers);
            } catch (scrapeErr) {
                console.error('Page scrape also failed:', scrapeErr.message);
            }
        }

        return {
            statusCode: 422,
            headers,
            body: JSON.stringify({
                error: 'Could not get transcript for this video. It may not have captions available.',
                code: 'NO_CAPTIONS'
            })
        };
    }
};

async function tryPageScrape(videoId, headers) {
    const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cookie': 'CONSENT=PENDING+987; SOCS=CAESEwgDEgk2NDcwMTcxMjQaAmVuIAEaBgiA_t-yBg',
        }
    });

    if (!pageRes.ok) throw new Error('Page fetch failed');
    const html = await pageRes.text();

    // Try to extract ytInitialPlayerResponse
    const match = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;/s);
    if (!match) throw new Error('NO_PLAYER_RESPONSE');

    let playerResponse;
    try {
        playerResponse = JSON.parse(match[1]);
    } catch {
        throw new Error('JSON_PARSE_FAILED');
    }

    const videoTitle = playerResponse?.videoDetails?.title || '';
    const captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

    if (!captionTracks || captionTracks.length === 0) {
        throw new Error('NO_CAPTIONS');
    }

    let track = captionTracks.find(t => t.languageCode === 'en' && !t.kind);
    if (!track) track = captionTracks.find(t => t.languageCode === 'en');
    if (!track) track = captionTracks[0];

    const capRes = await fetch(track.baseUrl);
    if (!capRes.ok) throw new Error('Caption fetch failed');

    const xml = await capRes.text();
    const transcript = parseCaptionXml(xml);

    if (!transcript || transcript.length < 10) {
        throw new Error('NO_CAPTIONS');
    }

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ transcript, videoTitle })
    };
}

function parseCaptionXml(xml) {
    const segments = [];
    const regex = /<text[^>]*>([\s\S]*?)<\/text>/g;
    let m;
    while ((m = regex.exec(xml)) !== null) {
        const decoded = m[1]
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\n/g, ' ')
            .trim();
        if (decoded) segments.push(decoded);
    }
    return segments.join(' ');
}
