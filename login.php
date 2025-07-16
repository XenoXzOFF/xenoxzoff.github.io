<?php
session_start();

$errors = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $password = $_POST['password'] ?? '';

  // Exemple de hash (à générer via password_hash('tonmdp', PASSWORD_DEFAULT))
  $hash = '$2y$10$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'; // À remplacer par ton hash réel

  if (password_verify($password, $hash)) {
    $_SESSION['is_admin'] = true;
    header('Location: admin.php');
    exit;
  } else {
    $errors = 'Mot de passe incorrect.';
  }
}

if (isset($_GET['logout'])) {
  session_destroy();
  header('Location: login.php');
  exit;
}
?>
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Connexion Admin</title>
  <link rel="stylesheet" href="css/styles.css" />
</head>
<body>
  <main class="login-container">
    <h1>Connexion Admin</h1>
    <?php if ($errors): ?>
      <p class="error"><?=htmlspecialchars($errors)?></p>
    <?php endif; ?>
    <form method="POST" action="login.php">
      <label for="password">Mot de passe :</label>
      <input type="password" id="password" name="password" required />
      <button type="submit">Se connecter</button>
    </form>
    <p><a href="index.html">Retour à l'accueil</a></p>
  </main>
</body>
</html>
