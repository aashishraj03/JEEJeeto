document.addEventListener('DOMContentLoaded', async () => {
  const loginNav = document.getElementById('navLoginBtn');
  const accountNav = document.getElementById('navAccountBtn');
  const logoutBtns = document.querySelectorAll('.logout-btn');

  // 1. Strict Tab Check: Agar is specific tab me session flag nahi hai to force logout state
  const isTabActive = sessionStorage.getItem('jee_session_active') === 'true';

  if (!isTabActive) {
    if (loginNav) loginNav.style.display = 'inline-block';
    if (accountNav) accountNav.style.display = 'none';
    // Background me cookie clear kar do taaki state completely sync rahe
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    return;
  }

  // 2. Agar tab me session active hai to backend se verify karo
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();

    if (data.authenticated) {
      if (loginNav) loginNav.style.display = 'none';
      if (accountNav) accountNav.style.display = 'inline-flex';
    } else {
      sessionStorage.removeItem('jee_session_active');
      if (loginNav) loginNav.style.display = 'inline-block';
      if (accountNav) accountNav.style.display = 'none';
    }
  } catch (err) {
    if (loginNav) loginNav.style.display = 'inline-block';
    if (accountNav) accountNav.style.display = 'none';
  }

  // 3. Handle Sign Out button on all pages
  logoutBtns.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      sessionStorage.removeItem('jee_session_active');
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.href = 'login.html';
      } catch (err) {
        window.location.href = 'login.html';
      }
    });
  });
});