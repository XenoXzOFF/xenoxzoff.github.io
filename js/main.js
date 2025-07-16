// main.js : gère affichage organigramme, places, et admin (modal + AJAX)

// Variables globales
let members = [];
let places = [];

// Fetch données pour organigramme et places (page publique)
function fetchData() {
  fetch('data.json')
    .then(resp => resp.json())
    .then(data => {
      members = data.members || [];
      places = data.places || [];
      if (document.getElementById('org-container')) renderOrganigramme();
      if (document.getElementById('places-container')) renderPlaces();
      if (document.getElementById('members-table')) renderMembersTable();
      if (document.getElementById('places-table')) renderPlacesTable();
    })
    .catch(() => {
      console.error('Erreur chargement data.json');
    });
}

// Organigramme public
function renderOrganigramme() {
  const container = document.getElementById('org-container');
  if (!container) return;
  if (members.length === 0) {
    container.innerHTML = '<p>Aucun membre dans l\'organigramme.</p>';
    return;
  }
  let html = '<ul class="org-list">';
  members.forEach(m => {
    html += `<li><strong>${escapeHtml(m.name)}</strong> - <em>${escapeHtml(m.role)}</em></li>`;
  });
  html += '</ul>';
  container.innerHTML = html;
}

// Places publiques
function renderPlaces() {
  const container = document.getElementById('places-container');
  if (!container) return;
  if (places.length === 0) {
    container.innerHTML = '<p>Aucune place disponible.</p>';
    return;
  }
  let html = '<table><thead><tr><th>Nom</th><th>Restantes</th><th>Max</th></tr></thead><tbody>';
  places.forEach(p => {
    html += `<tr><td>${escapeHtml(p.name)}</td><td>${p.remaining}</td><td>${p.max}</td></tr>`;
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

// Admin : affichage membres
function renderMembersTable() {
  const tbody = document.querySelector('#members-table tbody');
  tbody.innerHTML = '';
  members.forEach((m, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(m.name)}</td>
      <td>${escapeHtml(m.role)}</td>
      <td>
        <button class="action-btn" onclick="openMemberModal(${i})">Modifier</button>
        <button class="action-btn" onclick="deleteMember(${i})">Supprimer</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Admin : affichage places
function renderPlacesTable() {
  const tbody = document.querySelector('#places-table tbody');
  tbody.innerHTML = '';
  places.forEach((p, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(p.name)}</td>
      <td>${p.remaining}</td>
      <td>${p.max}</td>
      <td>
        <button class="action-btn" onclick="openPlaceModal(${i})">Modifier</button>
        <button class="action-btn" onclick="deletePlace(${i})">Supprimer</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Modals
const modal = document.getElementById('modal');
const modalForm = document.getElementById('modal-form');

function openModal() {
  modal.classList.remove('hidden');
}

function closeModal() {
  modal.classList.add('hidden');
  modalForm.innerHTML = '';
}

// Helper escape HTML
function escapeHtml(text) {
  return text.replace(/[&<>"']/g, function(m) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];
  });
}

// === Gestion membres ===

function openMemberModal(index = -1) {
  modalForm.innerHTML = `
    <h3>${index >= 0 ? 'Modifier' : 'Ajouter'} un membre</h3>
    <label for="name">Nom :</label>
    <input type="text" id="name" name="name" required value="${index >= 0 ? escapeHtml(members[index].name) : ''}">
    <label for="role">Rôle :</label>
    <select id="role" name="role" required>
      <option value="">-- Choisir --</option>
      <option value="Président" ${index >= 0 && members[index].role === 'Président' ? 'selected' : ''}>Président</option>
      <option value="Secrétaire" ${index >= 0 && members[index].role === 'Secrétaire' ? 'selected' : ''}>Secrétaire</option>
      <option value="Trésorier" ${index >= 0 && members[index].role === 'Trésorier' ? 'selected' : ''}>Trésorier</option>
      <option value="Autre" ${index >= 0 && !['Président','Secrétaire','Trésorier'].includes(members[index].role) ? 'selected' : ''}>Autre</option>
    </select>
    <div id="otherRoleContainer" style="display: ${index >= 0 && !['Président','Secrétaire','Trésorier'].includes(members[index].role) ? 'block' : 'none'};">
      <label for="otherRole">Préciser rôle :</label>
      <input type="text" id="otherRole" name="otherRole" value="${index >= 0 && !['Président','Secrétaire','Trésorier'].includes(members[index].role) ? escapeHtml(members[index].role) : ''}">
    </div>
    <button type="submit">${index >= 0 ? 'Modifier' : 'Ajouter'}</button>
  `;
  // Affichage conditionnel rôle
  modalForm.querySelector('#role').addEventListener('change', function() {
    if (this.value === 'Autre') {
      document.getElementById('otherRoleContainer').style.display = 'block';
    } else {
      document.getElementById('otherRoleContainer').style.display = 'none';
    }
  });

  modalForm.onsubmit = function(e) {
    e.preventDefault();
    let name = this.name.value.trim();
    let role = this.role.value;
    if (role === 'Autre') {
      role = this.otherRole.value.trim();
    }
    if (!name || !role) {
      alert('Nom et rôle sont obligatoires.');
      return;
    }
    saveMember(index, name, role);
  };

  openModal();
}

function saveMember(index, name, role) {
  const formData = new FormData();
  formData.append('action', 'save_member');
  formData.append('index', index);
  formData.append('name', name);
  formData.append('role', role);

  fetch('admin.php', {
    method: 'POST',
    body: formData
  }).then(resp => resp.json())
    .then(data => {
      if (data.success) {
        members = data.members;
        renderMembersTable();
        closeModal();
      } else {
        alert(data.message || 'Erreur lors de la sauvegarde');
      }
    });
}

function deleteMember(index) {
  if (!confirm('Supprimer ce membre ?')) return;
  const formData = new FormData();
  formData.append('action', 'delete_member');
  formData.append('index', index);
  fetch('admin.php', {
    method: 'POST',
    body: formData
  }).then(resp => resp.json())
    .then(data => {
      if (data.success) {
        members = data.members;
        renderMembersTable();
      } else {
        alert(data.message || 'Erreur suppression');
      }
    });
}

// === Gestion places ===

function openPlaceModal(index = -1) {
  modalForm.innerHTML = `
    <h3>${index >= 0 ? 'Modifier' : 'Ajouter'} une place</h3>
    <label for="name">Nom :</label>
    <input type="text" id="name" name="name" required value="${index >= 0 ? escapeHtml(places[index].name) : ''}">
    <label for="remaining">Places restantes :</label>
    <input type="number" id="remaining" name="remaining" min="0" required value="${index >= 0 ? places[index].remaining : 0}">
    <label for="max">Places maximum :</label>
    <input type="number" id="max" name="max" min="1" required value="${index >= 0 ? places[index].max : 1}">
    <button type="submit">${index >= 0 ? 'Modifier' : 'Ajouter'}</button>
  `;

  modalForm.onsubmit = function(e) {
    e.preventDefault();
    let name = this.name.value.trim();
    let remaining = parseInt(this.remaining.value, 10);
    let max = parseInt(this.max.value, 10);
    if (!name || max < 1 || remaining < 0 || remaining > max) {
      alert('Données invalides.');
      return;
    }
    savePlace(index, name, remaining, max);
  };

  openModal();
}

function savePlace(index, name, remaining, max) {
  const formData = new FormData();
  formData.append('action', 'save_place');
  formData.append('index', index);
  formData.append('name', name);
  formData.append('remaining', remaining);
  formData.append('max', max);

  fetch('admin.php', {
    method: 'POST',
    body: formData
  }).then(resp => resp.json())
    .then(data => {
      if (data.success) {
        places = data.places;
        renderPlacesTable();
        closeModal();
      } else {
        alert(data.message || 'Erreur lors de la sauvegarde');
      }
    });
}

function deletePlace(index) {
  if (!confirm('Supprimer cette place ?')) return;
  const formData = new FormData();
  formData.append('action', 'delete_place');
  formData.append('index', index);
  fetch('admin.php', {
    method: 'POST',
    body: formData
  }).then(resp => resp.json())
    .then(data => {
      if (data.success) {
        places = data.places;
        renderPlacesTable();
      } else {
        alert(data.message || 'Erreur suppression');
      }
    });
}

document.addEventListener('DOMContentLoaded', fetchData);
