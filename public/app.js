// Copy-to-clipboard buttons: <button data-copy="#input-selector">
document.querySelectorAll('[data-copy]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const input = document.querySelector(btn.dataset.copy);
    try {
      await navigator.clipboard.writeText(input.value);
    } catch {
      input.select();
      document.execCommand('copy');
    }
    const label = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => (btn.textContent = label), 1500);
  });
});

// Test the target link currently typed in the field (saved or not).
const testBtn = document.getElementById('test-link');
if (testBtn) {
  testBtn.addEventListener('click', () => {
    let url = document.getElementById('target-url').value.trim();
    if (!url) return alert('No link set — scanning the QR code will show the “nothing here yet” page.');
    if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) url = 'https://' + url;
    window.open(url, '_blank', 'noopener');
  });
}

// Confirmation for destructive forms.
document.querySelectorAll('form[data-confirm]').forEach((form) => {
  form.addEventListener('submit', (e) => {
    if (!confirm(form.dataset.confirm)) e.preventDefault();
  });
});
