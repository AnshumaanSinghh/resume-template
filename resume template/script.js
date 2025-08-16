// Dark/Light Mode
const toggleBtn = document.getElementById('theme-toggle');
toggleBtn.addEventListener('click', () => {
  document.body.classList.toggle('dark');
  toggleBtn.textContent = document.body.classList.contains('dark') ? "☀️" : "🌙";
});

// Fade-in on Scroll
const faders = document.querySelectorAll('.fade-in');
const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.animationDelay = "0.2s";
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
});
faders.forEach(fader => observer.observe(fader));
