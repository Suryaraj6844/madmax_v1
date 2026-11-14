
const express = require("express");
const cors = require("cors");
const mapping = require("./data/anime-mapping.json");
const { getPlayerUrls } = require("./animesalt");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.json({ message: "MadMax API is running!" });
});

app.get("/api/animesalt", async (req, res) => {
    try {
        const anilistId = req.query.anilistId;
        const episode = Number(req.query.episode || 1);

        if (!anilistId || !Number.isInteger(episode) || episode < 1) {
            return res.status(400).json({
                success: false,
                error: "Valid anilistId and episode are required"
            });
        }

        const players = await getPlayerUrls(anilistId, episode, mapping);

        res.json({
            success: true,
            ...players
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.listen(PORT, () => {
    console.log(`MadMax API running at http://localhost:${PORT}`);
});
