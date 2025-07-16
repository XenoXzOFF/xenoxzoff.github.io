<?php
session_start();

if (!isset($_SESSION['is_admin']) || !$_SESSION['is_admin']) {
  header('Location: login.php');
  exit;
}

$dataFile = __DIR__ . '/data.json';

if (!file_exists($dataFile)) {
  file_put_contents($dataFile, json_encode(['members'=>[], 'places'=>[]], JSON_PRETTY_PRINT));
}

$data = json_decode(file_get_contents($dataFile), true);

// Gérer requêtes AJAX
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action'])) {
  header('Content-Type: application/json');
  $action = $_POST['action'];

  function saveData($data) {
    global $dataFile;
    file_put_contents($dataFile, json_encode($data, JSON_PRETTY_PRINT));
  }

  switch ($action) {
    case 'save_member':
      $name = trim($_POST['name'] ?? '');
      $role = trim($_POST['role'] ?? '');
      $index = intval($_POST['index'] ?? -1);
      if ($name === '' || $role === '') {
        echo json_encode(['success' => false, 'message' => 'Nom et rôle obligatoires']);
        exit;
      }
      if ($index >= 0 && isset($data['members'][$index])) {
        $data['members'][$index] = ['name' => $name, 'role' => $role];
      } else {
        $data['members'][] = ['name' => $name, 'role' => $role];
      }
      saveData($data);
      echo json_encode(['success' => true, 'members' => $data['members']]);
      exit;

    case 'delete_member':
      $index = intval($_POST['index'] ?? -1);
      if ($index >= 0 && isset($data['members'][$index])) {
        array_splice($data['members'], $index, 1);
        saveData($data);
        echo json_encode(['success' => true, 'members' => $data['members']]);
      } else {
        echo json_encode(['success' => false, 'message' => 'Membre introuvable']);
      }
      exit;

    case 'save_place':
      $name = trim($_POST['name'] ?? '');
      $remaining = intval($_POST['remaining'] ?? 0);
      $max = intval($_POST['max'] ?? 0);
      $index = intval($_POST['index'] ?? -1);
      if ($name === '' || $max <= 0 || $remaining < 0 || $remaining > $max) {
        echo json_encode(['success' => false, 'message' => 'Données invalides pour la place']);
        exit;
      }
      if ($index >= 0 && isset($data['places'][$index])) {
        $data['places'][$index] = ['name' => $name, 'remaining' => $remaining, 'max' => $max];
      } else {
        $data['places'][] = ['name' => $name, 'remaining' => $remaining, 'max' => $max];
      }
      saveData($data);
      echo json_encode(['success' => true, 'places' => $data['places']]);
      exit;

    case 'delete_place':
      $index = intval($_POST['index'] ?? -1);
      if ($index >= 0 && isset($data['places'][$index])) {
        array_splice($data['places'], $index, 1);
        saveData($data);
        echo json_encode(['success' => true, 'places' => $data['places']]);
      } else {
        echo json_encode(['success' => false, 'message' => 'Place introuvable']);
      }
      exit;

    default:
      echo json_encode(['success' => false, 'message' => 'Action inconnue']);
      exit;
  }
}
?>

<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Admin - Gestion</title>
  <link rel="stylesheet" href="css/styles.css" />
</head>
<body>
  <header>
    <img src="assets/logo.png" alt="Logo du site" class="logo" />
    <h1>Administration</h1>
    <nav>
      <a href="index.html">Accueil</a>
      <a href="organigramme.html">Organigramme</a>
      <a href="places.html">Places</a>
      <a href="logout.php">Déconnexion</a>
    </nav>
  </header>
  <main>
    <section>
      <h2>Gestion de l'organigramme</h2>
      <button onclick="openMemberModal()">Ajouter un membre</button>
      <table id="members-table">
        <thead>
          <tr><th>Nom</th><th>Rôle</th><th>Actions</th></tr>
        </thead>
        <tbody></tbody>
      </table>
    </section>

    <section>
      <h2>Gestion des places</h2>
      <button onclick="openPlaceModal()">Ajouter une place</button>
      <table id="places-table">
        <thead>
          <tr><th>Nom</th><th>Places restantes</th><th>Places max</th><th>Actions</th></tr>
        </thead>
        <tbody></tbody>
      </table>
    </section>
  </main>

  <!-- Modals -->
  <div id="modal" class="modal hidden">
    <div class="modal-content">
      <span class="close" onclick="closeModal()">&times;</span>
      <form id="modal-form">
        <!-- Champs seront injectés via JS -->
      </form>
    </div>
  </div>

  <script src="js/main.js"></script>
</body>
</html>
