// server.js
const express = require('express');
const app = express();
const cors = require('cors');

app.use(cors());

// Données simulées
const discordData = {
    eleves: 245,
    personnel: 32,
    total: 277,
    roles: {
        cpe: 3,
        intendance: 5,
        professeur: 22,
        administration: 2
    }
};

// Endpoint pour les stats globales
app.get('/discord-stats', (req, res) => {
    res.json({
        eleves: discordData.eleves,
        personnel: discordData.personnel,
        total: discordData.total
    });
});

// Endpoint pour les rôles
app.get('/discord-roles', (req, res) => {
    res.json(discordData.roles);
});

app.listen(3000, () => {
    console.log('API running on port 3000');
});