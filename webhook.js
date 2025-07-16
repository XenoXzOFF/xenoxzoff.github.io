// Script pour envoyer un embed Discord via un webhook lors de la soumission d'un formulaire
// À inclure dans les pages d'inscription

async function sendDiscordWebhook(data, type) {
  // Remplacez l'URL ci-dessous par votre propre URL de webhook Discord !
  const webhookUrl = 'https://discord.com/api/webhooks/1394709417458667681/HoXuDdl3F26oQEqy0_7dsmSb2AnP7vj-0Fgh6kX60yD_bPqri-B5l2l5c48BSenwhDdu';
  const embed = {
    title: type === 'eleve' ? 'Nouvelle inscription élève' : 'Nouvelle inscription personnel',
    color: type === 'eleve' ? 3447003 : 16776960,
    fields: Object.entries(data).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value: value || 'Non renseigné',
      inline: false
    })),
    timestamp: new Date().toISOString()
  };
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] })
  });
}
