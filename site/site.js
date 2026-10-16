// The Copy button. Without this script the button stays hidden and the command can still be selected and copied.
for (const button of document.querySelectorAll('button[data-copy]')) {
  const source = document.getElementById(button.dataset.copy);
  const label = button.querySelector('[data-copy-label]');
  if (!source || !label || !navigator.clipboard) continue;
  button.hidden = false;
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(source.textContent.trim());
      label.textContent = 'Copied';
    } catch {
      label.textContent = 'Select and copy';
    }
    setTimeout(() => (label.textContent = 'Copy'), 2000);
  });
}
