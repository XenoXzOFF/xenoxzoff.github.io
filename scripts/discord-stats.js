// Récupère les statistiques depuis l'API Discord
async function fetchDiscordStats() {
    try {
        const response = await fetch('https://votre-api.com/discord-stats');
        const data = await response.json();
        
        // Mise à jour des compteurs
        document.getElementById('total-eleves').textContent = data.eleves;
        document.getElementById('total-personnel').textContent = data.personnel;
        document.getElementById('total-membres').textContent = data.total;
        
        // Animation des nombres
        animateCounters();
    } catch (error) {
        console.error('Erreur de récupération des stats:', error);
    }
}

// Anime les compteurs
function animateCounters() {
    const counters = document.querySelectorAll('.stat-value');
    const speed = 200;
    
    counters.forEach(counter => {
        const target = +counter.innerText;
        const count = +counter.innerText;
        const increment = target / speed;
        
        if (count < target) {
            counter.innerText = Math.ceil(count + increment);
            setTimeout(animateCounters, 1);
        } else {
            counter.innerText = target;
        }
    });
}

// Appel initial
fetchDiscordStats();

// Actualisation périodique
setInterval(fetchDiscordStats, 300000); // Toutes les 5 minutes