// Récupère les rôles Discord
async function fetchDiscordRoles() {
    try {
        const response = await fetch('https://votre-api.com/discord-roles');
        const roles = await response.json();
        
        // Mise à jour de l'organigramme
        document.querySelectorAll('.discord-count').forEach(el => {
            const role = el.getAttribute('data-role');
            el.textContent = roles[role] || 0;
        });
        
        // Mise à jour du tableau des stats
        const statsContainer = document.getElementById('discord-roles-stats');
        statsContainer.innerHTML = '';
        
        for (const [role, count] of Object.entries(roles)) {
            const roleElement = document.createElement('div');
            roleElement.className = 'role-card';
            roleElement.innerHTML = `
                <div class="role-name">${role}</div>
                <div class="role-count">${count} membres</div>
            `;
            statsContainer.appendChild(roleElement);
        }
    } catch (error) {
        console.error('Erreur de récupération des rôles:', error);
    }
}

// Appel initial
fetchDiscordRoles();