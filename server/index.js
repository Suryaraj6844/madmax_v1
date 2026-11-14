const express = require("express");
const cors = require("cors");
const mapping = require("./data/anime-mapping.json");
const { getPlayerUrls } = require("./animesalt");

const app = express();

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.json({
        message: "MadMax API is running!"
    });
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

        const players = await getPlayerUrls(
            anilistId,
            episode,
            mapping
        );

        res.json({
            success: true,
            ...players
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.listen(PORT, HOST, () => {
    console.log(`MadMax API running on port ${PORT}`);
});
