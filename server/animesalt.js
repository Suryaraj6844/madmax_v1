
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
        method: "GET",
        redirect: "follow",

        headers: {
            "User-Agent":
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/160.0.0.0 Safari/537.36",

            "Accept":
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",

            "Accept-Language": "en-US,en;q=0.9",

            "Referer": `${BASE_URL}/`,

            "Upgrade-Insecure-Requests": "1"
        },

        signal: AbortSignal.timeout(20000)
    });


    // FALLBACK WHEN SERVER-SIDE ACCESS IS DENIED

    if (response.status === 403) {
        console.warn(
            `AnimeSalt returned 403 for ${slug}. Using episode page fallback.`
        );

        return {
            slug,
            pageUrl,
            ravok: null,
            abyss: pageUrl,
            fallback: "episode-page"
        };
    }


    if (!response.ok) {
        throw new Error(`AnimeSalt returned HTTP ${response.status}`);
    }


    // PARSE EPISODE HTML

    const html = await response.text();
    const $ = cheerio.load(html);


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


    const ravok = extractPlayer(0);
    const abyss = extractPlayer(1);


    if (!abyss && !ravok) {
        throw new Error("No AnimeSalt players found on episode page.");
    }


    return {
        slug,
        pageUrl,
        ravok,
        abyss,
        fallback: null
    };
}


module.exports = {
    getPlayerUrls
};
