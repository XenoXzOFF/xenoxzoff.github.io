// ==== Data ====

const ORGANIGRAMME_STORAGE_KEY = 'organigrammeData';
const PLACES_STORAGE_KEY = 'placesData';
const ADMIN_PASSWORD = 'admin123'; // mot de passe simple côté client (pas sécurisé en prod)

// Récupérer données localStorage ou valeurs par défaut
let organigramme = JSON.parse(localStorage.getItem(ORGANIGRAMME_STORAGE_KEY)) || [
  { id: 1, name: 'Mme Dupont', role: 'Directeur' },
  { id: 2, name: 'M. Martin', role: 'Professeur Principal' },
  { id: 3, name: 'Mme Durant', role: 'Professeur' }
];

let places = JSON.parse(localStorage.getItem(PLACES_STORAGE_KEY)) || [
  { id: 1, name: 'Salle 101', max: 30, remaining: 5 },
  { id: 2, name: 'Salle 102', max: 25, remaining: 0 }
];

// ==== Fonctions de rendu ====

function renderOrganigramme() {
  const container = document.getElementById('organigramme-list');
  if (!container) return;

  container.innerHTML = '';
  organigramme.forEach(member => {
    const div = document.createElement('div');
    div.className = 'member';
    div.innerHTML = `<h3>${member.name}</h3><p>${member.role}</p>`;
    container.appendChild(div);
  });
}

function renderPlaces() {
  const container = document.getElementById('places-list');
  if (!container) return;

  container.innerHTML = '';
  places.forEach(place => {
    const div = document.createElement('div');
    div.className = 'place';
    div.innerHTML = `
      <h3>${place.name}</h3>
      <p>Places restantes: ${place.remaining} / ${place.max}</p>
    `;
    container.appendChild(div);
  });
}

// ==== Admin page ====

function renderAdminOrganigramme() {
  const container = document.getElementById('organigramme-admin-list');
  if (!container) return;

  container.innerHTML = '';
  organigramme.forEach(member => {
    const div = document.createElement('div');
    div.className = 'member';
    div.innerHTML = `
      <h3>${member.name}</h3>
      <p>${member.role}</p>
      <button class="btn-edit" data-id="${member.id}" title="Modifier">&#9998;</button>
      <button class="btn-delete" data-id="${member.id}" title="Supprimer">&#10060;</button>
    `;
    container.appendChild(div);
  });
}

function renderAdminPlaces() {
  const container = document.getElementById('places-admin-list');
  if (!container) return;

  container.innerHTML = '';
  places.forEach(place => {
    const div = document.createElement('div');
    div.className = 'place';
    div.innerHTML = `
      <h3>${place.name}</h3>
      <p>Places restantes: ${place.remaining} / ${place.max}</p>
      <button class="btn-edit" data-id="${place.id}" title="Modifier">&#9998;</button>
      <button class="btn-delete" data-id="${place.id}" title="Supprimer">&#10060;</button>
    `;
    container.appendChild(div);
  });
}

// ==== Modal helpers ====

const modalMember = document.getElementById('modal-member');
const modalPlace = document.getElementById('modal-place');
const closeButtons = document.querySelectorAll('.close');

closeButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    modalMember.style.display = 'none';
    modalPlace.style.display = 'none';
  });
});

window.onclick = function(event) {
  if (event.target === modalMember) modalMember.style.display = 'none';
  if (event.target === modalPlace) modalPlace.style.display = 'none';
};

// ==== Ajout / modification membre ====

let editingMemberId = null;
let editingPlaceId = null;

function openMemberModal(editId = null) {
  editingMemberId = editId;
  const form = document.getElementById('form-member');
  if (editId !== null) {
    const member = organigramme.find(m => m.id === editId);
    form['member-name'].value = member.name;
    form['member-role'].value = member.role;
    document.getElementById('modal-member-title').textContent = 'Modifier un membre';
  } else {
    form.reset();
    document.getElementById('modal-member-title').textContent = 'Ajouter un membre';
  }
  modalMember.style.display = 'flex';
}

function openPlaceModal(editId = null) {
  editingPlaceId = editId;
  const form = document.getElementById('form-place');
  if (editId !== null) {
    const place = places.find(p => p.id === editId);
    form['place-name'].value = place.name;
    form['place-max'].value = place.max;
    form['place-remaining'].value = place.remaining;
    document.getElementById('modal-place-title').textContent = 'Modifier une place';
  } else {
    form.reset();
    document.getElementById('modal-place-title').textContent = 'Ajouter une place';
  }
  modalPlace.style.display = 'flex';
}

// ==== Sauvegarde ====

function saveOrganigramme() {
  localStorage.setItem(ORGANIGRAMME_STORAGE_KEY, JSON.stringify(organigramme));
}

function savePlaces() {
  localStorage.setItem(PLACES_STORAGE_KEY, JSON.stringify(places));
}

// ==== Événements formulaire ====

document.getElementById('form-member').addEventListener('submit', function(e) {
  e.preventDefault();
  const name = this['member-name'].value.trim();
  const role = this['member-role'].value.trim();

  if (!name || !role) {
    alert('Veuillez remplir tous les champs.');
    return;
  }

  if (editingMemberId !== null) {
    // Modifier membre existant
    const member = organigramme.find(m => m.id === editingMemberId);
    member.name = name;
    member.role = role;
  } else {
    // Ajouter membre
    const newId = organigramme.length ? Math.max(...organigramme.map(m => m.id)) + 1 : 1;
    organigramme.push({ id: newId, name, role });
  }

  saveOrganigramme();
  renderOrganigramme();
  renderAdminOrganigramme();
  modalMember.style.display = 'none';
});

document.getElementById('form-place').addEventListener('submit', function(e) {
  e.preventDefault();
  const name = this['place-name'].value.trim();
  const max = parseInt(this['place-max'].value, 10);
  const remaining = parseInt(this['place-remaining'].value, 10);

  if (!name || isNaN(max) || isNaN(remaining) || max < 0 || remaining < 0 || remaining > max) {
    alert('Veuillez remplir correctement tous les champs.');
    return;
  }

  if (editingPlaceId !== null) {
    const place = places.find(p => p.id === editingPlaceId);
    place.name = name;
    place.max = max;
    place.remaining = remaining;
  } else {
    const newId = places.length ? Math.max(...places.map(p => p.id)) + 1 : 1;
    places.push({ id: newId, name, max, remaining });
  }

  savePlaces();
  renderPlaces();
  renderAdminPlaces();
  modalPlace.style.display = 'none';
});

// ==== Suppression ====

document.getElementById('organigramme-admin-list').addEventListener('click', function(e) {
  if (e.target.classList.contains('btn-delete')) {
    const id = parseInt(e.target.dataset.id, 10);
    if (confirm('Voulez-vous vraiment supprimer ce membre ?')) {
      organigramme = organigramme.filter(m => m.id !== id);
      saveOrganigramme();
      renderOrganigramme();
      renderAdminOrganigramme();
    }
  } else if (e.target.classList.contains('btn-edit')) {
    const id = parseInt(e.target.dataset.id, 10);
    openMemberModal(id);
  }
});

document.getElementById('places-admin-list').addEventListener('click', function(e) {
  if (e.target.classList.contains('btn-delete')) {
    const id = parseInt(e.target.dataset.id, 10);
    if (confirm('Voulez-vous vraiment supprimer cette place ?')) {
      places = places.filter(p => p.id !== id);
      savePlaces();
      renderPlaces();
      renderAdminPlaces();
    }
  } else if (e.target.classList.contains('btn-edit')) {
    const id = parseInt(e.target.dataset.id, 10);
    openPlaceModal(id);
  }
});

// ==== Admin login ====

const loginForm = document.getElementById('login-form');
const loginSection = document.getElementById('login-section');
const adminSection = document.getElementById('admin-section');

loginForm.addEventListener('submit', function(e) {
  e.preventDefault();
  const password = this['password'].value;

  if (password === ADMIN_PASSWORD) {
    loginSection.style.display = 'none';
    adminSection.style.display = 'block';
    renderAdminOrganigramme();
    renderAdminPlaces();
  } else {
    alert('Mot de passe incorrect.');
  }
});

// ==== Initial render ====

renderOrganigramme();
renderPlaces();
