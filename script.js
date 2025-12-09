// Particle animation inspired by minimal hero effects
const canvas = document.getElementById('particles');
const ctx = canvas.getContext('2d');

const particleConfig = {
  count: 80,
  speed: 0.3,
  maxRadius: 2.2,
  lineDistance: 140
};

let particles = [];
let width = 0;
let height = 0;

function resizeCanvas() {
  width = canvas.width = window.innerWidth;
  height = canvas.height = document.getElementById('home').offsetHeight;
}

function createParticles() {
  particles = Array.from({ length: particleConfig.count }).map(() => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * particleConfig.speed,
    vy: (Math.random() - 0.5) * particleConfig.speed,
    r: Math.random() * particleConfig.maxRadius + 0.4
  }));
}

function draw() {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(148, 163, 184, 0.9)';

  particles.forEach(p => {
    p.x += p.vx;
    p.y += p.vy;

    if (p.x < 0 || p.x > width) p.vx *= -1;
    if (p.y < 0 || p.y > height) p.vy *= -1;

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  });

  // draw connecting lines
  ctx.strokeStyle = 'rgba(34, 211, 238, 0.12)';
  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const dx = particles[i].x - particles[j].x;
      const dy = particles[i].y - particles[j].y;
      const dist = Math.hypot(dx, dy);
      if (dist < particleConfig.lineDistance) {
        const alpha = 1 - dist / particleConfig.lineDistance;
        ctx.strokeStyle = `rgba(34, 211, 238, ${alpha * 0.2})`;
        ctx.beginPath();
        ctx.moveTo(particles[i].x, particles[i].y);
        ctx.lineTo(particles[j].x, particles[j].y);
        ctx.stroke();
      }
    }
  }

  requestAnimationFrame(draw);
}

function init() {
  resizeCanvas();
  createParticles();
  requestAnimationFrame(draw);
}

window.addEventListener('resize', () => {
  resizeCanvas();
  createParticles();
});

// Smooth scroll for nav links
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', e => {
    const targetId = link.getAttribute('href');
    const target = document.querySelector(targetId);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth' });
    }
  });
});

init();

