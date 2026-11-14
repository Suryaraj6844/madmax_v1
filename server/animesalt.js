const cheerio = require("cheerio");

const BASE_URL = "https://animesalt.cx";


// GENERATE ANIMESALT EPISODE SLUG

function getEpisodeSlug(mapping, anilistId, episode) {

    const entries = mapping[String(anilistId)];

    if (!entries) {
        throw new Error("Anime not found in mapping");
    }

    const sorted = [...entries].sort(
        (a, b) => (b.startEpisode || 1) - (a.startEpisode || 1)
    );

    const selected =
        sorted.find(e => episode >= (e.startEpisode || 1)) || entries[0];

    const finalEpisode =
        selected.episodeOffset !== undefined
            ? Math.max(1, episode + selected.episodeOffset)
            : episode;

    return `${selected.saltId}-${selected.season ?? 1}x${finalEpisode}`;
}


// FETCH ANIMESALT PLAYER URLS

async function getPlayerUrls(anilistId, episode, mapping) {

    const slug = getEpisodeSlug(mapping, anilistId, episode);

    const pageUrl = `${BASE_URL}/episode/${slug}/`;

    const response = await fetch(pageUrl, {
        headers: {
            "User-Agent":
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",

            Referer: `${BASE_URL}/`
        },

        signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
        throw new Error(`AnimeSalt returned HTTP ${response.status}`);
    }

    const html = await response.text();

    const $ = cheerio.load(html);


    // EXTRACT PLAYER IFRAME URL

    function extractPlayer(optionId) {

        const option = $(
            `#options-${optionId}, #option-${optionId}, #opt-${optionId}`
        ).first();

        const iframe = option.find("iframe").first();

        let url =
            iframe.attr("data-src") ||
            iframe.attr("src") ||
            null;

        if (url && url.startsWith("//")) {

            url = `https:${url}`;

        } else if (url && url.startsWith("/")) {

            url = new URL(url, BASE_URL).href;
        }

        return url;
    }


    // SERVER 1: RAVOK
    const ravok = extractPlayer(0);

    // SERVER 2: ABYSSPLAYER MULTI-AUDIO
    // Language selection is handled inside the AbyssPlayer itself.
    const abyss = extractPlayer(1);


    return {
        slug,
        pageUrl,
        ravok,
        abyss
    };
}


module.exports = {
    getPlayerUrls
};