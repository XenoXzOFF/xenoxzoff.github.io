require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const { Client, GatewayIntentBits, EmbedBuilder, Partials } = require('discord.js');
const fs = require('fs');

const app = express();

// --- CONFIGURATION DES CHEMINS ---
// Le volume sera monté sur /data, nous utilisons donc des chemins absolus.
const dbPath = '/data/database.json';
const configPath = '/data/config.json';

// --- CONFIGURATION DU BOT DISCORD ---
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMembers, 
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel] 
});

client.on('ready', () => {
    console.log(`✅ Bot Elite connecté : ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);

// --- CACHE ---
const cache = {
    members: null,
    lastFetch: 0
};

async function getCachedMembers(guild) {
    const now = Date.now();
    if (!cache.members || (now - cache.lastFetch > 60000)) { // 60000ms = 1 minute
        console.log("🔄 Rafraîchissement du cache des membres Discord...");
        cache.members = await guild.members.fetch();
        cache.lastFetch = now;
    }
    return cache.members;
}

// --- HELPERS (JSON) ---
const getDB = () => {
    if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, JSON.stringify({ applications: [], quotas: {} }, null, 2));
    return JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
};
const saveDB = (data) => fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));

const getConfig = () => {
    if (!fs.existsSync(configPath)) fs.writeFileSync(configPath, JSON.stringify({ maintenance: false }, null, 2));
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
};
const saveConfig = (data) => fs.writeFileSync(configPath, JSON.stringify(data, null, 2));

// --- FONCTIONS DISCORD (LOGS & MP) ---
async function sendLog(title, desc, color = 0xc5a059) {
    try {
        const channel = await client.channels.fetch(process.env.LOG_CHANNEL_ID);
        if (channel) {
            const embed = new EmbedBuilder().setTitle(title).setDescription(desc).setColor(color).setTimestamp();
            await channel.send({ embeds: [embed] });
        }
    } catch (e) { console.error("❌ Erreur Log Discord :", e); }
}

async function sendConfirmMP(userId, posteLabel) {
    try {
        const user = await client.users.fetch(userId);
        const embed = new EmbedBuilder()
            .setTitle("<:on:1450921440407716051> Votre candidature écrite a bien été envoyée.")
// V1            .setDescription(`Votre dossier pour le poste de **${posteLabel}** a bien été réceptionné par nos services.`)
            .setDescription('Une fois le formulaire envoyé, le délai de réponse est d\'environ *48 heures**.\nPassé ce délai, si vous n\'avez aucune réponse, vous pouvez demander à un RH.\n\n⚠️ Toute relance avant ce délai entraînera une sanction ou un refus immédiat.')
            .setColor(0x57f288).setTimestamp();
        await user.send({ embeds: [embed] });
    } catch (e) { console.error(`❌ MP impossible pour ${userId}:`, e); }
}

async function sendResultMP(userId, status) {
    try {
        const user = await client.users.fetch(userId);
        let config = {
            accepte: { txt: "accepté. Bienvenue au collège !", col: 0xf48f0c },
            refuse: { txt: "refusé pour le moment.", col: 0xf48f0c },
            revision: { txt: "mis en cours de révision.", col: 0xf48f0c }
        }[status] || { txt: "mis à jour.", col: 0xf48f0c };
// V1        const embed = new EmbedBuilder().setTitle("⚜️ Mise à jour").setDescription(`Votre dossier a été **${config.txt}**`).setColor(config.col).setTimestamp();
            const embed = new EmbedBuilder().setColor(0xf48f0c).setTitle("<:partiel:1450921453238096094> Votre formulaire écrit a été traité").setDescription(`Connectez-vous au dashboard afin de prendre connaissance du résultat.\n\n🔗 [Cliquez ici pour accéder au Dashboard](https://clg.site.paname-75.fr/dashboard)`).setColor(config.col).setTimestamp();
        await user.send({ embeds: [embed] });
    } catch (e) { console.error(`❌ MP impossible pour ${userId}:`, e); }
}

// --- MIDDLEWARES ---
app.set('view engine', 'ejs');
app.set('trust proxy', 1);
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ 
    secret: process.env.SESSION_SECRET, 
    resave: false, 
    saveUninitialized: false,
    // En production (derrière le proxy Fly.io), il faut activer les cookies sécurisés.
    // Le `app.set('trust proxy', 1)` est nécessaire pour que cela fonctionne.
    cookie: { secure: true } 
}));

app.use(passport.initialize());
app.use(passport.session());

passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: process.env.DISCORD_CALLBACK_URL,
    scope: ['identify', 'guilds']
}, async (acc, ref, prof, done) => {
    try {
        const guild = await client.guilds.fetch(process.env.GUILD_ID);
        const member = await guild.members.fetch(prof.id).catch(() => null);
        prof.isAdmin = member ? member.roles.cache.has(process.env.ADMIN_ROLE_ID) : false;
        return done(null, prof);
    } catch (e) { 
        console.error("❌ Erreur lors de la vérification de l'utilisateur via Passport:", e);
        return done(e, null); // On signale une erreur d'authentification
    }
}));

passport.serializeUser((u, d) => d(null, u));
passport.deserializeUser((o, d) => d(null, o));

// Middleware de Maintenance
app.use((req, res, next) => {
    const config = getConfig();
    res.locals.maintenance = config.maintenance;
    res.locals.user = req.user || null;

    if (config.maintenance) {
        const allowedRoutes = ['/auth/discord', '/auth/callback', '/logout', '/maintenance'];
        if (req.user && req.user.isAdmin) return next();
        if (!allowedRoutes.includes(req.path)) return res.redirect('/maintenance');
    }
    next();
});

// Middleware de synchronisation des permissions (toutes les minutes)
app.use(async (req, res, next) => {
    // Ne rien faire si l'utilisateur n'est pas connecté
    if (!req.isAuthenticated()) {
        return next();
    }

    const now = Date.now();
    const userSession = req.session.passport.user;

    // Synchroniser toutes les 60 secondes (60000 ms)
    if (!userSession.lastSync || (now - userSession.lastSync > 60000)) {
        console.log(`🔄 Synchronisation des permissions pour ${userSession.username}...`);
        try {
            const guild = await client.guilds.fetch(process.env.GUILD_ID);
            const member = await guild.members.fetch(userSession.id).catch(() => null);
            
            const newIsAdmin = member ? member.roles.cache.has(process.env.ADMIN_ROLE_ID) : false;

            if (userSession.isAdmin !== newIsAdmin) {
                console.log(`Permissions changées pour ${userSession.username}. Admin: ${newIsAdmin}`);
                userSession.isAdmin = newIsAdmin;
            }
            
            userSession.lastSync = now;
            req.user.isAdmin = userSession.isAdmin; // Mettre à jour req.user pour la requête actuelle
            
            // Sauvegarder la session et continuer
            return req.session.save(err => next(err));

        } catch (error) {
            console.error(`❌ Erreur de synchronisation pour ${userSession.username}:`, error);
            return next(); // On continue même si la synchro échoue pour ne pas bloquer l'utilisateur
        }
    } else {
        // Pas besoin de synchroniser, on continue
        return next();
    }
});

// --- ROUTES ---

app.get('/maintenance', (req, res) => {
    const config = getConfig();
    if (!config.maintenance) return res.redirect('/');
    res.render('maintenance'); // Tu dois créer maintenance.ejs
});

app.get('/', (req, res) => res.render('index'));
app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => res.redirect('/dashboard'));
app.get('/logout', (req, res) => req.logout(() => res.redirect('/')));

app.get('/dashboard', (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/auth/discord');
    const db = getDB();
    const userApps = db.applications.filter(a => a.userId === req.user.id);
    res.render('dashboard', { appData: userApps[userApps.length - 1] || null, totalUserApps: userApps.length });
});

app.get('/apply', async (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/auth/discord');

    const db = getDB();
    const lastApp = db.applications.findLast(a => a.userId === req.user.id);
    
    // Si l'utilisateur a déjà une candidature en cours de révision, on le redirige.
    if (lastApp && lastApp.status === 'revision') {
        return res.redirect('/dashboard');
    }
    try {
        const guild = await client.guilds.fetch(process.env.GUILD_ID);
        const allMembers = await getCachedMembers(guild);
        const rolesStatus = {};
        if (db.quotas) {
            for (const [id, info] of Object.entries(db.quotas)) {
                const count = allMembers.filter(m => m.roles.cache.has(id)).size;
                const max = (info.max === "Infini" || info.max === "Infinity") ? Infinity : parseInt(info.max);
                rolesStatus[id] = { label: info.name, current: count, quota: max, isFull: max !== Infinity && count >= max };
            }
        }
        res.render('apply', { rolesStatus });
    } catch (e) { 
        console.error("❌ Erreur lors du chargement des rôles pour la candidature :", e);
        res.render('apply', { rolesStatus: {} }); 
    }
});

app.post('/apply', async (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/');
    const db = getDB();

    const lastApp = db.applications.findLast(a => a.userId === req.user.id);
    // Sécurité côté serveur pour empêcher la soumission multiple
    if (lastApp && lastApp.status === 'revision') {
        return res.redirect('/dashboard');
    }

    const roleInfo = db.quotas[req.body.posteId];
    const now = new Date().toISOString();
    const posteName = roleInfo ? roleInfo.name : "Inconnu";
    const fullRpName = `${req.body.prenomRP} ${req.body.nomRP}`;

    const newApp = {
        userId: req.user.id, username: req.user.username, rpName: fullRpName,
        posteId: req.body.posteId, posteLabel: posteName,
        prenomIRL: req.body.prenomIRL, ageIRL: req.body.ageIRL,
        prenomRP: req.body.prenomRP, nomRP: req.body.nomRP, ageRP: req.body.ageRP,
        dateNaissanceRP: req.body.dateNaissanceRP, villeNaissanceRP: req.body.villeNaissanceRP,
        deptNaissanceRP: req.body.deptNaissanceRP, cpNaissanceRP: req.body.cpNaissanceRP,
        motivations: req.body.motivations, apport: req.body.apport || "",
        status: 'revision',
        createdAt: now, updatedAt: now, history: [{ action: "Soumission", date: now, by: "Système" }]
    };
    db.applications.push(newApp);
    saveDB(db);
    await sendConfirmMP(req.user.id, posteName);
    
    let logDesc = `**👤 Identité IRL**\n`
                + `> Prénom : \`${req.body.prenomIRL}\`\n`
                + `> Âge : \`${req.body.ageIRL}\` ans\n\n`
                + `**🎭 Identité RP**\n`
                + `> Nom : \`${fullRpName}\`\n`
                + `> Âge : \`${req.body.ageRP}\` ans\n`
                + `> Date de Naissance : \`${new Date(req.body.dateNaissanceRP).toLocaleDateString('fr-FR')}\`\n`
                + `> Ville de Naissance : \`${req.body.villeNaissanceRP}\`\n`
                + `> Département : \`${req.body.deptNaissanceRP}\`\n`
                + `> Code Postal : \`${req.body.cpNaissanceRP}\`\n\n`
                + `**📂 Poste :** ${posteName}\n\n**📝 Motivations :**\n${req.body.motivations}`;
    if (req.body.apport) logDesc += `\n\n**🤝 Apport :**\n${req.body.apport}`;

    sendLog("📄 Nouvelle Candidature", logDesc);
    res.redirect('/dashboard');
});

app.get('/membres', async (req, res) => {
    try {
        const db = getDB();
        const guild = await client.guilds.fetch(process.env.GUILD_ID);
        const allMembers = await getCachedMembers(guild);
        const effectif = {};
        if (db.quotas) {
            for (const [id, info] of Object.entries(db.quotas)) {
                const roleExists = guild.roles.cache.has(id);
                if (roleExists) {
                    const users = allMembers.filter(m => m.roles.cache.has(id));
                    effectif[id] = { label: info.name, quota: info.max, membres: users.map(u => u.displayName) };
                } else {
                    effectif[id] = { label: info.name + " (Absent)", quota: info.max, membres: [] };
                }
            }
        }
        res.render('membres', { effectif });
    } catch (e) { 
        console.error("❌ Erreur Organigramme :", e);
        res.status(500).send("Erreur organigramme."); 
    }
});

// --- ADMIN ---
app.get('/admin', (req, res) => {
    if (!req.user?.isAdmin) return res.redirect('/');
    res.render('admin', { applications: getDB().applications, maintenance: getConfig().maintenance });
});

// Route pour activer/désactiver la maintenance
app.post('/admin/maintenance', (req, res) => {
    if (!req.user?.isAdmin) return res.redirect('/');
    const config = getConfig();
    config.maintenance = !config.maintenance;
    saveConfig(config);
    sendLog("🛠️ Maintenance", `Statut : **${config.maintenance ? 'ACTIVÉ' : 'DÉSACTIVÉ'}**`);
    res.redirect('/admin');
});

app.get('/view/:userId', (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/');

    // Autoriser l'accès si c'est un admin OU si l'utilisateur consulte son propre dossier
    if (!req.user.isAdmin && req.user.id !== req.params.userId) {
        return res.redirect('/dashboard');
    }

    const db = getDB();
    const userApps = db.applications.filter(a => a.userId === req.params.userId);
    if (userApps.length === 0) return res.redirect(req.user.isAdmin ? '/admin' : '/dashboard');
    res.render('view_app', { app: userApps[userApps.length - 1], attempts: userApps.length });
});

app.post('/admin/status/:userId', async (req, res) => {
    if (!req.user?.isAdmin) return res.redirect('/');
    const db = getDB();
    const appIdx = db.applications.findLastIndex(a => a.userId === req.params.userId);
    if (appIdx !== -1) {
        const now = new Date().toISOString();
        db.applications[appIdx].status = req.body.status;
        db.applications[appIdx].updatedAt = now;
        db.applications[appIdx].history.push({ action: `Statut : ${req.body.status}`, date: now, by: req.user.username });
        saveDB(db);
        await sendResultMP(req.params.userId, req.body.status);
        sendLog("⚖️ Mise à jour", `Dossier de **${db.applications[appIdx].rpName}** : **${req.body.status}**`);
    }
    res.redirect('/view/' + req.params.userId);
});

app.post('/admin/delete/:userId', (req, res) => {
    if (!req.user?.isAdmin) return res.redirect('/');
    const db = getDB();
    const reset = req.body.resetAttempts === 'true';

    if (reset) {
        // Supprimer toutes les candidatures de l'utilisateur
        const userToDelete = db.applications.find(a => a.userId === req.params.userId);
        db.applications = db.applications.filter(a => a.userId !== req.params.userId);
        sendLog("🗑️ Purge Dossiers", `Toutes les candidatures de **${userToDelete?.username || 'Utilisateur Inconnu'}** ont été supprimées.`);
    } else {
        // Supprimer uniquement la dernière candidature
        const appIdx = db.applications.findLastIndex(a => a.userId === req.params.userId);
        if (appIdx !== -1) {
            const appName = db.applications[appIdx].rpName;
            db.applications.splice(appIdx, 1);
            sendLog("🗑️ Suppression Dossier", `Le dernier dossier de **${appName}** a été supprimé.`);
        }
    }
    saveDB(db);
    res.redirect('/admin');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Port : ${PORT}`));