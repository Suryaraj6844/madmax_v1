const API_URL = "https://graphql.anilist.co";

const SEARCH_QUERY = `
  query ($search: String) {
    Page(page: 1, perPage: 18) {
      media(search: $search, type: ANIME, sort: SEARCH_MATCH, isAdult: false) {
        id
        idMal
        title {
          romaji
          english
          native
        }
        coverImage {
          large
        }
        format
        episodes
        seasonYear
      }
    }
  }
`;

const form = document.querySelector("#search-form");
const input = document.querySelector("#search-input");
const button = document.querySelector("#search-button");
const statusText = document.querySelector("#status");
const results = document.querySelector("#results");
const selection = document.querySelector("#selection");
const selectedAnime = document.querySelector("#selected-anime");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const search = input.value.trim();
  if (!search) return;

  button.disabled = true;
  results.replaceChildren();
  selection.classList.add("hidden");
  statusText.textContent = "Searching AniList...";

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        query: SEARCH_QUERY,
        variables: { search }
      })
    });

    if (!response.ok) {
      throw new Error(`AniList returned HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (payload.errors) {
      throw new Error(payload.errors[0]?.message || "AniList query failed");
    }

    const animeList = payload.data.Page.media;
    if (!animeList.length) {
      statusText.textContent = "No anime found. Try another title.";
      return;
    }

    statusText.textContent = `${animeList.length} results. Select an anime to view its IDs.`;
    renderResults(animeList);
  } catch (error) {
    console.error(error);
    statusText.textContent = `Search failed: ${error.message}. Check your connection and try again.`;
  } finally {
    button.disabled = false;
  }
});

function renderResults(animeList) {
  const fragment = document.createDocumentFragment();

  animeList.forEach((anime) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "anime-card";

    const image = document.createElement("img");
    image.src = anime.coverImage.large;
    image.alt = `${getTitle(anime)} poster`;
    image.loading = "lazy";

    const info = document.createElement("div");
    info.className = "anime-info";

    const title = document.createElement("h3");
    title.textContent = getTitle(anime);

    const meta = document.createElement("p");
    meta.textContent = [anime.format, anime.seasonYear, anime.episodes ? `${anime.episodes} eps` : null]
      .filter(Boolean).join(" · ");

    info.append(title, meta);
    card.append(image, info);
    card.addEventListener("click", () => selectAnime(anime));
    fragment.append(card);
  });

  results.replaceChildren(fragment);
}

function selectAnime(anime) {
  selectedAnime.replaceChildren();

  const row = document.createElement("div");
  row.className = "selected-row";

  const image = document.createElement("img");
  image.src = anime.coverImage.large;
  image.alt = "";

  const details = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = getTitle(anime);

  const ids = document.createElement("div");
  ids.className = "ids";
  ids.textContent = `AniList ID: ${anime.id}\nMAL ID: ${anime.idMal ?? "Not available"}`;

  details.append(title, ids);
  row.append(image, details);
  selectedAnime.append(row);
  selection.classList.remove("hidden");

  // These IDs will feed the provider URL generators in the next milestone.
  console.log("Selected anime:", {
    title: getTitle(anime),
    anilistId: anime.id,
    malId: anime.idMal
  });
}

function getTitle(anime) {
  return anime.title.english || anime.title.romaji || anime.title.native || "Unknown title";
}
